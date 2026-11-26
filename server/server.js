// pour. — web server
// Serves the website files AND the recipe API that reads from MySQL.
//
//   npm start            -> http://localhost:3000
//
// API
//   GET    /api/recipes                    curated drinks (home, low-ABV, 3-ingredient, quiz)
//   GET    /api/recipes?section=community  user recipes, newest first (&before=<id>&limit=12)
//   GET    /api/recipes/:id                one published recipe
//   GET    /api/ingredients                ingredient names + categories
//   POST   /api/cabinet                    { "ingredients": ["gin", "lime juice"] }
//   POST   /api/recipes                    add a recipe (the "Share your recipe" form)
//   GET    /api/admin/recipes              pending/hidden recipes        (Authorization: Bearer ADMIN_TOKEN)
//   PATCH  /api/admin/recipes/:id          { "status": 0 | 1 | 2 }       (Authorization: Bearer ADMIN_TOKEN)
//   DELETE /api/admin/recipes/:id          remove a recipe               (Authorization: Bearer ADMIN_TOKEN)
//   GET    /api/health                     checks the database connection
const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const config = require("./config");
const pool = require("./db");
const recipes = require("./recipes");

const MAX_BODY_BYTES = 3 * 1024 * 1024;   // JSON body incl. a base64 photo
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

function sendJSON(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    if (!/application\/json/i.test(req.headers["content-type"] || "")) {
      return reject(new HttpError(415, "Send the data as JSON."));
    }
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new HttpError(413, "The recipe (with photo) is too large. Use a photo under 2 MB.")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new HttpError(400, "That is not valid JSON.")); }
    });
    req.on("error", reject);
  });
}

