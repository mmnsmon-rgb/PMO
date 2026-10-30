import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) =>
	text(name)
		.notNull()
		.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
const createdAt = () => timestamp('created_at');

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
	position: text('position'),
	duty: text('duty'),
	level: text('level'),
	startDate: text('start_date'),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: createdAt()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(), // sha-256 of the cookie token
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull() // unix ms
});

export const projects = sqliteTable('projects', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	description: text('description'),
	createdAt: createdAt()
});

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const tasks = sqliteTable(
	'tasks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		code: text('code').notNull().unique(),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		assigneeId: integer('assignee_id').references(() => users.id, { onDelete: 'set null' }),
		priority: text('priority', { enum: TASK_PRIORITIES }).notNull().default('medium'),
		status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
		startDate: text('start_date'), // YYYY-MM-DD
		dueDate: text('due_date'), // YYYY-MM-DD
		estimatedHours: real('estimated_hours').notNull().default(0),
		actualHours: real('actual_hours').notNull().default(0),
		progress: integer('progress').notNull().default(0), // 0-100
		note: text('note'),
		createdAt: createdAt(),
		updatedAt: timestamp('updated_at')
	},
	(t) => [index('tasks_project_idx').on(t.projectId), index('tasks_assignee_idx').on(t.assigneeId)]
);

export const activityLogs = sqliteTable(
	'activity_logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
		entityType: text('entity_type', { enum: ['task', 'project', 'user'] }).notNull(),
		entityId: integer('entity_id').notNull(),
		entityLabel: text('entity_label').notNull(), // kept so history survives deletes
		action: text('action', { enum: ['create', 'update', 'delete', 'revert', 'import'] }).notNull(),
		// JSON: { field: { from, to } }
		changes: text('changes', { mode: 'json' }).$type<Record<string, { from: unknown; to: unknown }>>(),
		createdAt: createdAt()
	},
	(t) => [index('activity_entity_idx').on(t.entityType, t.entityId), index('activity_user_idx').on(t.userId)]
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
