CREATE TABLE `research_agent_runs` (
	`id` varchar(160) NOT NULL,
	`runId` varchar(160) NOT NULL,
	`userId` int NOT NULL,
	`agentType` varchar(32) NOT NULL,
	`runtime` varchar(32) NOT NULL,
	`status` varchar(32) NOT NULL,
	`confidence` varchar(16) NOT NULL,
	`evidenceIdsJson` text NOT NULL,
	`outputJson` text NOT NULL,
	`latencyMs` int NOT NULL DEFAULT 0,
	`errorCode` varchar(64),
	`attemptCount` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_agent_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` varchar(160) NOT NULL,
	`userId` int NOT NULL,
	`marketId` varchar(8) NOT NULL,
	`symbol` varchar(32),
	`requestJson` text NOT NULL,
	`runtimePolicyJson` text NOT NULL,
	`status` enum('queued','running','completed','degraded','failed','cancelled') NOT NULL DEFAULT 'queued',
	`resultJson` text,
	`errorMessage` text,
	`attemptCount` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `research_agent_runs_run_agent_idx` ON `research_agent_runs` (`runId`,`agentType`);--> statement-breakpoint
CREATE INDEX `research_agent_runs_user_updated_idx` ON `research_agent_runs` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `research_runs_user_updated_idx` ON `research_runs` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `research_runs_user_market_idx` ON `research_runs` (`userId`,`marketId`,`updatedAt`);