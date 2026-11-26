// All SQL the website runs lives in this file.
//
// Rules from the slides that this file follows:
// - Only the columns that are needed, never SELECT *.
// - No query per row (N+1): a list of recipes is loaded with 4 queries in
//   total, whatever its length, using WHERE recipe_id IN (...).
// - Keyset pagination (id < last seen id) instead of OFFSET.
// - Writes for one recipe happen in one transaction with multi-row INSERTs.
const pool = require("./db");
const cache = require("./cache");
const { categorize } = require("./categorize");

const CURATED_SECTIONS = ["classic", "low_abv", "minimalist"];
const CABINET_SECTIONS = ["classic", "low_abv", "community"];
const PUBLISHED = 1;

const RECIPE_COLUMNS = `r.id, r.section, r.name, r.tagline, r.flavor_profile, r.abv_type, r.abv_text,
  r.base_spirit, r.glass, r.method, r.garnish, r.ice, r.image_path, r.image_width, r.alt_text,
  r.iba_url, r.iba_label, r.author_name, r.created_at`;

// Turns database rows into the same object shape the front end always used
function toDrink(row) {
  return {
    id: row.id,
    section: row.section,
    name: row.name,
    tagline: row.tagline,
    ...(row.flavor_profile ? { flavorProfile: row.flavor_profile } : {}),
    ...(row.abv_type ? { type: row.abv_type, abvText: row.abv_text } : {}),
    ...(row.base_spirit ? { baseSpirit: row.base_spirit } : {}),
    glass: row.glass,
    method: row.method,
    garnish: row.garnish,
    ice: row.ice,
    image: row.image_path || null,
    imageWidth: row.image_width || null,
    altText: row.alt_text,
    ...(row.iba_url ? { iba: { url: row.iba_url, ...(row.iba_label ? { label: row.iba_label } : {}) } } : {}),
    ...(row.author_name ? { author: row.author_name } : {}),
    createdAt: row.created_at,
    ingredients: [],
    instructions: [],
    related: []
  };
}

// Adds ingredients, steps and "also try" links to a list of recipe rows:
// 3 extra queries for the whole list (not 3 per recipe).
async function hydrate(rows) {
  if (!rows.length) return [];
  const drinks = rows.map(toDrink);
  const byId = new Map(drinks.map(d => [d.id, d]));
  const ids = [...byId.keys()];

  const [[ingredientRows], [stepRows], [relatedRows]] = await Promise.all([
    pool.query(
      `SELECT ri.recipe_id, i.name, i.category, ri.amount_oz
         FROM recipe_ingredients ri
         JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id IN (?)
        ORDER BY ri.recipe_id, ri.position`, [ids]),
    pool.query(
      `SELECT recipe_id, body FROM recipe_steps
        WHERE recipe_id IN (?) ORDER BY recipe_id, position`, [ids]),
    pool.query(
      `SELECT rr.recipe_id, rr.related_id
         FROM related_recipes rr
         JOIN recipes r ON r.id = rr.related_id AND r.status = ${PUBLISHED}
        WHERE rr.recipe_id IN (?)
        ORDER BY rr.recipe_id, rr.position`, [ids])
  ]);

  for (const row of ingredientRows) {
    byId.get(row.recipe_id).ingredients.push({ name: row.name, oz: Number(row.amount_oz), category: row.category });
  }
  for (const row of stepRows) byId.get(row.recipe_id).instructions.push(row.body);
  for (const row of relatedRows) byId.get(row.recipe_id).related.push(row.related_id);
  return drinks;
}

// The 21 curated drinks for the home, low-ABV, minimalist and quiz pages
function listCurated() {
  return cache.get("curated", async () => {
    const [rows] = await pool.query(
      `SELECT ${RECIPE_COLUMNS} FROM recipes r
        WHERE r.section IN (?) AND r.status = ${PUBLISHED}
        ORDER BY r.id`, [CURATED_SECTIONS]);
    return hydrate(rows);
  });
}

// Community recipes, newest first, one page at a time (keyset pagination)
function listCommunity({ before = null, limit = 12 } = {}) {
  const key = `community:${before || "first"}:${limit}`;
  return cache.get(key, async () => {
    const params = [];
    let where = `r.section = 'community' AND r.status = ${PUBLISHED}`;
    if (before) { where += " AND r.id < ?"; params.push(before); }
    params.push(limit + 1); // one extra row tells us whether there is a next page
    const [rows] = await pool.query(
      `SELECT ${RECIPE_COLUMNS} FROM recipes r
        WHERE ${where}
        ORDER BY r.id DESC
        LIMIT ?`, params);
    const hasMore = rows.length > limit;
    const page = await hydrate(rows.slice(0, limit));
    return { recipes: page, nextBefore: hasMore ? page[page.length - 1].id : null };
  });
}

function getRecipe(id) {
  return cache.get(`recipe:${id}`, async () => {
    const [rows] = await pool.query(
      `SELECT ${RECIPE_COLUMNS} FROM recipes r WHERE r.id = ? AND r.status = ${PUBLISHED}`, [id]);
    const [drink] = await hydrate(rows);
    return drink || null;
  });
}

