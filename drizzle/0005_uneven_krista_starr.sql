CREATE TABLE `smart_alert_results` (
	`id` varchar(160) NOT NULL,
	`ruleId` varchar(96) NOT NULL,
	`ruleTitle` varchar(255) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`status` enum('eligible','potential','no-longer-eligible') NOT NULL,
	`matchScore` int NOT NULL,
	`eventJson` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`reason` text NOT NULL,
	`dataTimestamp` timestamp NOT NULL,
	`lastNotifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `smart_alert_results_id` PRIMARY KEY(`id`)
);
