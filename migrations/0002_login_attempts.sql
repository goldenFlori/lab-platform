CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_window_idx` ON `login_attempts` (`window_start`);