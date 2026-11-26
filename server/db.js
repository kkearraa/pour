// One connection pool for the whole app ("reuse connections instead of
// opening one per request"). Requests borrow a connection and give it back.
const mysql = require("mysql2/promise");
const config = require("./config");

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.poolSize,   // caps the load on max_connections
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  decimalNumbers: true,                  // DECIMAL amounts come back as numbers
  charset: "utf8mb4",
  ...(config.db.ssl ? { ssl: { rejectUnauthorized: true } } : {})
});

module.exports = pool;
