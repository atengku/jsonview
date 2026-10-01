# Changelog

## 1.0.1

- **Fix** a CSS specificity bug: `.sc-identity > span` also matched the avatar
  fallback span and beat its own `display: grid`, leaving the initial letter
  uncentred on any site without an avatar image. The text stack is now named
  `.sc-identity-text`.
- **Fix** ambiguous voice controls: during a call the end-call toggle and the
  mute toggle both rendered a microphone glyph, side by side. End-call now has
  its own hang-up icon.

## 1.0.0

First release of the standard.

- `defineSiteChat()` — the single per-site config file, with validation that
  rejects an API key pasted in place of an agent id.
- `createSessionRoute()` — the shared session endpoint. Mints a signed URL
  (WebSocket) or a conversation token (WebRTC), rate limits by client IP,
  rejects cross-origin callers, and keeps `ELEVENLABS_API_KEY` server-side.
- `<SiteChat />` — the shared React surface: launcher, panel, streamed
  transcript, text composer, optional voice escalation and mute, AI disclosure,
  dark mode, mobile full-screen, reduced-motion and keyboard support.
- `mountSiteChat()` — `<elevenlabs-convai>` fallback for non-React sites, using
  the same config and the same session endpoint.
- `npx site-chat check` — conformance checker for CI and the Vercel build.
