// Minimal .xlsx writer (uncompressed zip + inline strings) that runs on Workers.
// Strings stay text, so account numbers keep their leading zeros in Excel.

export type Cell = string | number | null | undefined;
export type Sheet = { name: string; rows: Cell[][]; widths?: number[] };

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const col = (i: number): string => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

function sheetXml(s: Sheet) {
	const cols = s.widths?.length
		? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
		: '';
	const rows = s.rows
		.map((row, r) => {
			const cells = row
				.map((v, c) => {
					const ref = `${col(c)}${r + 1}`;
					if (v === null || v === undefined || v === '') return '';
					// header row (r=0) uses style 1 (bold)
					const st = r === 0 ? ' s="1"' : '';
					return typeof v === 'number'
						? `<c r="${ref}"${st}><v>${v}</v></c>`
						: `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
				})
				.join('');
			return `<row r="${r + 1}">${cells}</row>`;
		})
		.join('');
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

export function buildXlsx(sheets: Sheet[]): Uint8Array<ArrayBuffer> {
	const ns = 'http://schemas.openxmlformats.org';
	const files: [string, string][] = [
		[
			'[Content_Types].xml',
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
				.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
				.join('')}</Types>`
		],
		[
			'_rels/.rels',
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
		],
		[
			'xl/workbook.xml',
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${sheets
				.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
				.join('')}</sheets></workbook>`
		],
		[
			'xl/_rels/workbook.xml.rels',
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships">${sheets
				.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
				.join('')}<Relationship Id="rId${sheets.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
		],
		[
			'xl/styles.xml',
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`
		],
		...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])
	];
	return zipStore(files.map(([name, text]) => [name, new TextEncoder().encode(text)]));
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(data: Uint8Array) {
	let c = 0xffffffff;
	for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** ZIP with STORED (no compression) entries — valid for xlsx and tiny to implement. */
function zipStore(files: [string, Uint8Array][]): Uint8Array<ArrayBuffer> {
	const enc = new TextEncoder();
	const local: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const [name, data] of files) {
		const nameBytes = enc.encode(name);
		const crc = crc32(data);
		const head = new DataView(new ArrayBuffer(30));
		head.setUint32(0, 0x04034b50, true);
		head.setUint16(4, 20, true);
		head.setUint16(6, 0x0800, true); // UTF-8 names
		head.setUint32(14, crc, true);
		head.setUint32(18, data.length, true);
		head.setUint32(22, data.length, true);
		head.setUint16(26, nameBytes.length, true);
		local.push(new Uint8Array(head.buffer), nameBytes, data);

		const cd = new DataView(new ArrayBuffer(46));
		cd.setUint32(0, 0x02014b50, true);
		cd.setUint16(4, 20, true);
		cd.setUint16(6, 20, true);
		cd.setUint16(8, 0x0800, true);
		cd.setUint32(16, crc, true);
		cd.setUint32(20, data.length, true);
		cd.setUint32(24, data.length, true);
		cd.setUint16(28, nameBytes.length, true);
		cd.setUint32(42, offset, true);
		central.push(new Uint8Array(cd.buffer), nameBytes);
		offset += 30 + nameBytes.length + data.length;
	}
	const cdSize = central.reduce((a, b) => a + b.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, cdSize, true);
	end.setUint32(16, offset, true);
	const parts = [...local, ...central, new Uint8Array(end.buffer)];
	const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
	let p = 0;
	for (const part of parts) {
		out.set(part, p);
		p += part.length;
	}
	return out;
}
