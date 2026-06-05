<p align="center">
  <img src="assets/logo.svg" alt="Universal Audio Overlay CD logo" width="128">
</p>

# Universal Audio Overlay

Universal Audio Overlay is a Windows desktop media overlay built with Electron. It stays on top of games and desktop apps, shows the active system media session, and gives fast playback, seek, volume, source-selection, and visual controls without switching windows.

## MVP Features

- Always-on-top transparent overlay for Windows.
- System media detection through Windows Global System Media Transport Controls.
- Playback controls: play/pause, previous/next, and +/-10 second seeking.
- Interactive timeline seeking.
- Per-source volume knob using Windows audio sessions.
- Media session picker for switching between exposed sources.
- Album art display with fallback lookup for music, podcasts, YouTube thumbnails, and audiobooks.
- Optional vinyl-style spinning album art.
- Reactive glow driven by live audio peak data.
- Click-through lock mode for gaming.
- Pixel movement mode and mouse snapping for positioning.
- Compact responsive layout for tiny overlay windows.

## Commands

Press `\` followed by:

- `1` or `L`: lock / click-through
- `2`: switch x-ray theme
- `3` or `Y`: x-ray transparency mode
- `4` or `G`: glow on/off
- `5` or `N`: vinyl album art mode
- `6` or `V`: pixel move mode
- `7` or `H`: safe hover mode
- `8` or `I`: show command list
- `A`: media session picker
- `D`: debug window edge
- `W`: glow color picker
- `0` or `Q`: quit

When pixel move mode is on, hold `\` and use arrow keys to nudge the window one pixel at a time.

## Install

Requires Windows and Node.js 18 or newer.

Quick path:

1. Download or clone this repository.
2. Double-click `Install Dependencies.bat`.
3. Double-click `Start Universal Audio Overlay.bat`.

Command line:

```powershell
npm install
npm start
```

See [INSTALL.md](INSTALL.md) for details.

## Desktop Shortcut

After installing dependencies, double-click `Create Desktop Shortcut.bat` to create a desktop launcher named `💿 Universal Audio Overlay`.

## Development

Run syntax checks:

```powershell
npm run check
```

## MVP Scope

This MVP focuses on a fast, reliable overlay experience for Windows media sessions. It intentionally does not include a real system-wide equalizer, because that requires a native audio processing layer, APO, driver, or virtual audio device.

## Resume Summary

Built a Windows desktop media overlay using Electron, PowerShell, Windows Runtime media APIs, and Core Audio session control. Implemented always-on-top transparent UI, global hotkeys, media session selection, low-latency optimistic playback controls, album-art enrichment, reactive audio visualization, and game-friendly click-through behavior.
