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

## Selectable speech turns

The current Anam, portrait and companion interfaces offer **說話方式** before
connecting. The preference is kept in this browser (`luna.turn-mode.v1`). Existing
users default to **按鈕控制**: press 開始說話, pause as needed, then 我說完了.
**自然對話** streams microphone audio after the explicit 開始對話 action; provider
VAD detects speech and pauses, commits the turn and requests one reply. Speaking
again interrupts queued playback and pending xAI speech synthesis. There is no
per-utterance button in this mode. 靜音 suspends microphone sending and discards
uncommitted audio; 結束對話 stops the microphone and session. Switching turn mode
requires ending the current session. Headphones reduce echo-triggered interruptions.

OpenAI uses nested `audio.input.turn_detection` server VAD with 800 ms silence,
300 ms prefix padding and automatic response/interruption. xAI's documented
`turn_detection: {type: 'server_vad'}` uses provider timing; OpenAI-specific tuning
fields are not sent to xAI. The bridge does not manually commit or create a response
for VAD events, and does not double-cancel the upstream response on speech start.
Manual text messages still explicitly request a response. During an active VAD
utterance or its pending automatic reply, typed sends are rejected nonfatally; the
draft remains in the input and history is updated only after server acceptance. The 45-second idle disconnect is removed; Anam sessions still end at ten minutes.
End the conversation explicitly when finished. Connected silent sessions can consume provider minutes.

Provider contracts checked against:
- https://developers.openai.com/api/docs/guides/realtime-vad
- https://developers.openai.com/api/reference/resources/realtime
- https://docs.x.ai/voice-realtime.ws.json
- https://docs.x.ai/developers/rest-api-reference/inference/voice

Mocked bridge tests cover automatic input, transcript retention, interruption during
both pending and playing TTS, mute/resume, stale responses and close cleanup for
OpenAI split speech and legacy xAI. They do not replace real microphone/VAD timing,
echo, provider access and physical mobile-device acceptance.


## Anam 人像串接（/anam）

Anam receives 24 kHz mono PCM16 audio and returns synchronized video. The AI and speech providers are selected by the environment configuration below. The current / and /digital entry points also open Anam. Legacy LiveAvatar backend code is retained but is not a newly enabled product mode.

在 Render 的既有服務 Environment 新增（不要把 key 放進 GitHub 或前端）：

- `ANAM_API_KEY`：Anam Lab → API Keys。
- `ANAM_AVATAR_ID`：在 Anam 上傳 Luna 黑白 OL 圖片後取得的 avatar ID；只對應 `luna-office`，不會假裝其他照片已動畫化。
- `ANAM_AVATAR_MODEL`：選填，預設 `cara-4`，需與帳號內 avatar 相容。
- `ANAM_AVATAR_MAP`：選填 JSON，如 `{"luna-office":"avatar-id-1","19-evening":"avatar-id-2"}`；有效角色鍵與 public/characters 檔名一致（不含副檔名）。對應優先於 ANAM_AVATAR_ID。

保留原有 `OPENAI_API_KEY`、`OPENAI_REALTIME_MODEL`、`APP_PASSWORD`、`APP_ORIGIN`。儲存後部署，打開 `/anam`。沒有設定角色時會停用開始按鈕。更換動態角色先結束連線；所有角色沿用同瀏覽器共享記憶。

每次 Anam 最多 600 秒，不再因閒置 45 秒自動結束；不自動重連。方案用量以 Anam 帳戶為準，本地限時不等於費用上限。請在 Anam 設定支出上限。Session token 使用 `sessionOptions.dataRetention` 關閉錄影與逐字稿保存，不等同 Enterprise Zero Data Retention。

驗收：先確認真正影片出現，再說一句中文，按「我說完了」，確認嘴型和聲音同步；測試短句、連續兩輪、打斷、文字訊息、切換已設定角色、重連帶入記憶和結束後不再播放。程式測試無法取代具有效 key 與 avatar 的真實 WebRTC 驗收。

## ChatGPT conversation with xAI speech on Anam

Set `OPENAI_API_KEY`, `XAI_API_KEY`, `CHAT_PROVIDER=openai`, and
`CHAT_OUTPUT=xai-tts` in the hosting service environment. Keep both keys on the
server; never place them in frontend variables or Git. `OPENAI_REALTIME_MODEL`
selects the OpenAI conversation model. `XAI_TTS_VOICE` selects the xAI voice
(default `eve`). The older `AI_PROVIDER` switch remains available for the
original single-provider realtime path.

In this split mode, OpenAI produces the response text and xAI produces
timestamped 24 kHz PCM speech. The selected Anam avatar receives that audio and
performs its own real-time lip sync. xAI's current voice API does not control
Anam facial expressions or gestures. Idle animation remains in the avatar
provider. The `/api/anam/status` response reports provider names and readiness,
never credentials. If xAI TTS is not configured, sessions are rejected with a
configuration error rather than silently returning a silent avatar.

Conversation history is Luna's existing browser-local shared memory: it is
replayed as context when OpenAI starts a session and can be cleared in the UI.
It is not the private memory attached to a user's ChatGPT account and does not
sync across browsers or devices.

