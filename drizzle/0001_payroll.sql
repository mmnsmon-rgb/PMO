CREATE TABLE `timesheet_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timesheet_id` integer NOT NULL,
	`worker_id` integer NOT NULL,
	`worker_name` text NOT NULL,
	`bank` text NOT NULL,
	`account_no` text NOT NULL,
	`shift` text DEFAULT 'D' NOT NULL,
	`ot1_hours` real DEFAULT 0 NOT NULL,
	`ot15_hours` real DEFAULT 0 NOT NULL,
	`ot3_hours` real DEFAULT 0 NOT NULL,
	`incentive` real DEFAULT 0 NOT NULL,
	`late_minutes` real DEFAULT 0 NOT NULL,
	`deduction` real DEFAULT 0 NOT NULL,
	`note` text,
	`total` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`timesheet_id`) REFERENCES `timesheets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entries_sheet_idx` ON `timesheet_entries` (`timesheet_id`);--> statement-breakpoint
CREATE INDEX `entries_worker_idx` ON `timesheet_entries` (`worker_id`);--> statement-breakpoint
CREATE TABLE `timesheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_date` text NOT NULL,
	`department` text NOT NULL,
	`submitted_by` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`daily_wage` real NOT NULL,
	`travel_allowance` real DEFAULT 0 NOT NULL,
	`meal_allowance` real DEFAULT 0 NOT NULL,
	`night_allowance` real DEFAULT 0 NOT NULL,
	`note` text,
	`submitted_at` text,
	`approved_by` integer,
	`approved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `timesheets_date_idx` ON `timesheets` (`work_date`);--> statement-breakpoint
CREATE INDEX `timesheets_user_idx` ON `timesheets` (`submitted_by`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`bank` text NOT NULL,
	`account_no` text NOT NULL,
	`department` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_account_no_unique` ON `workers` (`account_no`);