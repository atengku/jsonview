# Adopting the chat standard in a site

Ten minutes per project. Do these in order; step 6 tells you whether you got it
right.

## 0. Prerequisites

- The site is a Next.js App Router project deployed on Vercel.
- You have an ElevenLabs agent id (`agent_…`) for this site, and the workspace
  API key.
- One agent per site. Sharing an agent across sites makes the analytics useless
  and leaks one site's knowledge base into another's answers.

## 1. Install

```bash
npm install @atengku/site-chat @elevenlabs/react @elevenlabs/client
```

If the site uses voice (`mode` other than `text-only`) and you hit `/rtc/v1`
404s or `could not establish pc connection` on startup, add the LiveKit pin that
ElevenLabs currently recommends:

```json
{ "overrides": { "livekit-client": "2.16.1" } }
```

## 2. Config

Copy `templates/nextjs/site-chat.config.ts` to the project root and fill in
`site`, `agentId`, `brand`, and any copy that is genuinely site-specific.

Do not put the API key in this file. It is imported by the client bundle, and
`site-chat check` fails the build if it finds one.

## 3. Session route

Copy `templates/nextjs/app/api/site-chat/session/route.ts` to
`app/api/site-chat/session/route.ts`. Verbatim — no per-site logic here.

## 4. Mount

Add three lines to `app/layout.tsx`, per
`templates/nextjs/layout.snippet.tsx`: the stylesheet import, the component
import, and `<SiteChat config={siteChat} />` as the last child of `<body>`.

## 5. Environment

In Vercel → Project → Settings → Environment Variables, for **Production,
Preview and Development**:

| Name                             | Value             | Exposed to browser                    |
| -------------------------------- | ----------------- | ------------------------------------- |
| `ELEVENLABS_API_KEY`             | workspace API key | no — never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_CHAT_AGENT_ID` | `agent_…`         | yes, by design                        |

Then, in the ElevenLabs dashboard for this agent, enable authentication and
allowlist the site's origins (apex, `www`, and `*.vercel.app` if previews should
work).

## 6. Verify

```bash
npx site-chat check
```

Add it to the build so a site cannot silently drift:

```json
{ "scripts": { "build": "site-chat check && next build" } }
```

Then check by hand, once:

- Launcher appears bottom-right, opens on click.
- A typed question gets a streamed answer.
- `GET /api/site-chat/session` returns `{ transport, signedUrl }` and
  `cache-control: no-store`.
- The API key appears nowhere in `.next/static`.
- Voice sites: microphone prompt appears only after clicking the mic button.

## 7. Record it

Add the site to the table below so the estate is inventoried in one place.

| Site      | Repo              | Agent     | Mode         | Standard version | Live |
| --------- | ----------------- | --------- | ------------ | ---------------- | ---- |
| _example_ | `atengku/example` | `agent_…` | `text-first` | 1.0.1            | ☐    |

## Upgrading a site

1. `npm install @atengku/site-chat@latest`
2. Read the CHANGELOG entry for anything marked **breaking**.
3. `npx site-chat check`
4. Deploy a preview, click through the checks in step 6, promote.

Roll the whole estate on the same version. Two sites on two majors is exactly
the situation this package exists to prevent.
