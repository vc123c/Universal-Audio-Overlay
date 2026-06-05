const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");

const KEY = {
  BACKSLASH: 43,
  ONE: 2,
  TWO: 3,
  THREE: 4,
  FOUR: 5,
  FIVE: 6,
  SIX: 7,
  SEVEN: 8,
  EIGHT: 9,
  NINE: 10,
  ZERO: 11,
  A: 30,
  I: 23,
  N: 49,
  D: 32,
  G: 34,
  L: 38,
  H: 35,
  Q: 16,
  W: 17,
  Y: 21,
  V: 47,
  UP: 57416,
  LEFT: 57419,
  RIGHT: 57421,
  DOWN: 57424
};
let win, uIOhook, locked = false, hover = false, moveMode = false, slashHeld = false, snappingWindow = false, keyboardMoveUntil = 0, pollT, hoverT, topT, peakT, cmd = false, cmdT, lastAppId = "";
let snapEdges = { left: false, top: false, right: false, bottom: false };
const artCache = new Map();
const artMetaCache = new Map();
const artMissUntil = new Map();
const artInFlight = new Map();
let volumeProc = null, volumeBuffer = "", volumeReady = false;
let volumeQueue = [], volumePending = null, volumeFallbackUntil = 0;
let mediaProc = null, mediaBuffer = "", mediaReady = false;
let mediaQueue = [], mediaPending = null, mediaFallbackUntil = 0;
let lastTrackKey = "", boundsWriteT = null, pendingBounds = null, lastStableTrack = null, noSessionCount = 0, mediaPlaying = false, peakInFlight = false, pollInFlight = false, lastPeakSent = 0, selectedSessionKey = "";

const sp = (file) => path.join(app.getPath("userData"), file);
const read = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(sp(file), "utf8"));
  } catch {
    return fallback;
  }
};
const write = (file, data) => fs.writeFileSync(sp(file), JSON.stringify(data, null, 2));
const settings = () => read("settings.json", { glowBrightness: 70, glowEnabled: true, glowColor: "#7c3aed", xrayEnabled: false, xrayTheme: "white", vinylEnabled: false, debugBounds: false });
const save = (data) => write("settings.json", data);
const patch = (data) => {
  const next = { ...settings(), ...data };
  save(next);
  return next;
};

function flash(message) {
  win?.webContents.send("flash", message);
}

function sendState() {
  win?.webContents.send("state", { source: "system", locked, hover, moveMode, settings: settings(), snapEdges, selectedSessionKey });
}

