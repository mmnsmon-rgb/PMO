import { and, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { isSCB } from '$lib/payroll';
import { today } from '$lib/labels';
import { db } from './db';
import { timesheetEntries, timesheets, type SheetStatus } from './db/schema';
import { groupBy } from './stats';
import { paymentList, payrollRows, type PayrollRow } from './payroll';

export type Scope = 'approved' | 'all';
export const scopeStatuses = (s: Scope): SheetStatus[] => (s === 'approved' ? ['approved'] : ['submitted', 'approved']);

/** Parse ?from&to&scope (defaults: current month, approved only). */
export function reportParams(url: URL) {
	const q = url.searchParams;
	const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
	const now = today();
	const month = now.slice(0, 7);
	const [y, m] = month.split('-').map(Number);
	const from = isDate(q.get('from')) ? q.get('from')! : `${month}-01`;
	const to = isDate(q.get('to')) ? q.get('to')! : `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
	const scope: Scope = q.get('scope') === 'all' ? 'all' : 'approved';
	return { from, to, scope };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function totals(rows: PayrollRow[]) {
	const t = { sheets: new Set(rows.map((r) => r.sheetId)).size, people: rows.length, days: 0, ot: 0, scb: 0, other: 0, total: 0 };
	for (const r of rows) {
		t.days += r.shift === 'H' ? 0.5 : 1;
		t.ot += r.ot1Hours + r.ot15Hours + r.ot3Hours;
		if (isSCB(r.bank)) t.scb += r.total;
		else t.other += r.total;
		t.total += r.total;
	}
	return { ...t, scb: round2(t.scb), other: round2(t.other), total: round2(t.total) };
}

function* dateRange(from: string, to: string) {
	for (let d = Date.parse(from + 'T00:00:00Z'); d <= Date.parse(to + 'T00:00:00Z'); d += 864e5) yield new Date(d).toISOString().slice(0, 10);
}

export async function buildReport(from: string, to: string, scope: Scope) {
	const rows = await payrollRows(from, to, scopeStatuses(scope));
	const now = today();

	const byDate = groupBy(rows, (r) => r.workDate);
	const lastDay = to < now ? to : now;
	// table runs to the last day with data; days after that are reported as one "no sheets since" note
	const lastData = rows.at(-1)?.workDate;
	const tableEnd = lastData && lastData < lastDay ? lastData : lastDay;
	const daily = [...dateRange(from, tableEnd)].map((date) => ({ date, ...totals(byDate.get(date) ?? []) }));
	const noSheetsSince = tableEnd < lastDay ? tableEnd : null;

	const byDept = [...groupBy(rows, (r) => r.department)].map(([department, list]) => ({ department, ...totals(list) }));
	const bySubmitter = [...groupBy(rows, (r) => r.submitterName ?? '—')].map(([name, list]) => ({
		name,
		...totals(list),
		dates: new Set(list.map((r) => r.workDate)).size
	}));

	// same worker twice on one day = probably double payment
	const duplicates = [...groupBy(rows, (r) => `${r.workDate}|${r.workerId}`).values()]
		.filter((l) => l.length > 1)
		.map((l) => ({ date: l[0].workDate, name: l[0].workerName, sheets: l.map((r) => ({ id: r.sheetId, department: r.department })) }));

	const [statusCounts, monthly] = await Promise.all([
		db
			.select({ status: timesheets.status, n: count() })
			.from(timesheets)
			.where(and(gte(timesheets.workDate, from), lte(timesheets.workDate, to)))
			.groupBy(timesheets.status),
		db
			.select({
				month: sql<string>`substr(${timesheets.workDate}, 1, 7)`,
				sheets: sql<number>`count(distinct ${timesheets.id})`,
				people: sql<number>`count(${timesheetEntries.id})`,
				workers: sql<number>`count(distinct ${timesheetEntries.workerId})`,
				total: sql<number>`coalesce(sum(${timesheetEntries.total}), 0)`
			})
			.from(timesheets)
			.innerJoin(timesheetEntries, eq(timesheetEntries.timesheetId, timesheets.id))
			.where(inArray(timesheets.status, scopeStatuses(scope)))
			.groupBy(sql`1`)
			.orderBy(sql`1 desc`)
			.limit(12)
	]);
	const status = Object.fromEntries(statusCounts.map((s) => [s.status, s.n])) as Partial<Record<SheetStatus, number>>;

	return {
		rows,
		total: { ...totals(rows), workers: new Set(rows.map((r) => r.workerId)).size },
		daily,
		missingDays: daily.filter((d) => d.sheets === 0).map((d) => d.date),
		noSheetsSince,
		lastDay,
		byDept,
		bySubmitter,
		payments: paymentList(rows),
		duplicates,
		status,
		monthly: monthly.map((m) => ({ ...m, total: round2(m.total) }))
	};
}
