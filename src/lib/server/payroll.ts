import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, getTableColumns, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { calcPay, fmtBaht, fmtNum, SHIFT_LABEL, type Rates, type Shift } from '$lib/payroll';
import { logActivity } from './activity';
import { db } from './db';
import {
	SHIFTS,
	timesheetEntries,
	timesheets,
	users,
	workers,
	type SheetStatus,
	type Timesheet,
	type TimesheetEntry,
	type Worker
} from './db/schema';

type SessionUser = NonNullable<App.Locals['user']>;

export const sheetLabel = (s: Pick<Timesheet, 'workDate' | 'department'>) => `${s.department} ${s.workDate}`;
export const ratesOf = (s: Rates): Rates => ({
	dailyWage: s.dailyWage,
	travelAllowance: s.travelAllowance,
	mealAllowance: s.mealAllowance,
	nightAllowance: s.nightAllowance
});

export function canViewSheet(user: SessionUser, s: Pick<Timesheet, 'submittedBy'>) {
	return user.role === 'admin' || s.submittedBy === user.id;
}

/** Owners edit their drafts; admins edit anything not yet approved (reopen first to change approved). */
export function canEditSheet(user: SessionUser, s: Pick<Timesheet, 'submittedBy' | 'status'>) {
	if (user.role === 'admin') return s.status !== 'approved';
	return s.submittedBy === user.id && s.status === 'draft';
}

export async function getSheet(id: number) {
	const [s] = await db.select().from(timesheets).where(eq(timesheets.id, id));
	if (!s) error(404, 'ไม่พบใบงานนี้');
	return s;
}

export function getEntries(sheetId: number) {
	return db.select().from(timesheetEntries).where(eq(timesheetEntries.timesheetId, sheetId)).orderBy(asc(timesheetEntries.id));
}

export function listSheets(f: { from?: string; to?: string; status?: SheetStatus; submittedBy?: number; department?: string }) {
	const conds: SQL[] = [];
	if (f.from) conds.push(gte(timesheets.workDate, f.from));
	if (f.to) conds.push(lte(timesheets.workDate, f.to));
	if (f.status) conds.push(eq(timesheets.status, f.status));
	if (f.submittedBy) conds.push(eq(timesheets.submittedBy, f.submittedBy));
	if (f.department) conds.push(eq(timesheets.department, f.department));
	return db
		.select({
			...getTableColumns(timesheets),
			submitterName: users.name,
			headcount: sql<number>`count(${timesheetEntries.id})`,
			total: sql<number>`coalesce(sum(${timesheetEntries.total}), 0)`
		})
		.from(timesheets)
		.leftJoin(users, eq(timesheets.submittedBy, users.id))
		.leftJoin(timesheetEntries, eq(timesheetEntries.timesheetId, timesheets.id))
		.where(conds.length ? and(...conds) : undefined)
		.groupBy(timesheets.id)
		.orderBy(desc(timesheets.workDate), asc(timesheets.department));
}

export async function listDepartments() {
	const [a, b] = await Promise.all([
		db.selectDistinct({ d: timesheets.department }).from(timesheets),
		db.selectDistinct({ d: workers.department }).from(workers)
	]);
	return [...new Set([...a, ...b].map((r) => r.d).filter((d): d is string => !!d))].sort();
}

export type EntryInput = {
	workerId: number;
	shift: Shift;
	ot1Hours: number;
	ot15Hours: number;
	ot3Hours: number;
	incentive: number;
	lateMinutes: number;
	deduction: number;
	note: string | null;
};

export type ParsedEntry = EntryInput & { worker: Worker };

