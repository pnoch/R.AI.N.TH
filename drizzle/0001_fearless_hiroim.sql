CREATE TABLE `weather_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runKey` varchar(128) NOT NULL,
	`modelRunUtc` bigint NOT NULL,
	`generatedAtUtc` bigint NOT NULL,
	`payload` json NOT NULL,
	`draftStatus` enum('draft','approved') NOT NULL DEFAULT 'draft',
	`approvedAtUtc` bigint,
	`approvedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weather_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `weather_runs_runKey_unique` UNIQUE(`runKey`)
);
