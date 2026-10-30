import { and, asc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { requireUser } from '$lib/server/auth';
import { loadActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { activityLogs, tasks, users } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const q = event.url.searchParams;
	const isAdmin = user.role === 'admin';
	// employees only see their own actions; admins can filter by anyone
	const who = isAdmin ? Number(q.get('user')) || undefined : user.id;
	const type = q.get('type');
	const from = q.get('from');
	const to = q.get('to');
	const pageNo = Math.max(1, Number(q.get('page')) || 1);

	const conds: SQL[] = [];
	if (who) conds.push(eq(activityLogs.userId, who));
	if (type === 'task' || type === 'project' || type === 'user') conds.push(eq(activityLogs.entityType, type));
	if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) conds.push(gte(activityLogs.createdAt, from));
	if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) conds.push(lte(activityLogs.createdAt, to + 'T23:59:59.999Z'));

	const entries = await loadActivity({
		where: conds.length ? and(...conds) : undefined,
		limit: PAGE_SIZE + 1,
		offset: (pageNo - 1) * PAGE_SIZE
	});

	// which tasks may the viewer revert (own tasks, or any for admin)
	let editableTaskIds: number[] | null = null;
	if (!isAdmin) {
		editableTaskIds = (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.assigneeId, user.id))).map((t) => t.id);
	}

	return {
		entries: entries.slice(0, PAGE_SIZE).map((e) => ({
			...e,
			revertable: e.revertable && (editableTaskIds === null || editableTaskIds.includes(e.entityId))
		})),
		hasMore: entries.length > PAGE_SIZE,
		page: pageNo,
		members: isAdmin ? await db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.id)) : [],
		filter: { user: who ?? '', type: type ?? '', from: from ?? '', to: to ?? '' }
	};
};
