CREATE TABLE `roles` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`capabilities` text NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
-- The built-in role templates (#9). The app shows translated names for these keys; `name` serves
-- roles added later. Changing a template means a new migration, never an edit to this one.
INSERT INTO `roles` (`key`, `name`, `capabilities`, `position`) VALUES
	('admin', 'Institution admin', '["org.manage","staff.approve","analytics.view","course.create"]', 1),
	('coordinator', 'Coordinator', '["analytics.view","course.create","course.template.edit","course.manage","lab.view","lab.publish","solution.view","student.manage","submission.review","grade.edit","live.host","ai.configure"]', 2),
	('pedagog', 'Pedagog', '["analytics.view","course.create","course.manage","lab.view","lab.publish","solution.view","student.manage","submission.review","grade.edit","live.host","ai.configure"]', 3),
	('assistant', 'Assistant', '["lab.view","solution.view","student.manage","submission.review","live.host"]', 4),
	('student', 'Student', '["lab.view","submission.create"]', 5);
