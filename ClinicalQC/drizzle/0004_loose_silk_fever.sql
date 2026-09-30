CREATE TABLE `application_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`details` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
