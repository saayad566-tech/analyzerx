CREATE TABLE `held_news_articles` (
	`id` varchar(160) NOT NULL,
	`marketId` varchar(8) NOT NULL,
	`symbol` varchar(32),
	`articleId` varchar(128) NOT NULL,
	`articleHash` varchar(128) NOT NULL,
	`headline` text NOT NULL,
	`summary` text NOT NULL,
	`url` text NOT NULL,
	`source` varchar(128) NOT NULL,
	`publishedAt` timestamp NOT NULL,
	`holdReason` varchar(64) NOT NULL,
	`classification` varchar(64) NOT NULL,
	`confidence` varchar(16) NOT NULL,
	`score` int NOT NULL,
	`matchedSymbolsJson` text NOT NULL,
	`matchedThemesJson` text NOT NULL,
	`reasonsJson` text NOT NULL,
	`status` enum('held','approved','dismissed') NOT NULL DEFAULT 'held',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `held_news_articles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `held_news_articles_review_queue_idx` ON `held_news_articles` (`marketId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `held_news_articles_article_idx` ON `held_news_articles` (`marketId`,`articleHash`);