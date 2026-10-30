import { fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import { groupBy, summarize } from '$lib/server/stats';
import { listTasks } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireUser(event);
	const [list, rows] = await Promise.all([db.select().from(projects).orderBy(asc(projects.name)), listTasks()]);
	const byProject = groupBy(rows, (t) => t.projectId);
	return {
		projects: list.map((p) => {
			const ts = byProject.get(p.id) ?? [];
			return {
				...p,
				...summarize(ts),
				members: [...new Set(ts.map((t) => t.assigneeName).filter(Boolean))] as string[]
			};
		})
	};
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireAdmin(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		if (!name) return fail(400, { message: 'กรุณาระบุชื่อโปรเจกต์' });
		const [dupe] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, name));
		if (dupe) return fail(400, { message: 'มีโปรเจกต์ชื่อนี้แล้ว' });
		const [p] = await db.insert(projects).values({ name, description }).returning();
		await logActivity({ userId: user.id, entityType: 'project', entityId: p.id, entityLabel: p.name, action: 'create' });
		redirect(303, `/projects/${p.id}`);
	}
};
