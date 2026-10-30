import { fail, redirect } from '@sveltejs/kit';
import { asc, count, ne } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth';
import { logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { tasks, users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/password';
import { parseUserForm } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [list, openCounts] = await Promise.all([
		db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				role: users.role,
				position: users.position,
				level: users.level,
				active: users.active
			})
			.from(users)
			.orderBy(asc(users.id)),
		db
			.select({ assigneeId: tasks.assigneeId, n: count() })
			.from(tasks)
			.where(ne(tasks.status, 'done'))
			.groupBy(tasks.assigneeId)
	]);
	const open = new Map(openCounts.map((r) => [r.assigneeId, r.n]));
	return { users: list.map((u) => ({ ...u, openTasks: open.get(u.id) ?? 0 })) };
};

export const actions: Actions = {
	create: async (event) => {
		const admin = requireAdmin(event);
		const parsed = await parseUserForm(await event.request.formData(), { requirePassword: true });
		if ('error' in parsed) return fail(400, { message: parsed.error });
		const [u] = await db
			.insert(users)
			.values({ ...parsed.values, passwordHash: await hashPassword(parsed.password) })
			.returning();
		await logActivity({ userId: admin.id, entityType: 'user', entityId: u.id, entityLabel: u.name, action: 'create' });
		redirect(303, '/users');
	}
};
