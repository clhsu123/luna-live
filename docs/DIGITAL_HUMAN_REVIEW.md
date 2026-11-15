# Luna Live: development checkpoint — 2026-11-15

Status: **development implementation; NOT production-ready; NO staging deployment.**

## Verified production baseline

Inspected through the authenticated Render connection, not inferred from a ZIP:

- Workspace: My Workspace.
- Service: luna-live-private / srv-dbsa58bm8hqs73c6iu40.
- Repository: https://github.com/clhsu123/luna-live ; branch main.
- Live commit: dc0fcdc7e9e94860286c29fd31c8f932de31d13a.
- Live deployment: dep-dbsprn9lodes739vg4lg ; completed 2026-11-15 19:57 Taipei.
- Runtime Node; free instance; Virginia; one instance; no previews.
- Auto deploy: enabled, on commit. Do NOT push development changes to main.
- Build: npm install --include=dev && npm run build. Start: npm start.
- HTTP healthCheckPath is empty. Render currently uses default TCP health checking.
- Direct GET /api/health returned HTTP 200 and configured=true. This checks key presence, NOT validity, credit balance, or Realtime functionality.
- Recent application logs show successful startup on port 10000. Earlier builds failed, followed by successful builds; no claim of comprehensive log history review.
- Repository render.yaml differs: starter plan, /api/health, different build command. Do not apply it blindly to production.

## Current application assessment

React 19 / TypeScript / Vite, Express Node ESM backend. OpenAI WebRTC SDP exchange on /api/session. Three mode prompts exist. Visuals in App.tsx are amplitude-driven Canvas portrait distortion, not a digital human renderer.

Risks identified: Basic Auth without logout/expiry; initially no failed-login throttling; rate-limit map retention; raw upstream error body returned to browser; monolithic frontend and duplicated prompts; no lockfile; no provider lifecycle; connection cancellation races in legacy UI; no live regression test suite. The branch adds a lockfile, basic failed-login throttling, periodic map cleanup and upstream error sanitization. Full authentication migration remains outstanding. The throttle keys the socket address conservatively and may aggregate users behind Render's proxy; this is a single-user checkpoint, not a multi-tenant design.

## Architecture and implemented checkpoint

New page: /digital. Existing / and /api/session remain available unchanged except backend safety improvements. Code splitting keeps LiveKit off the legacy entry path.

1. Browser requests microphone permission before allocating a provider session.
2. Authenticated same-origin POST creates a bounded LiveAvatar LITE session; defaults to sandbox. Keys and session JWT remain backend-only.
3. Browser receives a scoped LiveKit client token and one-use, owner-bound bridge ticket (30-second expiry). Owner cookie is HttpOnly/SameSite Strict and Secure in production.
4. LiveKit delivers synchronized avatar audio/video. Browser does not play a separate OpenAI audio stream.
5. AudioWorklet resamples microphone PCM to 24kHz mono PCM16; same-origin WebSocket carries input to Node.
6. Node waits for avatar connected event, opens OpenAI Realtime WebSocket, then forwards output PCM to LiveAvatar.
7. VAD/manual interruption cancels generation and clears avatar rendering; conversation truncation uses an estimated elapsed playback position. This is NOT sample-accurate alignment.
8. Client close, TTL, pending-ticket timeout, error and SIGTERM trigger cleanup. One pending/active avatar session is allowed per server instance. A shared store would be necessary before horizontal scaling.

