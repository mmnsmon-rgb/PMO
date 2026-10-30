// Minimal .xlsx / .csv reader that runs on Workers (and Node ≥18): unzips with the
// built-in DecompressionStream and reads the first sheet as a grid of strings.
// No imports, so scripts/ can use it directly.

type ZipEntry = { name: string; method: number; compSize: number; offset: number };

function listZip(buf: Uint8Array): ZipEntry[] {
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
		if (dv.getUint32(i, true) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error('ไม่ใช่ไฟล์ Excel (.xlsx)');
	const count = dv.getUint16(eocd + 10, true);
	let p = dv.getUint32(eocd + 16, true);
	const dec = new TextDecoder();
	const entries: ZipEntry[] = [];
	for (let i = 0; i < count; i++) {
		if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ไฟล์ Excel เสียหาย');
		const nameLen = dv.getUint16(p + 28, true);
		entries.push({
			method: dv.getUint16(p + 10, true),
			compSize: dv.getUint32(p + 20, true),
			offset: dv.getUint32(p + 42, true),
			name: dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
		});
		p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
	}
	return entries;
}

async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<string> {
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
	const data = buf.slice(start, start + e.compSize);
	if (e.method === 0) return new TextDecoder().decode(data);
	if (e.method !== 8) throw new Error(`ไม่รองรับการบีบอัดแบบ ${e.method}`);
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Response(stream).text();
}

const unescape = (s: string) =>
	s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
		e[0] === '#'
			? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
			: ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]
	);
/** Text of every <t> inside a fragment (rich text runs are split across several). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('');
const colIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readXlsx(buf: Uint8Array): Promise<string[][]> {
	const entries = listZip(buf);
	const get = (name: string) => entries.find((e) => e.name === name);
	const read = async (name: string) => {
		const e = get(name);
		return e ? readEntry(buf, e) : '';
	};

	// first sheet in workbook order → its part via the workbook rels
	const workbook = await read('xl/workbook.xml');
	const rid = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
	const rels = await read('xl/_rels/workbook.xml.rels');
	const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`Id="${rid}"`));
	const target = rel && /\bTarget="([^"]+)"/.exec(rel)?.[1];
	const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target}`) : 'xl/worksheets/sheet1.xml';

	const shared = [...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
	const sheet = await read(sheetPath);
	if (!sheet) throw new Error('ไม่พบชีตข้อมูลในไฟล์');

	const rows: string[][] = [];
	for (const rm of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
		const r = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1) - 1;
		const row: string[] = [];
		for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const attrs = cm[1];
			const body = cm[2] ?? '';
			const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
			const t = /\bt="(\w+)"/.exec(attrs)?.[1];
			const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
			const value = t === 's' ? (shared[Number(v)] ?? '') : t === 'inlineStr' ? texts(body) : v !== undefined ? unescape(v) : '';
			row[ref ? colIndex(ref) : row.length] = value;
		}
		rows[r] = Array.from(row, (c) => c ?? '');
	}
	return Array.from(rows, (r) => r ?? []);
}

/** RFC 4180-ish CSV (quotes, embedded commas/newlines, UTF-8 BOM). */
export function readCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	const s = text.replace(/^﻿/, '');
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (quoted) {
			if (ch === '"' && s[i + 1] === '"') cell += s[i++];
			else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && s[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += ch;
	}
	if (cell || row.length) rows.push([...row, cell]);
	return rows;
}

export async function readSpreadsheet(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }) {
	const buf = new Uint8Array(await file.arrayBuffer());
	return /\.csv$/i.test(file.name) ? readCsv(new TextDecoder().decode(buf)) : readXlsx(buf);
}
