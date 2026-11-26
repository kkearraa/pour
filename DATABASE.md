# pour. — database guide

The recipes are no longer written inside `js/script.js`. They live in a **MySQL database**, and a small
**Node.js server** reads them and sends them to the pages. Visitors can also **add their own recipes**
on the new **Community** page (`community.html`).

```
Browser (pages + js/script.js)
      │  fetch("/api/recipes"), POST /api/recipes ...
      ▼
Node.js server (server/server.js)  ── in-memory cache (5 min TTL, cleared on every write)
      │  connection pool (mysql2)
      ▼
MySQL database "pour" (InnoDB)          uploads/  ← visitors' photos (only the path is in MySQL)
```

---

## 1. What you need (once)

| Thing | Where to get it |
|---|---|
| **Node.js 18 or newer** | https://nodejs.org (the "LTS" version) |
| **MySQL 8** | https://dev.mysql.com/downloads/mysql/ — or XAMPP/MAMP (MariaDB works too) |

Check they work: open a terminal and run `node -v` and `mysql --version`.
Remember the **root password** you chose when installing MySQL.

---

## 2. First-time setup (5 commands)

Open a terminal in the `pour` folder, then:

```bash
cd server
npm install                 # downloads the MySQL driver (mysql2)
cp .env.example .env        # Windows: copy .env.example .env
```

Open `server/.env` in your editor and set **two passwords**:

```ini
DB_PASSWORD=pick-a-long-password-here        # NEW password the website will use (you invent it)
DB_ADMIN_PASSWORD=your-mysql-root-password   # your existing MySQL root password
```

Then create the database and start the site:

```bash
npm run db:setup            # creates database, tables, user, and loads the 21 recipes
npm start                   # starts the website
```

Open **http://localhost:3000** — the site works exactly as before, now loaded from MySQL.

> ⚠️ **Open the site through `http://localhost:3000`, not by double-clicking `index.html`.**
> A page opened as a file (`file:///...`) cannot talk to the server, so you'll see
> "The recipes couldn't be loaded".

### Setting up without the script (MySQL Workbench / phpMyAdmin)

If you prefer, run the two SQL files yourself, in this order:

1. `database/schema.sql` — creates the `pour` database, the tables and the `pour_app` user
   (**edit `change-this-password` first** and put the same password in `server/.env` as `DB_PASSWORD`)
2. `database/seed.sql` — inserts the starting recipes

Command line version: `mysql -u root -p < database/schema.sql` then `mysql -u root -p < database/seed.sql`.

---

## 3. Everyday use

| You want to… | Do this |
|---|---|
| Start the site | `cd server` → `npm start` |
| Start it and auto-restart when you edit server code | `npm run dev` |
| Stop it | `Ctrl + C` in the terminal |
| Change CSS / `script.js` | Edit the readable file, then rebuild the `.min` file (see `README.md`) |
| Reset the database to the original 21 recipes | `npm run db:setup` (⚠️ **deletes user recipes**) |
| See what's in the database | MySQL Workbench / phpMyAdmin, database `pour` |

### How visitors add a recipe

1. They open **Community** in the menu and scroll to **Share your recipe**.
2. They fill in the name, at least **2 ingredients** with amounts (ml, cl or oz), the steps
   (one per line) and optionally a photo (shrunk to max 1200 px in the browser before upload).
3. They press **Share recipe**. The recipe is saved in one database transaction and appears at the top of the
   Community page immediately. Its ingredients also show up in the **Cabinet Search**.

