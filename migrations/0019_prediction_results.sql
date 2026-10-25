CREATE TABLE `prediction_results` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`cell` integer NOT NULL,
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`decision` text NOT NULL,
	`correct` integer NOT NULL,
	`pick` text NOT NULL,
	`answer` text NOT NULL,
	`prompt` text NOT NULL,
	`day` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_results_unique` ON `prediction_results` (`org_id`,`notebook_id`,`cell`,`user_id`,`decision`);