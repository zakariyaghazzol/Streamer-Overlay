const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const statePath = path.join(rootDir, "state.json");
const port = Number(process.env.PORT || process.argv[2] || 8787);
const host = process.env.HOST || "127.0.0.1";
const remoteStateKey = process.env.OVERLAY_STATE_KEY || "space-stream-overlay:state:v1";

const defaultState = {
  streamerName: "STAR RUNNER",
  gameTitle: "RANKED GRIND",
  statusText: "LIVE",
  kills: 0,
  wins: 0,
  subsCurrent: 42,
  subsTarget: 100,
  subLabel: "SUB GOAL",
  updatedAt: 0,
  timer: {
    mode: "countup",
    running: false,
    startedAt: null,
    elapsedMs: 0,
    durationMs: 15 * 60 * 1000
  },
  settings: {
    panelScale: 100,
    panelOpacity: 100,
    effectsIntensity: 70,
    audioEnabled: true,
    audioVolume: 35,
    killSoundUrl: "",
    winSoundUrl: "",
    subSoundUrl: ""
  },
  layout: {
    topHud: { x: 50, y: 3 },
    kill: { x: 5, y: 15 },
    win: { x: 5, y: 28 },
    timer: { x: 50, y: 88 },
    goal: { x: 75, y: 85 }
  }
};

let state = clone(defaultState);
const eventClients = new Set();
let stateReady = false;
let remoteStorageWarned = false;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

if (require.main === module) {
  bootstrap();
} else {
  module.exports = vercelHandler;
}

async function vercelHandler(req, res) {
  try {
    await ensureStateReady();
    await routeRequest(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Something went wrong." });
  }
}

async function bootstrap() {
  await ensureStateReady();

  const server = http.createServer(async (req, res) => {
    try {
      await routeRequest(req, res);
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "Something went wrong." });
    }
  });

  server.listen(port, host, () => {
    console.log("");
    console.log("Space Stream Overlay is running");
    console.log(`Overlay URL:  http://${host}:${port}/overlay`);
    console.log(`Control URL:  http://${host}:${port}/control`);
    console.log("");
  });

  setInterval(() => {
    broadcast("heartbeat", { serverTime: Date.now() });
  }, 15000).unref();
}

async function ensureStateReady() {
  if (stateReady) {
    return;
  }

  state = await loadState();
  stateReady = true;
}

async function routeRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    await refreshStateFromRemote();
    sendJson(res, 200, publicState());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/state") {
    await refreshStateFromRemote();
    const body = await readJson(req);
    state = sanitizeState({ ...state, ...body });
    state.updatedAt = Date.now();
    await persistAndBroadcast();
    sendJson(res, 200, publicState());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/action") {
    await refreshStateFromRemote();
    const body = await readJson(req);
    applyAction(body);
    await persistAndBroadcast();
    sendJson(res, 200, publicState());
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    openEventStream(req, res);
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  serveStatic(url.pathname, res);
}

async function loadState() {
  const remoteState = await loadRemoteState();
  if (remoteState) {
    return remoteState;
  }

  try {
    const raw = await fsp.readFile(statePath, "utf8");
    return sanitizeState({ ...defaultState, ...JSON.parse(raw) });
  } catch {
    return clone(defaultState);
  }
}