Built-in protection: every field has a length limit, amounts are checked, photos must really be
JPG/PNG/WebP (checked from the file's bytes) and under 2 MB, there is a hidden anti-bot field,
max **5 recipes per hour per visitor**, and all visitor text is escaped so nobody can inject HTML or
scripts into your pages.

---

## 4. Moderating recipes

**Option A — review before publishing.** In `server/.env` set `AUTO_PUBLISH=false` and restart.
New recipes are saved with `status = 0` and stay invisible until you publish them.

**Option B — remove bad ones after.** Keep `AUTO_PUBLISH=true` and hide/delete when needed.

Either way, the easiest tool is SQL (Workbench/phpMyAdmin), see the bottom of `database/maintenance.sql`:

```sql
SELECT id, name, author_name, status FROM recipes WHERE section = 'community' ORDER BY id DESC;
UPDATE recipes SET status = 1 WHERE id = 1001;   -- publish
UPDATE recipes SET status = 2 WHERE id = 1001;   -- hide
DELETE FROM recipes WHERE id = 1001;             -- delete (ingredients & steps are deleted with it)
```

Changes made by hand appear on the site within 5 minutes (the cache time), or immediately after restarting the server.

Or use the **admin API** — set `ADMIN_TOKEN=some-long-secret` in `.env`, restart, then:

```bash
curl -H "Authorization: Bearer some-long-secret" http://localhost:3000/api/admin/recipes            # list pending/hidden
curl -X PATCH -H "Authorization: Bearer some-long-secret" -H "Content-Type: application/json" \
     -d '{"status":1}' http://localhost:3000/api/admin/recipes/1001                                # publish
curl -X DELETE -H "Authorization: Bearer some-long-secret" http://localhost:3000/api/admin/recipes/1001  # delete (+ photo)
```

The admin API only touches community recipes; the 21 curated ones are safe.

---

## 5. Adding or editing *curated* recipes (home / low-ABV / 3-ingredient pages)

Those are rows in the database now, not JavaScript. Example, adding a classic:

```sql
USE pour;
START TRANSACTION;
INSERT INTO recipes (id, section, name, tagline, flavor_profile, glass, method, garnish, ice,
                     image_path, image_width, alt_text, ingredient_count)
VALUES (10, 'classic', 'French 75', 'Bubbly & Bright', 'refreshing', 'Flute', 'Shaken', 'Lemon twist',
        'None (Chilled)', 'images/french-75.webp', 800, 'French 75 in a champagne flute', 4);
INSERT IGNORE INTO ingredients (name, category) VALUES ('champagne', 'Spirits');
INSERT INTO recipe_ingredients (recipe_id, position, ingredient_id, amount_oz)
SELECT 10, 1, id, 1    FROM ingredients WHERE name = 'gin'           UNION ALL
SELECT 10, 2, id, 0.5  FROM ingredients WHERE name = 'lemon juice'   UNION ALL
SELECT 10, 3, id, 0.5  FROM ingredients WHERE name = 'simple syrup'  UNION ALL
SELECT 10, 4, id, 3    FROM ingredients WHERE name = 'champagne';
INSERT INTO recipe_steps (recipe_id, position, body) VALUES
  (10, 1, 'Shake gin, lemon juice and syrup with ice.'),
  (10, 2, 'Strain into a flute and top with champagne.');
COMMIT;
```

- `section`: `classic` (home), `low_abv` (also set `abv_type` = `zero`/`low` and `abv_text`), `minimalist` (also set `base_spirit`).
- Use ids **below 1000** for curated drinks (community recipes start at 1000).
- Keep `ingredient_count` equal to the number of ingredients — the cabinet search relies on it.
- "Also try" links: `INSERT INTO related_recipes (recipe_id, position, related_id) VALUES (10, 1, 9);`
- Photos: put the file in `images/` (and a `-400.webp` copy, as before), store only the path.

---

## 6. Putting it online

**GitHub Pages can't run this.** It only hosts static files — no Node.js, no MySQL. You need a host that
runs Node.js plus a MySQL database. Options students often use: **Railway** or **Render** (Node + MySQL add-on),
**Aiven** (free MySQL), or any VPS.

1. Create a MySQL database at the host and note host/port/user/password.
2. Load the tables: run `database/schema.sql` and `database/seed.sql` against it (or `npm run db:setup` with
   `DB_HOST`, `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD`, `DB_APP_HOST=%` pointing at it).
3. Deploy the whole `pour` folder. Start command: `cd server && npm install && npm start`.
4. Set the `.env` values as the host's **environment variables** (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, …,
   plus `TRUST_PROXY=true` and `DB_SSL=true` if the database needs SSL). The host sets `PORT` itself.
5. Photos are saved in `uploads/`. Many hosts wipe the disk on every deploy — attach a **persistent volume**
   to `uploads/` (or later move photos to object storage such as S3).

**Want to keep the pages on GitHub Pages?** Deploy only the server somewhere, then:
- add this line to the `<head>` of every page: `<meta name="pour-api" content="https://your-server.example.com">`
- set `ALLOWED_ORIGINS=https://kkearraa.github.io` in the server's environment.

