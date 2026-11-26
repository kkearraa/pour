// Database setup and upgrades that run when the server starts.
//
// ensureTables(): on an EMPTY database (DB_AUTO_SETUP=true), creates all
//   tables and loads the starting recipes. Made for hosts like Railway,
//   where you can't easily run "npm run db:setup". Never touches a
//   database that already has the recipes table.
//
// migrate(): upgrades an EXISTING database to the current version by adding
//   what's missing (the users/sessions tables and the recipe owner column).
//   It only ever adds; it never drops or changes your data, and does
//   nothing when the database is already up to date.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const config = require("./config");
const pool = require("./db");

async function tableExists(name) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", [name]);
  return rows[0].n > 0;
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return rows[0].n > 0;
}

async function ensureTables() {
  if (await tableExists("recipes")) return;

  console.log(`Database "${config.db.database}" is empty: creating tables and loading the starting recipes...`);
  const dbDir = path.join(__dirname, "..", "database");
  // Use the database the host gave us: drop CREATE DATABASE / USE / CREATE USER / GRANT
  const schema = fs.readFileSync(path.join(dbDir, "schema.sql"), "utf8")
    .replace(/CREATE DATABASE[\s\S]*?;/, "")
    .replace(/^USE pour;/m, "")
    .replace(/CREATE USER[\s\S]*?;/, "")
    .replace(/GRANT[\s\S]*?;/, "");
  const seed = fs.readFileSync(path.join(dbDir, "seed.sql"), "utf8").replace(/^USE pour;/m, "");

  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
    database: config.db.database, multipleStatements: true, charset: "utf8mb4",
    ...(config.db.ssl ? { ssl: { rejectUnauthorized: true } } : {})
  });
  try {
    await conn.query(schema);
    await conn.query(seed);
  } finally {
    await conn.end();
  }
  console.log("Database ready: 21 recipes loaded.");
}

const MIGRATIONS = [
  {
    name: "users table",
    needed: async () => !(await tableExists("users")),
    sql: `CREATE TABLE users (
      id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
      username      VARCHAR(30)      NOT NULL,
      password_hash VARCHAR(255)     NOT NULL,
      is_admin      TINYINT UNSIGNED NOT NULL DEFAULT 0,
      created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  },
  {
    name: "sessions table",
    needed: async () => !(await tableExists("sessions")),
    sql: `CREATE TABLE sessions (
      token_hash BINARY(32)   NOT NULL,
      user_id    INT UNSIGNED NOT NULL,
      expires_at DATETIME     NOT NULL,
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (token_hash),
      KEY idx_sessions_user (user_id),
      KEY idx_sessions_expires (expires_at),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`
  },
  {
    name: "recipe owner column",
    needed: async () => !(await columnExists("recipes", "user_id")),
    sql: `ALTER TABLE recipes
      ADD COLUMN user_id INT UNSIGNED NULL AFTER iba_label,
      ADD KEY idx_recipes_user_id (user_id, id),
      ADD CONSTRAINT fk_recipes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`
  }
];

async function migrate() {
  for (const m of MIGRATIONS) {
    if (!(await m.needed())) continue;
    try {
      await pool.query(m.sql);
      console.log(`Database upgraded: added ${m.name}.`);
    } catch (err) {
      console.error(`Could not add ${m.name} (${err.code || err.message}). ` +
        "Run database/schema.sql again or give the database user ALTER/CREATE rights.");
      throw err;
    }
  }
}

module.exports = { ensureTables, migrate };
