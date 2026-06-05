# Prompt For Claude: Resume Project Explanation

Use this prompt with Claude to turn the project into polished resume wording:

```text
I built a project called Universal Audio Overlay. It is a Windows desktop media overlay built with Electron, JavaScript, HTML/CSS, PowerShell, Windows Runtime media APIs, and Windows Core Audio APIs.

The app stays always-on-top over games and desktop apps. It detects the active Windows media session, shows title/artist/timeline/album art, provides play/pause, previous/next, +/-10 second seeking, interactive timeline seeking, source selection for multiple media sessions, a per-source volume knob, click-through lock mode for gaming, reactive audio glow based on live peak data, a vinyl-style album art mode, and compact responsive layouts for very small overlay windows.

It uses Electron for the UI, PowerShell helper scripts for Windows media/session and Core Audio integration, persistent helper processes to reduce command latency, optimistic UI updates so controls feel instant, album art fallback lookup for music/podcasts/YouTube/audiobooks, and a global keyboard command system.

Please write:
1. A concise resume project entry.
2. 3-5 strong bullet points with action verbs and technical specificity.
3. A short technical explanation I can say in an interview.
4. A GitHub README tagline.
5. A version for a software engineering internship resume.

Please keep it honest: this is an MVP Windows desktop app, not a packaged commercial product yet. Do not claim a real system-wide equalizer or macOS support.
```

## Short Interview Explanation

Universal Audio Overlay is a Windows desktop overlay I built to control music and media without leaving a game or focused app. The UI is Electron, but the system integration is done through Windows Runtime media APIs and Core Audio helper scripts. The interesting engineering work was making the overlay feel instant even though Windows media APIs can be slow, so I moved repeated work into persistent helper processes and made the UI update optimistically before system calls returned.

## Resume Bullets

- Built an always-on-top Windows media overlay using Electron, PowerShell, Windows Runtime media APIs, and Core Audio session control.
- Implemented global hotkeys, click-through gaming mode, media session selection, playback controls, seek controls, per-source volume, and reactive audio visualization.
- Improved perceived latency with optimistic UI updates and persistent helper processes that avoid repeated PowerShell process startup.
- Designed responsive compact layouts that preserve title, artist, timeline, and album art across small overlay sizes.
- Added album-art fallback lookup for music, podcasts, YouTube thumbnails, and audiobook metadata.
