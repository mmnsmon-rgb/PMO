// Import initial data from data/project_tracking_sample.xlsx into the SQLite DB.
// Run with: npm run db:seed  (after npm run db:push)
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import ExcelJS from 'exceljs';
import * as schema from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/password.ts';

const { users, projects, tasks, activityLogs, sessions } = schema;

const FILE = process.argv[2] ?? 'data/project_tracking_sample.xlsx';
// Test credentials for local development only — every seeded account uses this password.
const DEFAULT_PASSWORD = 'pmo1234';
const ADMIN = { name: 'ผู้ดูแลระบบ', email: 'admin@example.com', position: 'System Admin' };
const ADMIN_NAMES = new Set(['วิภา']); // team lead gets admin rights

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? 'file:local.db' }), { schema });

const STATUS: Record<string, schema.TaskStatus> = {
	ยังไม่เริ่ม: 'todo',
	กำลังดำเนินการ: 'doing',
	รอตรวจ: 'doing', // no "review"/"on hold" column in the 3-state board; tagged in the note instead
	ระงับ: 'todo',
	เสร็จแล้ว: 'done'
};
const TAGGED = new Set(['รอตรวจ', 'ระงับ']);
const PRIORITY: Record<string, schema.TaskPriority> = { สูง: 'high', กลาง: 'medium', ต่ำ: 'low' };

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

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const teamSheet = wb.getWorksheet('ทีมงาน');
const taskSheet = wb.getWorksheet('งานทั้งหมด');
if (!teamSheet || !taskSheet) throw new Error('Expected sheets "ทีมงาน" and "งานทั้งหมด"');

const team = readTable(teamSheet, 'ลำดับ');
const taskRows = readTable(taskSheet, 'รหัสงาน');

// wipe in FK-safe order
await db.delete(activityLogs);
await db.delete(sessions);
await db.delete(tasks);
await db.delete(projects);
await db.delete(users);

const passwordHash = await hashPassword(DEFAULT_PASSWORD);

const [admin] = await db
	.insert(users)
	.values({ ...ADMIN, role: 'admin', passwordHash })
	.returning();

const userByName = new Map<string, number>();
for (const r of team) {
	const name = str(r['ชื่อ']);
	const [u] = await db
		.insert(users)
		.values({
			name,
			email: str(r['อีเมล']).toLowerCase(),
			passwordHash,
			role: ADMIN_NAMES.has(name) ? 'admin' : 'member',
			position: str(r['ตำแหน่ง']) || null,
			duty: str(r['หน้าที่หลัก']) || null,
			level: str(r['ระดับ']) || null,
			startDate: date(r['วันเริ่มงาน'])
		})
		.returning();
	userByName.set(name, u.id);
}

const projectByName = new Map<string, number>();
for (const name of new Set(taskRows.map((r) => str(r['ลูกค้า / โครงการ'])))) {
	const [p] = await db.insert(projects).values({ name }).returning();
	projectByName.set(name, p.id);
	await db.insert(activityLogs).values({
		userId: admin.id,
		entityType: 'project',
		entityId: p.id,
		entityLabel: name,
		action: 'import'
	});
}

let skipped = 0;
for (const r of taskRows) {
	const code = str(r['รหัสงาน']);
	const rawStatus = str(r['สถานะ']);
	const status = STATUS[rawStatus];
	if (!status) {
		console.warn(`skip ${code}: unknown status "${rawStatus}"`);
		skipped++;
		continue;
	}
	const assignee = str(r['ผู้รับผิดชอบ']);
	const note = [TAGGED.has(rawStatus) ? `[${rawStatus}]` : '',str(r['หมายเหตุ'])].filter(Boolean).join(' ');
	const [t] = await db
		.insert(tasks)
		.values({
			code,
			projectId: projectByName.get(str(r['ลูกค้า / โครงการ']))!,
			title: str(r['ชื่องาน']),
			assigneeId: userByName.get(assignee) ?? null,
			priority: PRIORITY[str(r['ความสำคัญ'])] ?? 'medium',
			status,
			startDate: date(r['วันเริ่ม']),
			dueDate: date(r['กำหนดเสร็จ']),
			estimatedHours: num(r['ชั่วโมงประเมิน']),
			actualHours: num(r['ชั่วโมงจริง']),
			progress: Math.round(num(r['% ความคืบหน้า']) * 100),
			note: note || null
		})
		.returning();
	await db.insert(activityLogs).values({
		userId: admin.id,
		entityType: 'task',
		entityId: t.id,
		entityLabel: `${t.code} ${t.title}`,
		action: 'import'
	});
}

console.log(
	`Imported ${team.length} team members (+1 admin), ${projectByName.size} projects, ${taskRows.length - skipped} tasks from ${FILE}`
);
console.log(`Login: any team email (e.g. vipa@example.com = admin, napa@example.com = member) / password: ${DEFAULT_PASSWORD}`);
