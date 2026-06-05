let flashTimer = null;
let commandTimer = null;
let currentPlaying = false;
let currentProgress = 0;
let brightness = 70;
let glowColor = "#7c3aed";
let currentVolume = 100;
let volumeDragStart = null;
let volumeRefreshPending = false;
let lastVolumeRefresh = 0;
let lastVolumeInteraction = 0;
let volumeCommitTimer = null;
let volumeRequestId = 0;
let playheadDragging = false;
let bands = [];
let glowFrame = null;
let audioPeak = 0;
let smoothPeak = 0;
let bassPeak = 0;
let bassFloor = 0;
let displayedProgress = 0;
let targetProgress = 0;
let lastProgressUpdate = 0;
let progressRate = 0;
let progressFrame = null;
let progressTrackKey = "";
let layoutFitKey = "";
let lastRenderStaticKey = "";

const $ = (id) => document.getElementById(id);
const els = {
  art: $("art"),
  artWrap: document.querySelector(".art-wrap"),
  src: $("src"),
  title: $("title"),
  artist: $("artist"),
  prog: $("prog"),
  elapsed: $("elapsed"),
  duration: $("duration"),
  playhead: $("playhead"),
  playMini: $("playMini"),
  volumeKnob: $("volumeKnob"),
  volumeValue: $("volumeValue"),
  drag: $("drag"),
  flash: $("flashBox"),
  label: $("flashLabel"),
  commandHelp: $("commandHelp"),
  sessionPanel: $("sessionPanel"),
  colorPanel: $("colorPanel"),
  glowColor: $("glowColor"),
  card: document.querySelector(".playback-card"),
  statusDot: $("statusDot")
};

const PLAY_ICON = '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5 L19 12 L7 19 Z"></path></svg>';
const PAUSE_ICON = '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="4.5" height="14"></rect><rect x="14.5" y="5" width="4.5" height="14"></rect></svg>';

init();

async function init() {
  state(await api.getState());
  bindInstantButton($("prevTrackMini"), () => api.previousTrack());
  bindInstantButton($("back10Mini"), () => {
    optimisticSkip(-10);
    api.skip(-10);
  });
  bindInstantButton(els.playMini, () => {
    currentPlaying = !currentPlaying;
    setPlayPauseIcon(currentPlaying);
    els.statusDot.classList.toggle("playing", currentPlaying);
    els.statusDot.classList.toggle("paused", !currentPlaying);
    api.playPause();
  });
  bindInstantButton($("fwd10Mini"), () => {
    optimisticSkip(10);
    api.skip(10);
  });
  bindInstantButton($("nextTrackMini"), () => api.nextTrack());
  setupVolumeKnob();
  setupPlayhead();
  startProgressLoop();
  setupResizeZones();
  setupGlowColor();
  setupCompactFit();
  setupSessionPicker();

  bands = Array.from(document.querySelectorAll(".glow-band"));
  startGlowLoop();
  api.onTrack(render);
  api.onState(state);
  api.onFlash(flash);
  api.onCommands(showCommands);
  api.onSessionPicker(showSessionPicker);
  api.onColorWheel(toggleColorPanel);
  api.onAudioPeak((peak) => {
    if (Number.isFinite(Number(peak))) audioPeak = Math.max(0, Math.min(1, Number(peak)));
  });
  api.onHover((active) => document.body.classList.toggle("hovering", active));
  api.onLock((locked) => {
    document.body.classList.toggle("locked", locked);
    els.drag.classList.toggle("locked", locked);
  });
}

function bindInstantButton(button, action) {
  if (!button) return;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  });
}

