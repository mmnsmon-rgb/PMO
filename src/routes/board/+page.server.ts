import { asc, eq } from 'drizzle-orm';
import { requireUser } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { projects, users } from '$lib/server/db/schema';
import { listTasks, parseTaskForm, updateTask } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const q = event.url.searchParams;
	const projectId = Number(q.get('project')) || undefined;
	// "mine" is the default for employees; admins see everyone unless filtered
	const assigneeParam = q.get('assignee') ?? (user.role === 'admin' ? '' : String(user.id));
	const assigneeId = Number(assigneeParam) || undefined;

	const [rows, projectList, members] = await Promise.all([
		listTasks({ projectId, assigneeId }),
		db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
		db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.id))
	]);
	return { tasks: rows, projects: projectList, members, filter: { projectId, assigneeId } };
};

export const actions: Actions = {
	move: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const id = Number(form.get('id'));
		const patch = parseTaskForm(form);
		await updateTask(user, id, { status: patch.status });
		return { ok: true };
	}
};