function clientIp(req) {
  if (config.trustProxy && req.headers["x-forwarded-for"]) return req.headers["x-forwarded-for"].split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function isAdmin(req) {
  if (!config.adminToken) return false;
  const given = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(config.adminToken);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Very small rate limit for submissions: N per IP per hour, kept in memory
const submissionLog = new Map();
function checkRateLimit(ip) {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const times = (submissionLog.get(ip) || []).filter(t => t > hourAgo);
  if (times.length >= config.maxSubmissionsPerHour) {
    throw new HttpError(429, "You have shared a lot of recipes in the last hour. Please try again later.");
  }
  times.push(Date.now());
  submissionLog.set(ip, times);
}
setInterval(() => {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  for (const [ip, times] of submissionLog) if (!times.some(t => t > hourAgo)) submissionLog.delete(ip);
}, 10 * 60 * 1000).unref();

// ---------------------------------------------------------------------
// Validating a submitted recipe
// ---------------------------------------------------------------------
const FLAVORS = ["sour", "strong", "sweet", "bitter", "refreshing"];
const UNIT_TO_OZ = { oz: 1, ml: 1 / 30, cl: 1 / 3 };   // same conversions the site uses

function cleanText(value, { field, max, min = 0, required = false }) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (required && !text) throw new HttpError(400, `Please fill in: ${field}.`);
  if (text && text.length < min) throw new HttpError(400, `${field} must be at least ${min} characters.`);
  if (text.length > max) throw new HttpError(400, `${field} can be at most ${max} characters.`);
  return text;
}

function validateRecipe(body) {
  if (body.website) throw new HttpError(400, "Submission rejected."); // hidden "honeypot" field bots fill in

  const name = cleanText(body.name, { field: "Cocktail name", max: 80, min: 2, required: true });
  const author = cleanText(body.author, { field: "Your name", max: 60 }) || "Anonymous";
  const tagline = cleanText(body.tagline, { field: "Short description", max: 120 });
  const flavorProfile = FLAVORS.includes(body.flavorProfile) ? body.flavorProfile : null;
  const abvType = ["zero", "low"].includes(body.abvType) ? body.abvType : null;
  const abvText = abvType === "zero" ? "0% ABV" : abvType === "low" ? "Low ABV" : null;

  const unit = UNIT_TO_OZ[body.unit] ? body.unit : "ml";
  if (!Array.isArray(body.ingredients)) throw new HttpError(400, "Add at least two ingredients.");
  const seen = new Set();
  const ingredients = body.ingredients
    .filter(i => i && String(i.name || "").trim())
    .map(i => {
      const ingName = recipes.normalizeName(cleanText(i.name, { field: "Ingredient name", max: 60 }));
      const amount = Number(String(i.amount).replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, `Give an amount for "${ingName}".`);
      const oz = Math.round(amount * UNIT_TO_OZ[unit] * 10000) / 10000;
      if (oz < 0.01 || oz > 30) throw new HttpError(400, `The amount for "${ingName}" looks wrong.`);
      if (seen.has(ingName)) throw new HttpError(400, `"${ingName}" is listed twice.`);
      seen.add(ingName);
      return { name: ingName, oz };
    });
  if (ingredients.length < 2) throw new HttpError(400, "Add at least two ingredients.");
  if (ingredients.length > 12) throw new HttpError(400, "A recipe can have at most 12 ingredients.");

  const rawSteps = Array.isArray(body.instructions) ? body.instructions : String(body.instructions || "").split(/\r?\n/);
  const instructions = rawSteps
    .map(s => cleanText(s, { field: "Each step", max: 500 }).replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
  if (!instructions.length) throw new HttpError(400, "Add at least one step to the instructions.");
  if (instructions.length > 12) throw new HttpError(400, "Use at most 12 steps.");

  return {
    name, author, tagline: tagline || "Shared by the pour. community", flavorProfile, abvType, abvText,
    glass: cleanText(body.glass, { field: "Glass", max: 40 }),
    method: cleanText(body.method, { field: "Method", max: 40 }),
    garnish: cleanText(body.garnish, { field: "Garnish", max: 80 }),
    ice: cleanText(body.ice, { field: "Ice", max: 40 }),
    altText: `${name}, a cocktail shared by ${author}`,
    ingredients, instructions, unit
  };
}

// Photos are saved as files; the database only stores the path.
// The file type is checked from its first bytes, not from its name.
function detectImage(buf) {
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

async function saveImage(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) throw new HttpError(400, "The photo could not be read. Use a JPG, PNG or WebP file.");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(413, "The photo is too large. Use one under 2 MB.");
  const ext = detectImage(buf);
  if (!ext) throw new HttpError(400, "The photo must be a JPG, PNG or WebP file.");
  await fsp.mkdir(config.uploadDir, { recursive: true });
  const file = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  await fsp.writeFile(path.join(config.uploadDir, file), buf);
  return `uploads/${file}`; // served from UPLOAD_DIR at /uploads/...
}

async function removeImage(imagePath) {
  if (!imagePath) return;
  const m = String(imagePath).match(/^uploads\/([a-f0-9]{24}\.(?:webp|jpg|png))$/);
  if (!m) return; // only ever delete uploaded photos
  const full = path.join(config.uploadDir, m[1]);
  await fsp.unlink(full).catch(() => {});
}

// ---------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------
function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 4294967295) throw new HttpError(404, "Recipe not found.");
  return id;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(2); // after /api
  const method = req.method;

  if (parts[0] === "health" && method === "GET") {
    await pool.query("SELECT 1");
    return sendJSON(res, 200, { ok: true });
  }

  if (parts[0] === "recipes" && parts.length === 1 && method === "GET") {
    if (url.searchParams.get("section") === "community") {
      const before = url.searchParams.get("before") ? parseId(url.searchParams.get("before")) : null;
      const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit")) || 12));
      return sendJSON(res, 200, await recipes.listCommunity({ before, limit }));
    }
    return sendJSON(res, 200, { recipes: await recipes.listCurated() });
  }

  if (parts[0] === "recipes" && parts.length === 2 && method === "GET") {
    const drink = await recipes.getRecipe(parseId(parts[1]));
    if (!drink) throw new HttpError(404, "Recipe not found.");
    return sendJSON(res, 200, { recipe: drink });
  }

  if (parts[0] === "recipes" && parts.length === 1 && method === "POST") {
    const body = await readJSON(req);
    const recipe = validateRecipe(body);
    checkRateLimit(clientIp(req));
    recipe.imagePath = await saveImage(body.image);
    const status = config.autoPublish ? 1 : 0;
    try {
      const id = await recipes.createRecipe(recipe, { status });
      return sendJSON(res, 201, {
        id, published: status === 1,
        message: status === 1 ? "Thanks! Your recipe is live." : "Thanks! Your recipe will appear after a quick review."
      });
    } catch (err) {
      await removeImage(recipe.imagePath);
      throw err;
    }
  }

  if (parts[0] === "ingredients" && method === "GET") {
    return sendJSON(res, 200, { ingredients: await recipes.listIngredients() });
  }

  if (parts[0] === "cabinet" && method === "POST") {
    const body = await readJSON(req);
    const names = Array.isArray(body.ingredients) ? body.ingredients.map(String) : [];
    return sendJSON(res, 200, await recipes.cabinetSearch(names));
  }

  if (parts[0] === "admin") {
    if (!isAdmin(req)) throw new HttpError(config.adminToken ? 401 : 403,
      config.adminToken ? "Wrong or missing admin token." : "Admin tools are off. Set ADMIN_TOKEN in server/.env.");
    if (parts[1] === "recipes" && parts.length === 2 && method === "GET") {
      return sendJSON(res, 200, { recipes: await recipes.listForReview() });
    }
    if (parts[1] === "recipes" && parts.length === 3 && method === "PATCH") {
      const body = await readJSON(req);
      const status = Number(body.status);
      if (![0, 1, 2].includes(status)) throw new HttpError(400, "status must be 0 (pending), 1 (published) or 2 (hidden).");
      if (!(await recipes.setStatus(parseId(parts[2]), status))) throw new HttpError(404, "Recipe not found.");
      return sendJSON(res, 200, { ok: true });
    }
    if (parts[1] === "recipes" && parts.length === 3 && method === "DELETE") {
      const result = await recipes.deleteRecipe(parseId(parts[2]));
      if (!result.deleted) throw new HttpError(404, "Recipe not found.");
      await removeImage(result.imagePath);
      return sendJSON(res, 200, { ok: true });
    }
  }

  throw new HttpError(404, "Unknown API address.");
}

