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

module.exports = {
  port: Number(env("PORT", 3000)),
  db: {
    host: env("DB_HOST", "localhost"),
    port: Number(env("DB_PORT", 3306)),
    user: env("DB_USER", "pour_app"),
    password: env("DB_PASSWORD", ""),
    database: env("DB_NAME", "pour"),
    poolSize: Number(env("DB_POOL_SIZE", 10)),
    ssl: bool("DB_SSL", false)
  },
  siteRoot,
  uploadDir: path.resolve(siteRoot, env("UPLOAD_DIR", "uploads")),
  cacheTtlSeconds: Number(env("CACHE_TTL_SECONDS", 300)),
  autoPublish: bool("AUTO_PUBLISH", true),
  adminToken: env("ADMIN_TOKEN", ""),
  allowedOrigins: env("ALLOWED_ORIGINS", "").split(",").map(s => s.trim()).filter(Boolean),
  trustProxy: bool("TRUST_PROXY", false),
  maxSubmissionsPerHour: Number(env("MAX_SUBMISSIONS_PER_HOUR", 5))
};
