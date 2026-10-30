// Build seed SQL for D1 from data/project_tracking_sample.xlsx (projects & tasks)
// and the daily cash files data/dsv/เงินสด DSV <date>.xlsx (payroll timesheets).
//
//   node scripts/seed.ts [file.xlsx] [--dsv data/dsv] [--out seed.sql] [--password <pw>]
//
// Writes INSERT statements (wiping existing rows first). Apply with
//   npx wrangler d1 execute pmo-db --local  --file seed.sql   (dev)
//   npx wrangler d1 execute pmo-db --remote --file seed.sql   (production)
// Without --password a random password is generated and printed — every
// seeded account gets it. Never commit seed.sql (it contains password hashes).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { Shift, TaskPriority, TaskStatus } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/password.ts';
import { calcPay, cleanAccount, cleanName, type Rates } from '../src/lib/payroll.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const OUT = flag('--out') ?? 'seed.sql';
// Same password as production when .seed-credentials.txt (gitignored, line 2) exists,
// so one password works on both localhost and the live site.
const savedPassword = existsSync('.seed-credentials.txt')
	? readFileSync('.seed-credentials.txt', 'utf8').split(/\r?\n/)[1]?.trim() || undefined
	: undefined;
const passwordFlag = flag('--password');
const PASSWORD = passwordFlag ?? savedPassword ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const DSV_DIR = flag('--dsv') ?? 'data/dsv';
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
for (const t of ['activity_logs', 'sessions', 'timesheet_entries', 'timesheets', 'workers', 'tasks', 'projects', 'users'])
	lines.push(`DELETE FROM ${t};`);

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

// ---- Daily cash files ("เงินสด DSV <d> Oct 2026.xlsx") → workers + timesheets ----
//
// Sheet "DSV รายวัน": row 2 = rates (T ค่าแรง, U เดินทาง, V อาหาร, W–Y OT rates, Z กะดึก),
// row 3–4 = headers, row 5 = column totals, rows 6+ = one worker each (blank rows after).
// Sheets "SCB" / "Other" are the same people split by bank for transfer — derived, not imported.
const COL = { bank: 2, account: 3, name: 4, dept: 5, shift: 6, ot1: 12, ot15: 14, ot3: 16, incentive: 18, late: 28, deduction: 30, total: 31, evidence: 32 };

// one site coordinator per department keys that site's sheet
const COORDINATORS: Record<string, { name: string; email: string }> = {
	'DSV กม.39': { name: 'สมศักดิ์', email: 'somsak@example.com' },
	'DSV กม.19': { name: 'มาลี', email: 'malee@example.com' }
};
const coordinatorId = new Map<string, number>();
for (const [dept, c] of Object.entries(COORDINATORS)) {
	coordinatorId.set(dept, userId);
	insert('users', {
		id: userId++,
		name: c.name,
		email: c.email,
		password_hash: passwordHash,
		role: 'member',
		position: 'ผู้ประสานงานไซต์',
		duty: `คีย์เงินสดรายวัน ${dept}`
	});
}
const approverId = userByName.get('วิภา') ?? adminId;

type DsvRow = { date: string; dept: string; account: string; name: string; bank: string; entry: Record<string, unknown>; expected: number };
const dsvRows: DsvRow[] = [];
const sheetRates = new Map<string, Rates>();
const files = existsSync(DSV_DIR) ? readdirSync(DSV_DIR).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$')) : [];
let mismatches = 0;
for (const f of files) {
	const book = new ExcelJS.Workbook();
	await book.xlsx.readFile(join(DSV_DIR, f));
	const ws = book.worksheets[0];
	const workDate = date(ws.getCell('F4'));
	if (!workDate) throw new Error(`${f}: no work date in F4`);
	const rates: Rates = {
		dailyWage: num(ws.getCell('T2')) || 500,
		travelAllowance: num(ws.getCell('U2')),
		mealAllowance: num(ws.getCell('V2')),
		nightAllowance: num(ws.getCell('Z2'))
	};
	for (let r = 6; r <= ws.rowCount; r++) {
		const row = ws.getRow(r);
		const name = cleanName(str(row.getCell(COL.name)));
		if (!name) continue;
		const shift = str(row.getCell(COL.shift)).toUpperCase() as Shift;
		if (!['D', 'N', 'H'].includes(shift)) {
			console.warn(`${f} row ${r}: ${name} has no shift (D/N/H) — skipped`);
			continue;
		}
		const dept = str(row.getCell(COL.dept)) || 'ไม่ระบุหน่วยงาน';
		sheetRates.set(`${workDate}|${dept}`, rates);
		const entry = {
			shift,
			ot1Hours: num(row.getCell(COL.ot1)),
			ot15Hours: num(row.getCell(COL.ot15)),
			ot3Hours: num(row.getCell(COL.ot3)),
			incentive: num(row.getCell(COL.incentive)),
			lateMinutes: num(row.getCell(COL.late)),
			deduction: num(row.getCell(COL.deduction))
		};
		const expected = num(row.getCell(COL.total));
		const got = calcPay(entry, rates).total;
		if (Math.abs(got - expected) > 0.005) {
			mismatches++;
			console.warn(`${f} row ${r}: ${name} Excel total ${expected} ≠ computed ${got}`);
		}
		dsvRows.push({
			date: workDate,
			dept,
			account: cleanAccount(str(row.getCell(COL.account))),
			name,
			bank: str(row.getCell(COL.bank)),
			entry: { ...entry, note: str(row.getCell(COL.evidence)) || null, total: got },
			expected
		});
	}
}

