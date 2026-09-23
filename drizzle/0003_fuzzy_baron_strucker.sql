CREATE TABLE `automation_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(64) NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`cronExpression` varchar(64),
	`lastStartedAtUtc` bigint,
	`lastCompletedAtUtc` bigint,
	`lastStatus` enum('idle','running','success','failed') NOT NULL DEFAULT 'idle',
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automation_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `automation_jobs_jobKey_unique` UNIQUE(`jobKey`),
	CONSTRAINT `automation_jobs_schedule_cron_task_uid_unique` UNIQUE(`schedule_cron_task_uid`)
);
--> statement-breakpoint
CREATE TABLE `official_warnings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(32) NOT NULL,
	`externalKey` varchar(128) NOT NULL,
	`issueNo` varchar(32),
	`titleTh` text NOT NULL,
	`headlineTh` text,
	`descriptionTh` text,
	`titleEn` text,
	`effectStartUtc` bigint,
	`effectEndUtc` bigint,
	`announcedAtUtc` bigint,
	`sourceUrl` text,
	`payload` json NOT NULL,
	`retrievedAtUtc` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `official_warnings_id` PRIMARY KEY(`id`),
	CONSTRAINT `official_warnings_externalKey_unique` UNIQUE(`externalKey`)
);
