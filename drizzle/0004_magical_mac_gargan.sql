ALTER TABLE `source_records` ADD `documentName` varchar(255);--> statement-breakpoint
ALTER TABLE `source_records` ADD `dataHash` varchar(128);--> statement-breakpoint
ALTER TABLE `source_records` ADD `parserVersion` varchar(64);--> statement-breakpoint
ALTER TABLE `source_records` ADD `supersedesId` varchar(96);--> statement-breakpoint
UPDATE `source_records` SET `dataHash` = SHA2(`rawPayload`, 256), `parserVersion` = 'legacy-v1' WHERE `dataHash` IS NULL OR `parserVersion` IS NULL;--> statement-breakpoint
ALTER TABLE `source_records` MODIFY `dataHash` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `source_records` MODIFY `parserVersion` varchar(64) NOT NULL;