CREATE TABLE `news_relevance_feedback` (
	`id` varchar(160) NOT NULL,
	`userId` int NOT NULL,
	`marketId` varchar(8) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`articleId` varchar(128) NOT NULL,
	`articleHash` varchar(128) NOT NULL,
	`headline` text NOT NULL,
	`url` text NOT NULL,
	`reason` enum('not_about_company','wrong_market','duplicate','low_quality','other') NOT NULL DEFAULT 'not_about_company',
	`status` enum('active','undone') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `news_relevance_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `news_relevance_feedback_user_article_idx` ON `news_relevance_feedback` (`userId`,`articleId`,`marketId`);--> statement-breakpoint
CREATE INDEX `news_relevance_feedback_aggregate_idx` ON `news_relevance_feedback` (`marketId`,`symbol`,`articleHash`,`status`);