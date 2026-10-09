CREATE TABLE `news_events` (
	`id` varchar(64) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`headline` text NOT NULL,
	`category` enum('Tech','Finance','Markets','Crypto','General') NOT NULL,
	`summary` text NOT NULL,
	`keyEntities` text NOT NULL,
	`sentiment` enum('Positive','Neutral','Negative') NOT NULL,
	`actionableImpact` text NOT NULL,
	`url` text NOT NULL,
	`source` varchar(128) NOT NULL,
	`publishedAt` timestamp NOT NULL,
	`impactScore` int NOT NULL,
	`highImpact` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `news_events_id` PRIMARY KEY(`id`)
);
