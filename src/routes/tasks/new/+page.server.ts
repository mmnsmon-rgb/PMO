import { fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth';
import { logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { projects, tasks, users } from '$lib/server/db/schema';
import { nextTaskCode, parseTaskForm } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [projectList, members] = await Promise.all([
		db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
		db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.id))
	]);
	return {
		projects: projectList,
		members,
		projectId: Number(event.url.searchParams.get('project')) || null,
		code: await nextTaskCode()
	};
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireAdmin(event);
		const patch = parseTaskForm(await event.request.formData());
		if (!patch.title || !patch.projectId) return fail(400, { message: 'กรุณากรอกชื่องานและเลือกโปรเจกต์' });
		const [task] = await db
			.insert(tasks)
			.values({ ...patch, title: patch.title, projectId: patch.projectId, code: await nextTaskCode() })
			.returning();
		await logActivity({
			userId: user.id,
			entityType: 'task',
			entityId: task.id,
			entityLabel: `${task.code} ${task.title}`,
			action: 'create'
		});
		redirect(303, `/tasks/${task.id}`);
	}
};
