// Reads settings from server/.env (copy .env.example to .env and edit it).
// Real environment variables (e.g. set by your hosting provider) win over the file.
const fs = require("fs");
const path = require("path");

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const env = (key, fallback) => (process.env[key] !== undefined && process.env[key] !== "" ? process.env[key] : fallback);
const bool = (key, fallback) => /^(1|true|yes|on)$/i.test(env(key, String(fallback)));

const siteRoot = path.resolve(__dirname, "..");

// Hosting services like Railway give the database as one URL
// (mysql://user:password@host:port/database) or as MYSQLHOST, MYSQLUSER, ... variables.
let fromUrl = {};
const dbUrl = env("DATABASE_URL", env("MYSQL_URL", ""));
if (/^mysql:\/\//i.test(dbUrl)) {
  const u = new URL(dbUrl);
  fromUrl = {
    host: u.hostname, port: u.port || "3306",
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, ""))
  };
}
const pick = (key, railwayKey, urlKey, fallback) => env(key, env(railwayKey, fromUrl[urlKey] || fallback));

module.exports = {
  port: Number(env("PORT", 3000)),
  db: {
    host: pick("DB_HOST", "MYSQLHOST", "host", "localhost"),
    port: Number(pick("DB_PORT", "MYSQLPORT", "port", 3306)),
    user: pick("DB_USER", "MYSQLUSER", "user", "pour_app"),
    password: pick("DB_PASSWORD", "MYSQLPASSWORD", "password", ""),
    database: pick("DB_NAME", "MYSQLDATABASE", "database", "pour"),
    poolSize: Number(env("DB_POOL_SIZE", 10)),
    ssl: bool("DB_SSL", false)
  },
  siteRoot,
  uploadDir: path.resolve(siteRoot, env("UPLOAD_DIR", "uploads")),
  cacheTtlSeconds: Number(env("CACHE_TTL_SECONDS", 300)),
  autoPublish: bool("AUTO_PUBLISH", true),
  // Create the tables and load the starting recipes on first start if they are missing
  autoSetup: bool("DB_AUTO_SETUP", false),
  adminToken: env("ADMIN_TOKEN", ""),
  // Usernames that can edit/delete ANY community recipe (comma separated)
  adminUsernames: env("ADMIN_USERNAMES", "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
  allowedOrigins: env("ALLOWED_ORIGINS", "").split(",").map(s => s.trim()).filter(Boolean),
  trustProxy: bool("TRUST_PROXY", false),
  maxSubmissionsPerHour: Number(env("MAX_SUBMISSIONS_PER_HOUR", 5))
};
