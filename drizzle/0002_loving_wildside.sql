CREATE TABLE `verification_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`verificationKey` varchar(128) NOT NULL,
	`forecastRunUtc` bigint NOT NULL,
	`validEndUtc` bigint NOT NULL,
	`generatedAtUtc` bigint NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verification_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `verification_runs_verificationKey_unique` UNIQUE(`verificationKey`)
);
