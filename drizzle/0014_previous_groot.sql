CREATE TABLE `provider_health_history` (
	`id` varchar(128) NOT NULL,
	`providerId` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`circuitState` varchar(32) NOT NULL,
	`failureClass` varchar(32),
	`latencyMs` int,
	`checkedAt` timestamp NOT NULL,
	`successAt` timestamp,
	`payloadPreview` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `provider_health_history_id` PRIMARY KEY(`id`)
);
