CREATE TABLE `history_rows` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`identity_key` text NOT NULL,
	`batch_id` text NOT NULL,
	`record_id` text NOT NULL,
	`source_row` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `history_rows_identity` ON `history_rows` (`identity_key`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`file_hash` text NOT NULL,
	`filename` text NOT NULL,
	`created_at` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`source_rows` integer NOT NULL,
	`imported_rows` integer NOT NULL,
	`skipped_rows` integer NOT NULL,
	`record_count` integer NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_hash` ON `import_batches` (`file_hash`);