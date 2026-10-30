import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { requireUser } from '$lib/server/auth';
import { logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { SHEET_STATUSES, timesheets, users, type SheetStatus } from '$lib/server/db/schema';
import { listDepartments, listSheets, sheetLabel } from '$lib/server/payroll';
import { today } from '$lib/labels';
import { DEFAULT_RATES } from '$lib/payroll';
import type { Actions, PageServerLoad } from './$types';

const monthRange = (m: string) => {
	const [y, mo] = m.split('-').map(Number);
	const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
	return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
};

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const isAdmin = user.role === 'admin';
	const q = event.url.searchParams;
	const month = /^\d{4}-\d{2}$/.test(q.get('month') ?? '') ? q.get('month')! : today().slice(0, 7);
	const status = SHEET_STATUSES.includes(q.get('status') as SheetStatus) ? (q.get('status') as SheetStatus) : undefined;
	const department = q.get('department') || undefined;
	// employees only see sheets they keyed; admins can filter by submitter
	const submittedBy = isAdmin ? Number(q.get('user')) || undefined : user.id;

	const [sheets, departments, members] = await Promise.all([
		listSheets({ ...monthRange(month), status, department, submittedBy }),
		listDepartments(),
		isAdmin ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.id)) : []
	]);
	return { sheets, departments, members, filter: { month, status: status ?? '', department: department ?? '', user: submittedBy ?? '' } };
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const workDate = String(form.get('workDate') ?? '');
		const department = String(form.get('department') ?? '').trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return fail(400, { message: 'กรุณาเลือกวันที่ทำงาน' });
		if (!department) return fail(400, { message: 'กรุณาระบุหน่วยงาน' });
		if (workDate > today()) return fail(400, { message: 'ยังไม่ถึงวันที่ทำงานนี้' });
		// one sheet per site per day — the payroll summary would otherwise double-count
		const [dupe] = await db
			.select({ id: timesheets.id, by: users.name })
			.from(timesheets)
			.leftJoin(users, eq(timesheets.submittedBy, users.id))
			.where(and(eq(timesheets.workDate, workDate), eq(timesheets.department, department)));
		if (dupe) {
			if (user.role === 'admin' || dupe.by === user.name) redirect(303, `/timesheets/${dupe.id}`);
			return fail(400, { message: `มีใบงาน ${department} วันที่นี้แล้ว (โดย ${dupe.by ?? '—'})` });
		}
		const [s] = await db
			.insert(timesheets)
			.values({ workDate, department, submittedBy: user.id, ...DEFAULT_RATES })
			.returning();
		await logActivity({ userId: user.id, entityType: 'timesheet', entityId: s.id, entityLabel: sheetLabel(s), action: 'create' });
		redirect(303, `/timesheets/${s.id}`);
	}
};