function enforceAlwaysOnTop() {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(true, "screen-saver", 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {}
}

function raiseOverlay() {
  enforceAlwaysOnTop();
  try {
    if (win?.isVisible()) win.moveTop();
  } catch {}
}

function artKey(data) {
  const title = String(isLongMedia(data) ? longMediaSearchTitle(data) : data?.title || "").trim().toLowerCase();
  const artist = String(data?.artist || "").trim().toLowerCase();
  const kind = isLongMedia(data) ? "long" : "music";
  if (title.includes("no system media") || title.includes("system media")) return "";
  if (kind === "long") return title ? `${kind}::${cleanDisplayArtist(artist, data?.appId) || "unknown"}::${title}` : "";
  if (!title || !artist) return "";
  return `${kind}::${artist}::${title}`;
}

function parseDurationSeconds(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function durationSeconds(data) {
  const direct = Number(data?.durationSeconds || 0);
  return Number.isFinite(direct) && direct > 0 ? direct : parseDurationSeconds(data?.durationText);
}

function isSpotifyApp(data) {
  const text = `${data?.appId || ""} ${data?.artist || ""}`.toLowerCase();
  return text.includes("spotify");
}

function isLikelyAudiobook(data) {
  const title = String(data?.title || "").trim();
  const albumTitle = String(data?.albumTitle || "").trim();
  if (!albumTitle || normalizeSongText(albumTitle) === normalizeSongText(title)) return false;

  const combined = `${title} ${albumTitle}`.toLowerCase();
  if (/\b(audiobook|audio book|unabridged|abridged|chapter \d+|prologue|epilogue)\b/i.test(combined)) return true;

  // Spotify audiobooks often expose the book as AlbumTitle and the current file as "Introduction".
  return isSpotifyApp(data) && isGenericChapterTitle(title);
}

function isLongMedia(data) {
  if (durationSeconds(data) >= 20 * 60) return true;
  return isLikelyAudiobook(data) && durationSeconds(data) >= 5 * 60;
}

function cleanDisplayArtist(value, appId = "") {
  const artist = String(value || "").trim();
  if (!artist) return "";
  const app = String(appId || "").trim();
  const compact = artist.toLowerCase();
  if (app && compact === app.toLowerCase()) return "";
  if (/spotifyab\.spotifymusic/i.test(artist)) return "";
  if (/^[a-z0-9]+([._-][a-z0-9]+){2,}/i.test(artist) && artist.length > 18) return "";
  if (/^[a-z0-9]{16,}$/i.test(artist)) return "";
  return artist;
}

function isGenericChapterTitle(value) {
  const text = normalizeSongText(value);
  return /^(intro|introduction|prologue|epilogue|chapter|chapter \d+|part \d+|opening|credits)$/.test(text) ||
    /^chapter \d+ /.test(text);
}

function longMediaSearchTitle(data) {
  const title = cleanForSearch(data?.title);
  const albumTitle = cleanForSearch(data?.albumTitle);
  if (albumTitle && isLikelyAudiobook(data)) {
    return albumTitle;
  }
  return title;
}

function displayTrackData(data) {
  if (!data || !isLongMedia(data)) return data;
  const artist = cleanDisplayArtist(data.artist, data.appId);
  const albumTitle = cleanForSearch(data.albumTitle);
  const title = albumTitle && isLikelyAudiobook(data) ? albumTitle : data.title;
  return artist === data.artist && title === data.title ? data : { ...data, title, artist };
}

function isNoSessionData(data) {
  const title = String(data?.title || "").toLowerCase();
  return title.includes("no system media session") ||
    title.includes("system media parse failed") ||
    String(data?.artist || "").toLowerCase().includes("waiting for windows media");
}

function cleanForSearch(value) {
  return String(value || "")
    .replace(/\s*\([^)]*(official|audio|video|lyrics?|visualizer|remaster|remastered)[^)]*\)/ig, " ")
    .replace(/\s*\[[^\]]*(official|audio|video|lyrics?|visualizer|remaster|remastered)[^\]]*\]/ig, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSongText(value) {
  return cleanForSearch(value)
    .toLowerCase()
    .replace(/\b(feat|featuring|ft)\b.*$/i, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreArtworkResult(result, artist, title, source) {
  const resultArtist = normalizeSongText(source === "deezer" ? result?.artist?.name : result?.artistName);
  const resultTitle = normalizeSongText(source === "deezer" ? result?.title : result?.trackName);
  const wantedArtist = normalizeSongText(artist);
  const wantedTitle = normalizeSongText(title);
  if (!resultArtist || !resultTitle || !wantedArtist || !wantedTitle) return 0;

  let score = 0;
  if (resultArtist === wantedArtist) score += 60;
  else if (resultArtist.includes(wantedArtist) || wantedArtist.includes(resultArtist)) score += 35;

  if (resultTitle === wantedTitle) score += 70;
  else if (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle)) score += 35;

  return score;
}

function bestArtworkResult(results, artist, title, source) {
  return (results || [])
    .map((result) => ({ result, score: scoreArtworkResult(result, artist, title, source) }))
    .filter((item) => item.score >= 95)
    .sort((a, b) => b.score - a.score)[0]?.result || null;
}

async function fetchJson(url, timeout = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "UniversalAudioOverlay/1.8" }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeout = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "UniversalAudioOverlay/1.8" }
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function upgradeItunesArt(url) {
  return String(url || "").replace(/\/\d+x\d+bb\.(jpg|png|webp)$/i, (_, ext) => `/600x600bb.${ext}`);
}

function bestPodcastResult(results, artist, title) {
  const wantedArtist = normalizeSongText(artist);
  const wantedTitle = normalizeSongText(title);
  return (results || [])
    .map((result) => {
      const collection = normalizeSongText(result.collectionName);
      const resultArtist = normalizeSongText(result.artistName);
      const episode = normalizeSongText(result.trackName);
      let score = 0;

      if (wantedTitle && episode) {
        if (episode === wantedTitle) score += 80;
        else if (episode.includes(wantedTitle) || wantedTitle.includes(episode)) score += 48;
      }

      if (wantedArtist) {
        if (collection === wantedArtist || resultArtist === wantedArtist) score += 60;
        else if (collection.includes(wantedArtist) || wantedArtist.includes(collection)) score += 38;
        else if (resultArtist.includes(wantedArtist) || wantedArtist.includes(resultArtist)) score += 30;
      }

      return { result, score };
    })
    .filter((item) => item.score >= 55)
    .sort((a, b) => b.score - a.score)[0]?.result || null;
}

function scoreBookResult(title, artist, resultTitle, resultAuthor) {
  const wantedTitle = normalizeSongText(title);
  const wantedArtist = normalizeSongText(artist);
  const foundTitle = normalizeSongText(resultTitle);
  const foundAuthor = normalizeSongText(resultAuthor);
  if (!wantedTitle || !foundTitle) return 0;

  let score = 0;
  if (foundTitle === wantedTitle) score += 90;
  else if (foundTitle.includes(wantedTitle) || wantedTitle.includes(foundTitle)) score += 58;

  if (wantedArtist && foundAuthor) {
    if (foundAuthor === wantedArtist) score += 50;
    else if (foundAuthor.includes(wantedArtist) || wantedArtist.includes(foundAuthor)) score += 28;
  }

  return score;
}

function bestBookResult(results, artist, title, source) {
  return (results || [])
    .map((result) => {
      const info = source === "google" ? result?.volumeInfo || {} : result || {};
      const resultTitle = source === "itunes" ? (info.collectionName || info.trackName) : info.title;
      const resultAuthor = source === "itunes" ? info.artistName : (info.authors || []).join(" ");
      return { result, score: scoreBookResult(title, artist, resultTitle, resultAuthor) };
    })
    .filter((item) => item.score >= 58)
    .sort((a, b) => b.score - a.score)[0]?.result || null;
}

