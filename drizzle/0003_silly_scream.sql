CREATE TABLE `source_records` (
	`id` varchar(96) NOT NULL,
	`sourceKey` varchar(64) NOT NULL,
	`sourceUrl` text NOT NULL,
	`recordType` varchar(64) NOT NULL,
	`externalId` varchar(255),
	`symbol` varchar(32),
	`title` text,
	`reportDate` timestamp,
	`publishedAt` timestamp,
	`retrievedAt` timestamp NOT NULL DEFAULT (now()),
	`freshnessStatus` enum('fresh','stale','unavailable','error') NOT NULL,
	`rawPayload` text NOT NULL,
	`normalizedPayload` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `source_records_id` PRIMARY KEY(`id`)
);