function sanitizeState(input) {
  const timerInput = input.timer && typeof input.timer === "object" ? input.timer : {};
  const layoutInput = input.layout && typeof input.layout === "object" ? input.layout : {};
  const settingsInput = input.settings && typeof input.settings === "object" ? input.settings : {};
  const defaultLayout = defaultState.layout || {
    topHud: { x: 50, y: 3 },
    kill: { x: 5, y: 15 },
    win: { x: 5, y: 28 },
    timer: { x: 50, y: 88 },
    goal: { x: 75, y: 85 }
  };

  const sanitizePanel = (panel, def) => {
    const val = layoutInput[panel] && typeof layoutInput[panel] === "object" ? layoutInput[panel] : {};
    return {
      x: clampInt(val.x !== undefined ? val.x : def.x, -50, 150),
      y: clampInt(val.y !== undefined ? val.y : def.y, -50, 150)
    };
  };

  const next = {
    streamerName: cleanText(input.streamerName, defaultState.streamerName, 28),
    gameTitle: cleanText(input.gameTitle, defaultState.gameTitle, 32),
    statusText: cleanText(input.statusText, defaultState.statusText, 16),
    kills: clampInt(input.kills, 0, 999),
    wins: clampInt(input.wins, 0, 999),
    subsCurrent: clampInt(input.subsCurrent, 0, 999999),
    subsTarget: Math.max(1, clampInt(input.subsTarget, 1, 999999)),
    subLabel: cleanText(input.subLabel, defaultState.subLabel, 28),
    updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : 0,
    timer: {
      mode: timerInput.mode === "countdown" ? "countdown" : "countup",
      running: Boolean(timerInput.running),
      startedAt: Number.isFinite(Number(timerInput.startedAt)) ? Number(timerInput.startedAt) : null,
      elapsedMs: clampInt(timerInput.elapsedMs, 0, 24 * 60 * 60 * 1000),
      durationMs: Math.max(1000, clampInt(timerInput.durationMs, 1000, 24 * 60 * 60 * 1000))
    },
    settings: {
      panelScale: clampInt(settingsInput.panelScale ?? defaultState.settings.panelScale, 60, 140),
      panelOpacity: clampInt(settingsInput.panelOpacity ?? defaultState.settings.panelOpacity, 20, 100),
      effectsIntensity: clampInt(settingsInput.effectsIntensity ?? defaultState.settings.effectsIntensity, 0, 140),
      audioEnabled: settingsInput.audioEnabled !== false,
      audioVolume: clampInt(settingsInput.audioVolume ?? defaultState.settings.audioVolume, 0, 100),
      killSoundUrl: cleanOptionalText(settingsInput.killSoundUrl, 500),
      winSoundUrl: cleanOptionalText(settingsInput.winSoundUrl, 500),
      subSoundUrl: cleanOptionalText(settingsInput.subSoundUrl, 500)
    },
    layout: {
      topHud: sanitizePanel("topHud", defaultLayout.topHud),
      kill: sanitizePanel("kill", defaultLayout.kill),
      win: sanitizePanel("win", defaultLayout.win),
      timer: sanitizePanel("timer", defaultLayout.timer),
      goal: sanitizePanel("goal", defaultLayout.goal)
    }
  };

  if (next.timer.running && !next.timer.startedAt) {
    next.timer.startedAt = Date.now();
  }

  if (!next.timer.running) {
    next.timer.startedAt = null;
  }

  return next;
}