function state(s) {
  els.src.textContent = "system";
  document.body.classList.toggle("locked", !!s.locked);
  applySnapEdges(s.snapEdges);
  document.body.classList.toggle("glow-off", s.settings?.glowEnabled === false);
  document.body.classList.toggle("xray", s.settings?.xrayEnabled === true);
  document.body.classList.toggle("xray-black", s.settings?.xrayTheme === "black");
  document.body.classList.toggle("vinyl", s.settings?.vinylEnabled === true);
  document.body.classList.toggle("debug-bounds", s.settings?.debugBounds === true);
  els.drag.classList.toggle("locked", !!s.locked);
  if (s.settings) {
    brightness = Number(s.settings.glowBrightness ?? 70);
    glowColor = normalizeHex(s.settings.glowColor || "#7c3aed");
  }
  applyBrightness(brightness);
  applyGlowColor(glowColor);
}

function applySnapEdges(edges = {}) {
  document.body.classList.toggle("snap-left", !!edges.left);
  document.body.classList.toggle("snap-top", !!edges.top);
  document.body.classList.toggle("snap-right", !!edges.right);
  document.body.classList.toggle("snap-bottom", !!edges.bottom);
}

function normalizeHex(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#7c3aed";
}

function hexToRgb(value) {
  const color = normalizeHex(value).slice(1);
  return [
    parseInt(color.slice(0, 2), 16),
    parseInt(color.slice(2, 4), 16),
    parseInt(color.slice(4, 6), 16)
  ];
}

function applyGlowColor(value) {
  glowColor = normalizeHex(value);
  const [r, g, b] = hexToRgb(glowColor);
  document.documentElement.style.setProperty("--glow-rgb", `${r}, ${g}, ${b}`);
  els.glowColor.value = glowColor;
}

function toggleColorPanel() {
  els.colorPanel.classList.toggle("hidden");
  const active = !els.colorPanel.classList.contains("hidden");
  els.colorPanel.classList.toggle("active", active);
  if (active) {
    els.glowColor.focus();
    els.glowColor.click();
  } else {
    api.closeColorWheel();
  }
}

function setupGlowColor() {
  els.glowColor.addEventListener("input", () => {
    applyGlowColor(els.glowColor.value);
    api.setGlowColor(glowColor);
  });
  els.glowColor.addEventListener("change", () => {
    applyGlowColor(els.glowColor.value);
    api.setGlowColor(glowColor);
  });
}

function setupSessionPicker() {
  els.sessionPanel.addEventListener("pointerdown", (event) => {
    const row = event.target.closest(".session-row");
    if (!row) return;
    event.preventDefault();
    hideSessionPicker();
    api.selectMediaSession(row.dataset.key || "");
  });
}

