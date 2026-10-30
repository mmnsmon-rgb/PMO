import { and, eq, inArray, or } from 'drizzle-orm';
import { requireUser } from '$lib/server/auth';
import { loadActivity } from '$lib/server/activity';
import { activityLogs, tasks } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { summarize } from '$lib/server/stats';
import { listTasks } from '$lib/server/tasks';
import { timeState, today } from '$lib/labels';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const rows = await listTasks({ assigneeId: user.id });
	const myTaskIds = (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.assigneeId, user.id))).map((t) => t.id);
	const now = today();
	const rank = { overdue: 0, soon: 1, normal: 2, none: 3, done: 4 };

	return {
		summary: summarize(rows),
		open: rows
			.filter((t) => t.status !== 'done')
			.sort((a, b) => rank[timeState(a, now)] - rank[timeState(b, now)] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')),
		done: rows.filter((t) => t.status === 'done'),
		// my own edits + anything that happened to my tasks
		history: await loadActivity({
			where: or(
				eq(activityLogs.userId, user.id),
				myTaskIds.length
					? and(eq(activityLogs.entityType, 'task'), inArray(activityLogs.entityId, myTaskIds))
					: undefined
			),
			limit: 30
		})
	};
};
