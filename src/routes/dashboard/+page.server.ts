import { eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth';
import { loadActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { projects, users } from '$lib/server/db/schema';
import { groupBy, summarize } from '$lib/server/stats';
import { listTasks } from '$lib/server/tasks';
import { timeState, today } from '$lib/labels';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [rows, members, projectList, recent] = await Promise.all([
		listTasks(),
		db.select({ id: users.id, name: users.name, position: users.position }).from(users).where(eq(users.active, true)),
		db.select().from(projects).orderBy(projects.name),
		loadActivity({ limit: 8 })
	]);

	const byUser = groupBy(rows, (t) => t.assigneeId);
	const byProject = groupBy(rows, (t) => t.projectId);
	const now = today();
	const byDue = (a: { dueDate: string | null }, b: { dueDate: string | null }) =>
		(a.dueDate ?? '').localeCompare(b.dueDate ?? '');

	return {
		today: now,
		total: summarize(rows),
		people: members
			.map((m) => ({ ...m, ...summarize(byUser.get(m.id) ?? []) }))
			.filter((p) => p.total > 0)
			.sort((a, b) => b.overdue - a.overdue || b.total - a.total),
		projects: projectList.map((p) => {
			const list = byProject.get(p.id) ?? [];
			return {
				...p,
				...summarize(list),
				avgProgress: list.length ? Math.round(list.reduce((a, t) => a + t.progress, 0) / list.length) : 0
			};
		}),
		overdue: rows.filter((t) => timeState(t, now) === 'overdue').sort(byDue),
		dueSoon: rows.filter((t) => timeState(t, now) === 'soon').sort(byDue),
		recent
	};
};