function bookResultAuthor(result, source) {
  if (!result) return "";
  const info = source === "google" ? result.volumeInfo || result : result;
  return source === "itunes" ? String(info.artistName || "") : String((info.authors || []).join(", "));
}

function googleBookArtUrl(item) {
  const links = item?.volumeInfo?.imageLinks || {};
  const url = links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail || "";
  if (!url) return "";
  return String(url).replace(/^http:/i, "https:").replace(/zoom=\d+/i, "zoom=2");
}

async function lookupBookArt(data, title, artist) {
  const key = artKey(data);
  if (!title) return "";

  const termParts = [title, artist].filter(Boolean);
  const itunes = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(termParts.join(" "))}&media=audiobook&entity=audiobook&limit=10`, 3000);
  const audioBook = bestBookResult(itunes?.results, artist, title, "itunes");
  const itunesArt = audioBook?.artworkUrl600 || audioBook?.artworkUrl100 || "";
  if (itunesArt) {
    const art = upgradeItunesArt(itunesArt);
    rememberArt(key, art, { artist: bookResultAuthor(audioBook, "itunes") });
    return art;
  }

  const googleQuery = artist ? `intitle:${title} inauthor:${artist}` : `intitle:${title}`;
  const books = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(googleQuery)}&maxResults=8&printType=books`, 3000);
  const book = bestBookResult(books?.items, artist, title, "google");
  const googleArt = googleBookArtUrl(book);
  if (googleArt) {
    rememberArt(key, googleArt, { artist: bookResultAuthor(book, "google") });
    return googleArt;
  }

  const openLibrary = await fetchJson(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}${artist ? `&author=${encodeURIComponent(artist)}` : ""}&limit=8`, 3000);
  const openItem = bestBookResult((openLibrary?.docs || []).map((item) => ({
    title: item.title,
    authors: item.author_name || [],
    cover_i: item.cover_i
  })), artist, title, "google");
  if (openItem?.cover_i) {
    const art = `https://covers.openlibrary.org/b/id/${openItem.cover_i}-L.jpg`;
    rememberArt(key, art, { artist: bookResultAuthor(openItem, "google") });
    return art;
  }

  return "";
}

