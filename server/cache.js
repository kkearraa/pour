// Application cache ("ask the cache first, then MySQL").
//
// - Every entry has a TTL, so even data changed by hand in MySQL shows up
//   after CACHE_TTL_SECONDS.
// - Writes call clear() in the same code path that changes the rows
//   ("delete it when the row changes").
// - While one request rebuilds a missing key, other requests for the same
//   key wait for that result instead of all hitting the database at once.
//
// This keeps the cache inside the Node process, which is right for one
// server. If you ever run several servers, swap this file for Redis or
// Memcached with the same get/clear functions.
const config = require("./config");

const entries = new Map();   // key -> { value, expires }
const inFlight = new Map();  // key -> Promise

async function get(key, loader, ttlSeconds = config.cacheTtlSeconds) {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  if (inFlight.has(key)) return inFlight.get(key);

  const generation = clearCount;
  let promise;
  promise = (async () => {
    try {
      const value = await loader();
      // Don't store a result that was read before a write cleared the cache
      if (generation === clearCount) entries.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
      return value;
    } finally {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

let clearCount = 0;
function clear() {
  clearCount++;
  entries.clear();
  inFlight.clear();
}

module.exports = { get, clear };
