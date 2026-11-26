// User accounts: sign up, log in, log out, and "who is this request from?"
//
// Passwords: hashed with scrypt (built into Node.js) and a random salt per
// user. The password itself is never stored or logged.
//
// Sessions: on login the browser receives a random token (it keeps it in
// localStorage and sends it as "Authorization: Bearer <token>"). The
// database stores only the SHA-256 hash of the token, so a leaked database
// can't be used to log in. Sessions last 30 days.
const crypto = require("crypto");
const { promisify } = require("util");
const pool = require("./db");
const config = require("./config");

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30;

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(key, expected);
}

// Same answer time whether or not the username exists
let dummyHash = null;
async function getDummyHash() { return dummyHash || (dummyHash = await hashPassword("not-a-real-password")); }

const tokenHash = token => crypto.createHash("sha256").update(token).digest();

function isAdminUser(user) {
  if (!user) return false;
  if (user.is_admin) return true;
  return config.adminUsernames.includes(user.username.toLowerCase());
}

function publicUser(user) {
  return { id: user.id, username: user.username, isAdmin: isAdminUser(user) };
}

function validateCredentials(username, password) {
  const name = String(username || "").trim();
  const pass = String(password || "");
  if (!USERNAME_RE.test(name)) {
    return { error: "Usernames are 3–30 characters: letters, numbers, dots, dashes or underscores." };
  }
  if (pass.length < 8) return { error: "Use a password with at least 8 characters." };
  if (pass.length > 200) return { error: "That password is too long (max 200 characters)." };
  return { username: name, password: pass };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    [tokenHash(token), userId, expires]);
  return { token, expiresAt: expires.toISOString() };
}

async function signup(username, password) {
  const v = validateCredentials(username, password);
  if (v.error) return { error: v.error, status: 400 };
  const [existing] = await pool.query(`SELECT id FROM users WHERE username = ?`, [v.username]);
  if (existing.length) return { error: "That username is taken. Try another one.", status: 409 };
  let result;
  try {
    [result] = await pool.query(`INSERT INTO users (username, password_hash) VALUES (?, ?)`,
      [v.username, await hashPassword(v.password)]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY" || /UNIQUE/i.test(err.message)) {
      return { error: "That username is taken. Try another one.", status: 409 };
    }
    throw err;
  }
  const user = { id: result.insertId, username: v.username, is_admin: 0 };
  return { user: publicUser(user), ...(await createSession(user.id)) };
}

async function login(username, password) {
  const [rows] = await pool.query(
    `SELECT id, username, password_hash, is_admin FROM users WHERE username = ?`, [String(username || "").trim()]);
  const user = rows[0];
  const ok = await verifyPassword(String(password || ""), user ? user.password_hash : await getDummyHash());
  if (!user || !ok) return { error: "Wrong username or password.", status: 401 };
  return { user: publicUser(user), ...(await createSession(user.id)) };
}

async function logout(token) {
  if (token) await pool.query(`DELETE FROM sessions WHERE token_hash = ?`, [tokenHash(token)]);
}

function bearerToken(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

// Returns the logged-in user for a request, or null
async function userFromRequest(req) {
  const token = bearerToken(req);
  if (!token || token.length > 100) return null;
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`, [tokenHash(token), new Date()]);
  return rows[0] || null;
}

async function resetPassword(username, newPassword) {
  const v = validateCredentials(username, newPassword);
  if (v.error) return { error: v.error, status: 400 };
  const [result] = await pool.query(`UPDATE users SET password_hash = ? WHERE username = ?`,
    [await hashPassword(v.password), v.username]);
  if (!result.affectedRows) return { error: "No user with that username.", status: 404 };
  // Log the user out everywhere
  await pool.query(`DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)`, [v.username]);
  return { ok: true };
}

// Remove expired sessions once an hour (uses idx_sessions_expires)
setInterval(() => {
  pool.query(`DELETE FROM sessions WHERE expires_at < ?`, [new Date()]).catch(() => {});
}, 60 * 60 * 1000).unref();

module.exports = { signup, login, logout, userFromRequest, bearerToken, isAdminUser, publicUser, resetPassword };
