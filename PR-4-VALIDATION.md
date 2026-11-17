# PR #4 pre-production validation — 2026-11-17

Status: **NOT READY TO MERGE**. No production deployment or main update authorized by this review.

Reviewed head: `a65dc8f355c4fe85990ddbdc8549d6572f0ca9b9` (four commits).
Base and currently live Render commit: `6b34e9138a9b947ac004192921d2ab37601b6622`.
PR: https://github.com/clhsu123/luna-live/pull/4

## Product scope

Retain Anam as the current dynamic avatar. Do not enable a new LiveAvatar route.
The owner clarified that all 20 alternative anime-style characters must move.
Their current implementation uses static SVG crops of two approved sheets; animation
behavior/assets remain outstanding. Do not claim blinking, gestures or lip sync.
No private ChatGPT memory integration is implemented. Existing browser-local history
and its bounded replay remain the context source.

## Fixes in this review

- Browser PCM playback now waits for both the sequence end marker and the final
  scheduled sample. Network gaps no longer falsely end the speaking state.
- Interruption disconnects/stops queued sources and invalidates old callbacks;
  shutdown releases the player before replacing its AudioContext.
- A new response aborts older pending synthesis and streamed PCM. Duplicate/current
  completion gating remains in place; shutdown and stale failures are covered.
- Relay interruption clears the client queue even after the estimated completion.
- Anam's completion estimate subtracts time already spent streaming; old completion
  events cannot clear a newer utterance. This is still an estimate, not a measured
  Anam playback clock.
- A pending TTS request is not treated as user idle time. Its timeout still applies.
- xAI responses reject malformed/noncanonical base64, odd PCM lengths and a declared
  non-PCM content type. Duration derives from sample count, not provider timestamps.
- Repeated user-transcription events replace the same item instead of duplicating it.

## Evidence and limitations

- `npm ci --ignore-scripts`: passed against the lockfile.
- `npm run build`: passed; existing ~736 kB avatar chunk size warning remains.
- `npm test`: 40 passed, 0 failed. Includes PCM ordering/end/drain/stale callbacks,
  interrupted and repeated split responses, close during TTS, absent speech credentials,
  malformed codec/base64, Anam relay timing, auth, ownership and memory replay.
- Additional targeted split tests cover cancellation during paced PCM transmission.
- `npm audit --audit-level=low`: 0 vulnerabilities (point-in-time dependency scan).
- `git diff --check`: passed.
- Existing head GitHub Actions run 44015014220: success. This is not evidence for
  changes that have not yet been pushed and checked.
- Local browser test attempted: Chromium cannot start because this execution
  environment denies `socket()` (`Operation not permitted`). No desktop/mobile
  screenshot, actual browser audio or all-20-crop visual acceptance is claimed.
- No local provider API keys or .env files are available. No paid/live provider
  requests were made. Model entitlement, quota, speech quality, actual transcription,
  Anam video/lip sync, mobile autoplay and device interruptions are unverified.
- The portrait bridge test uses the actual local portrait allocation path; no Anam
  token/session is allocated. Speech providers are mocked.
- REST synthesis currently speaks only the first 4,000 text characters. Full
  responses remain in text context; interrupted split text also remains in context.
  Do not assume context represents only the words that were audibly played.

## Provider contract review

Official sources checked on the review date:

- OpenAI model: https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
- WebSocket auth/URL: https://developers.openai.com/api/docs/guides/voice-websockets?voice-api=realtime
- Session/events: https://developers.openai.com/api/docs/guides/realtime-conversations
- xAI TTS: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
- Anam audio passthrough: https://anam.ai/docs/llms-full.txt (Audio Passthrough API)

OpenAI documents the requested model, Bearer-authenticated Realtime WebSocket,
text output modality, 24 kHz PCM and response output-text events. Manual turns use
null turn detection, input buffer commit and response.create; transcription is
separate from response generation and can arrive asynchronously.

xAI documents POST /v1/tts, eve, language auto, nested output_format and timestamped
JSON containing base64 audio. PCM is signed 16-bit little-endian; the requested
sample rate is 24 kHz. Timestamp metadata is not used for mouth animation or browser
scheduling. Provider 429/error responses terminate the session with a safe error;
there is no automatic retry that could duplicate speech or charges.

Anam accepts mono pcm_s16le and natively supports 24 kHz. Its agent audio stream is
created after video streaming starts; endSequence delimits turns and
interruptPersona interrupts playback. The installed SDK exposes these methods.
Real synchronized video/audio acceptance is still required.

OpenAI conversation/input transcription, xAI synthesis and Anam sessions are separate
billable services. Limits/credits are account-specific and were not inspected.
Cancellation and the 180-second session cap are not hard spending limits.

## Render configuration (read-only review)

The live service watches main with commit auto-deploy enabled. Its current build
command is `npm install --include=dev && npm run build`; start command `npm start`.
The actual health-check path is empty, while render.yaml specifies /api/health.
PR previews are off. No service settings or environment variables were modified.
The existing /api/health reports chat-key presence, not end-to-end speech readiness.
Use authenticated /api/anam/status and /api/portrait/status as additional checks.

Required values, stored only in Render's secure environment:

- APP_PASSWORD: strong existing password; NODE_ENV=production; Node 22+.
- APP_ORIGIN: exact public HTTPS origin (or Render's RENDER_EXTERNAL_URL).
- CHAT_PROVIDER=openai; CHAT_OUTPUT=xai-tts.
- OPENAI_API_KEY; OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini.
- XAI_API_KEY; XAI_TTS_VOICE=eve.
- ANAM_API_KEY and ANAM_AVATAR_ID for luna-office, or ANAM_AVATAR_MAP for selected
  configured characters. ANAM_AVATAR_MODEL defaults to cara-4; confirm compatibility.
- PORT is supplied by Render. No LiveAvatar credentials are required for Anam/portraits.

## Release and rollback procedure — not executed

1. Finish the requested 20-character motion experience and review all original crops
   on desktop/mobile without replacing Anam.
2. Run the same locked install, build/tests and browser checks on the exact final head;
   require green CI and a staging call using approved server-side credentials.
3. Exercise Korean/Chinese/English speech, text, at least two turns, barge-in during
   synthesis/playback, switching appearance, history reconnect, disconnect and stop.
   Check that stop ends billing sessions and no old audio plays afterward.
4. Obtain explicit production merge/deploy approval. Record the current live SHA and
   configuration before merging. Do not expose secrets in the PR or logs.
5. Merge PR #4 only after approval; main auto-deploy triggers Render. Verify the live
   deployment SHA, /login, /api/health, authenticated status and real speech/video.
6. If validation fails, stop rollout. With approval, redeploy the recorded previous
   successful Render commit and revert the merge on main using a normal revert commit
   (never force-push). Account for auto-deploy when coordinating the revert. Restore
   environment settings only if separately approved changes had been made.
