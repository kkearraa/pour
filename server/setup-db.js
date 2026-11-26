// Creates the database, tables, app user and starting recipes in one go:
//
//   npm run db:setup
//
// It logs in with an ADMIN MySQL account (DB_ADMIN_USER / DB_ADMIN_PASSWORD
// in .env, usually "root"), because creating databases and users needs that.
// The website itself later uses the limited DB_USER account.
//
// WARNING: re-running it deletes all recipes (including user-submitted ones)
// and loads the starting data again. Pass --yes to skip the question.
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mysql = require("mysql2/promise");
const config = require("./config");

const dbDir = path.join(__dirname, "..", "database");
const sqlString = s => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";

async function confirm() {
  if (process.argv.includes("--yes")) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(r => rl.question(
    `This (re)creates the "${config.db.database}" database and DELETES any recipes already in it. Continue? (y/N) `, r));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

(async () => {
  if (!config.db.password) {
    console.error("Set DB_PASSWORD in server/.env first (the password the website will use).");
    process.exit(1);
  }
  if (!(await confirm())) { console.log("Cancelled."); return; }

  const adminUser = process.env.DB_ADMIN_USER || "root";
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: adminUser,
    password: process.env.DB_ADMIN_PASSWORD || "",
    multipleStatements: true,
    charset: "utf8mb4",
    ...(config.db.ssl ? { ssl: { rejectUnauthorized: true } } : {})
  });

  const appHost = process.env.DB_APP_HOST || "localhost";
  let schema = fs.readFileSync(path.join(dbDir, "schema.sql"), "utf8")
    .replace(/'change-this-password'/g, sqlString(config.db.password))
    .replace(/'pour_app'@'localhost'/g, `${sqlString(config.db.user)}@${sqlString(appHost)}`);
  let seed = fs.readFileSync(path.join(dbDir, "seed.sql"), "utf8");
  if (config.db.database !== "pour") {
    const rename = s => s
      .replace(/DATABASE IF NOT EXISTS pour\b/, `DATABASE IF NOT EXISTS \`${config.db.database}\``)
      .replace(/^USE pour;/m, `USE \`${config.db.database}\`;`)
      .replace(/ON pour\.\*/g, `ON \`${config.db.database}\`.*`);
    schema = rename(schema);
    seed = rename(seed);
  }

  console.log(`Creating database "${config.db.database}" as ${adminUser}...`);
  await conn.query(schema);
  // Make sure the password matches .env even if the user already existed
  await conn.query(`ALTER USER ${sqlString(config.db.user)}@${sqlString(appHost)} IDENTIFIED BY ${sqlString(config.db.password)}`);
  console.log("Loading the starting recipes...");
  await conn.query(seed);

  const [[counts]] = await conn.query(
    `SELECT (SELECT COUNT(*) FROM \`${config.db.database}\`.recipes) AS recipes,
            (SELECT COUNT(*) FROM \`${config.db.database}\`.ingredients) AS ingredients`);
  await conn.end();
  console.log(`Done: ${counts.recipes} recipes and ${counts.ingredients} ingredients. Now run: npm start`);
})().catch(err => {
  console.error("Database setup failed:", err.code || "", err.message);
  if (err.code === "ER_ACCESS_DENIED_ERROR") console.error("Check DB_ADMIN_USER / DB_ADMIN_PASSWORD in server/.env.");
  if (err.code === "ECONNREFUSED") console.error("MySQL is not running, or DB_HOST / DB_PORT are wrong.");
  process.exit(1);
});
