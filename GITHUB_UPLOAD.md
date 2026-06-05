# GitHub Upload Guide

## Files To Upload

Upload the entire `universal-audio-overlay-mvp` folder to GitHub.

Important files:

- `README.md`: main project page
- `INSTALL.md`: install instructions
- `MVP_SCOPE.md`: what the MVP does and does not include
- `ROADMAP.md`: future work
- `RESUME.md`: resume bullets
- `PUBLISH_CHECKLIST.md`: release checklist
- `LICENSE`: MIT license
- `assets/logo.svg`: square CD project logo
- `assets/github-social-preview.svg`: GitHub/social preview artwork
- `main.js`, `renderer.js`, `preload.js`, `overlay.html`, `styles.css`: Electron app
- `media-session.ps1`, `media-control.ps1`, `audio-volume.ps1`: Windows helper scripts
- `Install Dependencies.bat`: double-click dependency install
- `Start Universal Audio Overlay.bat`: double-click launcher
- `Create Desktop Shortcut.bat`: creates a desktop shortcut named `💿 Universal Audio Overlay`

Do not upload:

- `node_modules/`
- `dist/`
- `out/`
- log files

The `.gitignore` already excludes those.

## Option A: Upload With GitHub Website

1. Go to <https://github.com/new>.
2. Create a new repository named `universal-audio-overlay`.
3. Keep it public if you want to use it on a resume.
4. Do not add a README on GitHub, because this folder already has one.
5. Open the new empty repo.
6. Click `uploading an existing file`.
7. Drag all files from the `universal-audio-overlay-mvp` folder into GitHub.
8. Commit the upload.

## Option B: Upload With Git

From inside this folder:

```powershell
git init
git add .
git commit -m "Initial MVP release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/universal-audio-overlay.git
git push -u origin main
```

## Set The GitHub Logo / Preview

GitHub has two useful visual spots:

1. README logo: already included at the top of `README.md`.
2. Social preview image:
   - Go to repo `Settings`
   - Go to `General`
   - Scroll to `Social preview`
   - Upload `assets/github-social-preview.svg`

If GitHub rejects SVG for social preview, open `assets/github-social-preview.svg` in a browser, screenshot it, save it as PNG, and upload the PNG instead.

## After Upload

1. Add screenshots or a short GIF to the README.
2. Run through `PUBLISH_CHECKLIST.md`.
3. Create a release tag named `v1.0.0`.
4. Add the GitHub repo link to your resume.