/** Validate the editor's JSON payload. Returns `{ error }` or `{ rows }` with bank details resolved. */
export async function parseEntries(json: string): Promise<{ error: string } | { rows: ParsedEntry[] }> {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return { error: 'ข้อมูลรายการไม่ถูกต้อง' };
	}
	if (!Array.isArray(raw)) return { error: 'ข้อมูลรายการไม่ถูกต้อง' };
	const n = (v: unknown) => {
		const x = Number(v);
		return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : NaN;
	};
	const rows: EntryInput[] = [];
	for (const [i, r] of raw.entries()) {
		const e = {
			workerId: Number(r?.workerId),
			shift: r?.shift,
			ot1Hours: n(r?.ot1Hours),
			ot15Hours: n(r?.ot15Hours),
			ot3Hours: n(r?.ot3Hours),
			incentive: n(r?.incentive),
			lateMinutes: n(r?.lateMinutes),
			deduction: n(r?.deduction),
			note: String(r?.note ?? '').trim() || null
		};
		if (!e.workerId) return { error: `แถวที่ ${i + 1}: กรุณาเลือกลูกจ้าง` };
		if (!SHIFTS.includes(e.shift)) return { error: `แถวที่ ${i + 1}: กะไม่ถูกต้อง` };
		const bad = (['ot1Hours', 'ot15Hours', 'ot3Hours', 'incentive', 'lateMinutes', 'deduction'] as const).find((k) => Number.isNaN(e[k]));
		if (bad) return { error: `แถวที่ ${i + 1}: ตัวเลขต้องไม่ติดลบ` };
		if (e.ot1Hours + e.ot15Hours + e.ot3Hours > 16) return { error: `แถวที่ ${i + 1}: OT รวมเกิน 16 ชั่วโมง` };
		rows.push(e as EntryInput);
	}
	const ids = rows.map((r) => r.workerId);
	if (new Set(ids).size !== ids.length) return { error: 'มีลูกจ้างซ้ำในใบงานเดียวกัน' };
	const found = ids.length ? await db.select().from(workers).where(inArray(workers.id, ids)) : [];
	const byId = new Map(found.map((w) => [w.id, w]));
	const missing = ids.find((id) => !byId.has(id));
	if (missing) return { error: 'ไม่พบลูกจ้างบางคนในระบบ (อาจถูกลบไปแล้ว)' };
	return { rows: rows.map((r) => ({ ...r, worker: byId.get(r.workerId)! })) };
}

const entrySummary = (e: Pick<TimesheetEntry, 'shift' | 'ot1Hours' | 'ot15Hours' | 'ot3Hours' | 'incentive' | 'lateMinutes' | 'deduction' | 'total'>) =>
	[
		SHIFT_LABEL[e.shift],
		e.ot1Hours && `OT1 ${fmtNum(e.ot1Hours)} ชม.`,
		e.ot15Hours && `OT1.5 ${fmtNum(e.ot15Hours)} ชม.`,
		e.ot3Hours && `OT3 ${fmtNum(e.ot3Hours)} ชม.`,
		e.incentive && `Incentive ${fmtNum(e.incentive)}`,
		e.lateMinutes && `สาย ${fmtNum(e.lateMinutes)} นาที`,
		e.deduction && `หัก ${fmtNum(e.deduction)}`,
		`= ${fmtBaht(e.total)} ฿`
	]
		.filter(Boolean)
		.join(' · ');

/** Replace a sheet's entries (and optionally its rates), logging a per-worker diff. */
export async function saveSheet(
	user: SessionUser,
	sheet: Timesheet,
	rows: ParsedEntry[],
	newRates?: Rates
) {
	const rates = newRates ?? ratesOf(sheet);
	const before = await getEntries(sheet.id);
	const values = rows.map((r) => {
		// keep the bank snapshot of an existing row; new rows copy the worker's current details
		const snap = before.find((b) => b.workerId === r.workerId);
		return {
			timesheetId: sheet.id,
			workerId: r.workerId,
			workerName: snap?.workerName ?? r.worker.name,
			bank: snap?.bank ?? r.worker.bank,
			accountNo: snap?.accountNo ?? r.worker.accountNo,
			shift: r.shift,
			ot1Hours: r.ot1Hours,
			ot15Hours: r.ot15Hours,
			ot3Hours: r.ot3Hours,
			incentive: r.incentive,
			lateMinutes: r.lateMinutes,
			deduction: r.deduction,
			note: r.note,
			total: calcPay(r, rates).total
		};
	});

	const changes: Record<string, { from: unknown; to: unknown }> = {};
	const prev = new Map(before.map((b) => [b.workerId, b]));
	for (const v of values) {
		const b = prev.get(v.workerId);
		const to = entrySummary(v);
		const from = b ? entrySummary(b) : null;
		if (from !== to) changes[v.workerName] = { from, to };
		prev.delete(v.workerId);
	}
	for (const b of prev.values()) changes[b.workerName] = { from: entrySummary(b), to: null };
	for (const k of ['dailyWage', 'travelAllowance', 'mealAllowance', 'nightAllowance'] as const) {
		if (rates[k] !== sheet[k]) changes[k] = { from: sheet[k], to: rates[k] };
	}
	if (!Object.keys(changes).length) return false;
	const sum = (list: { total: number }[]) => Math.round(list.reduce((a, e) => a + e.total, 0) * 100) / 100;
	changes.sheetTotal = { from: sum(before), to: sum(values) };

	// D1 caps bound parameters at 100 per statement → insert 6 rows (14 columns) at a time
	const chunks = [];
	for (let i = 0; i < values.length; i += 6) chunks.push(db.insert(timesheetEntries).values(values.slice(i, i + 6)));
	await db.batch([
		db.delete(timesheetEntries).where(eq(timesheetEntries.timesheetId, sheet.id)),
		db
			.update(timesheets)
			.set({ ...rates, updatedAt: new Date().toISOString() })
			.where(eq(timesheets.id, sheet.id)),
		...chunks
	]);
	await logActivity({ userId: user.id, entityType: 'timesheet', entityId: sheet.id, entityLabel: sheetLabel(sheet), action: 'update', changes });
	return true;
}