// ---------------------------------------------------------------------
// Static website files
// ---------------------------------------------------------------------
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json"
};
// Folders and files that must never be downloadable
const PRIVATE = new Set(["server", "database", "node_modules", "uploads", "README.md", "DATABASE.md", "package.json", "package-lock.json", "railway.json"]);

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { rel = "/"; }
  const segments = rel.split("/").filter(Boolean);
  const blocked = segments.some(s => s.startsWith(".")) ||
    (segments.length && PRIVATE.has(segments[0]) && segments[0] !== "uploads");

  // Uploaded photos live in UPLOAD_DIR (which can be a Railway volume outside the site folder)
  const isUpload = segments[0] === "uploads" && segments.length === 2 && /^[a-f0-9]{24}\.(webp|jpg|png)$/.test(segments[1]);
  let file = isUpload
    ? path.join(config.uploadDir, segments[1])
    : path.resolve(config.siteRoot, "." + path.posix.normalize("/" + segments.join("/")));
  if (!blocked && !isUpload && file.startsWith(config.siteRoot)) {
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); } catch { /* not found */ }
  }
  const ext = path.extname(file).toLowerCase();

  if (blocked || (!isUpload && !file.startsWith(config.siteRoot)) || !TYPES[ext] || !fs.existsSync(file)) {
    const notFound = path.join(config.siteRoot, "404.html");
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    return fs.createReadStream(notFound).on("error", () => res.end("Not found")).pipe(res);
  }

  res.writeHead(200, {
    "Content-Type": TYPES[ext],
    "X-Content-Type-Options": "nosniff",
    // Browser cache layer: photos and assets for a week, pages always fresh
    "Cache-Control": ext === ".html" ? "no-cache" : (isUpload ? "public, max-age=31536000, immutable" : "public, max-age=604800")
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

// ---------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Allow the GitHub Pages copy of the site (or another domain) to call the API
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) return sendJSON(res, err.status, { error: err.message });
      console.error(new Date().toISOString(), req.method, url.pathname, err);
      const dbDown = ["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR", "PROTOCOL_CONNECTION_LOST", "ETIMEDOUT"].includes(err.code);
      sendJSON(res, dbDown ? 503 : 500, { error: dbDown ? "The recipe database is not reachable right now." : "Something went wrong on the server." });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
});

if (require.main === module) {
  // Connect to MySQL, retrying every few seconds: on hosts like Railway the
  // database (or the private network to it) can need a moment after a start.
  async function connectDatabase(attempt = 1) {
    const where = `${config.db.host}:${config.db.port} (database "${config.db.database}", user "${config.db.user}")`;
    try {
      await pool.query("SELECT 1");
      console.log(`Connected to MySQL at ${where}`);
      if (config.autoSetup) await require("./auto-setup").ensureTables();
    } catch (err) {
      const wait = Math.min(30, attempt * 3);
      console.error(`Could not connect to MySQL at ${where}: ${err.code || err.message}. Trying again in ${wait} s (attempt ${attempt}).`);
      if (config.db.host === "localhost" && (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)) {
        console.error("Hint: the host is 'localhost', so MYSQL_URL is missing or empty in this service's Variables.");
      }
      setTimeout(() => connectDatabase(attempt + 1), wait * 1000).unref();
    }
  }

  server.listen(config.port, () => {
    console.log(`pour. is running at http://localhost:${config.port}`);
    connectDatabase();
  });

  const shutdown = () => { server.close(() => pool.end().finally(() => process.exit(0))); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { server, validateRecipe };
