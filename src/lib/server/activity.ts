import { desc, eq, type SQL } from 'drizzle-orm';
import { FIELD_LABEL, PRIORITY_LABEL, STATUS_LABEL, fmtDate } from '$lib/labels';
import { db } from './db';
import { activityLogs, projects, users, type ActivityLog } from './db/schema';

type Changes = Record<string, { from: unknown; to: unknown }>;

/** Field-level diff between two records, limited to `fields`. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: (keyof T)[]) {
	const changes: Changes = {};
	for (const f of fields) {
		if (!(f in after)) continue;
		const a = before[f] ?? null;
		const b = after[f] ?? null;
		if (a !== b) changes[f as string] = { from: a, to: b };
	}
	return changes;
}

export async function logActivity(entry: {
	userId: number | null;
	entityType: ActivityLog['entityType'];
	entityId: number;
	entityLabel: string;
	action: ActivityLog['action'];
	changes?: Changes | null;
}) {
	await db.insert(activityLogs).values({ ...entry, changes: entry.changes ?? null });
}

/** Load log entries with user-facing labels (ids resolved to names, enums translated). */
export async function loadActivity(opts: { where?: SQL; limit?: number; offset?: number } = {}) {
	const [rows, userList, projectList] = await Promise.all([
		db
			.select({ log: activityLogs, userName: users.name })
			.from(activityLogs)
			.leftJoin(users, eq(activityLogs.userId, users.id))
			.where(opts.where)
			.orderBy(desc(activityLogs.id))
			.limit(opts.limit ?? 50)
			.offset(opts.offset ?? 0),
		db.select({ id: users.id, name: users.name }).from(users),
		db.select({ id: projects.id, name: projects.name }).from(projects)
	]);
	const userName = new Map(userList.map((u) => [u.id, u.name]));
	const projectName = new Map(projectList.map((p) => [p.id, p.name]));

	const show = (field: string, v: unknown): string => {
		if (v === null || v === undefined || v === '') return '—';
		switch (field) {
			case 'status':
				return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v);
			case 'priority':
				return PRIORITY_LABEL[v as keyof typeof PRIORITY_LABEL] ?? String(v);
			case 'assigneeId':
				return userName.get(v as number) ?? `#${v}`;
			case 'projectId':
				return projectName.get(v as number) ?? `#${v}`;
			case 'startDate':
			case 'dueDate':
				return fmtDate(v as string);
			case 'progress':
				return `${v}%`;
			case 'role':
				return v === 'admin' ? 'Admin' : 'พนักงาน';
			case 'active':
				return v ? 'ใช้งาน' : 'ปิดใช้งาน';
			case 'password':
				return '••••';
			default:
				return String(v);
		}
	};

	return rows.map(({ log, userName: by }) => ({
		id: log.id,
		createdAt: log.createdAt,
		by: by ?? 'ระบบ',
		action: log.action,
		entityType: log.entityType,
		entityId: log.entityId,
		entityLabel: log.entityLabel,
		revertable: log.entityType === 'task' && (log.action === 'update' || log.action === 'revert') && !!log.changes,
		changes: Object.entries(log.changes ?? {}).map(([field, c]) => ({
			field,
			label: FIELD_LABEL[field] ?? field,
			from: show(field, c.from),
			to: show(field, c.to)
		}))
	}));
}
export type ActivityEntry = Awaited<ReturnType<typeof loadActivity>>[number];