Deployment still needs a live check with valid OpenAI and xAI credentials, an
Anam avatar mapping, account credit, and the target browser. Automated checks
cannot verify provider-side lip sync or speech quality.

## Persistent trilingual Luna persona

`shared/companion-prompt.mjs` is the version-controlled source for all three
language styles and all conversation modes. Korean is the no-cue default; Luna
mirrors Chinese (Traditional/Taiwan) or English input. Teaching comes first,
flirting remains playful and non-explicit, and customer-facing examples stay
professional. Hanja annotations are requested for written teaching material;
realtime speech transcripts may remain verbatim without separate annotations.
These persona rules persist across sessions, independently of browser-local memory.


## Independent 20-style animation mode

`/portraits` adds 20 selectable characters derived from the approved After Hours
(01–10) and Office (11–20) sheets. Each character has its own eight-frame sprite
with blink, head turns, nod and wave poses. The original sheets remain unchanged
for picker thumbnails and load-error fallback. These are discrete frame animations,
not continuous video or phoneme-synchronized lips. Selection persists locally
and can change during a call. Animation can be paused, respects reduced-motion
preferences and stops when the page is hidden. Only the selected sprite is loaded. `/`, `/anam`, and `/digital` keep the Anam interface.

Portrait calls use `/api/portrait`, the same authenticated manual-turn bridge and
provider configuration, with browser PCM playback. They allocate no Anam or
LiveAvatar session. OpenAI/xAI usage still incurs provider charges. There is no application lifetime or idle cutoff for portrait calls; end them explicitly. In split mode configure
`CHAT_PROVIDER=openai` and `CHAT_OUTPUT=xai-tts`; do not change or publish keys.

Regression validation: `npm ci --ignore-scripts && npm run build && npm test`.
The build must precede HTTP tests because those verify production assets.
`tests/split-bridge.test.mjs` covers both Anam and portrait split paths including
user transcripts, current response IDs, repeated/cancelled/stale completions,
text turns, PCM delivery and pending TTS cancellation. TTS request tests verify
`output_format: { codec: 'pcm', sample_rate: 24000 }` as documented at
https://docs.x.ai/developers/model-capabilities/audio/text-to-speech .

Optional browser check: start the built server on port 18788 with
`APP_PASSWORD=local-ui-test`, then run `node tests/wardrobe-browser.mjs`.
It verifies all 20 unique selections, persistence, mobile overflow, Anam
navigation and business roles. Actual microphone input, xAI speech, Anam video
and lip sync still require a staging call with valid server-side credentials.
No ChatGPT private-memory import or writeback is implemented by this change.

## PR #4 pre-production review

See [PR-4-VALIDATION.md](PR-4-VALIDATION.md) for verified checks, provider contracts,
remaining release blockers, required environment variables and rollback steps.
Twenty independent sprite animations are implemented. Live provider acceptance
and visual motion-quality acceptance remain release gates. See public/wardrobe/motion/README.md
for generation provenance and limitations.

## Single-character local video companion (/companion)

The B character uses three curated, silent video loops and precomputed mouth
landmarks. The browser reuses motion locally, avoids recent clip repeats, and
blends transitions. Speech still uses the existing OpenAI/xAI portrait bridge;
no new lip-sync provider, API key, or video-generation request is introduced.
Mouth opening follows scheduled audible PCM amplitude, not transcript length.
This is an approximate talking effect, not phoneme or word-accurate lip sync.
Interrupt and session end clear the mouth envelope. Hidden pages stop motion;
reduced-motion and explicit pause controls are honored. Anam and /portraits remain.

The three 24fps loops are derived from user-supplied B videos. Per-frame mouth
positions were computed offline using MediaPipe 0.10.21's CPU face landmarker;
the model and Python dependencies are not shipped to browsers. WebGL is required
for the talking effect. The source clips have different poses/clothing states;
short blended transitions cannot guarantee cinematic continuity. Real mobile
playback and perceived naturalness require visual acceptance.

## Private user background

Optionally set `LUNA_USER_CONTEXT` in Render's server environment to a reviewed
plain-text personal summary (maximum 8,000 characters). Never commit its value.
The Anam/portrait/companion bridge sends it once per new conversation as user-role
background before recent browser history, without generating a reply. Current
messages/corrections take precedence. The status API and logs do not expose it.
This single-user deployment shares that profile with anyone who can log in.
The configured conversation provider receives it; synthesized replies may also
contain relevant details. It is not a complete ChatGPT memory export or ongoing
synchronization. Clear the environment value and redeploy to stop injecting it;
this does not erase browser history or provider-retained data. Existing calls
must be ended and restarted after an update.

## Current appearance navigation

Only Anam and Luna B companion are selectable. The 20-style page and four-face/eight-outfit picker are retired from the active UI; old `/portraits` bookmarks redirect to `/anam`. Anam selects the configured `luna-office` mapping (or the first configured mapping), ignoring old wardrobe preferences. Archived assets remain for rollback; companion audio and controls are retained.
