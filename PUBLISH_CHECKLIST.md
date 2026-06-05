# Publish Checklist

## Before GitHub

- Pick a final repository name.
- Add screenshots or a short screen recording to the README.
- Replace the license copyright holder if needed.
- Test `Install Dependencies.bat`.
- Test `Start Universal Audio Overlay.bat`.
- Test `Create Desktop Shortcut.bat`.
- Run `npm install`.
- Run `npm run check`.
- Launch with `npm start` and test:
  - Play/pause
  - Previous/next
  - +/-10 second seek
  - Timeline dragging
  - Volume knob
  - `\A` session picker
  - `\1` click-through lock
  - `\6` pixel movement

## First GitHub Release

- Create a GitHub repo.
- Push this folder.
- Add screenshots to the README.
- Create a `v1.0.0` tag.
- Optional: add Electron Builder later for a Windows installer.

## Resume Link

Use the GitHub repo as the project link. In interviews, describe the project as a desktop systems/UI app that integrates Electron with Windows media/session APIs and native PowerShell helpers.
