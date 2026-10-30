// Build seed SQL for D1 from data/project_tracking_sample.xlsx.
//
//   node scripts/seed.ts [file.xlsx] [--out seed.sql] [--password <pw>]
//
// Writes INSERT statements (wiping existing rows first). Apply with
//   npx wrangler d1 execute pmo-db --local  --file seed.sql   (dev)
//   npx wrangler d1 execute pmo-db --remote --file seed.sql   (production)
// Without --password a random password is generated and printed — every
// seeded account gets it. Never commit seed.sql (it contains password hashes).
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import type { TaskPriority, TaskStatus } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/password.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const OUT = flag('--out') ?? 'seed.sql';
const PASSWORD = flag('--password') ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const FILE = args[0] ?? 'data/project_tracking_sample.xlsx';

const ADMIN = { name: 'ผู้ดูแลระบบ', email: 'admin@example.com', position: 'System Admin' };
const ADMIN_NAMES = new Set(['วิภา']); // team lead gets admin rights

const STATUS: Record<string, TaskStatus> = {
	ยังไม่เริ่ม: 'todo',
	กำลังดำเนินการ: 'doing',
	รอตรวจ: 'doing', // no "review"/"on hold" column in the 3-state board; tagged in the note instead
	ระงับ: 'todo',
	เสร็จแล้ว: 'done'
};
const TAGGED = new Set(['รอตรวจ', 'ระงับ']);
const PRIORITY: Record<string, TaskPriority> = { สูง: 'high', กลาง: 'medium', ต่ำ: 'low' };

/** Cell value → plain value (unwraps formulas/rich text). */
function val(cell: ExcelJS.Cell): unknown {
	const v = cell.value as unknown;
	if (v && typeof v === 'object' && !(v instanceof Date)) {
		if ('result' in v) return (v as { result: unknown }).result;
		if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
		if ('text' in v) return (v as { text: string }).text;
	}
	return v;
}
const str = (c: ExcelJS.Cell) => {
	const v = val(c);
	return v === null || v === undefined ? '' : String(v).trim();
};
const num = (c: ExcelJS.Cell) => Number(val(c)) || 0;
function date(c: ExcelJS.Cell): string | null {
	const v = val(c);
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
	return null;
}

/** Find the header row (by its first header label) and return rows below it as column-name → cell maps. */
function readTable(ws: ExcelJS.Worksheet, firstHeader: string) {
	let headerRow = 0;
	ws.eachRow((row, i) => {
		if (!headerRow && str(row.getCell(1)) === firstHeader) headerRow = i;
	});
	if (!headerRow) throw new Error(`Header "${firstHeader}" not found in sheet "${ws.name}"`);
	const headers = (ws.getRow(headerRow).values as unknown[]).map((h) => String(h ?? '').trim());
	const rows: Record<string, ExcelJS.Cell>[] = [];
	for (let i = headerRow + 1; i <= ws.rowCount; i++) {
		const row = ws.getRow(i);
		if (!str(row.getCell(1)) || !str(row.getCell(2))) continue;
		const rec: Record<string, ExcelJS.Cell> = {};
		headers.forEach((h, col) => h && (rec[h] = row.getCell(col)));
		rows.push(rec);
	}
	return rows;
}

const sqlVal = (v: unknown) =>
	v === null || v === undefined
		? 'NULL'
		: typeof v === 'number'
			? String(v)
			: typeof v === 'boolean'
				? (v ? '1' : '0')
				: `'${String(v).replace(/'/g, "''")}'`;
const lines: string[] = [];
const insert = (table: string, row: Record<string, unknown>) =>
	lines.push(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(sqlVal).join(', ')});`);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const teamSheet = wb.getWorksheet('ทีมงาน');
const taskSheet = wb.getWorksheet('งานทั้งหมด');
if (!teamSheet || !taskSheet) throw new Error('Expected sheets "ทีมงาน" and "งานทั้งหมด"');

const team = readTable(teamSheet, 'ลำดับ');
const taskRows = readTable(taskSheet, 'รหัสงาน');

// wipe in FK-safe order
for (const t of ['activity_logs', 'sessions', 'tasks', 'projects', 'users']) lines.push(`DELETE FROM ${t};`);

const passwordHash = await hashPassword(PASSWORD);
let userId = 1;
const adminId = userId;
insert('users', { id: userId++, name: ADMIN.name, email: ADMIN.email, position: ADMIN.position, role: 'admin', password_hash: passwordHash });

const userByName = new Map<string, number>();
for (const r of team) {
	const name = str(r['ชื่อ']);
	userByName.set(name, userId);
	insert('users', {
		id: userId++,
		name,
		email: str(r['อีเมล']).toLowerCase(),
		password_hash: passwordHash,
		role: ADMIN_NAMES.has(name) ? 'admin' : 'member',
		position: str(r['ตำแหน่ง']) || null,
		duty: str(r['หน้าที่หลัก']) || null,
		level: str(r['ระดับ']) || null,
		start_date: date(r['วันเริ่มงาน'])
	});
}

let logId = 1;
const projectByName = new Map<string, number>();
for (const name of new Set(taskRows.map((r) => str(r['ลูกค้า / โครงการ'])))) {
	const id = projectByName.size + 1;
	projectByName.set(name, id);
	insert('projects', { id, name });
	insert('activity_logs', { id: logId++, user_id: adminId, entity_type: 'project', entity_id: id, entity_label: name, action: 'import' });
}

let taskId = 1;
for (const r of taskRows) {
	const code = str(r['รหัสงาน']);
	const rawStatus = str(r['สถานะ']);
	const status = STATUS[rawStatus];
	if (!status) {
		console.warn(`skip ${code}: unknown status "${rawStatus}"`);
		continue;
	}
	const title = str(r['ชื่องาน']);
	const note = [TAGGED.has(rawStatus) ? `[${rawStatus}]` : '', str(r['หมายเหตุ'])].filter(Boolean).join(' ');
	insert('tasks', {
		id: taskId,
		code,
		project_id: projectByName.get(str(r['ลูกค้า / โครงการ']))!,
		title,
		assignee_id: userByName.get(str(r['ผู้รับผิดชอบ'])) ?? null,
		priority: PRIORITY[str(r['ความสำคัญ'])] ?? 'medium',
		status,
		start_date: date(r['วันเริ่ม']),
		due_date: date(r['กำหนดเสร็จ']),
		estimated_hours: num(r['ชั่วโมงประเมิน']),
		actual_hours: num(r['ชั่วโมงจริง']),
		progress: Math.round(num(r['% ความคืบหน้า']) * 100),
		note: note || null
	});
	insert('activity_logs', { id: logId++, user_id: adminId, entity_type: 'task', entity_id: taskId, entity_label: `${code} ${title}`, action: 'import' });
	taskId++;
}

writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`Wrote ${OUT}: ${team.length} team members (+1 admin), ${projectByName.size} projects, ${taskId - 1} tasks from ${FILE}`);
console.log(`Password for every seeded account: ${PASSWORD}`);
