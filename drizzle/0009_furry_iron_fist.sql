CREATE TABLE `user_alert_results` (
	`id` varchar(160) NOT NULL,
	`userId` int NOT NULL,
	`ruleId` varchar(96) NOT NULL,
	`autonomousRecommendationId` varchar(160),
	`symbol` varchar(32) NOT NULL,
	`status` varchar(32) NOT NULL,
	`evidenceJson` text NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_alert_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_alert_rules` (
	`id` varchar(96) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`query` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_alert_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_notification_preferences` (
	`userId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`minimumScore` int NOT NULL DEFAULT 70,
	`channelsJson` text NOT NULL,
	`quietHoursEnabled` boolean NOT NULL DEFAULT false,
	`quietStart` varchar(5) NOT NULL,
	`quietEnd` varchar(5) NOT NULL,
	`timezone` varchar(64) NOT NULL,
	`quietHoursOverrideForCritical` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_notification_preferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_push_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(512) NOT NULL,
	`platform` varchar(32) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`revokedAt` timestamp,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_push_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_push_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user_saved_research` (
	`id` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`title` varchar(255) NOT NULL,
	`reportType` varchar(64) NOT NULL,
	`storageKey` varchar(512),
	`sourceJson` text NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_saved_research_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_saved_screens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`filtersJson` text NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_saved_screens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_watchlist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`entityId` varchar(96),
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_watchlist_items_id` PRIMARY KEY(`id`)
);
