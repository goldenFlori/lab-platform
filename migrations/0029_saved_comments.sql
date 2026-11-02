CREATE TABLE `saved_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`cell` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_comments_notebook_idx` ON `saved_comments` (`org_id`,`notebook_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `saved_comments_id_org_unique` ON `saved_comments` (`id`,`org_id`);