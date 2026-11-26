-- =====================================================================
-- pour. — MySQL 8 database schema
-- ---------------------------------------------------------------------
-- Run once:   mysql -u root -p < database/schema.sql
-- then:       mysql -u root -p pour < database/seed.sql
-- (or simply: cd server && npm run db:setup)
--
-- Design choices follow the "Speeding up website databases" slides:
--   * ENGINE=InnoDB everywhere: row-level locks, transactions, crash
--     recovery and foreign keys (MyISAM locks whole tables).
--   * Compact, sequential primary keys (INT/SMALLINT UNSIGNED
--     AUTO_INCREMENT), never random UUIDs.
--   * Small column types: ENUM / TINYINT for flags and categories,
--     DECIMAL(7,4) for amounts, VARCHAR with sensible limits.
--   * Long text (instructions) lives in its own table, so the hot
--     `recipes` rows stay narrow and more of them fit in the buffer pool.
--   * Photos are stored on disk; the table only keeps the path.
--   * Indexes only on what queries filter, join and sort on
--     (equality columns first, then the sort column).
--   * `ingredient_count` is a stored total, so the cabinet search does not
--     have to COUNT() every recipe's ingredients on each request.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS pour
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;   -- works on MySQL 8 and MariaDB (XAMPP)

USE pour;

-- Drop in reverse dependency order so the script can be re-run.
DROP TABLE IF EXISTS related_recipes;
DROP TABLE IF EXISTS recipe_steps;
DROP TABLE IF EXISTS recipe_ingredients;
DROP TABLE IF EXISTS ingredients;
DROP TABLE IF EXISTS recipes;

-- ---------------------------------------------------------------------
-- recipes: one row per drink (curated and user-submitted)
-- ---------------------------------------------------------------------
CREATE TABLE recipes (
  id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  -- Which page the drink belongs to. ENUM is stored in 1 byte.
  section          ENUM('classic','low_abv','minimalist','community') NOT NULL,
  -- 0 = waiting for review, 1 = published, 2 = hidden by an admin
  status           TINYINT UNSIGNED  NOT NULL DEFAULT 1,
  name             VARCHAR(80)       NOT NULL,
  tagline          VARCHAR(120)      NOT NULL DEFAULT '',
  flavor_profile   ENUM('sour','strong','sweet','bitter','refreshing') NULL,
  abv_type         ENUM('zero','low') NULL,          -- low_abv page tabs
  abv_text         VARCHAR(20)       NULL,           -- e.g. "~8% ABV"
  base_spirit      VARCHAR(30)       NULL,           -- minimalist page tabs
  glass            VARCHAR(40)       NOT NULL DEFAULT '',
  method           VARCHAR(40)       NOT NULL DEFAULT '',
  garnish          VARCHAR(80)       NOT NULL DEFAULT '',
  ice              VARCHAR(40)       NOT NULL DEFAULT '',
  -- Path to the photo on disk / CDN, never the image bytes themselves
  image_path       VARCHAR(255)      NULL,
  image_width      SMALLINT UNSIGNED NULL,           -- for srcset
  alt_text         VARCHAR(200)      NOT NULL DEFAULT '',
  iba_url          VARCHAR(255)      NULL,
  iba_label        VARCHAR(80)       NULL,
  author_name      VARCHAR(60)       NULL,           -- set for community recipes
  ingredient_count TINYINT UNSIGNED  NOT NULL DEFAULT 0,  -- stored total
  created_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Every page asks "published drinks of section X, ordered by id".
  -- Equality columns first, then the sort column; also serves keyset
  -- pagination on the community page (WHERE ... AND id < ? ORDER BY id DESC).
  KEY idx_recipes_section_status_id (section, status, id),
  -- Admin review queue: "status = 0 ORDER BY id"
  KEY idx_recipes_status_id (status, id)
) ENGINE=InnoDB
  AUTO_INCREMENT = 1000;  -- curated drinks keep ids 1-206, new ones start at 1000

-- ---------------------------------------------------------------------
-- ingredients: each ingredient name exists once
-- ---------------------------------------------------------------------
CREATE TABLE ingredients (
  id        SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name      VARCHAR(60)       NOT NULL,
  category  ENUM('Spirits','Juices & Mixers','Syrups & Sweeteners','Bitters & Extras')
            NOT NULL DEFAULT 'Bitters & Extras',
  PRIMARY KEY (id),
  UNIQUE KEY uq_ingredients_name (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- recipe_ingredients: which ingredients, how much, in what order
-- ---------------------------------------------------------------------
CREATE TABLE recipe_ingredients (
  recipe_id     INT UNSIGNED      NOT NULL,
  position      TINYINT UNSIGNED  NOT NULL,
  ingredient_id SMALLINT UNSIGNED NOT NULL,
  amount_oz     DECIMAL(7,4)      NOT NULL,  -- 4 decimals so 50 ml (1.6667 oz) shows as 50 ml again
  -- Clustered by recipe: loading one recipe's ingredients is one range read.
  PRIMARY KEY (recipe_id, position),
  -- Cabinet search filters by ingredient_id and needs recipe_id back:
  -- covering index, EXPLAIN shows "Using index".
  KEY idx_ri_ingredient_recipe (ingredient_id, recipe_id),
  CONSTRAINT fk_ri_recipe     FOREIGN KEY (recipe_id)     REFERENCES recipes(id)     ON DELETE CASCADE,
  CONSTRAINT fk_ri_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- recipe_steps: instructions, kept out of the hot recipes table
-- ---------------------------------------------------------------------
CREATE TABLE recipe_steps (
  recipe_id INT UNSIGNED     NOT NULL,
  position  TINYINT UNSIGNED NOT NULL,
  body      VARCHAR(500)     NOT NULL,
  PRIMARY KEY (recipe_id, position),
  CONSTRAINT fk_steps_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- related_recipes: the "Also try" links in the recipe popup
-- ---------------------------------------------------------------------
CREATE TABLE related_recipes (
  recipe_id  INT UNSIGNED     NOT NULL,
  position   TINYINT UNSIGNED NOT NULL,
  related_id INT UNSIGNED     NOT NULL,
  PRIMARY KEY (recipe_id, position),
  CONSTRAINT fk_rel_recipe  FOREIGN KEY (recipe_id)  REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_rel_related FOREIGN KEY (related_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Application user: the website connects with this account, which can
-- only read and write data (no DROP / ALTER). Change the password!
-- ---------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'pour_app'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON pour.* TO 'pour_app'@'localhost';
