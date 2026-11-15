# Luna Live — Realtime AI Companion MVP

A **working React + TypeScript + Express prototype** with a female AI-generated portrait, realtime voice, text transcripts and three modes: companion, Korean practice and semiconductor sales roleplay.

> Important: The portrait is **a static AI-generated image with subtle idle/speaking-state animations**. It does not do audio-driven lip movement or viseme alignment. Use a licensed real-time digital human / avatar service to implement proper lip-sync. It is not a webcam feed or a human actor.

## Quick start

1. Install Node.js 22+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `OPENAI_API_KEY=...` (a paid API account with Realtime model access is needed).
4. Run `npm run dev`.
5. Open **http://127.0.0.1:5173** in Chrome or Edge and grant microphone permission.
6. Press **開始對話**, then speak naturally or type into the chat input.

The Vite frontend runs on 5173 and proxies `/api` to the Express backend on 8787. The backend sends the browser's SDP offer and mode-specific session configuration to `POST https://api.openai.com/v1/realtime/calls`, then returns OpenAI's SDP answer. **No permanent API key is shipped to the browser.**

### Notes

- This is an actual online voice app, not a local AI model; it requires Internet access and incurs API usage charges.
- Default: `gpt-realtime-2.1-mini`. Change `OPENAI_REALTIME_MODEL` to another supported Realtime model if desired. Actual access depends on account/model availability.
- WebRTC supplies voice. Data channel sends text messages and receives transcriptions, turn and response lifecycle events.
- Microphone streaming can be muted. Turn-taking relies on server-side VAD and users can interrupt AI speech.
- Changing modes in a connected call sends `session.update`. For fully isolated scenarios, end the call and begin a new one after changing modes. Older conversation context remains within an active call.
- No application-side database or long-term memory exists in v0.1. Chat content stays in React state until refresh. This does not override provider-side data retention policies.
- No authentication, full abuse prevention, strong billing limits or production observability. **Do not expose this server to the public Internet without authentication, quotas, abuse protection and deployment security review.**
- Generated avatar image is for this prototype; to deploy with a live avatar vendor, check their licensing and API requirements.
- OpenAI may update event formats and models; consult current official docs when upgrading.

## Layout

```text
luna-live-mvp/
├── .env.example
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── server/index.mjs     # secured OpenAI WebRTC session endpoint
├── src/App.tsx          # call controls, modes, transcript, UI
├── src/style.css
├── src/main.tsx
└── public/avatar.png    # generated portrait
```

## Production roadmap

1. Authentication, user ID, strict server-side session quotas, cost limits, server logging with consent, CSP and HTTPS.
2. Dedicated digital-human provider (LiveAvatar or similar) with audio-driven lips, facial blendshapes and synchronized video/audio playback. This component is **not included in this MVP**.
3. User-controlled memory in D1 with opt-in save/delete/export, encrypted storage and data governance.
4. Improved transcript ordering, reconnection logic and usage analytics; test network, browser autoplay and mobile permissions.
5. Optional Cloudflare Workers/D1/R2 deployment once Node backend security is hardened.

## Sources

- OpenAI WebRTC guide: https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime
- OpenAI realtime conversations: https://developers.openai.com/api/docs/guides/realtime-conversations
- OpenAI pricing: https://platform.openai.com/pricing/

## Cloud deployment: Render (private MVP)

This edition includes `render.yaml` and `npm start` for Render.

1. Upload all project contents to a **private GitHub repository** (do not upload `.env` or `node_modules`).
2. In Render: New > Web Service > connect GitHub repo; runtime Node; build command `npm install && npm run build`; start command `npm start`.
3. Environment: `NODE_VERSION=22`, `OPENAI_API_KEY=<your key>`, `OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini`, `APP_PASSWORD=<strong unique password>`, `NODE_ENV=production`. Do **not** commit secrets.
4. After deployment browse to the given HTTPS `onrender.com` URL. In browser's login dialog, username is `luna`, password is your `APP_PASSWORD`.
5. Verify `/api/health` shows `configured:true`, grant microphone access and test.

**Caveats:** HTTP Basic auth is adequate only as a private MVP password gate over HTTPS, not a production multiuser identity system. There are no server-side per-account spending limits and no production-grade abuse controls. Configure OpenAI billing limits and Render account protections. This application is still a static portrait, not true lip-synced streaming video.

## Character wardrobe and shared memory

The main `/` voice interface includes four faces and eight approved outfit images in
`public/characters/`. Select **角色與造型** to switch instantly without reopening an
OpenAI session. These are static portraits, not registered LiveAvatar video avatars.
The `/digital` interface offers the same picker and a link back to portrait voice mode;
its actual provider stream remains explicitly labeled (Wayne in sandbox).

Both interfaces use one browser-local transcript store (`luna.shared-memory.v1`),
independent of appearance and conversation mode. Up to 100 entries / 60,000 characters
are retained; each entry is capped at 4,000 characters. On a new connection the newest
40 entries / 16,000 characters are replayed as user/assistant conversation items, without
triggering a response. Memory is not synchronized between devices or browser profiles.
The **清除共享記憶** action ends the current connection and clears the local store.
Clearing browser data also removes memory. No transcript is written to this public repo.

Validation: `npm run build && npm test`. Optional browser checks require Chromium:
start the built server on port 18788 with `APP_PASSWORD=local-ui-test`, then run
`node tests/characters-browser.mjs` and `node tests/browser-check.mjs`.

## Manual speech turns

Both voice interfaces disable automatic turn detection. Connect, press **開始說話**,
speak with pauses as needed, then press **我說完了** to commit audio and request a
reply. Starting a new turn interrupts the previous response. Appearance changes do
not end the turn. Existing provider session duration limits still apply.
