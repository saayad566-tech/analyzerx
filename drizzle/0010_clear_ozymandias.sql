CREATE TABLE `user_market_preferences` (
	`userId` int NOT NULL,
	`marketId` varchar(8) NOT NULL DEFAULT 'IN',
	`revision` int NOT NULL DEFAULT 1,
	`clientUpdatedAt` timestamp NOT NULL,
	`serverUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastWriter` varchar(32) NOT NULL DEFAULT 'server',
	`conflictCount` int NOT NULL DEFAULT 0,
	`conflictJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_market_preferences_userId` PRIMARY KEY(`userId`)
);
