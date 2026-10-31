ALTER TABLE `organizations` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `ai_allowed` integer DEFAULT true NOT NULL;