// Ingredient names for the cabinet sidebar and the form's suggestions
function listIngredients() {
  return cache.get("ingredients", async () => {
    const [rows] = await pool.query(
      `SELECT DISTINCT i.name, i.category
         FROM ingredients i
         JOIN recipe_ingredients ri ON ri.ingredient_id = i.id
         JOIN recipes r ON r.id = ri.recipe_id
        WHERE r.status = ${PUBLISHED} AND r.section IN (?)
        ORDER BY i.name`, [CABINET_SECTIONS]);
    return rows.map(r => ({ name: r.name, category: r.category }));
  });
}

// Cabinet search, done by the database: recipes missing at most one of
// the ticked ingredients. Uses the stored ingredient_count instead of
// counting every recipe's ingredients on each request.
async function cabinetSearch(names) {
  const wanted = [...new Set(names.map(normalizeName).filter(Boolean))].slice(0, 100);
  if (!wanted.length) return { exact: [], partial: [] };

  const [matchRows] = await pool.query(
    `SELECT r.id, r.ingredient_count - COUNT(*) AS missing
       FROM recipe_ingredients ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       JOIN recipes r ON r.id = ri.recipe_id
      WHERE i.name IN (?) AND r.status = ${PUBLISHED} AND r.section IN (?)
      GROUP BY r.id, r.ingredient_count
     HAVING missing <= 1
      ORDER BY r.id`, [wanted, CABINET_SECTIONS]);
  if (!matchRows.length) return { exact: [], partial: [] };

  const [rows] = await pool.query(
    `SELECT ${RECIPE_COLUMNS} FROM recipes r WHERE r.id IN (?) ORDER BY r.id`, [matchRows.map(m => m.id)]);
  const drinks = await hydrate(rows);
  const have = new Set(wanted);
  const exact = [], partial = [];
  for (const drink of drinks) {
    const missing = drink.ingredients.filter(i => !have.has(i.name.toLowerCase()));
    if (missing.length === 0) exact.push(drink);
    else if (missing.length === 1) partial.push({ ...drink, missing: missing[0].name });
  }
  return { exact, partial };
}

// ---------------------------------------------------------------------
// Adding a recipe (from the "Share your recipe" form)
// ---------------------------------------------------------------------
function normalizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().toLowerCase();
}

async function createRecipe(recipe, { status }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO recipes (section, status, name, tagline, flavor_profile, abv_type, abv_text,
                            glass, method, garnish, ice, image_path, alt_text, author_name, ingredient_count)
       VALUES ('community', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [status, recipe.name, recipe.tagline, recipe.flavorProfile, recipe.abvType, recipe.abvText,
       recipe.glass, recipe.method, recipe.garnish, recipe.ice, recipe.imagePath, recipe.altText,
       recipe.author, recipe.ingredients.length]);
    const recipeId = result.insertId;

    // Find ingredients that already exist; insert only the new ones.
    // (Reading first avoids burning AUTO_INCREMENT ids on duplicates.)
    const names = recipe.ingredients.map(i => i.name);
    const [existing] = await conn.query(`SELECT id, name FROM ingredients WHERE name IN (?)`, [names]);
    const idByName = new Map(existing.map(r => [r.name.toLowerCase(), r.id]));
    const newOnes = names.filter(n => !idByName.has(n));
    if (newOnes.length) {
      await conn.query(
        `INSERT IGNORE INTO ingredients (name, category) VALUES ?`,
        [newOnes.map(n => [n, categorize(n)])]);
      const [added] = await conn.query(`SELECT id, name FROM ingredients WHERE name IN (?)`, [newOnes]);
      for (const r of added) idByName.set(r.name.toLowerCase(), r.id);
    }

    await conn.query(
      `INSERT INTO recipe_ingredients (recipe_id, position, ingredient_id, amount_oz) VALUES ?`,
      [recipe.ingredients.map((ing, i) => [recipeId, i + 1, idByName.get(ing.name), ing.oz])]);

    await conn.query(
      `INSERT INTO recipe_steps (recipe_id, position, body) VALUES ?`,
      [recipe.instructions.map((step, i) => [recipeId, i + 1, step])]);

    await conn.commit();
    cache.clear(); // the new recipe must show up right away
    return recipeId;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------
// Moderation (needs ADMIN_TOKEN)
// ---------------------------------------------------------------------
async function listForReview() {
  const [rows] = await pool.query(
    `SELECT ${RECIPE_COLUMNS}, r.status FROM recipes r
      WHERE r.section = 'community' AND r.status <> ${PUBLISHED}
      ORDER BY r.id DESC LIMIT 200`);
  const drinks = await hydrate(rows);
  return drinks.map((d, i) => ({ ...d, status: rows[i].status }));
}

async function setStatus(id, status) {
  const [result] = await pool.query(
    `UPDATE recipes SET status = ? WHERE id = ? AND section = 'community'`, [status, id]);
  cache.clear();
  return result.affectedRows > 0;
}

async function deleteRecipe(id) {
  const [rows] = await pool.query(`SELECT image_path FROM recipes WHERE id = ? AND section = 'community'`, [id]);
  if (!rows.length) return { deleted: false };
  await pool.query(`DELETE FROM recipes WHERE id = ? AND section = 'community'`, [id]);
  cache.clear();
  return { deleted: true, imagePath: rows[0].image_path };
}

module.exports = {
  listCurated, listCommunity, getRecipe, listIngredients, cabinetSearch,
  createRecipe, listForReview, setStatus, deleteRecipe, normalizeName
};