// workers: one per bank account; latest file wins for name/bank/site
dsvRows.sort((a, b) => a.date.localeCompare(b.date));
const workerByAccount = new Map<string, { id: number; name: string; bank: string; dept: string }>();
for (const r of dsvRows) {
	const prev = workerByAccount.get(r.account);
	workerByAccount.set(r.account, { id: prev?.id ?? workerByAccount.size + 1, name: r.name, bank: r.bank, dept: r.dept });
}
for (const [account, w] of workerByAccount) insert('workers', { id: w.id, name: w.name, bank: w.bank, account_no: account, department: w.dept });

// timesheets: one per (date, department) — a file mixing sites becomes one sheet per site
const lastDate = dsvRows.at(-1)?.date ?? '';
let sheetId = 0;
const sheetKey = new Map<string, number>();
for (const r of dsvRows) {
	const key = `${r.date}|${r.dept}`;
	if (!sheetKey.has(key)) {
		const id = ++sheetId;
		sheetKey.set(key, id);
		// latest day stays "submitted" so the approval step has something to show
		const approved = r.date < lastDate;
		const at = `${r.date}T11:00:00.000Z`;
		insert('timesheets', {
			id,
			work_date: r.date,
			department: r.dept,
			submitted_by: coordinatorId.get(r.dept) ?? null,
			status: approved ? 'approved' : 'submitted',
			daily_wage: sheetRates.get(key)!.dailyWage,
			travel_allowance: sheetRates.get(key)!.travelAllowance,
			meal_allowance: sheetRates.get(key)!.mealAllowance,
			night_allowance: sheetRates.get(key)!.nightAllowance,
			submitted_at: at,
			approved_by: approved ? approverId : null,
			approved_at: approved ? at : null,
			created_at: at,
			updated_at: at
		});
		insert('activity_logs', { id: logId++, user_id: adminId, entity_type: 'timesheet', entity_id: id, entity_label: `${r.dept} ${r.date}`, action: 'import' });
	}
	const w = workerByAccount.get(r.account)!;
	const e = r.entry;
	insert('timesheet_entries', {
		timesheet_id: sheetKey.get(key)!,
		worker_id: w.id,
		worker_name: r.name,
		bank: r.bank,
		account_no: r.account,
		shift: e.shift,
		ot1_hours: e.ot1Hours,
		ot15_hours: e.ot15Hours,
		ot3_hours: e.ot3Hours,
		incentive: e.incentive,
		late_minutes: e.lateMinutes,
		deduction: e.deduction,
		note: e.note,
		total: e.total
	});
}

writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`Wrote ${OUT}: ${team.length} team members (+1 admin), ${projectByName.size} projects, ${taskId - 1} tasks from ${FILE}`);
const dsvTotal = dsvRows.reduce((a, r) => a + (r.entry.total as number), 0);
console.log(
	`  + ${files.length} DSV files → ${workerByAccount.size} workers, ${sheetId} timesheets, ${dsvRows.length} entries, ` +
		`total ${dsvTotal.toFixed(2)} ฿ (${mismatches ? `${mismatches} rows differ from Excel` : 'matches Excel to the satang'})`
);
console.log(
	passwordFlag || !savedPassword
		? `Password for every seeded account: ${PASSWORD}`
		: 'Password for every seeded account: same as production (.seed-credentials.txt)'
);
