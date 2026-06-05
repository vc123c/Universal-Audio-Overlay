const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getState: () => ipcRenderer.invoke("get-state"),
  listMediaSessions: () => ipcRenderer.invoke("list-media-sessions"),
  selectMediaSession: (key) => ipcRenderer.invoke("select-media-session", key),
  getWindowBounds: () => ipcRenderer.invoke("get-window-bounds"),
  resizeWindow: (edge, startBounds, dx, dy) => ipcRenderer.invoke("resize-window", edge, startBounds, dx, dy),
  playPause: () => ipcRenderer.invoke("play-pause"),
  previousTrack: () => ipcRenderer.invoke("previous-track"),
  nextTrack: () => ipcRenderer.invoke("next-track"),
  skip: (seconds) => ipcRenderer.invoke("skip", seconds),
  seekPercent: (percent) => ipcRenderer.invoke("seek-percent", percent),
  getVolume: () => ipcRenderer.invoke("get-volume"),
  setVolume: (value) => ipcRenderer.invoke("set-volume", value),
  setGlowColor: (value) => ipcRenderer.invoke("set-glow-color", value),
  closeColorWheel: () => ipcRenderer.invoke("close-color-wheel"),
  onTrack: (cb) => ipcRenderer.on("track", (_, track) => cb(track)),
  onState: (cb) => ipcRenderer.on("state", (_, state) => cb(state)),
  onFlash: (cb) => ipcRenderer.on("flash", (_, message) => cb(message)),
  onCommands: (cb) => ipcRenderer.on("commands", (_, commands) => cb(commands)),
  onSessionPicker: (cb) => ipcRenderer.on("session-picker", (_, data) => cb(data)),
  onColorWheel: (cb) => ipcRenderer.on("color-wheel", () => cb()),
  onAudioPeak: (cb) => ipcRenderer.on("audio-peak", (_, peak) => cb(peak)),
  onHover: (cb) => ipcRenderer.on("hover-state", (_, active) => cb(active)),
  onLock: (cb) => ipcRenderer.on("lock", (_, locked) => cb(locked))
});