---

## 7. How the database follows the "Speeding up website databases" slides

| Slide | Where it is in this project |
|---|---|
| Measure first: slow query log, `EXPLAIN ANALYZE` | `database/my.cnf.example`, `database/maintenance.sql` (EXPLAINs of the site's real queries) |
| Index what you filter, join and sort on | `idx_recipes_section_status_id (section, status, id)` — equality columns first, then the sort column; `idx_ri_ingredient_recipe` is a **covering index** for the cabinet search |
| Drop unused indexes / hide first | `sys.schema_unused_indexes` + `ALTER INDEX … INVISIBLE` in `maintenance.sql` |
| No `SELECT *`, no N+1 loops | `server/recipes.js`: named columns only; a whole list loads in 4 queries with `WHERE recipe_id IN (…)` |
| Keyset pagination, not `OFFSET` | Community "Load more" uses `WHERE id < last_seen_id ORDER BY id DESC LIMIT 12` |
| InnoDB, not MyISAM | Every table `ENGINE=InnoDB` (transactions, row locks, foreign keys with `ON DELETE CASCADE`) |
| Buffer pool | `innodb_buffer_pool_size` in `my.cnf.example`, hit-rate check in `maintenance.sql` |
| Smaller rows | `ENUM`/`TINYINT` for section, status, flavor; `SMALLINT` for ingredient ids; instructions in a **separate table** so `recipes` rows stay narrow |
| Compact sequential primary key | `INT UNSIGNED AUTO_INCREMENT`, no UUIDs |
| Batch your writes | Seed: one transaction, one multi-row `INSERT` per table. New recipe: one transaction, multi-row inserts for ingredients and steps |
| Store totals you read often | `recipes.ingredient_count` → cabinet search compares it with matched ingredients instead of counting every time |
| Cache with TTL, delete on write, avoid a rush | `server/cache.js`: 5-min TTL, `cache.clear()` in the same code path as each write, one request rebuilds a missing key while others wait |
| MySQL 8 has no query cache | No `query_cache_*` settings; the app caches results instead |
| Reuse connections (pool) | `server/db.js`: one `mysql2` pool, `connectionLimit` from `DB_POOL_SIZE` |
| Cache close to the user | Server sends `Cache-Control` headers: images/CSS/JS cached by the browser, uploaded photos cached for a year |
| Keep files out of the database | Photos saved in `uploads/`, only `image_path` stored |
| Least privilege | The site connects as `pour_app` with only SELECT/INSERT/UPDATE/DELETE |

---

## 8. Troubleshooting

| Message | Fix |
|---|---|
| `Could not connect to MySQL (ECONNREFUSED)` | MySQL isn't running (start it in XAMPP / Services / `brew services start mysql`) or `DB_HOST`/`DB_PORT` are wrong |
| `ER_ACCESS_DENIED_ERROR` | Wrong password in `.env`. Run `npm run db:setup` again to reset the `pour_app` password to `DB_PASSWORD` |
| `ER_BAD_DB_ERROR` | The database doesn't exist yet — run `npm run db:setup` |
| `Cannot find module 'mysql2/promise'` | You skipped `npm install` inside `server/` |
| `EADDRINUSE: address already in use :::3000` | The site is already running in another terminal, or set `PORT=3001` in `.env` |
| Page says "The recipes couldn't be loaded" | You opened the HTML file directly, or the server isn't running. Use `http://localhost:3000` |
| A recipe I changed in Workbench doesn't show | Wait up to 5 min (cache) or restart the server |
| `Unknown collation` during setup | Very old MySQL/MariaDB. Update, or change the `COLLATE` line in `schema.sql` to `utf8mb4_general_ci` |

## API reference

| Method & address | What it does |
|---|---|
| `GET /api/recipes` | the 21 curated drinks |
| `GET /api/recipes?section=community&limit=12&before=1050` | community recipes, newest first |
| `GET /api/recipes/1001` | one published recipe |
| `GET /api/ingredients` | ingredient names and categories |
| `POST /api/cabinet` `{"ingredients":["gin","lime juice"]}` | drinks you can make / missing one ingredient |
| `POST /api/recipes` | add a recipe (JSON, what the form sends) |
| `GET /api/health` | `{"ok":true}` when the database answers |
| `/api/admin/...` | moderation, see section 4 |
