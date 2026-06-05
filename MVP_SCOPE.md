# MVP Scope

## What Ships

- Windows-only Electron desktop app.
- Transparent always-on-top overlay.
- Global keyboard command system.
- Media metadata and controls through Windows media sessions.
- Volume and peak data through Windows Core Audio sessions.
- Responsive overlay UI that updates controls optimistically before slower system APIs return.
- Session picker for exposed media sessions.
- Album art fallback lookup for common media types.

## What Does Not Ship Yet

- Packaged installer.
- macOS support.
- Real system-wide equalizer.
- Cloud sync or user accounts.
- Store publishing.
- Automated UI tests.

## Definition Of Done

- App launches with `npm start`.
- `npm run check` passes.
- README explains install, usage, commands, and project scope.
- No dead EQ UI/backend code remains.
- Code is organized enough for GitHub review and resume discussion.
