CREATE TABLE `embeds` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`cell` integer NOT NULL,
	`viz` text NOT NULL,
	`title` text,
	`props` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `embeds_notebook_cell_unique` ON `embeds` (`org_id`,`notebook_id`,`cell`);--> statement-breakpoint
CREATE TABLE `file_chunks` (
	`org_id` text NOT NULL,
	`file_id` text NOT NULL,
	`n` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`org_id`, `file_id`, `n`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`,`org_id`) REFERENCES `files`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`encoding` text DEFAULT 'identity' NOT NULL,
	`size` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_notebook_name_unique` ON `files` (`org_id`,`notebook_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_id_org_unique` ON `files` (`id`,`org_id`);--> statement-breakpoint
CREATE TABLE `notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`lab_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`original_name` text NOT NULL,
	`sha256` text NOT NULL,
	`ready_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lab_id`,`org_id`) REFERENCES `labs`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notebooks_lab_idx` ON `notebooks` (`lab_id`,`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notebooks_id_org_unique` ON `notebooks` (`id`,`org_id`);