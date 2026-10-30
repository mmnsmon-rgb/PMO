import { error } from '@sveltejs/kit';
import { and, asc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { activityLogs, projects, tasks, TASK_PRIORITIES, TASK_STATUSES, users, type Task } from './db/schema';
import { diff, logActivity } from './activity';

type SessionUser = NonNullable<App.Locals['user']>;

export const TASK_FIELDS = [
	'title',
	'projectId',
	'assigneeId',
	'priority',
	'status',
	'startDate',
	'dueDate',
	'estimatedHours',
	'actualHours',
	'progress',
	'note'
] as const satisfies (keyof Task)[];

/** Fields an employee may change on a task assigned to them. */
const MEMBER_FIELDS = new Set<string>(['status', 'progress', 'actualHours', 'note']);

export function listTasks(where?: { projectId?: number; assigneeId?: number }) {
	const conds: SQL[] = [];
	if (where?.projectId) conds.push(eq(tasks.projectId, where.projectId));
	if (where?.assigneeId) conds.push(eq(tasks.assigneeId, where.assigneeId));
	return db
		.select({ ...getTableColumns(tasks), projectName: projects.name, assigneeName: users.name })
		.from(tasks)
		.innerJoin(projects, eq(tasks.projectId, projects.id))
		.leftJoin(users, eq(tasks.assigneeId, users.id))
		.where(conds.length ? and(...conds) : undefined)
		.orderBy(asc(tasks.code));
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function getTask(id: number) {
	const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
	if (!t) error(404, 'ไม่พบงานนี้');
	return t;
}

export function canEditTask(user: SessionUser, task: Pick<Task, 'assigneeId'>) {
	return user.role === 'admin' || task.assigneeId === user.id;
}

/** Parse a task form into a partial patch (only fields present in the form). */
export function parseTaskForm(form: FormData) {
	const patch: Partial<Task> = {};
	const s = (k: string) => (form.has(k) ? String(form.get(k) ?? '').trim() : undefined);
	const title = s('title');
	if (title !== undefined) {
		if (!title) error(400, 'กรุณาระบุชื่องาน');
		patch.title = title;
	}
	const projectId = s('projectId');
	if (projectId !== undefined) patch.projectId = Number(projectId);
	const assigneeId = s('assigneeId');
	if (assigneeId !== undefined) patch.assigneeId = assigneeId ? Number(assigneeId) : null;
	const priority = s('priority');
	if (priority !== undefined && (TASK_PRIORITIES as readonly string[]).includes(priority))
		patch.priority = priority as Task['priority'];
	const status = s('status');
	if (status !== undefined) {
		if (!(TASK_STATUSES as readonly string[]).includes(status)) error(400, 'สถานะไม่ถูกต้อง');
		patch.status = status as Task['status'];
	}
	for (const k of ['startDate', 'dueDate'] as const) {
		const v = s(k);
		if (v !== undefined) patch[k] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
	}
	for (const k of ['estimatedHours', 'actualHours'] as const) {
		const v = s(k);
		if (v !== undefined) patch[k] = Math.max(0, Number(v) || 0);
	}
	const progress = s('progress');
	if (progress !== undefined) patch.progress = Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));
	const note = s('note');
	if (note !== undefined) patch.note = note || null;
	return patch;
}

export async function updateTask(user: SessionUser, id: number, patch: Partial<Task>, action: 'update' | 'revert' = 'update') {
	const before = await getTask(id);
	if (!canEditTask(user, before)) error(403, 'คุณแก้ไขได้เฉพาะงานของตัวเอง');
	if (user.role !== 'admin') {
		for (const k of Object.keys(patch)) if (!MEMBER_FIELDS.has(k)) delete patch[k as keyof Task];
	}
	// keep status and progress consistent
	if (action === 'update' && patch.status === 'done' && before.status !== 'done' && patch.progress === undefined) patch.progress = 100;

	const changes = diff(before, patch, [...TASK_FIELDS]);
	if (!Object.keys(changes).length) return before;

	const [after] = await db
		.update(tasks)
		.set({ ...patch, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` })
		.where(eq(tasks.id, id))
		.returning();
	await logActivity({
		userId: user.id,
		entityType: 'task',
		entityId: id,
		entityLabel: `${after.code} ${after.title}`,
		action,
		changes
	});
	return after;
}

/** Restore the "from" values recorded in a task log entry. */
export async function revertTaskChange(user: SessionUser, logId: number) {
	const [log] = await db.select().from(activityLogs).where(eq(activityLogs.id, logId));
	if (!log || log.entityType !== 'task' || !log.changes) error(400, 'รายการนี้ย้อนกลับไม่ได้');
	const patch = Object.fromEntries(
		Object.entries(log.changes)
			.filter(([k]) => (TASK_FIELDS as readonly string[]).includes(k))
			.map(([k, v]) => [k, v.from])
	) as Partial<Task>;
	return updateTask(user, log.entityId, patch, 'revert');
}

export async function nextTaskCode() {
	const [row] = await db
		.select({ max: sql<number>`max(cast(substr(${tasks.code}, 3) as integer))` })
		.from(tasks)
		.where(sql`${tasks.code} like 'T-%'`);
	return `T-${String((row?.max ?? 0) + 1).padStart(3, '0')}`;
}
