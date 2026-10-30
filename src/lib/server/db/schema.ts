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
		entityType: text('entity_type', { enum: ['task', 'project', 'user', 'timesheet', 'worker'] }).notNull(),
		entityId: integer('entity_id').notNull(),
		entityLabel: text('entity_label').notNull(), // kept so history survives deletes
		action: text('action', { enum: ['create', 'update', 'delete', 'revert', 'import', 'export'] }).notNull(),
		// JSON: { field: { from, to } }
		changes: text('changes', { mode: 'json' }).$type<Record<string, { from: unknown; to: unknown }>>(),
		createdAt: createdAt()
	},
	(t) => [index('activity_entity_idx').on(t.entityType, t.entityId), index('activity_user_idx').on(t.userId)]
);

// ---- Daily cash payroll (replaces the "เงินสด DSV <date>.xlsx" files) ----

/** Daily-wage workers who get paid — not app users. */
export const workers = sqliteTable('workers', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	bank: text('bank').notNull(),
	accountNo: text('account_no').notNull().unique(), // text: keeps leading zeros
	department: text('department'), // usual site, e.g. "DSV กม.39"
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: createdAt()
});

export const SHEET_STATUSES = ['draft', 'submitted', 'approved'] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

/** One site's work for one day — what used to be one Excel file sent over LINE. */
export const timesheets = sqliteTable(
	'timesheets',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		workDate: text('work_date').notNull(), // YYYY-MM-DD
		department: text('department').notNull(),
		submittedBy: integer('submitted_by').references(() => users.id, { onDelete: 'set null' }),
		status: text('status', { enum: SHEET_STATUSES }).notNull().default('draft'),
		// rate snapshot (row 2 of the Excel sheet); OT and late rates derive from dailyWage
		dailyWage: real('daily_wage').notNull(),
		travelAllowance: real('travel_allowance').notNull().default(0),
		mealAllowance: real('meal_allowance').notNull().default(0),
		nightAllowance: real('night_allowance').notNull().default(0),
		note: text('note'),
		submittedAt: text('submitted_at'),
		approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
		approvedAt: text('approved_at'),
		createdAt: createdAt(),
		updatedAt: timestamp('updated_at')
	},
	(t) => [index('timesheets_date_idx').on(t.workDate), index('timesheets_user_idx').on(t.submittedBy)]
);

export const SHIFTS = ['D', 'N', 'H'] as const;
export type Shift = (typeof SHIFTS)[number];

export const timesheetEntries = sqliteTable(
	'timesheet_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		timesheetId: integer('timesheet_id')
			.notNull()
			.references(() => timesheets.id, { onDelete: 'cascade' }),
		workerId: integer('worker_id')
			.notNull()
			.references(() => workers.id),
		// bank details are copied at entry time so a later account edit can't change a past payment
		workerName: text('worker_name').notNull(),
		bank: text('bank').notNull(),
		accountNo: text('account_no').notNull(),
		shift: text('shift', { enum: SHIFTS }).notNull().default('D'),
		ot1Hours: real('ot1_hours').notNull().default(0),
		ot15Hours: real('ot15_hours').notNull().default(0),
		ot3Hours: real('ot3_hours').notNull().default(0),
		incentive: real('incentive').notNull().default(0),
		lateMinutes: real('late_minutes').notNull().default(0),
		deduction: real('deduction').notNull().default(0),
		note: text('note'), // "หลักฐานการทำงาน"
		total: real('total').notNull().default(0) // calcPay() result, stored for reporting
	},
	(t) => [index('entries_sheet_idx').on(t.timesheetId), index('entries_worker_idx').on(t.workerId)]
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type Timesheet = typeof timesheets.$inferSelect;
export type TimesheetEntry = typeof timesheetEntries.$inferSelect;
