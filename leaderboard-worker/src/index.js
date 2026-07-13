import "./geography.js";

const MAX_BODY_BYTES = 12_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MIN_ROUND_TIME_MS = 1_000;
const MAX_PLAYER_NAME_LENGTH = 15;

function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } }); }
function requestId() { return crypto.randomUUID(); }
function allowedOrigins(env) { return new Set((env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)); }
function cors(request, env) { const origin = request.headers.get("origin"); return origin && allowedOrigins(env).has(origin) ? { "access-control-allow-origin": origin, vary: "origin" } : {}; }
function fail(message, status, request, env) { return json({ error: message }, status, cors(request, env)); }
async function body(request) { const length = Number(request.headers.get("content-length") || 0); if (length > MAX_BODY_BYTES) throw new Error("body too large"); const text = await request.text(); if (text.length > MAX_BODY_BYTES) throw new Error("body too large"); return JSON.parse(text); }
function exactKeys(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value); }
function validName(value) { const normalized = typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : ""; return normalized.length >= 1 && normalized.length <= MAX_PLAYER_NAME_LENGTH && /^[\p{L}\p{N} ._-]+$/u.test(normalized) ? normalized : null; }
function locationsForSession(mode, stationId) { const locations = globalThis.PeterboroughGeography.locations; const eligible = locations.filter((location) => mode === "city-ten" ? location.cityTen : location.stationDistrict === Number(stationId.at(-1))); if (eligible.length < 10) throw new Error("not enough eligible locations"); return eligible.slice(0, 10).map((location) => location.id); }
function distanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) { const radians = Math.PI / 180; const latitudeDelta = (latitudeB - latitudeA) * radians; const longitudeDelta = (longitudeB - longitudeA) * radians; const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA * radians) * Math.cos(latitudeB * radians) * Math.sin(longitudeDelta / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function validGuess(guess) { return exactKeys(guess, ["locationId", "latitude", "longitude"]) && typeof guess.locationId === "string" && Number.isFinite(guess.latitude) && Math.abs(guess.latitude) <= 90 && Number.isFinite(guess.longitude) && Math.abs(guess.longitude) <= 180; }
async function completedResult(env, sessionId) { return env.DB.prepare("SELECT id, player_name, mode, station_id, raw_elapsed_ms, penalty_ms, verified_total_ms, completed_at_ms FROM results WHERE session_id=?").bind(sessionId).first(); }
async function rateLimit(env, request, nowMs) { const ip = request.headers.get("cf-connecting-ip") || "unknown"; const key = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.IP_HASH_SALT || "development"}:${ip}`)).then((buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")); const row = await env.DB.prepare("SELECT window_started_ms, request_count FROM rate_limits WHERE key = ?").bind(key).first(); const startMs = !row || nowMs - row.window_started_ms >= 60_000 ? nowMs : row.window_started_ms; const count = !row || startMs === nowMs ? 1 : row.request_count + 1; if (count > 30) return false; await env.DB.prepare("INSERT INTO rate_limits(key, window_started_ms, request_count) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET window_started_ms=excluded.window_started_ms, request_count=excluded.request_count").bind(key, startMs, count).run(); return true; }

export default { async fetch(request, env) {
  const headers = cors(request, env);
  if (request.method === "OPTIONS") return new Response(null, { headers: { ...headers, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" } });
  if (request.headers.get("origin") && !headers["access-control-allow-origin"]) return fail("origin not allowed", 403, request, env);
  if (request.method === "GET" && new URL(request.url).pathname === "/health") return json({ ok: true }, 200, headers);
  const nowMs = Date.now();
  if (!(await rateLimit(env, request, nowMs))) return fail("rate limit exceeded", 429, request, env);
  try {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/sessions") {
      const value = await body(request); if (!exactKeys(value, ["mode", "stationId", "gameVersion", "scoringVersion"]) || !["city-ten", "random"].includes(value.mode) || !["station-1", "station-2", "station-3"].includes(value.stationId) || value.gameVersion !== env.GAME_VERSION || value.scoringVersion !== env.SCORING_VERSION) return fail("invalid session request", 400, request, env);
      const id = requestId(), locationIds = locationsForSession(value.mode, value.stationId); await env.DB.prepare("INSERT INTO sessions(id,mode,station_id,location_ids_json,game_version,scoring_version,created_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?,?)").bind(id, value.mode, value.stationId, JSON.stringify(locationIds), value.gameVersion, value.scoringVersion, nowMs, nowMs + SESSION_TTL_MS).run(); return json({ id, mode: value.mode, stationId: value.stationId, locationIds, startedAtMs: nowMs, expiresAtMs: nowMs + SESSION_TTL_MS }, 201, headers);
    }
    const completionMatch = path.match(/^\/sessions\/([0-9a-f-]{36})\/complete$/);
    if (request.method === "POST" && completionMatch) {
      const sessionId = completionMatch[1]; const value = await body(request); const playerName = validName(value?.playerName);
      if (!exactKeys(value, ["playerName", "guesses", "gameVersion", "scoringVersion"]) || !playerName || !Array.isArray(value.guesses) || !value.guesses.every(validGuess)) return fail("invalid completion request", 400, request, env);
      const existing = await completedResult(env, sessionId); if (existing) return json({ result: existing, idempotent: true }, 200, headers);
      const session = await env.DB.prepare("SELECT * FROM sessions WHERE id=?").bind(sessionId).first();
      if (!session || session.completed_at_ms !== null || nowMs > session.expires_at_ms || value.gameVersion !== session.game_version || value.scoringVersion !== session.scoring_version) return fail("invalid or expired session", 400, request, env);
      const assignedIds = JSON.parse(session.location_ids_json); if (value.guesses.length !== assignedIds.length || !value.guesses.every((guess, index) => guess.locationId === assignedIds[index])) return fail("rounds do not match session", 400, request, env);
      const locations = new Map(globalThis.PeterboroughGeography.locations.map((location) => [location.id, location])); let penaltyMs = 0;
      for (const guess of value.guesses) { const location = locations.get(guess.locationId); if (!location) return fail("unknown location", 400, request, env); const outsideMeters = Math.max(0, distanceMeters(guess.latitude, guess.longitude, location.latitude, location.longitude) - location.targetRadiusMeters); penaltyMs += Math.min(60_000, Math.round(outsideMeters * 328.084)); }
      const rawElapsedMs = nowMs - session.created_at_ms; if (rawElapsedMs < MIN_ROUND_TIME_MS * assignedIds.length) return fail("completion time is implausible", 400, request, env);
      const resultId = requestId(), totalMs = rawElapsedMs + penaltyMs, flagged = rawElapsedMs < MIN_ROUND_TIME_MS * assignedIds.length * 2 ? 1 : 0, status = flagged ? "pending" : "published";
      try { await env.DB.batch([env.DB.prepare("UPDATE sessions SET completed_at_ms=?, result_id=? WHERE id=? AND completed_at_ms IS NULL").bind(nowMs, resultId, sessionId), env.DB.prepare("INSERT INTO results(id,session_id,player_name,mode,station_id,raw_elapsed_ms,penalty_ms,verified_total_ms,round_count,game_version,scoring_version,created_at_ms,completed_at_ms,flagged,moderation_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(resultId, sessionId, playerName, session.mode, session.station_id, rawElapsedMs, penaltyMs, totalMs, assignedIds.length, session.game_version, session.scoring_version, nowMs, nowMs, flagged, status)]); } catch (_) { const result = await completedResult(env, sessionId); if (result) return json({ result, idempotent: true }, 200, headers); throw _; }
      return json({ result: { id: resultId, playerName, rawElapsedMs, penaltyMs, verifiedTotalMs: totalMs, flagged: Boolean(flagged) } }, 201, headers);
    }
    if (request.method === "GET" && path === "/leaderboard") { const mode = new URL(request.url).searchParams.get("mode"); const stationId = new URL(request.url).searchParams.get("stationId"); if (!['city-ten','random'].includes(mode)) return fail("invalid mode",400,request,env); const query = mode === 'random' ? "SELECT player_name, verified_total_ms, penalty_ms, completed_at_ms FROM results WHERE mode=? AND station_id=? AND moderation_status='published' AND flagged=0 ORDER BY verified_total_ms, penalty_ms, completed_at_ms LIMIT 50" : "SELECT player_name, verified_total_ms, penalty_ms, completed_at_ms FROM results WHERE mode=? AND moderation_status='published' AND flagged=0 ORDER BY verified_total_ms, penalty_ms, completed_at_ms LIMIT 50"; const results = await env.DB.prepare(query).bind(...(mode === 'random' ? [mode, stationId] : [mode])).all(); return json({ results: results.results },200,headers); }
    return fail("not found", 404, request, env);
  } catch (error) { return fail(error.message === "body too large" ? error.message : "invalid request", error.message === "body too large" ? 413 : 400, request, env); }
} };
