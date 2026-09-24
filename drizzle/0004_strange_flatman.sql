CREATE TABLE `satellite_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`satelliteKey` varchar(191) NOT NULL,
	`windowEndUtc` bigint NOT NULL,
	`generatedAtUtc` bigint NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `satellite_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `satellite_runs_satelliteKey_unique` UNIQUE(`satelliteKey`)
);
