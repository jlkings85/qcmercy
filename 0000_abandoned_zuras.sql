CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`exception_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	`action` text NOT NULL,
	`notes` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `actions_exception` ON `actions` (`exception_id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`asset_key` text NOT NULL,
	`label` text NOT NULL,
	`details` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_kind_key` ON `assets` (`kind`,`asset_key`);--> statement-breakpoint
CREATE INDEX `assets_kind` ON `assets` (`kind`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	`entity_id` text NOT NULL,
	`event` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_time` ON `audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text,
	`device_id` text,
	`operator_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assignee` text,
	`due` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`details` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exceptions_status` ON `exceptions` (`status`);--> statement-breakpoint
CREATE INDEX `exceptions_assignee` ON `exceptions` (`assignee`);--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`credential_status` text DEFAULT 'pending' NOT NULL,
	`expires` text,
	`details` text DEFAULT '{}' NOT NULL,
	`verified_by` text,
	`verified_at` text,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operators_email` ON `operators` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `operators_auth` ON `operators` (`auth_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`operator_id` text NOT NULL,
	`device_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_device_time` ON `records` (`device_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `records_operator_time` ON `records` (`operator_id`,`created_at`);