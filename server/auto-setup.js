// Creates the tables and loads the starting recipes the first time the
// server starts on an empty database (turn on with DB_AUTO_SETUP=true).
// Made for hosts like Railway, where you can't easily run "npm run db:setup".
// It never touches a database that already has the recipes table.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const config = require("./config");
const pool = require("./db");

async function ensureTables() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'recipes'");
  if (rows[0].n > 0) return;

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

module.exports = { ensureTables };
