-- Rollback for 0019_market_scope.
--
-- Recovery strategy for the market-scope migration. Safe to run because the migration
-- only ADDS a column and an index; nothing is renamed or dropped on the way in, so
-- rolling back loses no table data — only the market classification, which the forward
-- migration and the backfill script can rebuild.
--
-- Run this only if 0019_market_scope must be reverted. Apply the statements in the
-- order given: indexes first, then columns.

DROP INDEX `source_records_market_idx` ON `source_records`;
--> statement-breakpoint
DROP INDEX `smart_alert_results_market_idx` ON `smart_alert_results`;
--> statement-breakpoint
DROP INDEX `autonomous_recommendations_market_idx` ON `autonomous_recommendations`;
--> statement-breakpoint
DROP INDEX `entities_market_idx` ON `entities`;
--> statement-breakpoint
DROP INDEX `market_observations_market_idx` ON `market_observations`;
--> statement-breakpoint
DROP INDEX `fundamental_observations_market_idx` ON `fundamental_observations`;
--> statement-breakpoint
DROP INDEX `event_projections_market_idx` ON `event_projections`;
--> statement-breakpoint
DROP INDEX `user_watchlist_items_market_idx` ON `user_watchlist_items`;
--> statement-breakpoint
DROP INDEX `user_saved_screens_market_idx` ON `user_saved_screens`;
--> statement-breakpoint
DROP INDEX `user_alert_rules_market_idx` ON `user_alert_rules`;
--> statement-breakpoint
DROP INDEX `user_saved_research_market_idx` ON `user_saved_research`;
--> statement-breakpoint
ALTER TABLE `source_records` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `smart_alert_results` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `autonomous_recommendations` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `entities` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `market_observations` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `fundamental_observations` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `event_projections` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `user_watchlist_items` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `user_saved_screens` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `user_alert_rules` DROP COLUMN `marketId`;
--> statement-breakpoint
ALTER TABLE `user_saved_research` DROP COLUMN `marketId`;
