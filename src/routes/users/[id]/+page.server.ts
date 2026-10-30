import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth';
import { diff, loadActivity, logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { activityLogs, sessions, tasks, users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/password';
import { parseUserForm, USER_FIELDS } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

async function getUser(id: number) {
	const [u] = await db.select().from(users).where(eq(users.id, id));
	if (!u) error(404, 'ไม่พบพนักงานนี้');
	return u;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { passwordHash: _, ...user } = await getUser(Number(event.params.id));
	return {
		user,
		history: await loadActivity({
			where: and(eq(activityLogs.entityType, 'user'), eq(activityLogs.entityId, user.id)),
			limit: 50
		})
	};
};

export const actions: Actions = {
	update: async (event) => {
		const admin = requireAdmin(event);
		const before = await getUser(Number(event.params.id));
		const parsed = await parseUserForm(await event.request.formData(), { id: before.id, requirePassword: false });
		if ('error' in parsed) return fail(400, { message: parsed.error });
		const values = parsed.values;
		if (before.id === admin.id) {
			values.role = 'admin';
			values.active = true;
		}
		const changes = diff(before, values, [...USER_FIELDS]);
		const set: Partial<typeof users.$inferInsert> = { ...values };
		if (parsed.password) {
			set.passwordHash = await hashPassword(parsed.password);
			changes.password = { from: '***', to: '***' };
		}
		if (!Object.keys(changes).length) return { ok: true };
		await db.update(users).set(set).where(eq(users.id, before.id));
		// sign out a deactivated user or one whose password was reset
		if (!values.active || parsed.password) await db.delete(sessions).where(eq(sessions.userId, before.id));
		await logActivity({ userId: admin.id, entityType: 'user', entityId: before.id, entityLabel: values.name, action: 'update', changes });
		return { ok: true };
	},
	delete: async (event) => {
		const admin = requireAdmin(event);
		const u = await getUser(Number(event.params.id));
		if (u.id === admin.id) return fail(400, { message: 'ไม่สามารถลบบัญชีของตัวเองได้' });
		// keep the audit trail intact: someone with recorded edits can only be deactivated
		const [hasLogs] = await db.select({ id: activityLogs.id }).from(activityLogs).where(eq(activityLogs.userId, u.id)).limit(1);
		if (hasLogs) {
			return fail(400, { message: 'พนักงานคนนี้มีประวัติการแก้ไขในระบบ จึงลบไม่ได้ — ให้ปิดใช้งานบัญชีแทน เพื่อเก็บประวัติไว้' });
		}
		await db.update(tasks).set({ assigneeId: null }).where(eq(tasks.assigneeId, u.id));
		await db.delete(sessions).where(eq(sessions.userId, u.id));
		await db.delete(users).where(eq(users.id, u.id));
		await logActivity({ userId: admin.id, entityType: 'user', entityId: u.id, entityLabel: u.name, action: 'delete' });
		redirect(303, '/users');
	}
};
