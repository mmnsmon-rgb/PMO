import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { diff, logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { projects, tasks } from '$lib/server/db/schema';
import { summarize } from '$lib/server/stats';
import { listTasks } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

async function getProject(id: number) {
	const [p] = await db.select().from(projects).where(eq(projects.id, id));
	if (!p) error(404, 'ไม่พบโปรเจกต์นี้');
	return p;
}

export const load: PageServerLoad = async (event) => {
	requireUser(event);
	const project = await getProject(Number(event.params.id));
	const rows = await listTasks({ projectId: project.id });
	return { project, tasks: rows, summary: summarize(rows) };
};

export const actions: Actions = {
	update: async (event) => {
		const user = requireAdmin(event);
		const before = await getProject(Number(event.params.id));
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		if (!name) return fail(400, { message: 'กรุณาระบุชื่อโปรเจกต์' });
		const [dupe] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.name, name), ne(projects.id, before.id)));
		if (dupe) return fail(400, { message: 'มีโปรเจกต์ชื่อนี้แล้ว' });
		const changes = diff(before, { name, description }, ['name', 'description']);
		if (Object.keys(changes).length) {
			await db.update(projects).set({ name, description }).where(eq(projects.id, before.id));
			await logActivity({ userId: user.id, entityType: 'project', entityId: before.id, entityLabel: name, action: 'update', changes });
		}
		return { ok: true };
	},
	delete: async (event) => {
		const user = requireAdmin(event);
		const p = await getProject(Number(event.params.id));
		// explicit rather than relying on FK cascade (PRAGMA foreign_keys may be off)
		await db.delete(tasks).where(eq(tasks.projectId, p.id));
		await db.delete(projects).where(eq(projects.id, p.id));
		await logActivity({ userId: user.id, entityType: 'project', entityId: p.id, entityLabel: p.name, action: 'delete' });
		redirect(303, '/projects');
	}
};
