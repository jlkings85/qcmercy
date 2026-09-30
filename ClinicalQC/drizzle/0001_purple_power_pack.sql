ALTER TABLE `operators` ADD `network_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `operators_network_id` ON `operators` (`network_id`);--> statement-breakpoint
CREATE INDEX `records_occurred_at` ON `records` (`occurred_at`);