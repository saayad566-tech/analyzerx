CREATE TABLE `push_tokens` (
	`token` varchar(512) NOT NULL,
	`platform` varchar(32) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_tokens_token` PRIMARY KEY(`token`)
);
