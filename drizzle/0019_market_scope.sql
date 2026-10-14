-- Market scope for the tables that previously had none.
--
-- Every row now carries the market it belongs to. Existing rows default to 'UNKNOWN',
-- NOT to India: an unclassifiable row must be hidden from every market view rather
-- than silently shown as Indian. The backfill below classifies what it can from the
-- source key, the symbol suffix and the exchange; anything it cannot classify stays
-- UNKNOWN and remains hidden.

ALTER TABLE `source_records` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `smart_alert_results` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `autonomous_recommendations` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `entities` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `market_observations` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `fundamental_observations` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `event_projections` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `user_watchlist_items` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `user_saved_screens` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `user_alert_rules` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
ALTER TABLE `user_saved_research` ADD COLUMN `marketId` varchar(8) NOT NULL DEFAULT 'UNKNOWN';
--> statement-breakpoint
CREATE INDEX `source_records_market_idx` ON `source_records` (`marketId`, `retrievedAt`);
--> statement-breakpoint
CREATE INDEX `smart_alert_results_market_idx` ON `smart_alert_results` (`marketId`, `status`);
--> statement-breakpoint
CREATE INDEX `autonomous_recommendations_market_idx` ON `autonomous_recommendations` (`marketId`, `eventTimestamp`);
--> statement-breakpoint
CREATE INDEX `entities_market_idx` ON `entities` (`marketId`, `symbol`);
--> statement-breakpoint
CREATE INDEX `market_observations_market_idx` ON `market_observations` (`marketId`, `symbol`);
--> statement-breakpoint
CREATE INDEX `fundamental_observations_market_idx` ON `fundamental_observations` (`marketId`, `symbol`);
--> statement-breakpoint
CREATE INDEX `event_projections_market_idx` ON `event_projections` (`marketId`, `symbol`);
--> statement-breakpoint
CREATE INDEX `user_watchlist_items_market_idx` ON `user_watchlist_items` (`marketId`, `userId`);
--> statement-breakpoint
CREATE INDEX `user_saved_screens_market_idx` ON `user_saved_screens` (`marketId`, `userId`);
--> statement-breakpoint
CREATE INDEX `user_alert_rules_market_idx` ON `user_alert_rules` (`marketId`, `userId`);
--> statement-breakpoint
CREATE INDEX `user_saved_research_market_idx` ON `user_saved_research` (`marketId`, `userId`);
--> statement-breakpoint
-- ---- Backfill: classify by source key, then by symbol suffix ----
UPDATE `source_records` SET `marketId` = 'US' WHERE `marketId` = 'UNKNOWN' AND `sourceKey` LIKE 'sec-%';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'IN' WHERE `marketId` = 'UNKNOWN' AND (`sourceKey` LIKE 'nse%' OR `sourceKey` LIKE 'bse%' OR `sourceKey` LIKE 'sebi%' OR `sourceKey` LIKE 'nsdl%' OR `sourceKey` LIKE 'amfi%' OR `sourceKey` LIKE 'company-ir%');
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'US' WHERE `marketId` = 'UNKNOWN' AND `symbol` REGEXP '^[A-Z]{1,5}$';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'GB' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.L';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'CA' WHERE `marketId` = 'UNKNOWN' AND (`symbol` LIKE '%.TO' OR `symbol` LIKE '%.V');
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'AU' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.AX';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'JP' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.T';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'HK' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.HK';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'SG' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.SI';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'DE' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.DE';
--> statement-breakpoint
UPDATE `source_records` SET `marketId` = 'FR' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.PA';
--> statement-breakpoint
-- event projections carry the same symbols; apply the same suffix rules
UPDATE `event_projections` SET `marketId` = 'GB' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.L';
--> statement-breakpoint
UPDATE `event_projections` SET `marketId` = 'JP' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.T';
--> statement-breakpoint
UPDATE `event_projections` SET `marketId` = 'HK' WHERE `marketId` = 'UNKNOWN' AND `symbol` LIKE '%.HK';
--> statement-breakpoint
UPDATE `event_projections` SET `marketId` = 'US' WHERE `marketId` = 'UNKNOWN' AND `symbol` REGEXP '^[A-Z]{1,5}$';
--> statement-breakpoint
-- User rows that were created before scoping belong to India, which was the only
-- selectable market then. These are explicitly classified, not left UNKNOWN, so a
-- returning user keeps their list.
UPDATE `user_watchlist_items` SET `marketId` = 'IN' WHERE `marketId` = 'UNKNOWN';
--> statement-breakpoint
UPDATE `user_saved_screens` SET `marketId` = 'IN' WHERE `marketId` = 'UNKNOWN';
--> statement-breakpoint
UPDATE `user_alert_rules` SET `marketId` = 'IN' WHERE `marketId` = 'UNKNOWN';
--> statement-breakpoint
UPDATE `user_saved_research` SET `marketId` = 'IN' WHERE `marketId` = 'UNKNOWN';
