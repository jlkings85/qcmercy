CREATE TABLE `temperature_records` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`qc_record_id` text,
	`operator_id` text NOT NULL,
	`observed_date` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `temperature_date` ON `temperature_records` (`observed_date`);--> statement-breakpoint
CREATE INDEX `temperature_operator` ON `temperature_records` (`operator_id`);