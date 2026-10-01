# `@atengku/site-chat`

The standard chat surface for every site we ship on Vercel. One package, one
config file per site, identical behaviour everywhere.

Built on [ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/integrate/overview).

---

## What "standardised" means here

Exactly one file differs between sites: `site-chat.config.ts`. Everything else —
markup, styling, transport selection, authentication, rate limiting, the AI
disclosure, accessibility behaviour — lives in this package and is identical
across the estate.

| Concern                                      | Where it is decided                 |
| -------------------------------------------- | ----------------------------------- |
| Agent id, brand name, accent, copy overrides | `site-chat.config.ts` (per site)    |
| Panel markup and styling                     | this package (shared)               |
| WebSocket vs WebRTC                          | this package, from `mode`           |
| Credential minting and API-key handling      | this package (`createSessionRoute`) |
| Rate limiting, origin checks                 | this package                        |
| AI disclosure text                           | this package, overridable per site  |

`npx site-chat check` enforces it in CI.

## Install

```bash
npm install @atengku/site-chat @elevenlabs/react @elevenlabs/client
```

Then follow [ADOPTION.md](./ADOPTION.md) — four files, about ten minutes.

## The three moving parts

**1. Config** (`site-chat.config.ts`, root of the project)

```ts
import { defineSiteChat } from "@atengku/site-chat";

export default defineSiteChat({
  site: "seekingalpha",
  agentId: process.env.NEXT_PUBLIC_SITE_CHAT_AGENT_ID ?? "",
  mode: "text-first",
  auth: "signed",
  brand: { name: "Alpha", accent: "#c9a227" },
});
```

**2. Session route** (`app/api/site-chat/session/route.ts`, copied verbatim)

```ts
import { createSessionRoute } from "@atengku/site-chat/server";
import siteChat from "@/site-chat.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createSessionRoute(siteChat);
```

**3. Mount** (`app/layout.tsx`, once)

```tsx
import "@atengku/site-chat/styles.css";
import { SiteChat } from "@atengku/site-chat/react";
import siteChat from "@/site-chat.config";
// …
<SiteChat config={siteChat} />;
```

## How a session is established

```
browser                    our Vercel function              ElevenLabs
  │  GET /api/site-chat/session?transport=websocket │
  ├────────────────────────────────►│
  │                                 │ GET /v1/convai/conversation/get-signed-url
  │                                 ├──────────────────────────────►
  │                                 │◄── { signed_url }
  │◄── { transport, signedUrl } ────┤
  │
  │  startSession({ signedUrl })  ─── WebSocket ──────────────────►
```

For voice the endpoint is `/v1/convai/conversation/token` instead, and the
browser gets a `conversationToken`, which selects WebRTC.

The workspace API key (`ELEVENLABS_API_KEY`) never leaves the server. The browser
only ever holds a credential scoped to one conversation.

**Signed URLs expire after 15 minutes.** The conversation may run for much
longer, but it has to be _started_ inside that window — which is why the surface
fetches a credential when the panel opens, not on page load.

## Modes

| `mode`                 | Opens as                        | Transport              | Microphone      |
| ---------------------- | ------------------------------- | ---------------------- | --------------- |
| `text-only`            | text chat                       | WebSocket              | never requested |
| `text-first` (default) | text chat, one click to voice   | WebSocket, then WebRTC | on escalation   |
| `voice-first`          | voice call with live transcript | WebRTC                 | on open         |

## Auth

`auth: "signed"` (default) mints a short-lived credential per session, so the
agent can require authentication and allowlist our domains in ElevenLabs. Set
the allowlist to the site's real origins under the agent's platform settings.

`auth: "public"` skips credential minting and connects with the bare agent id.
Only valid for agents with authentication disabled — an agent id in a public
bundle is an open invitation to run up the bill, so treat this as a deliberate
exception, not a shortcut.

## Non-React sites

`@atengku/site-chat/embed` mounts ElevenLabs' own `<elevenlabs-convai>` element
against the same config and the same session endpoint. It gives up the shared
markup, so use it only where React isn't available. See
[`templates/static/snippet.html`](./templates/static/snippet.html).

## Styling

Two custom properties come from `brand` (`--sc-accent`,
`--sc-accent-foreground`). A site that must go further can override tokens on
`.sc-root` in its own stylesheet:

```css
.sc-root {
  --sc-radius: 8px;
  --sc-font: "Inter", sans-serif;
}
```

Forking `styles.css` defeats the point of the standard. If a site needs a change
the tokens can't express, change this package and roll the version.

## Local development

```bash
npm install
npm run typecheck
npm run build
```

## Versioning

Every site pins a caret range on this package. Breaking changes to the config
shape bump the major and are listed in [CHANGELOG.md](./CHANGELOG.md).
`STANDARD_VERSION` is stamped onto the rendered root as
`data-standard-version`, so you can see which version a deployed site is running
straight from the DOM.