async function lookupYoutubeThumbnail(artist, title) {
  const query = encodeURIComponent([title, artist].filter(Boolean).join(" "));
  if (!query) return "";
  const html = await fetchText(`https://www.youtube.com/results?search_query=${query}`, 3500);
  const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((match) => match[1]);
  const id = ids.find((value, index) => ids.indexOf(value) === index);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

async function lookupLongMediaArt(data) {
  const key = artKey(data);
  const title = longMediaSearchTitle(data);
  const artist = cleanForSearch(cleanDisplayArtist(data.artist, data.appId));
  if (!title) return "";

  if (isLikelyAudiobook(data)) {
    const bookArt = await lookupBookArt(data, title, artist);
    if (bookArt) return bookArt;
  }

  const episodeTerm = encodeURIComponent([title, artist].filter(Boolean).join(" "));
  const episode = await fetchJson(`https://itunes.apple.com/search?term=${episodeTerm}&media=podcast&entity=podcastEpisode&limit=8`, 3000);
  const episodeItem = bestPodcastResult(episode?.results, artist, title);
  const episodeArt = episodeItem?.artworkUrl600 || episodeItem?.artworkUrl160 || episodeItem?.artworkUrl60 || "";
  if (episodeArt) {
    const art = upgradeItunesArt(episodeArt);
    rememberArt(key, art);
    return art;
  }

  if (artist) {
    const show = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&media=podcast&entity=podcast&limit=8`, 3000);
    const showItem = bestPodcastResult(show?.results, artist, title);
    const showArt = showItem?.artworkUrl600 || showItem?.artworkUrl100 || "";
    if (showArt) {
      const art = upgradeItunesArt(showArt);
      rememberArt(key, art);
      return art;
    }
  }

  const youtubeArt = await lookupYoutubeThumbnail(artist, title);
  if (youtubeArt) {
    rememberArt(key, youtubeArt);
    return youtubeArt;
  }

  return "";
}

function rememberArt(key, art, meta = {}) {
  artCache.set(key, art);
  if (meta && Object.values(meta).some(Boolean)) artMetaCache.set(key, meta);
  if (artCache.size > 60) {
    const oldest = artCache.keys().next().value;
    artCache.delete(oldest);
    artMetaCache.delete(oldest);
  }
}

async function lookupAlbumArt(data) {
  const key = artKey(data);
  if (!key) return "";
  if (artCache.has(key)) return artCache.get(key);
  if ((artMissUntil.get(key) || 0) > Date.now()) return "";

  if (isLongMedia(data)) {
    const art = await lookupLongMediaArt(data);
    if (art) return art;
    artMissUntil.set(key, Date.now() + 5 * 60 * 1000);
    return "";
  }

  const title = cleanForSearch(data.title);
  const artist = cleanForSearch(data.artist);

  const deezerQuery = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
  const deezer = await fetchJson(`https://api.deezer.com/search?q=${deezerQuery}&limit=8`);
  const deezerItem = bestArtworkResult(deezer?.data, artist, title, "deezer");
  const deezerArt = deezerItem?.album?.cover_xl || deezerItem?.album?.cover_big || "";
  if (deezerArt) {
    rememberArt(key, deezerArt);
    return deezerArt;
  }

  const term = encodeURIComponent(`${artist} ${title}`);
  const itunes = await fetchJson(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=10`);
  const item = bestArtworkResult(itunes?.results, artist, title, "itunes");
  if (item?.artworkUrl100) {
    const art = upgradeItunesArt(item.artworkUrl100);
    rememberArt(key, art);
    return art;
  }

  artMissUntil.set(key, Date.now() + 5 * 60 * 1000);
  return "";
}

function track(data) {
  const next = displayTrackData(data);
  if (next?.appId) lastAppId = next.appId;
  if (!selectedSessionKey && next?.sessionKey) selectedSessionKey = "";
  mediaPlaying = !!next?.isPlaying && !isNoSessionData(next);
  lastTrackKey = artKey(next);
  win?.webContents.send("track", next);
}

function requestAlbumArt(data) {
  const next = displayTrackData(data);
  const key = artKey(next);
  if (!key || next?.albumArt || artInFlight.has(key)) return;

  if (artCache.has(key)) {
    const meta = artMetaCache.get(key) || {};
    win?.webContents.send("track", { ...next, ...meta, albumArt: artCache.get(key) });
    return;
  }

  const promise = lookupAlbumArt(next)
    .then((art) => {
      if (art && lastTrackKey === key) {
        const meta = artMetaCache.get(key) || {};
        win?.webContents.send("track", { ...next, ...meta, albumArt: art });
      }
    })
    .finally(() => artInFlight.delete(key));

  artInFlight.set(key, promise);
}

function create() {
  const bounds = read("overlay.json", { x: 200, y: 200, width: 520, height: 122 });
  const iconPath = path.join(__dirname, "assets", "logo.svg");
  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    focusable: false,
    title: "Universal Audio Overlay",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setOpacity(1);
  enforceAlwaysOnTop();
  win.loadFile("overlay.html");
  win.on("moved", saveSnappedBounds);
  win.on("resized", saveSnappedBounds);
  win.on("show", raiseOverlay);
  win.on("focus", raiseOverlay);
  win.on("restore", raiseOverlay);
  win.on("blur", enforceAlwaysOnTop);
  topT = setInterval(enforceAlwaysOnTop, 2500);
  startPeakPump();
  startHover();
}

function snappedBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.bounds;
  const margin = 34;
  const next = { ...bounds };
  const edges = { left: false, top: false, right: false, bottom: false };

  const leftDist = Math.abs(bounds.x - area.x);
  const topDist = Math.abs(bounds.y - area.y);
  const rightDist = Math.abs((bounds.x + bounds.width) - (area.x + area.width));
  const bottomDist = Math.abs((bounds.y + bounds.height) - (area.y + area.height));

  if (leftDist <= margin) {
    next.x = area.x;
    edges.left = true;
  } else if (rightDist <= margin) {
    next.x = area.x + area.width - bounds.width;
    edges.right = true;
  }

  if (topDist <= margin) {
    next.y = area.y;
    edges.top = true;
  } else if (bottomDist <= margin) {
    next.y = area.y + area.height - bounds.height;
    edges.bottom = true;
  }

  next.x = Math.max(area.x, Math.min(next.x, area.x + area.width - bounds.width));
  next.y = Math.max(area.y, Math.min(next.y, area.y + area.height - bounds.height));
  return { bounds: next, edges };
}

function setSnapEdges(edges) {
  const next = edges || { left: false, top: false, right: false, bottom: false };
  const changed = ["left", "top", "right", "bottom"].some((edge) => snapEdges[edge] !== next[edge]);
  if (!changed) return;
  snapEdges = next;
  sendState();
}

function saveSnappedBounds() {
  if (!win || snappingWindow) return;
  const current = win.getBounds();
  if (Date.now() < keyboardMoveUntil) {
    setSnapEdges(null);
    scheduleBoundsWrite(current);
    return;
  }
  const { bounds: next, edges } = snappedBounds(current);
  setSnapEdges(edges);
  if (next.x !== current.x || next.y !== current.y) {
    snappingWindow = true;
    win.setBounds(next);
    snappingWindow = false;
  }
  scheduleBoundsWrite(win.getBounds());
}

function scheduleBoundsWrite(bounds) {
  pendingBounds = bounds;
  clearTimeout(boundsWriteT);
  boundsWriteT = setTimeout(() => {
    if (pendingBounds) write("overlay.json", pendingBounds);
    pendingBounds = null;
  }, 180);
}

function resizeFromEdge(edge, startBounds, dx, dy) {
  if (!win || locked) return win?.getBounds();
  const minWidth = 118;
  const minHeight = 70;
  const start = {
    x: Number(startBounds?.x) || 0,
    y: Number(startBounds?.y) || 0,
    width: Math.max(minWidth, Number(startBounds?.width) || minWidth),
    height: Math.max(minHeight, Number(startBounds?.height) || minHeight)
  };
  const next = { ...start };
  const deltaX = Number(dx) || 0;
  const deltaY = Number(dy) || 0;
  const side = String(edge || "");

  if (side.includes("e")) next.width = Math.max(minWidth, start.width + deltaX);
  if (side.includes("s")) next.height = Math.max(minHeight, start.height + deltaY);
  if (side.includes("w")) {
    const width = Math.max(minWidth, start.width - deltaX);
    next.x = start.x + start.width - width;
    next.width = width;
  }
  if (side.includes("n")) {
    const height = Math.max(minHeight, start.height - deltaY);
    next.y = start.y + start.height - height;
    next.height = height;
  }

  keyboardMoveUntil = Date.now() + 250;
  setSnapEdges(null);
  win.setBounds(next);
  scheduleBoundsWrite(win.getBounds());
  return win.getBounds();
}

function inside(point, bounds) {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function applyMouse() {
  win.setIgnoreMouseEvents(locked || hover, { forward: false });
  if (!hover) {
    win.setOpacity(1);
    win.webContents.send("hover-state", false);
    return;
  }

  const isInside = inside(screen.getCursorScreenPoint(), win.getBounds());
  win.setOpacity(isInside ? 0.01 : 1);
  win.webContents.send("hover-state", isInside);
}

function startHover() {
  hoverT = setInterval(() => {
    if (locked || hover) applyMouse();
  }, 35);
}

function toggleLock() {
  locked = !locked;
  win.setResizable(!locked);
  win.webContents.send("lock", locked);
  applyMouse();
  flash(locked ? "\\1 locked + mouse off" : "\\1 unlocked");
  sendState();
}

function toggleHover() {
  hover = !hover;
  applyMouse();
  flash(hover ? "\\7 safe hover on" : "\\7 safe hover off");
  sendState();
}

function toggleGlow() {
  const current = settings().glowEnabled !== false;
  patch({ glowEnabled: !current });
  flash(!current ? "\\4 glow on" : "\\4 glow off");
  sendState();
}

function toggleXray() {
  const current = settings().xrayEnabled === true;
  patch({ xrayEnabled: !current });
  flash(!current ? "\\3 x-ray on" : "\\3 x-ray off");
  sendState();
}

function toggleXrayTheme() {
  const current = settings().xrayTheme === "black" ? "black" : "white";
  const next = current === "white" ? "black" : "white";
  patch({ xrayTheme: next, xrayEnabled: true });
  flash(`\\2 x-ray ${next}`);
  sendState();
}

function toggleVinyl() {
  const current = settings().vinylEnabled === true;
  patch({ vinylEnabled: !current });
  flash(!current ? "\\5 vinyl on" : "\\5 vinyl off");
  sendState();
}

function toggleDebugBounds() {
  const current = settings().debugBounds === true;
  patch({ debugBounds: !current });
  flash(!current ? "\\D debug bounds on" : "\\D debug bounds off");
  sendState();
}

function showColorWheel() {
  win?.setIgnoreMouseEvents(false);
  win?.setOpacity(1);
  win?.setFocusable(true);
  win?.webContents.send("color-wheel");
  flash("\\W glow color");
}

function showCommands() {
  win?.webContents.send("commands", [
    "\\1 lock / click-through",
    "\\2 x-ray white/black",
    "\\3 x-ray on/off",
    "\\4 glow on/off",
    "\\5 vinyl album art",
    "\\6 pixel move mode",
    "\\7 safe hover",
    "\\8 / \\I show commands",
    "\\A media sessions",
    "\\D debug window edge",
    "\\W glow color wheel",
    "\\0 quit",
    "\\ + arrow nudge while move mode is on",
  ]);
}

function mediaSessionArgs(action, seconds = 10, positionPct = -1) {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(__dirname, "media-session.ps1"),
    "-Action",
    action,
    "-Seconds",
    String(seconds),
    "-PositionPct",
    String(positionPct)
  ];
  if (selectedSessionKey) args.push("-SessionKey", selectedSessionKey);
  return args;
}

function sys(action = "get", seconds = 10, positionPct = -1) {
  if (Date.now() > mediaFallbackUntil) {
    return mediaFast(action, seconds, positionPct).catch(() => sysOnce(action, seconds, positionPct));
  }

  return sysOnce(action, seconds, positionPct);
}

function parseHelperJson(output) {
  const text = String(output || "").replace(/^\uFEFF/, "").replace(/\0/g, "").trim();
  if (!text) throw new Error("empty helper output");

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const marked = lines[i].match(/^UAOJSON:([A-Za-z0-9+/=]+)$/);
    if (!marked) continue;
    const json = Buffer.from(marked[1], "base64").toString("utf8");
    return JSON.parse(json);
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith("{") && !lines[i].startsWith("[")) continue;
    try {
      return JSON.parse(lines[i]);
    } catch {}
  }

  const firstObject = text.indexOf("{");
  const lastObject = text.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    return JSON.parse(text.slice(firstObject, lastObject + 1));
  }

  const firstArray = text.indexOf("[");
  const lastArray = text.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    return JSON.parse(text.slice(firstArray, lastArray + 1));
  }

  return JSON.parse(text);
}

function sysOnce(action = "get", seconds = 10, positionPct = -1) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      mediaSessionArgs(action, seconds, positionPct),
      { windowsHide: true, timeout: 5000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve({
            source: "system",
            title: "No system media session",
            artist: "Waiting for Windows media",
            progressPct: 0,
            progressText: "0:00",
            durationText: "0:00",
            isPlaying: false
          });
          return;
        }

        try {
          const data = parseHelperJson(stdout);
          data.source = "system";
          if (action === "get" && selectedSessionKey && (data.selectedSessionMissing || data.sessionKey && data.sessionKey !== selectedSessionKey)) {
            selectedSessionKey = "";
            sendState();
          }
          resolve(data);
        } catch {
          resolve({
            source: "system",
            title: "System media parse failed",
            artist: "Helper output could not be decoded",
            progressPct: 0,
            progressText: "0:00",
            durationText: "0:00",
            isPlaying: false
          });
        }
      }
    );
  });
}

function ensureMediaServer() {
  if (mediaProc && !mediaProc.killed) return;

  mediaReady = false;
  mediaBuffer = "";
  mediaProc = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(__dirname, "media-control.ps1"),
    "-Server"
  ], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });

  mediaProc.stdout.setEncoding("utf8");
  mediaProc.stdout.on("data", (chunk) => {
    mediaBuffer += chunk;
    const lines = mediaBuffer.split(/\r?\n/);
    mediaBuffer = lines.pop() || "";
    for (const line of lines) handleMediaLine(line);
  });

  mediaProc.on("exit", () => {
    const pending = mediaPending;
    mediaProc = null;
    mediaReady = false;
    mediaPending = null;
    mediaFallbackUntil = Date.now() + 6000;
    if (pending) pending.resolve({ ok: false, error: "Media helper stopped" });
    while (mediaQueue.length) mediaQueue.shift().resolve({ ok: false, error: "Media helper stopped" });
  });
}

function handleMediaLine(line) {
  if (!line.trim()) return;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    if (mediaPending) {
      const pending = mediaPending;
      mediaPending = null;
      pending.resolve({ ok: false, error: line });
      pumpMediaQueue();
    }
    return;
  }

  if (data.ready) {
    mediaReady = true;
    pumpMediaQueue();
    return;
  }

  if (!mediaPending) return;
  const pending = mediaPending;
  mediaPending = null;
  pending.resolve(data);
  pumpMediaQueue();
}

function pumpMediaQueue() {
  if (!mediaReady || mediaPending || !mediaQueue.length) return;
  ensureMediaServer();
  const item = mediaQueue.shift();
  mediaPending = item;
  try {
    mediaProc.stdin.write(JSON.stringify({
      action: item.action,
      seconds: item.seconds,
      positionPct: item.positionPct,
      sessionKey: selectedSessionKey || ""
    }) + "\n");
  } catch (error) {
    mediaPending = null;
    item.reject(error);
  }
}

function mediaFast(action = "get", seconds = 10, positionPct = -1) {
  ensureMediaServer();
  return new Promise((resolve, reject) => {
    const item = { action, seconds, positionPct, resolve, reject };
    if (action === "seek" || action === "get") {
      const oldQueue = mediaQueue;
      mediaQueue = [];
      for (const old of oldQueue) {
        if (old.action === action) old.resolve({ ok: true, superseded: true });
        else mediaQueue.push(old);
      }
    }
    mediaQueue.push(item);
    setTimeout(() => {
      const idx = mediaQueue.indexOf(item);
      if (idx >= 0) {
        mediaQueue.splice(idx, 1);
        resolve({ ok: false, error: "Media helper timeout" });
      }
    }, action === "get" ? 900 : 2500);
    pumpMediaQueue();
  });
}

async function listMediaSessions() {
  const data = await sysOnce("list", 0, -1);
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  return { selectedSessionKey, sessions };
}

async function showSessionPicker() {
  restoreInteractivity();
  const data = await listMediaSessions();
  win?.webContents.send("session-picker", data);
  flash("\\A media sessions");
}

async function selectMediaSession(key = "") {
  selectedSessionKey = String(key || "");
  mediaQueue = [];
  await pollSystem();
  sendState();
  flash(selectedSessionKey ? "\\A session selected" : "\\A auto session");
  return listMediaSessions();
}

function restoreInteractivity() {
  if (moveMode) {
    win?.setIgnoreMouseEvents(false);
    win?.setOpacity(1);
    win?.setFocusable(true);
    return;
  }

  win?.setFocusable(false);
  applyMouse();
}

function toggleMoveMode() {
  moveMode = !moveMode;
  if (moveMode && locked) {
    locked = false;
    win.setResizable(true);
    win.webContents.send("lock", false);
  }
  flash(moveMode ? "\\6 move mode on" : "\\6 move mode off");
  restoreInteractivity();
  sendState();
}

function nudgeWindow(code) {
  if (!win) return false;
  const bounds = win.getBounds();
  const next = { x: bounds.x, y: bounds.y };
  if (code === KEY.LEFT) next.x -= 1;
  else if (code === KEY.RIGHT) next.x += 1;
  else if (code === KEY.UP) next.y -= 1;
  else if (code === KEY.DOWN) next.y += 1;
  else return false;

  keyboardMoveUntil = Date.now() + 250;
  setSnapEdges(null);
  win.setBounds({ ...bounds, x: next.x, y: next.y });
  scheduleBoundsWrite(win.getBounds());
  return true;
}

async function pollSystem() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const data = await sys("get", 10);
    if (data?.superseded) return;
    if (isNoSessionData(data)) {
      noSessionCount += 1;
      if (lastStableTrack && noSessionCount < 4) return;
    } else {
      noSessionCount = 0;
      lastStableTrack = data;
    }

    track(data);
    requestAlbumArt(data);
  } finally {
    pollInFlight = false;
  }
}

async function playPause() {
  sys("playpause", 0).finally(() => setTimeout(pollSystem, 80));
  return { ok: true };
}

async function previousTrack() {
  sys("previous", 0).finally(() => setTimeout(pollSystem, 120));
  return { ok: true };
}

async function nextTrack() {
  sys("next", 0).finally(() => setTimeout(pollSystem, 120));
  return { ok: true };
}

async function skip(seconds) {
  sys("skip", seconds).finally(() => setTimeout(pollSystem, 120));
  return { ok: true };
}

async function seekPercent(percent) {
  const pct = Math.max(0, Math.min(100, Number(percent || 0)));
  sys("seek", 0, pct).finally(() => setTimeout(pollSystem, 120));
  return { ok: true };
}

function volume(action = "get", value = -1) {
  if (Date.now() > volumeFallbackUntil) {
    return volumeFast(action, value).catch(() => volumeOnce(action, value));
  }

  return volumeOnce(action, value);
}

function volumeArgs(action, value) {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(__dirname, "audio-volume.ps1"),
    "-Action",
    action,
    "-Volume",
    String(value)
  ];

  if (lastAppId) {
    args.push("-AppId", lastAppId);
  }

  return args;
}

function normalizeVolumeResult(data) {
  if (Number(data.volume) < 0) {
    data.volume = 100;
    data.matched = false;
  }
  if (!Number.isFinite(Number(data.peak))) data.peak = 0;
  data.peak = Math.max(0, Math.min(1, Number(data.peak)));
  return data;
}

function volumeOnce(action = "get", value = -1) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      volumeArgs(action, value),
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        if (error) {
          resolve({ volume: 100, matched: false, error: String(error.message) });
          return;
        }
        try {
          resolve(normalizeVolumeResult(JSON.parse(stdout.trim())));
        } catch {
          resolve({ volume: 100, matched: false, error: stdout.trim() });
        }
      }
    );
  });
}

function ensureVolumeServer() {
  if (volumeProc && !volumeProc.killed) return;

  volumeReady = false;
  volumeBuffer = "";
  volumeProc = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(__dirname, "audio-volume.ps1"),
    "-Server"
  ], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });

  volumeProc.stdout.setEncoding("utf8");
  volumeProc.stdout.on("data", (chunk) => {
    volumeBuffer += chunk;
    const lines = volumeBuffer.split(/\r?\n/);
    volumeBuffer = lines.pop() || "";
    for (const line of lines) handleVolumeLine(line);
  });

  volumeProc.on("exit", () => {
    const pending = volumePending;
    volumeProc = null;
    volumeReady = false;
    volumePending = null;
    volumeFallbackUntil = Date.now() + 6000;
    if (pending) pending.resolve({ volume: 100, matched: false, error: "Volume helper stopped" });
    while (volumeQueue.length) volumeQueue.shift().resolve({ volume: 100, matched: false, error: "Volume helper stopped" });
  });
}

function handleVolumeLine(line) {
  if (!line.trim()) return;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    if (volumePending) {
      const pending = volumePending;
      volumePending = null;
      pending.resolve({ volume: 100, matched: false, error: line });
      pumpVolumeQueue();
    }
    return;
  }

  if (data.ready) {
    volumeReady = true;
    pumpVolumeQueue();
    return;
  }

  if (!volumePending) return;
  const pending = volumePending;
  volumePending = null;
  pending.resolve(normalizeVolumeResult(data));
  pumpVolumeQueue();
}

function pumpVolumeQueue() {
  if (!volumeReady || volumePending || !volumeQueue.length) return;
  ensureVolumeServer();
  const item = volumeQueue.shift();
  volumePending = item;
  try {
    volumeProc.stdin.write(JSON.stringify({
      action: item.action,
      appId: lastAppId || "",
      volume: item.value
    }) + "\n");
  } catch (error) {
    volumePending = null;
    item.reject(error);
  }
}

function volumeFast(action = "get", value = -1) {
  ensureVolumeServer();
  return new Promise((resolve, reject) => {
    const item = { action, value, resolve, reject };
    if (action === "set" || action === "peak") {
      const oldQueue = volumeQueue;
      volumeQueue = [];
      for (const old of oldQueue) {
        if (old.action === action) {
          old.resolve(action === "peak" ? { peak: lastPeakSent, matched: false, superseded: true } : { volume: old.value, matched: true, superseded: true });
        } else {
          volumeQueue.push(old);
        }
      }
    }
    volumeQueue.push(item);
    setTimeout(() => {
      const idx = volumeQueue.indexOf(item);
      if (idx >= 0) {
        volumeQueue.splice(idx, 1);
        resolve({ volume: 100, matched: false, error: "Volume helper timeout" });
      }
    }, action === "peak" ? 600 : 2500);
    pumpVolumeQueue();
  });
}

function sendPeak(peak) {
  const next = Math.max(0, Math.min(1, Number(peak) || 0));
  if (Math.abs(next - lastPeakSent) < 0.012 && next !== 0) return;
  lastPeakSent = next;
  win?.webContents.send("audio-peak", next);
}

function startPeakPump() {
  clearInterval(peakT);
  peakT = setInterval(async () => {
    if (!win || win.isDestroyed()) return;
    if (!mediaPlaying || settings().glowEnabled === false) {
      if (lastPeakSent !== 0) sendPeak(0);
      return;
    }
    if (peakInFlight) return;
    peakInFlight = true;
    try {
      const result = await volume("peak");
      if (result?.matched && Number.isFinite(Number(result.peak))) sendPeak(result.peak);
    } catch {
      sendPeak(0);
    } finally {
      peakInFlight = false;
    }
  }, 165);
}

function startPoll() {
  pollSystem();
  pollT = setInterval(pollSystem, 1250);
}

function enterCommandMode() {
  cmd = true;
  flash("\\ command");
  clearTimeout(cmdT);
  cmdT = setTimeout(() => {
    cmd = false;
    flash("cancel");
  }, 1400);
}

function key(code) {
  if (code === KEY.BACKSLASH) {
    slashHeld = true;
    if (!cmd) enterCommandMode();
    return;
  }

  if (slashHeld && nudgeWindow(code)) {
    return;
  }

  if (!cmd) {
    return;
  }

  if (nudgeWindow(code)) {
    cmd = false;
    clearTimeout(cmdT);
    return;
  }

  cmd = false;
  clearTimeout(cmdT);
  if (code === KEY.ONE || code === KEY.L) toggleLock();
  else if (code === KEY.TWO) toggleXrayTheme();
  else if (code === KEY.THREE || code === KEY.Y) toggleXray();
  else if (code === KEY.FOUR || code === KEY.G) toggleGlow();
  else if (code === KEY.FIVE || code === KEY.N) toggleVinyl();
  else if (code === KEY.SIX || code === KEY.V) toggleMoveMode();
  else if (code === KEY.SEVEN || code === KEY.H) toggleHover();
  else if (code === KEY.EIGHT || code === KEY.I) showCommands();
  else if (code === KEY.A) showSessionPicker();
  else if (code === KEY.D) toggleDebugBounds();
  else if (code === KEY.W) showColorWheel();
  else if (code === KEY.ZERO || code === KEY.Q) app.quit();
}

function keys() {
  try {
    ({ uIOhook } = require("uiohook-napi"));
    uIOhook.on("keydown", (event) => key(event.keycode));
    uIOhook.on("keyup", (event) => {
      if (event.keycode === KEY.BACKSLASH) slashHeld = false;
    });
    uIOhook.start();
  } catch (error) {
    console.error(error);
  }
}

app.whenReady().then(() => {
  create();
  ensureMediaServer();
  ensureVolumeServer();
  startPoll();
  keys();
});

app.on("will-quit", () => {
  clearInterval(pollT);
  clearInterval(hoverT);
  clearInterval(topT);
  clearInterval(peakT);
  clearTimeout(boundsWriteT);
  if (pendingBounds) write("overlay.json", pendingBounds);
  uIOhook?.stop();
  volumeProc?.kill();
  mediaProc?.kill();
});
app.on("window-all-closed", () => app.quit());

ipcMain.handle("get-state", () => ({ source: "system", locked, hover, moveMode, settings: settings(), snapEdges, selectedSessionKey }));
ipcMain.handle("list-media-sessions", listMediaSessions);
ipcMain.handle("select-media-session", (_, key) => selectMediaSession(key));
ipcMain.handle("get-window-bounds", () => win?.getBounds());
ipcMain.handle("resize-window", (_, edge, startBounds, dx, dy) => resizeFromEdge(edge, startBounds, dx, dy));
ipcMain.handle("play-pause", playPause);
ipcMain.handle("previous-track", previousTrack);
ipcMain.handle("next-track", nextTrack);
ipcMain.handle("skip", (_, seconds) => skip(seconds));
ipcMain.handle("seek-percent", (_, percent) => seekPercent(percent));
ipcMain.handle("get-volume", () => volume("get"));
ipcMain.handle("set-volume", (_, value) => {
  const n = Math.max(0, Math.min(100, Number(value || 0)));
  return volume("set", n);
});
ipcMain.handle("set-glow-color", (_, value) => {
  const color = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "#7c3aed";
  patch({ glowColor: color });
  sendState();
  return color;
});
ipcMain.handle("close-color-wheel", () => {
  restoreInteractivity();
});
