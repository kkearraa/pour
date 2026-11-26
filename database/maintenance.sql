-- =====================================================================
-- pour. — measuring and maintenance queries ("measure first, scale last")
-- Run in MySQL Workbench or:  mysql -u root -p pour < database/maintenance.sql
-- =====================================================================
USE pour;

-- 1. Turn on the slow query log without a restart (MySQL 8)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
SET GLOBAL log_queries_not_using_indexes = 'ON';

-- 2. EXPLAIN ANALYZE the queries the website actually runs (MySQL 8.0.18+).
--    Look for type = ref/range/const (good) and never ALL (full scan).
--    On MariaDB write "ANALYZE SELECT ..." instead of "EXPLAIN ANALYZE SELECT ...".

-- Home page / low-ABV / minimalist list (uses idx_recipes_section_status_id)
EXPLAIN ANALYZE
SELECT id, name, tagline FROM recipes
WHERE section = 'classic' AND status = 1
ORDER BY id;

-- Community page, keyset pagination: "12 recipes older than id 1050"
EXPLAIN ANALYZE
SELECT id, name, tagline FROM recipes
WHERE section = 'community' AND status = 1 AND id < 1050
ORDER BY id DESC
LIMIT 12;

-- Cabinet search: drinks missing at most one ingredient
-- (idx_ri_ingredient_recipe is a covering index here: "Using index")
EXPLAIN ANALYZE
SELECT r.id, r.ingredient_count - COUNT(*) AS missing
FROM recipe_ingredients ri
JOIN recipes r ON r.id = ri.recipe_id
WHERE ri.ingredient_id IN (1, 2, 3)
  AND r.status = 1 AND r.section IN ('classic', 'low_abv', 'community')
GROUP BY r.id, r.ingredient_count
HAVING missing <= 1;

-- 3. Indexes no query has used since the server started (MySQL only; MariaDB has no sys schema)
--    (check over a full business cycle before dropping anything)
SELECT * FROM sys.schema_unused_indexes WHERE object_schema = 'pour';
-- Hide first, drop later:
-- ALTER TABLE recipes ALTER INDEX idx_recipes_status_id INVISIBLE;

-- 4. Buffer pool hit rate: Innodb_buffer_pool_reads (disk) should be tiny
--    next to Innodb_buffer_pool_read_requests (memory)
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read%';

-- 5. Refresh statistics after big data changes
ANALYZE TABLE recipes, ingredients, recipe_ingredients, recipe_steps, related_recipes;

-- 6. Moderation helpers
-- Recipes waiting for review (only used when AUTO_PUBLISH=false):
SELECT id, name, author_name, created_at FROM recipes WHERE status = 0 ORDER BY id;
-- Publish one:   UPDATE recipes SET status = 1 WHERE id = 1001;
-- Hide one:      UPDATE recipes SET status = 2 WHERE id = 1001;
-- Delete one:    DELETE FROM recipes WHERE id = 1001;   -- ingredients/steps go with it (ON DELETE CASCADE)
-- After editing rows by hand, restart the server or wait 5 minutes for its cache to expire.