export async function setSheetStatus(user: SessionUser, sheet: Timesheet, status: SheetStatus) {
	const now = new Date().toISOString();
	const set: Partial<Timesheet> = { status, updatedAt: now };
	if (status === 'submitted') set.submittedAt = now;
	if (status === 'approved') Object.assign(set, { approvedBy: user.id, approvedAt: now });
	if (status === 'draft') Object.assign(set, { approvedBy: null, approvedAt: null });
	await db.update(timesheets).set(set).where(eq(timesheets.id, sheet.id));
	await logActivity({
		userId: user.id,
		entityType: 'timesheet',
		entityId: sheet.id,
		entityLabel: sheetLabel(sheet),
		action: 'update',
		changes: { sheetStatus: { from: sheet.status, to: status } }
	});
}

/** Entry-level rows for reports, joined with their sheet. */
export function payrollRows(from: string, to: string, statuses: SheetStatus[]) {
	return db
		.select({
			sheetId: timesheets.id,
			workDate: timesheets.workDate,
			department: timesheets.department,
			status: timesheets.status,
			submittedBy: timesheets.submittedBy,
			submitterName: users.name,
			workerId: timesheetEntries.workerId,
			workerName: timesheetEntries.workerName,
			bank: timesheetEntries.bank,
			accountNo: timesheetEntries.accountNo,
			shift: timesheetEntries.shift,
			ot1Hours: timesheetEntries.ot1Hours,
			ot15Hours: timesheetEntries.ot15Hours,
			ot3Hours: timesheetEntries.ot3Hours,
			total: timesheetEntries.total
		})
		.from(timesheetEntries)
		.innerJoin(timesheets, eq(timesheetEntries.timesheetId, timesheets.id))
		.leftJoin(users, eq(timesheets.submittedBy, users.id))
		.where(and(gte(timesheets.workDate, from), lte(timesheets.workDate, to), inArray(timesheets.status, statuses)))
		.orderBy(asc(timesheets.workDate), asc(timesheets.department), asc(timesheetEntries.id));
}
export type PayrollRow = Awaited<ReturnType<typeof payrollRows>>[number];

/** Per-worker totals for a period — the consolidated payment list (old "SCB" / "Other" sheets). */
export function paymentList(rows: PayrollRow[]) {
	const m = new Map<string, { workerId: number; name: string; bank: string; accountNo: string; departments: Set<string>; days: number; ot: number; total: number }>();
	for (const r of rows) {
		// group by the account actually paid, so a mid-month account change yields two lines
		const key = `${r.workerId}|${r.accountNo}`;
		const p = m.get(key) ?? { workerId: r.workerId, name: r.workerName, bank: r.bank, accountNo: r.accountNo, departments: new Set(), days: 0, ot: 0, total: 0 };
		p.departments.add(r.department);
		p.days += r.shift === 'H' ? 0.5 : 1;
		p.ot += r.ot1Hours + r.ot15Hours + r.ot3Hours;
		p.total = Math.round((p.total + r.total) * 100) / 100;
		m.set(key, p);
	}
	return [...m.values()]
		.map((p) => ({ ...p, departments: [...p.departments].join(', ') }))
		.sort((a, b) => a.name.localeCompare(b.name, 'th'));
}