Files: server/avatar-provider.mjs (provider boundary and lifecycle), server/digital-human.mjs (routes and bridge), src/DigitalHuman.tsx, src/digital.css, public/pcm-worklet.js, tests/*.test.mjs.

The backend remains ESM JavaScript to fit the existing server. Strict TypeScript applies to frontend; migrating backend to strict TypeScript remains outstanding.

## Provider decision (official references retrieved 2026-11-15)

| Option | OpenAI preservation | Strength / limitation | Decision |
|---|---|---|---|
| LiveAvatar LITE | External PCM16 24kHz audio; our backend retains OpenAI reasoning and voice | Synchronized WebRTC output, interrupt and listening/idle commands. Custom identity needs account/avatar validation. No documented bow/hand gesture commands in the inspected event API. | Initial adapter implemented; real stream unverified |
| Tavus CVI Echo | Audio Echo bypasses all layers except renderer | External audio supported, but Echo disables perception; own turn management and Daily integration needed. | Credible alternative; not implemented |
| MuseTalk self-hosted | Can render externally generated speech | GPU model/service, transport, scaling and orchestration must be operated; not a replacement turnkey platform on the current Node free instance. | Defer |

LiveAvatar also has an OpenAI connector, but it requires registering the OpenAI key with LiveAvatar. This branch deliberately uses our own bridge, keeping the existing OpenAI key on Render. No third-party registration of the key has occurred.

Cost assumptions: LiveAvatar LITE documentation states 1 credit per session minute. Public pricing currently lists Essentials $99/month with 1,100 credits: approximately $0.09 per included minute **only if fully used**, plus OpenAI and hosting. At 300 minutes/month the fixed subscription averages $0.33/min before OpenAI. Final billing/taxes/overages and plan eligibility must be confirmed in the account; no purchase authorized or made. Sandbox uses no avatar credits, only Wayne, approximately 60 seconds; OpenAI usage is separate. Tavus Developer Starter lists $59/month with 100 conversational minutes and pay-as-you-go; compare Echo eligibility and overage pricing before purchase. Do not confuse consumer PAL pricing with developer API plans.

Sources:
- https://docs.liveavatar.com/docs/lite-mode/overview
- https://docs.liveavatar.com/docs/lite-mode/events
- https://docs.liveavatar.com/docs/lite-mode/lifecycle
- https://docs.liveavatar.com/api-reference/sessions/create-session-token
- https://docs.liveavatar.com/api-reference/sessions/start-session
- https://docs.liveavatar.com/api-reference/sessions/stop-session
- https://docs.liveavatar.com/docs/sandbox-mode
- https://docs.liveavatar.com/docs/lite-mode/connectors/openai-realtime
- https://www.liveavatar.com/
- https://docs.tavus.io/sections/conversational-video-interface/echo-mode
- https://www.tavus.io/pricing
- https://github.com/TMElyralab/MuseTalk
- https://developers.openai.com/api/docs/guides/realtime-conversations
- https://render.com/docs/deploys.md
- https://render.com/docs/health-checks.md

## Validation performed

- Dependency installation: passed; package-lock.json generated.
- Baseline and modified strict TypeScript/production builds: passed.
- node --check server/digital-human.mjs: passed.
- npm test: 9 tests passed. Real local HTTP startup/auth/origin/input validation/configuration failure/legacy static routes; mocked provider token-start-stop contract; paid session denial; cleanup after partial failure; insecure URL rejection; concurrent creation reservation; foreign-owner denial; duplicate stop; failed stop retention/retry; TTL; shutdown/allocation race.
- Browser automation: prepared tests/browser-check.mjs and installed Playwright; attempted Chromium launch. Environment denied socket() during Chromium startup (Operation not permitted). Browser UI screenshots, responsive rendering and microphone denial checks were NOT executed successfully. Do not count that script as passed.
- git diff --check: passed.
- Build warning: LiveKit digital page chunk exceeds 500kB. Lazy-loaded separately; further optimization pending.

Not verified: actual avatar session creation/termination; audio/video lip sync; genuine Mandarin/Korean/English conversation; audible barge-in; playback truncation accuracy; transcript alignment with heard speech; reconnect across multiple turns; browser microphone permissions; mobile UI; real quota errors; true end-to-end latency. The displayed latency is server speech-stopped to provider speak-start event, not mouth-to-ear latency. Transcripts follow generation and can lead playback. No clinical/precise pronunciation scoring is claimed.

No recording feature was added. Transcripts live only in frontend memory. Provider-side retention terms still need account-level review.

## Staging configuration and blockers

A separate service should use the feature branch, a new name (luna-live-digital-staging), Node 22, npm ci --include=dev && npm run build, npm start, /api/health, one instance, and auto-deploy off. Existing production stays unchanged. Free compute suitability and account quotas should be confirmed before creation; no paid compute authorized.

Environment values (configure securely in the staging service, never commit values):

| Variable | Purpose |
|---|---|
| APP_PASSWORD | Staging-only login password; Basic username luna |
| OPENAI_API_KEY | Reuse authorized existing key, securely configure without showing it in chat |
| OPENAI_REALTIME_MODEL | Existing model configuration, access still requires live verification |
| LIVEAVATAR_API_KEY | New provider credential required |
| LIVEAVATAR_SANDBOX | true by default |
| LIVEAVATAR_AVATAR_ID | Required only for non-sandbox identity |
| ALLOW_PAID_AVATAR | false unless explicitly authorized |
| APP_ORIGIN | Exact staging https origin; RENDER_EXTERNAL_URL used automatically when available |

GitHub create_branch returned HTTP 403 Resource not accessible by integration. Repository metadata advertised user push/admin permissions, but the connector cannot create Git refs. This is a write-scope blocker, not a missing repository URL. Local branch exists; remote branch and PR were not created. No staging deployment can consume local unpublished changes.

Next access needed: authorize GitHub integration Contents read/write for clhsu123/luna-live (or use an authorized GitHub development connection); obtain LiveAvatar API access. No key should be pasted in chat. After branch push and safe staging creation, configure credentials through Render's Environment UI. No production environment variables were read or changed.

## Rollback / promotion gate

Before any production promotion, require the full requested live user journey and explicit user approval. Record live deploy dep-dbsprn9lodes739vg4lg and commit dc0fcdc7e9e94860286c29fd31c8f932de31d13a as baseline. No schema/data changes were introduced. Removing the separate staging service/branch does not require touching production. If later promoted, review current Render rollback artifact retention and auto-deploy behavior before invoking rollback; rollback does not automatically reverse external provider sessions or account settings. Never assume the old artifact remains retained indefinitely.
