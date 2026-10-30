import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, lt, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { loadActivity, logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { activityLogs, timesheetEntries, timesheets, users, workers } from '$lib/server/db/schema';
import {
	canEditSheet,
	canViewSheet,
	getEntries,
	getSheet,
	listDepartments,
	parseEntries,
	ratesOf,
	saveSheet,
	setSheetStatus,
	sheetLabel
} from '$lib/server/payroll';
import type { Rates } from '$lib/payroll';
import type { Actions, PageServerLoad } from './$types';

async function loadSheetFor(event: Parameters<PageServerLoad>[0]) {
	const user = requireUser(event);
	const sheet = await getSheet(Number(event.params.id));
	if (!canViewSheet(user, sheet)) error(403, 'ดูได้เฉพาะใบงานที่คุณส่ง');
	return { user, sheet };
}

export const load: PageServerLoad = async (event) => {
	const { user, sheet } = await loadSheetFor(event);
	const isAdmin = user.role === 'admin';
	const approver = alias(users, 'approver');
	const entries = await getEntries(sheet.id);
	const inSheet = entries.map((e) => e.workerId);

	const [[names], workerList, departments, [prev], sameDay, history] = await Promise.all([
		db
			.select({ submitter: users.name, approver: approver.name })
			.from(timesheets)
			.leftJoin(users, eq(timesheets.submittedBy, users.id))
			.leftJoin(approver, eq(timesheets.approvedBy, approver.id))
			.where(eq(timesheets.id, sheet.id)),
		db
			.select({ id: workers.id, name: workers.name, bank: workers.bank, accountNo: workers.accountNo, department: workers.department })
			.from(workers)
			.where(inSheet.length ? or(eq(workers.active, true), inArray(workers.id, inSheet)) : eq(workers.active, true))
			.orderBy(asc(workers.name)),
		listDepartments(),
		// most recent earlier sheet of this site, to copy its crew
		db
			.select({ id: timesheets.id, workDate: timesheets.workDate })
			.from(timesheets)
			.where(and(eq(timesheets.department, sheet.department), lt(timesheets.workDate, sheet.workDate)))
			.orderBy(desc(timesheets.workDate))
			.limit(1),
		// the same worker on another sheet the same day would be paid twice
		inSheet.length
			? db
					.select({ workerId: timesheetEntries.workerId, department: timesheets.department, sheetId: timesheets.id })
					.from(timesheetEntries)
					.innerJoin(timesheets, eq(timesheetEntries.timesheetId, timesheets.id))
					.where(and(eq(timesheets.workDate, sheet.workDate), ne(timesheets.id, sheet.id), inArray(timesheetEntries.workerId, inSheet)))
			: [],
		loadActivity({ where: and(eq(activityLogs.entityType, 'timesheet'), eq(activityLogs.entityId, sheet.id)), limit: 30 })
	]);
	const prevCrew = prev
		? (await db.select({ workerId: timesheetEntries.workerId, shift: timesheetEntries.shift }).from(timesheetEntries).where(eq(timesheetEntries.timesheetId, prev.id)))
		: [];

	const mask = (acct: string) => (isAdmin ? acct : '••••' + acct.slice(-4));
	return {
		sheet: { ...sheet, submitterName: names?.submitter ?? null, approverName: names?.approver ?? null },
		entries: entries.map((e) => ({ ...e, accountNo: mask(e.accountNo) })),
		workers: workerList.map((w) => ({ ...w, accountNo: mask(w.accountNo) })),
		departments,
		prev: prev ? { workDate: prev.workDate, crew: prevCrew } : null,
		sameDay,
		history,
		canEdit: canEditSheet(user, sheet),
		isOwner: sheet.submittedBy === user.id
	};
};

const num = (form: FormData, k: string, fallback: number) => {
	const v = Number(form.get(k));
	return form.has(k) && Number.isFinite(v) && v >= 0 ? v : fallback;
};

async function save(event: Parameters<Actions[string]>[0], submit: boolean) {
	const user = requireUser(event);
	const sheet = await getSheet(Number(event.params.id));
	if (!canEditSheet(user, sheet)) return fail(403, { message: 'ใบงานนี้ถูกส่งหรืออนุมัติแล้ว แก้ไขไม่ได้' });
	const form = await event.request.formData();
	const parsed = await parseEntries(String(form.get('entries') ?? '[]'));
	if ('error' in parsed) return fail(400, { message: parsed.error });
	if (submit && !parsed.rows.length) return fail(400, { message: 'ยังไม่มีรายชื่อลูกจ้างในใบงาน' });

	let rates: Rates | undefined;
	if (user.role === 'admin') {
		const r = ratesOf(sheet);
		rates = {
			dailyWage: num(form, 'dailyWage', r.dailyWage),
			travelAllowance: num(form, 'travelAllowance', r.travelAllowance),
			mealAllowance: num(form, 'mealAllowance', r.mealAllowance),
			nightAllowance: num(form, 'nightAllowance', r.nightAllowance)
		};
		if (!rates.dailyWage) return fail(400, { message: 'ค่าแรงต่อวันต้องมากกว่า 0' });
	}
	await saveSheet(user, sheet, parsed.rows, rates);
	if (submit && sheet.status === 'draft') await setSheetStatus(user, sheet, 'submitted');
	return { saved: true, submitted: submit };
}

export const actions: Actions = {
	save: (event) => save(event, false),
	submit: (event) => save(event, true),
	approve: async (event) => {
		const admin = requireAdmin(event);
		const sheet = await getSheet(Number(event.params.id));
		if (sheet.status !== 'submitted') return fail(400, { message: 'อนุมัติได้เฉพาะใบงานที่ส่งแล้ว' });
		await setSheetStatus(admin, sheet, 'approved');
		return { approved: true };
	},
	// admin sends a sheet back (or unlocks an approved one); the owner may recall a submitted one
	reopen: async (event) => {
		const user = requireUser(event);
		const sheet = await getSheet(Number(event.params.id));
		const ownerRecall = sheet.submittedBy === user.id && sheet.status === 'submitted';
		if (user.role !== 'admin' && !ownerRecall) return fail(403, { message: 'ไม่มีสิทธิ์ดึงใบงานนี้กลับ' });
		if (sheet.status === 'draft') return { ok: true };
		await setSheetStatus(user, sheet, 'draft');
		return { reopened: true };
	},
	delete: async (event) => {
		const user = requireUser(event);
		const sheet = await getSheet(Number(event.params.id));
		if (!canEditSheet(user, sheet) || sheet.status !== 'draft') return fail(403, { message: 'ลบได้เฉพาะใบงานสถานะร่าง' });
		await db.delete(timesheets).where(eq(timesheets.id, sheet.id));
		await logActivity({ userId: user.id, entityType: 'timesheet', entityId: sheet.id, entityLabel: sheetLabel(sheet), action: 'delete' });
		redirect(303, '/timesheets');
	}
};
