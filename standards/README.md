# Standards

Shared, versioned building blocks that every one of our sites consumes rather
than reimplements.

| Standard | What it covers |
| --- | --- |
| [`site-chat`](./site-chat) | The ElevenLabs Agents chat surface on every Vercel site |

A standard lives here as the source of truth, is published to npm, and is pinned
by each consuming project. Projects do not fork them — if a site needs something
the standard can't express, the standard changes and the estate rolls forward
together.
