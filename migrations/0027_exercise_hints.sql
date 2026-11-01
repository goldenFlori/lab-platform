CREATE TABLE `hint_reveals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`cell` integer NOT NULL,
	`user_id` text NOT NULL,
	`hint` integer NOT NULL,
	`day` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hint_reveals_unique` ON `hint_reveals` (`org_id`,`notebook_id`,`cell`,`user_id`,`hint`);--> statement-breakpoint
CREATE INDEX `hint_reveals_day_idx` ON `hint_reveals` (`day`);--> statement-breakpoint
ALTER TABLE `exercises` ADD `hints` text;