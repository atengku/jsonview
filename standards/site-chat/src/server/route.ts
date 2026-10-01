import { defaultTransportForMode, supportsVoice } from "../config.js";
import type { SiteChatConfig, SiteChatSessionResponse, SiteChatTransport } from "../types.js";
import {
  createConversationToken,
  createSignedUrl,
  ElevenLabsCredentialError,
} from "./elevenlabs.js";
import { clientKey, createMemoryLimiter, type SiteChatLimiter } from "./rate-limit.js";

export interface SessionRouteOptions {
  /**
   * Workspace API key. Defaults to `process.env.ELEVENLABS_API_KEY`. Never pass
   * a value that could reach a client bundle.
   */
  apiKey?: string;
  /** Replace the in-memory limiter with a shared one (Upstash, KV, …). */
  limiter?: SiteChatLimiter;
  /**
   * Derives a per-user identity handed to ElevenLabs, e.g. from a session
   * cookie. Returning `undefined` keeps the session anonymous.
   */
  identify?: (request: Request) => string | undefined | Promise<string | undefined>;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // A session credential is single-use and short-lived; never let it be cached.
  "cache-control": "no-store, max-age=0",
};

function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function originAllowed(request: Request, config: SiteChatConfig): boolean {
  const origin = request.headers.get("origin");
  // Same-origin `fetch` from a page omits Origin on GET in some browsers.
  if (!origin) return true;

  const allowed = config.allowedOrigins;
  if (allowed && allowed.length > 0) return allowed.includes(origin);

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function requestedTransport(request: Request, config: SiteChatConfig): SiteChatTransport | null {
  const raw = new URL(request.url).searchParams.get("transport");
  if (!raw) return defaultTransportForMode(config.mode);
  if (raw !== "websocket" && raw !== "webrtc") return null;
  if (raw === "webrtc" && !supportsVoice(config.mode)) return null;
  return raw;
}

/**
 * Builds the GET handler for `app/api/site-chat/session/route.ts`.
 *
 * The handler mints exactly one short-lived credential per call and returns
 * nothing else. The API key stays on the server; the browser only ever sees a
 * signed URL or a conversation token scoped to a single conversation.
 */
export function createSessionRoute(
  config: SiteChatConfig,
  options: SessionRouteOptions = {},
): (request: Request) => Promise<Response> {
  const limiter =
    options.limiter ?? createMemoryLimiter(config.rateLimit.windowMs, config.rateLimit.max);

  return async function GET(request: Request): Promise<Response> {
    if (!config.enabled) {
      return json({ error: "site_chat_disabled" }, 404);
    }

    if (!originAllowed(request, config)) {
      return json({ error: "origin_not_allowed" }, 403);
    }

    const transport = requestedTransport(request, config);
    if (!transport) {
      return json({ error: "unsupported_transport" }, 400);
    }

    const decision = await limiter(`${config.site}:${clientKey(request)}`);
    if (!decision.allowed) {
      return json({ error: "rate_limited" }, 429, {
        "retry-after": String(Math.max(1, decision.retryAfter)),
      });
    }

    // A public agent needs no credential at all — the browser connects with the
    // agent id. Only valid when authentication is disabled on the agent.
    if (config.auth === "public") {
      const body: SiteChatSessionResponse = {
        transport,
        agentId: config.agentId,
        publicAgent: true,
      };
      return json(body, 200);
    }

    const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      // Loud on the server, vague to the browser.
      console.error(
        `[site-chat:${config.site}] ELEVENLABS_API_KEY is not set; cannot mint session credentials.`,
      );
      return json({ error: "server_misconfigured" }, 500);
    }

    const credentialRequest = {
      agentId: config.agentId,
      apiKey,
      environment: config.environment,
      branchId: config.branchId,
      signal: request.signal,
    };

    try {
      if (transport === "webrtc") {
        const participantName = await options.identify?.(request);
        const token = await createConversationToken({ ...credentialRequest, participantName });
        const body: SiteChatSessionResponse = {
          transport: "webrtc",
          agentId: config.agentId,
          conversationToken: token.conversationToken,
          conversationId: token.conversationId,
          expiresAt: token.expiresAt,
        };
        return json(body, 200);
      }

      const signedUrl = await createSignedUrl(credentialRequest);
      const body: SiteChatSessionResponse = {
        transport: "websocket",
        agentId: config.agentId,
        signedUrl,
      };
      return json(body, 200);
    } catch (error) {
      const status = error instanceof ElevenLabsCredentialError ? error.status : 500;
      console.error(`[site-chat:${config.site}] session mint failed:`, error);
      return json({ error: "session_unavailable" }, status);
    }
  };
}