function cleanText(value, fallback, maxLength) {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function cleanOptionalText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function applyAction(action = {}) {
  const type = typeof action.type === "string" ? action.type : "";
  const amount = clampInt(action.amount ?? 1, -999, 999);
  const next = sanitizeState(state);

  switch (type) {
    case "kills:add":
      next.kills = clampInt(next.kills + Math.max(1, amount), 0, 999);
      break;
    case "kills:subtract":
      next.kills = clampInt(next.kills - Math.max(1, amount), 0, 999);
      break;
    case "kills:reset":
      next.kills = 0;
      break;
    case "wins:add":
      next.wins = clampInt(next.wins + Math.max(1, amount), 0, 999);
      break;
    case "wins:subtract":
      next.wins = clampInt(next.wins - Math.max(1, amount), 0, 999);
      break;
    case "wins:reset":
      next.wins = 0;
      break;
    case "subs:add":
      next.subsCurrent = clampInt(next.subsCurrent + Math.max(1, amount), 0, 999999);
      break;
    case "subs:subtract":
      next.subsCurrent = clampInt(next.subsCurrent - Math.max(1, amount), 0, 999999);
      break;
    case "stats:reset":
      next.kills = 0;
      next.wins = 0;
      break;
    case "timer:start":
      if (!next.timer.running) {
        next.timer.running = true;
        next.timer.startedAt = Date.now();
      }
      break;
    case "timer:pause":
      pauseTimer(next);
      break;
    case "timer:toggle":
      if (next.timer.running) {
        pauseTimer(next);
      } else {
        next.timer.running = true;
        next.timer.startedAt = Date.now();
      }
      break;
    case "timer:reset":
      next.timer.running = false;
      next.timer.startedAt = null;
      next.timer.elapsedMs = 0;
      break;
    case "timer:mode":
      next.timer.mode = action.mode === "countdown" ? "countdown" : "countup";
      break;
    case "timer:duration":
      next.timer.durationMs = Math.max(1000, clampInt(action.durationMs, 1000, 24 * 60 * 60 * 1000));
      break;
    case "state:update":
      Object.assign(next, sanitizeState({ ...next, ...action.patch }));
      break;
    case "layout:update":
      if (typeof action.panelId === "string" && next.layout[action.panelId]) {
        next.layout[action.panelId].x = clampInt(action.x, -50, 150);
        next.layout[action.panelId].y = clampInt(action.y, -50, 150);
      }
      break;
    case "layout:reset":
      next.layout = clone(defaultState.layout);
      break;
    default:
      break;
  }

  next.updatedAt = Date.now();
  state = sanitizeState(next);
}

function pauseTimer(next) {
  if (!next.timer.running) {
    return;
  }

  next.timer.elapsedMs = currentElapsed(next.timer);
  next.timer.running = false;
  next.timer.startedAt = null;
}

function currentElapsed(timer, at = Date.now()) {
  const startedAt = Number(timer.startedAt);
  const liveElapsed = timer.running && Number.isFinite(startedAt) ? Math.max(0, at - startedAt) : 0;
  return clampInt(Number(timer.elapsedMs || 0) + liveElapsed, 0, 24 * 60 * 60 * 1000);
}

async function persistAndBroadcast() {
  await persistState();
  broadcast("state", publicState());
}

async function persistState() {
  const savedRemotely = await saveRemoteState();

  if (savedRemotely) {
    return;
  }

  if (process.env.VERCEL) {
    warnMissingRemoteStorage();
    return;
  }

  try {
    await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error("Could not save state:", error.message);
  }
}

async function loadRemoteState() {
  if (!hasRemoteStorage()) {
    warnMissingRemoteStorage();
    return null;
  }

  try {
    const raw = await redisCommand(["GET", remoteStateKey]);
    if (!raw) {
      return null;
    }

    return sanitizeState({ ...defaultState, ...JSON.parse(raw) });
  } catch (error) {
    console.error("Could not load remote overlay state:", error.message);
    return null;
  }
}

async function refreshStateFromRemote() {
  if (!hasRemoteStorage()) {
    return;
  }

  const remoteState = await loadRemoteState();
  if (remoteState) {
    state = remoteState;
  }
}

async function saveRemoteState() {
  if (!hasRemoteStorage()) {
    return false;
  }

  try {
    await redisCommand(["SET", remoteStateKey, JSON.stringify(state)]);
    return true;
  } catch (error) {
    console.error("Could not save remote overlay state:", error.message);
    return false;
  }
}

async function redisCommand(command) {
  const config = getRemoteStorageConfig();
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Redis REST request failed with ${response.status}`);
  }

  return payload.result;
}

function getRemoteStorageConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  return { url, token };
}

function hasRemoteStorage() {
  const config = getRemoteStorageConfig();
  return Boolean(config.url && config.token);
}

function warnMissingRemoteStorage() {
  if (!process.env.VERCEL || remoteStorageWarned || hasRemoteStorage()) {
    return;
  }

  remoteStorageWarned = true;
  console.warn("Hosted overlay state is temporary because no Redis/KV REST environment variables are configured.");
}

function publicState() {
  return {
    ...state,
    serverTime: Date.now()
  };
}

function openEventStream(req, res) {
  res.writeHead(200, {
    ...corsHeaders(),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  res.write("retry: 1500\n\n");
  eventClients.add(res);
  sendEvent(res, "state", publicState());

  req.on("close", () => {
    eventClients.delete(res);
  });
}

function broadcast(event, payload) {
  for (const client of eventClients) {
    sendEvent(client, event, payload);
  }
}

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function serveStatic(requestPath, res) {
  const routes = {
    "/": "overlay.html",
    "/overlay": "overlay.html",
    "/control": "control.html"
  };

  const routeTarget = routes[requestPath] || requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(publicDir, routeTarget);

  if (!resolvedPath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(resolvedPath).pipe(res);
}

async function readJson(req) {
  let raw = "";

  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      throw new Error("Request body too large.");
    }
  }

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
