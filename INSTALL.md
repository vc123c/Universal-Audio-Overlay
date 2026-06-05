# Install

Universal Audio Overlay is currently shipped as a source-based Windows MVP. A packaged `.exe` installer is planned, but this version runs through Node.js and Electron.

## Requirements

- Windows 10 or Windows 11
- Node.js 18 or newer
- npm, included with Node.js

Download Node.js from <https://nodejs.org/>.

## Quick Install

1. Download or clone this repository.
2. Open the project folder.
3. Double-click `Install Dependencies.bat`.
4. Double-click `Start Universal Audio Overlay.bat`.

Optional: double-click `Create Desktop Shortcut.bat` to add a desktop shortcut named `💿 Universal Audio Overlay`.

## Command Line Install

From the project folder:

```powershell
npm install
npm start
```

## Verify

Run:

```powershell
npm run check
```

## Notes

- The overlay uses Windows media sessions, so the active app must expose media metadata to Windows.
- Some browsers expose multiple media sessions. Use `\A` to choose the right source.
- Use `\1` to toggle click-through mode when gaming.
- This MVP does not include a signed installer yet. For a polished release, package the app with Electron Builder or Electron Forge.
