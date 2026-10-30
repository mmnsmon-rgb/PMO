import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { diff, loadActivity, logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { activityLogs, timesheetEntries, timesheets, workers } from '$lib/server/db/schema';
import { listDepartments } from '$lib/server/payroll';
import { parseWorkerForm, WORKER_FIELDS } from '$lib/server/workers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const isAdmin = user.role === 'admin';
	const [list, departments] = await Promise.all([
		db
			.select({
				id: workers.id,
				name: workers.name,
				bank: workers.bank,
				accountNo: workers.accountNo,
				department: workers.department,
				active: workers.active,
				days: sql<number>`count(${timesheetEntries.id})`,
				lastDate: sql<string | null>`max(${timesheets.workDate})`,
				earned: sql<number>`coalesce(sum(case when ${timesheets.status} = 'approved' then ${timesheetEntries.total} end), 0)`
			})
			.from(workers)
			.leftJoin(timesheetEntries, eq(timesheetEntries.workerId, workers.id))
			.leftJoin(timesheets, eq(timesheetEntries.timesheetId, timesheets.id))
			.groupBy(workers.id)
			.orderBy(asc(workers.department), asc(workers.name)),
		listDepartments()
	]);
	const historyId = Number(event.url.searchParams.get('history')) || 0;
	return {
		// employees need names to key sheets, not full account numbers or payout history
		workers: list.map((w) => (isAdmin ? w : { ...w, accountNo: '••••' + w.accountNo.slice(-4), earned: 0 })),
		departments,
		history:
			isAdmin && historyId
				? await loadActivity({ where: and(eq(activityLogs.entityType, 'worker'), eq(activityLogs.entityId, historyId)), limit: 30 })
				: null,
		historyId
	};
};

export const actions: Actions = {
	// any signed-in user can register a new worker while keying a sheet
	create: async (event) => {
		const user = requireUser(event);
		const parsed = await parseWorkerForm(await event.request.formData());
		if ('error' in parsed) return fail(400, { message: parsed.error });
		const [w] = await db.insert(workers).values(parsed.values).returning();
		await logActivity({ userId: user.id, entityType: 'worker', entityId: w.id, entityLabel: w.name, action: 'create' });
		return { created: w };
	},
	update: async (event) => {
		const admin = requireAdmin(event);
		const form = await event.request.formData();
		const id = Number(form.get('id'));
		const [before] = await db.select().from(workers).where(eq(workers.id, id));
		if (!before) error(404, 'ไม่พบลูกจ้างนี้');
		const parsed = await parseWorkerForm(form, id);
		if ('error' in parsed) return fail(400, { message: parsed.error, id });
		const changes = diff(before, parsed.values, [...WORKER_FIELDS]);
		if (!Object.keys(changes).length) return { ok: true };
		await db.update(workers).set(parsed.values).where(eq(workers.id, id));
		await logActivity({ userId: admin.id, entityType: 'worker', entityId: id, entityLabel: parsed.values.name, action: 'update', changes });
		return { ok: true };
	},
	delete: async (event) => {
		const admin = requireAdmin(event);
		const id = Number((await event.request.formData()).get('id'));
		const [w] = await db.select().from(workers).where(eq(workers.id, id));
		if (!w) error(404, 'ไม่พบลูกจ้างนี้');
		const [used] = await db.select({ id: timesheetEntries.id }).from(timesheetEntries).where(eq(timesheetEntries.workerId, id)).limit(1);
		if (used) return fail(400, { message: `${w.name} มีประวัติการจ่ายเงินแล้ว จึงลบไม่ได้ — ให้ปิดใช้งานแทน`, id });
		await db.delete(workers).where(eq(workers.id, id));
		await logActivity({ userId: admin.id, entityType: 'worker', entityId: id, entityLabel: w.name, action: 'delete' });
		return { ok: true };
	}
};
