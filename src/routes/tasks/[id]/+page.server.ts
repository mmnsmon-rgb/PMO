import { redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { loadActivity, logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { activityLogs, projects, tasks, users } from '$lib/server/db/schema';
import { canEditTask, getTask, parseTaskForm, revertTaskChange, updateTask } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const id = Number(event.params.id);
	const task = await getTask(id);
	const [projectList, members, history] = await Promise.all([
		db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
		db.select({ id: users.id, name: users.name, active: users.active }).from(users).orderBy(asc(users.id)),
		loadActivity({ where: and(eq(activityLogs.entityType, 'task'), eq(activityLogs.entityId, id)), limit: 200 })
	]);
	return {
		task,
		projectName: projectList.find((p) => p.id === task.projectId)?.name ?? '',
		assigneeName: members.find((m) => m.id === task.assigneeId)?.name ?? null,
		projects: projectList,
		members: members.filter((m) => m.active || m.id === task.assigneeId),
		canEdit: canEditTask(user, task),
		history
	};
};

export const actions: Actions = {
	save: async (event) => {
		const user = requireUser(event);
		await updateTask(user, Number(event.params.id), parseTaskForm(await event.request.formData()));
		return { ok: true };
	},
	revert: async (event) => {
		const user = requireUser(event);
		const logId = Number((await event.request.formData()).get('logId'));
		await revertTaskChange(user, logId);
		return { ok: true };
	},
	delete: async (event) => {
		const user = requireAdmin(event);
		const task = await getTask(Number(event.params.id));
		await db.delete(tasks).where(eq(tasks.id, task.id));
		await logActivity({
			userId: user.id,
			entityType: 'task',
			entityId: task.id,
			entityLabel: `${task.code} ${task.title}`,
			action: 'delete'
		});
		redirect(303, `/projects/${task.projectId}`);
	}
};
