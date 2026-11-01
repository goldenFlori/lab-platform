ALTER TABLE `notebooks` ADD `version_at` integer;--> statement-breakpoint
ALTER TABLE `notebooks` ADD `changed_cells` text;--> statement-breakpoint
ALTER TABLE `notebooks` ADD `previous_version` text;--> statement-breakpoint
ALTER TABLE `notebooks` ADD `cell_map` text;