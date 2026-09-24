CREATE TABLE `radar_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`radarKey` varchar(191) NOT NULL,
	`observedAtUtc` bigint NOT NULL,
	`generatedAtUtc` bigint NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `radar_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `radar_runs_radarKey_unique` UNIQUE(`radarKey`)
);
