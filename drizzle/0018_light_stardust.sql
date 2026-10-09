CREATE TABLE `user_notifications` (
	`id` varchar(160) NOT NULL,
	`userId` int NOT NULL,
	`marketId` varchar(8) NOT NULL DEFAULT 'IN',
	`symbol` varchar(32),
	`notificationType` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`deepLinkPath` varchar(255),
	`deepLinkParamsJson` text,
	`dedupeKey` varchar(255) NOT NULL,
	`sourcePublishedAt` timestamp,
	`readAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_notifications_dedupeKey_unique` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE INDEX `user_notifications_user_read_created_idx` ON `user_notifications` (`userId`,`readAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `user_notifications_user_market_created_idx` ON `user_notifications` (`userId`,`marketId`,`createdAt`);