function showCommands(commands) {
  clearTimeout(commandTimer);
  if (!els.commandHelp.classList.contains("hidden")) {
    els.commandHelp.classList.remove("active");
    els.commandHelp.classList.add("hidden");
    return;
  }
  els.commandHelp.innerHTML = (commands || []).map((command) => {
    const [key, ...rest] = String(command).split(" ");
    return `<div class="command-row"><span class="command-key">${key}</span><span class="command-desc">${rest.join(" ")}</span></div>`;
  }).join("");
  els.commandHelp.classList.remove("hidden");
  els.commandHelp.classList.add("active");
  commandTimer = setTimeout(() => {
    els.commandHelp.classList.remove("active");
    els.commandHelp.classList.add("hidden");
  }, 5000);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function hideSessionPicker() {
  els.sessionPanel.classList.remove("active");
  els.sessionPanel.classList.add("hidden");
}

function showSessionPicker(data = {}) {
  if (!els.sessionPanel.classList.contains("hidden")) {
    hideSessionPicker();
    return;
  }

  const selected = String(data.selectedSessionKey || "");
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const rows = [
    `<button class="session-row ${selected ? "" : "selected"}" data-key="">
      <span class="session-title">Auto - playing session</span>
      <span class="session-meta">Prefer whatever is actively playing</span>
    </button>`
  ].concat(sessions.map((session) => {
    const key = escapeHtml(session.key || "");
    const title = escapeHtml(session.title || "Untitled media");
    const artist = escapeHtml(session.artist || session.appId || "");
    const status = session.isPlaying ? "Playing" : (session.playbackStatus || "Paused");
    const duration = session.durationText && session.durationText !== "0:00" ? ` - ${escapeHtml(session.durationText)}` : "";
    return `<button class="session-row ${selected && selected === session.key ? "selected" : ""}" data-key="${key}">
      <span class="session-title">${title}</span>
      <span class="session-meta">${escapeHtml(status)}${duration}${artist ? " - " + artist : ""}</span>
    </button>`;
  })).join("");

  els.sessionPanel.innerHTML = `<div class="session-heading">Media Session</div>${rows}`;
  els.sessionPanel.classList.remove("hidden");
  els.sessionPanel.classList.add("active");
}

function render(track) {
  els.src.textContent = "system";
  const isLongMedia = Number(track.durationSeconds || 0) >= 20 * 60 || parseDurationSeconds(track.durationText) >= 20 * 60;
  document.body.classList.toggle("long-media", isLongMedia);
  const nextTitle = track.title || "Nothing playing";
  const nextArtist = track.artist || "";
  const staticKey = [nextTitle, nextArtist, track.albumArt || "", isLongMedia ? "long" : "short"].join("\n");
  if (staticKey !== lastRenderStaticKey) {
    lastRenderStaticKey = staticKey;
    if (track.albumArt) {
      document.body.classList.remove("no-art");
      els.artWrap.classList.remove("hidden-art");
      els.art.classList.remove("hidden-art");
      if (els.art.src !== track.albumArt) els.art.src = track.albumArt;
    } else {
      document.body.classList.add("no-art");
      els.art.removeAttribute("src");
      els.art.classList.add("hidden-art");
      els.artWrap.classList.add("hidden-art");
    }

    document.body.classList.toggle("no-artist", !String(nextArtist).trim());
    if (els.title.textContent !== nextTitle) els.title.textContent = nextTitle;
    if (els.artist.textContent !== nextArtist) els.artist.textContent = nextArtist;
  }

  els.art.onerror = () => {
    document.body.classList.add("no-art");
    els.art.removeAttribute("src");
    els.art.classList.add("hidden-art");
    els.artWrap.classList.add("hidden-art");
    lastRenderStaticKey = "";
  };
  const progressPct = Math.max(0, Math.min(100, Number(track.progressPct || 0)));
  const nextProgressKey = `${nextTitle}\n${nextArtist}\n${track.durationText || ""}`;
  const progressReset = nextProgressKey !== progressTrackKey || progressPct < 0.8 && targetProgress > 85;
  progressTrackKey = nextProgressKey;
  updateProgressTarget(progressPct, progressReset);
  els.playhead.setAttribute("aria-valuenow", String(Math.round(progressPct)));
  els.elapsed.textContent = track.progressText || "0:00";
  els.duration.textContent = track.durationText || "0:00";
  currentPlaying = !!track.isPlaying;
  currentProgress = Math.max(0, Math.min(100, Number(track.progressPct || 0)));
  setPlayPauseIcon(currentPlaying);
  refreshVolume();
  els.statusDot.classList.toggle("playing", currentPlaying);
  els.statusDot.classList.toggle("paused", !currentPlaying);
  const nextLayoutKey = [
    nextTitle,
    nextArtist,
    track.albumArt ? "art" : "no-art",
    document.body.classList.contains("long-media") ? "long" : "short",
    window.innerWidth,
    window.innerHeight
  ].join("\n");
  if (nextLayoutKey !== layoutFitKey) {
    layoutFitKey = nextLayoutKey;
    requestAnimationFrame(fitCompactLayout);
  }
}

function setDisplayedProgress(value) {
  displayedProgress = Math.max(0, Math.min(100, Number(value) || 0));
  els.prog.style.width = `${displayedProgress}%`;
  els.playhead.style.setProperty("--seek-pct", `${displayedProgress}%`);
}

function updateProgressTarget(value, reset = false) {
  const now = performance.now();
  const next = Math.max(0, Math.min(100, Number(value) || 0));
  if (reset || Math.abs(next - targetProgress) > 20 || now - lastProgressUpdate > 2500) {
    progressRate = 0;
    if (!playheadDragging) setDisplayedProgress(next);
  } else if (currentPlaying && next < targetProgress && targetProgress - next < 2.5) {
    lastProgressUpdate = now;
    return;
  } else if (lastProgressUpdate > 0) {
    const dt = Math.max(1, now - lastProgressUpdate);
    const rawRate = (next - targetProgress) / dt;
    if (rawRate >= 0) progressRate = progressRate ? progressRate * 0.7 + rawRate * 0.3 : rawRate;
  }
  targetProgress = next;
  lastProgressUpdate = now;
}

function startProgressLoop() {
  if (progressFrame) cancelAnimationFrame(progressFrame);
  let lastTs = 0;
  const step = (ts = 0) => {
    progressFrame = requestAnimationFrame(step);
    if (playheadDragging) {
      lastTs = ts;
      return;
    }
    const dt = lastTs ? Math.min(80, ts - lastTs) : 16;
    lastTs = ts;
    const predicted = currentPlaying ? targetProgress + progressRate * Math.max(0, ts - lastProgressUpdate) : targetProgress;
    const clampedTarget = Math.max(0, Math.min(100, currentPlaying ? Math.max(displayedProgress, predicted) : predicted));
    const diff = clampedTarget - displayedProgress;
    if (Math.abs(diff) < 0.02) return;
    setDisplayedProgress(displayedProgress + diff * Math.min(1, dt / 180));
  };
  progressFrame = requestAnimationFrame(step);
}

function setupCompactFit() {
  window.addEventListener("resize", () => {
    layoutFitKey = "";
    requestAnimationFrame(fitCompactLayout);
  });
}

function setupResizeZones() {
  const zones = $("resizeZones");
  if (!zones || !api.getWindowBounds || !api.resizeWindow) return;
  let drag = null;
  let raf = null;
  let latest = null;

  const apply = () => {
    raf = null;
    if (!drag || !latest) return;
    api.resizeWindow(drag.edge, drag.bounds, latest.x - drag.x, latest.y - drag.y);
  };

  zones.addEventListener("pointerdown", async (event) => {
    const zone = event.target.closest(".resize-zone");
    if (!zone || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = await api.getWindowBounds();
    if (!bounds) return;
    drag = {
      edge: zone.dataset.edge || "",
      x: event.screenX,
      y: event.screenY,
      bounds
    };
    latest = { x: event.screenX, y: event.screenY };
    zone.setPointerCapture(event.pointerId);
  });

  zones.addEventListener("pointermove", (event) => {
    if (!drag) return;
    event.preventDefault();
    latest = { x: event.screenX, y: event.screenY };
    if (!raf) raf = requestAnimationFrame(apply);
  });

  const stop = (event) => {
    if (!drag) return;
    if (event?.target?.releasePointerCapture) {
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch {}
    }
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    drag = null;
    latest = null;
  };

  zones.addEventListener("pointerup", stop);
  zones.addEventListener("pointercancel", stop);
}

function fitCompactLayout() {
  const root = document.documentElement;
  root.style.removeProperty("--compact-art-size");
  root.style.removeProperty("--compact-title-size");
  root.style.removeProperty("--compact-artist-size");
  document.body.classList.remove("compact-no-art-fit");
  document.body.classList.remove("compact-hide-timeline");
  document.body.classList.remove("compact-hide-buttons");
  document.body.classList.remove("compact-hide-volume");

  const w = window.innerWidth;
  const h = window.innerHeight;
  document.body.classList.toggle("compact-hide-buttons", w < 190 || h < 126 || (w < 255 && h < 245));
  document.body.classList.toggle("compact-hide-volume", w < 250 && h > 260);

  if (w > 340 || h < 180 || document.body.classList.contains("no-art")) return;

  const availableWidth = Math.max(92, w - 28);
  const heightBudget = Math.max(100, h - 58);
  const titleLen = els.title.textContent.trim().length;
  const artistLen = els.artist.textContent.trim().length;

  let titleSize = Math.min(16, Math.max(10, availableWidth / Math.max(12, Math.min(28, titleLen / 4.2))));
  let artistSize = artistLen ? Math.min(12.5, Math.max(8.5, availableWidth / Math.max(10, artistLen * 0.9))) : 8.5;
  let artSize = Math.floor(Math.min(150, w * 0.72, h * 0.34, heightBudget * 0.5));

  for (let i = 0; i < 28; i++) {
    root.style.setProperty("--compact-art-size", `${artSize}px`);
    root.style.setProperty("--compact-title-size", `${titleSize.toFixed(1)}px`);
    root.style.setProperty("--compact-artist-size", `${artistSize.toFixed(1)}px`);

    const titleOverflow = els.title.scrollHeight > els.title.clientHeight + 1;
    const artistOverflow = els.artist.scrollHeight > els.artist.clientHeight + 1;
    const timeOverflow = els.elapsed.scrollWidth > els.elapsed.clientWidth + 1 || els.duration.scrollWidth > els.duration.clientWidth + 1;
    const cardOverflow = els.card.scrollHeight > els.card.clientHeight + 1;
    if (timeOverflow && !document.body.classList.contains("compact-hide-buttons")) {
      document.body.classList.add("compact-hide-buttons");
      continue;
    }
    if (cardOverflow && !document.body.classList.contains("compact-hide-buttons")) {
      document.body.classList.add("compact-hide-buttons");
      continue;
    }
    if (!titleOverflow && !artistOverflow && !timeOverflow && !cardOverflow) break;

    if (artSize > 0) artSize = Math.max(0, artSize - 5);
    else if (!document.body.classList.contains("compact-hide-volume")) document.body.classList.add("compact-hide-volume");
    else if (!document.body.classList.contains("compact-hide-buttons")) document.body.classList.add("compact-hide-buttons");
    else if (titleSize > 6.5) titleSize -= 0.35;
    else if (artistSize > 6) artistSize -= 0.25;
    else break;
  }

  document.body.classList.toggle("compact-no-art-fit", artSize < 20);
}

function parseDurationSeconds(value) {
  const parts = String(value || "").trim().split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function optimisticSkip(seconds) {
  const duration = parseDurationSeconds(els.duration.textContent);
  if (!duration) return;
  const currentSeconds = duration * (displayedProgress / 100);
  const nextPct = Math.max(0, Math.min(100, ((currentSeconds + seconds) / duration) * 100));
  setDisplayedProgress(nextPct);
  updateProgressTarget(nextPct, true);
  currentProgress = nextPct;
  els.playhead.setAttribute("aria-valuenow", String(Math.round(nextPct)));
}

function setPlayPauseIcon(isPlaying) {
  els.playMini.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
  els.playMini.title = isPlaying ? "Pause" : "Play";
  els.playMini.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function setVolumeVisual(value) {
  currentVolume = Math.max(0, Math.min(100, Number(value)));
  if (!Number.isFinite(currentVolume)) currentVolume = 100;
  const display = String(Math.round(currentVolume));
  const ringValue = currentVolume;
  els.volumeKnob.style.setProperty("--volume", `${ringValue}%`);
  els.volumeValue.textContent = display;
  els.volumeKnob.setAttribute("aria-valuenow", String(Math.max(0, Math.round(ringValue))));
}

async function refreshVolume() {
  if (!api.getVolume) return;
  const now = Date.now();
  if (volumeDragStart || volumeRefreshPending || now - lastVolumeRefresh < 12000 || now - lastVolumeInteraction < 12000) return;
  volumeRefreshPending = true;
  lastVolumeRefresh = now;
  try {
    const result = await api.getVolume();
    if (!volumeDragStart && result?.matched && Number.isFinite(Number(result.volume))) setVolumeVisual(result.volume);
  } finally {
    volumeRefreshPending = false;
  }
}

async function commitVolume(value) {
  const next = Math.max(0, Math.min(100, Math.round(value)));
  const requestId = ++volumeRequestId;
  lastVolumeInteraction = Date.now();
  setVolumeVisual(next);
  if (!api.setVolume) return;
  const result = await api.setVolume(next);
  if (!volumeDragStart && requestId === volumeRequestId && result?.matched && Number.isFinite(Number(result.volume))) {
    setVolumeVisual(result.volume);
  }
}

function scheduleVolumeCommit(value, delay = 160) {
  const next = Math.max(0, Math.min(100, Math.round(value)));
  lastVolumeInteraction = Date.now();
  setVolumeVisual(next);
  clearTimeout(volumeCommitTimer);
  if (next === 0 || next === 100) {
    commitVolume(next);
    return;
  }
  volumeCommitTimer = setTimeout(() => {
    commitVolume(next);
  }, delay);
}

function setupVolumeKnob() {
  setVolumeVisual(100);
  els.volumeKnob.addEventListener("wheel", (event) => {
    event.preventDefault();
    scheduleVolumeCommit(currentVolume + (event.deltaY < 0 ? 4 : -4), 70);
  }, { passive: false });

  els.volumeKnob.addEventListener("pointerdown", (event) => {
    lastVolumeInteraction = Date.now();
    clearTimeout(volumeCommitTimer);
    volumeDragStart = { y: event.clientY, volume: currentVolume };
    els.volumeKnob.setPointerCapture(event.pointerId);
  });

  els.volumeKnob.addEventListener("pointermove", (event) => {
    if (!volumeDragStart) return;
    lastVolumeInteraction = Date.now();
    const delta = volumeDragStart.y - event.clientY;
    const next = volumeDragStart.volume + delta;
    setVolumeVisual(next);
    scheduleVolumeCommit(next, 70);
  });

  els.volumeKnob.addEventListener("pointerup", async (event) => {
    if (!volumeDragStart) return;
    lastVolumeInteraction = Date.now();
    volumeDragStart = null;
    els.volumeKnob.releasePointerCapture(event.pointerId);
    await commitVolume(currentVolume);
  });

  els.volumeKnob.addEventListener("pointercancel", () => {
    if (!volumeDragStart) return;
    volumeDragStart = null;
    commitVolume(currentVolume);
  });
}

function percentFromPlayhead(event) {
  const rect = els.playhead.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
}

function setupPlayhead() {
  els.playhead.addEventListener("pointerdown", (event) => {
    playheadDragging = true;
    document.body.classList.add("seeking");
    els.playhead.setPointerCapture(event.pointerId);
    const pct = percentFromPlayhead(event);
    setDisplayedProgress(pct);
  });

  els.playhead.addEventListener("pointermove", (event) => {
    if (!playheadDragging) return;
    const pct = percentFromPlayhead(event);
    setDisplayedProgress(pct);
  });

  els.playhead.addEventListener("pointerup", async (event) => {
    if (!playheadDragging) return;
    const pct = percentFromPlayhead(event);
    playheadDragging = false;
    document.body.classList.remove("seeking");
    els.playhead.releasePointerCapture(event.pointerId);
    setDisplayedProgress(pct);
    updateProgressTarget(pct);
    if (api.seekPercent) api.seekPercent(pct);
  });

  els.playhead.addEventListener("pointercancel", () => {
    playheadDragging = false;
    document.body.classList.remove("seeking");
  });
}

function applyBrightness(value) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  document.documentElement.style.setProperty("--glow-opacity", (0.08 + pct / 100 * 0.95).toFixed(2));
  document.documentElement.style.setProperty("--glow-blur", `${(6 + pct / 100 * 10).toFixed(1)}px`);
}

function startGlowLoop() {
  if (glowFrame) cancelAnimationFrame(glowFrame);
  const values = [0.22, 0.45, 0.75, 0.4, 0.26];
  let phase = 0;
  let lastStep = 0;
  let lastPeak = 0;

  function step(ts = 0) {
    glowFrame = requestAnimationFrame(step);
    if (ts - lastStep < 50) return;
    lastStep = ts;

    if (document.body.classList.contains("glow-off")) return;

    phase += currentPlaying ? 0.12 : 0.018;
    if (!currentPlaying) audioPeak = 0;
    const attack = audioPeak > smoothPeak ? 0.48 : 0.12;
    smoothPeak += (audioPeak - smoothPeak) * attack;
    const transient = Math.max(0, audioPeak - lastPeak);
    lastPeak += (audioPeak - lastPeak) * 0.12;
    bassFloor += (audioPeak - bassFloor) * (audioPeak > bassFloor ? 0.01 : 0.08);
    const liftedPeak = Math.max(0, audioPeak - bassFloor * 0.42);
    const quietHit = Math.sqrt(Math.max(0, liftedPeak));
    const bassTarget = Math.max(0, Math.min(1, quietHit * 1.05 + smoothPeak * 0.45 + transient * 7.4));
    bassPeak += (bassTarget - bassPeak) * (bassTarget > bassPeak ? 0.52 : 0.09);
    const wobble = Math.sin(phase * 0.72) * 0.025;
    const pulse = currentPlaying ? Math.max(0, Math.min(1, bassPeak + wobble)) : 0.04;
    const shimmer = currentPlaying ? Math.max(0, Math.min(1, bassPeak * 0.85 + transient * 3.2)) : 0;
    const alpha = 0.10 + pulse * 0.58;
    const innerAlpha = 0.08 + shimmer * 0.38;
    document.documentElement.style.setProperty("--glow-alpha", alpha.toFixed(2));
    document.documentElement.style.setProperty("--glow-inner-alpha", innerAlpha.toFixed(2));
    document.documentElement.style.setProperty("--glow-component-alpha", Math.min(1, alpha * 0.72).toFixed(2));
    document.documentElement.style.setProperty("--glow-component-soft-alpha", Math.min(1, alpha * 0.34).toFixed(2));
    document.documentElement.style.setProperty("--glow-component-strong-alpha", Math.min(1, alpha * 0.84).toFixed(2));
    document.documentElement.style.setProperty("--glow-component-progress-alpha", Math.min(1, alpha * 0.62).toFixed(2));
    document.documentElement.style.setProperty("--glow-component-inner-alpha", Math.min(1, innerAlpha * 0.5).toFixed(2));
    document.documentElement.style.setProperty("--glow-spread", `${(6 + pulse * 9).toFixed(1)}px`);

    for (let i = 0; i < bands.length; i++) {
      const centerWeight = 1 - Math.abs(i - 2) * 0.13;
      const offset = Math.sin(phase * 0.9 + i * 1.2) * 0.04;
      const target = currentPlaying ? (0.12 + bassPeak * (1.02 * centerWeight) + transient * (1.9 - i * 0.12) + offset) : 0.12;
      values[i] += (target - values[i]) * (currentPlaying ? 0.34 : 0.1);
      const value = Math.max(0.1, Math.min(1.18, values[i]));
      bands[i].style.setProperty("--band-scale", value.toFixed(3));
      bands[i].style.opacity = (0.55 + value * 0.38).toFixed(2);
    }
  }

  glowFrame = requestAnimationFrame(step);
}

function flash(message) {
  clearTimeout(flashTimer);
  els.label.textContent = message || "";
  els.flash.classList.add("active");
  els.label.classList.add("active");
  flashTimer = setTimeout(() => {
    els.flash.classList.remove("active");
    els.label.classList.remove("active");
  }, 450);
}
