/**
 * The shape of the one file a project is allowed to vary: `site-chat.config.ts`.
 *
 * Everything else in the chat surface — markup, styling primitives, transport
 * selection, auth, rate limiting, accessibility — is fixed by this package so
 * that every site we ship behaves identically.
 */

/** How the agent is presented on first contact. */
export type SiteChatMode =
  /** Typing only. No microphone permission is ever requested. */
  | "text-only"
  /** Opens as a text chat; the user can escalate to voice with one click. */
  | "text-first"
  /** Opens straight into a voice call, with the text transcript alongside. */
  | "voice-first";

/**
 * `"signed"` mints a short-lived credential server-side on every session, so the
 * agent can be locked down to our domains. `"public"` connects with a bare agent
 * id and requires the agent to have authentication disabled in ElevenLabs.
 */
export type SiteChatAuth = "signed" | "public";

/** Wire protocol used for a session. Text sessions are always WebSocket. */
export type SiteChatTransport = "websocket" | "webrtc";

export type SiteChatPlacement = "bottom-right" | "bottom-left";

export interface SiteChatBrand {
  /** Display name of the assistant, e.g. "Alpha". Shown in the panel header. */
  name: string;
  /** Accent colour (any CSS colour). Drives the launcher and agent bubbles. */
  accent?: string;
  /** Foreground colour used on top of `accent`. Defaults to white. */
  accentForeground?: string;
  /** Square avatar shown in the header and next to agent messages. */
  avatarUrl?: string;
}

export interface SiteChatCopy {
  /** Tooltip / aria-label on the closed launcher. */
  launcher: string;
  /** Panel header subtitle. */
  tagline: string;
  /** Placeholder in the text input. */
  inputPlaceholder: string;
  /** Label on the button that starts a voice call. */
  startVoice: string;
  /** Label on the button that ends a voice call. */
  endVoice: string;
  /** Shown while the transcript is empty. */
  empty: string;
  /** Small print under the composer. Required — this is our AI disclosure. */
  disclosure: string;
  /** Shown when the session endpoint or the agent fails. */
  error: string;
}

export interface SiteChatRateLimit {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum session credentials issued per client IP per window. */
  max: number;
}

/** Author-facing config. Everything optional here has a standard default. */
export interface SiteChatConfigInput {
  /** Stable slug for the site, e.g. "seekingalpha". Used in logs and rate-limit keys. */
  site: string;
  /** ElevenLabs agent id (`agent_…`). Safe to expose to the browser. */
  agentId: string;
  mode?: SiteChatMode;
  auth?: SiteChatAuth;
  /** Route that mints session credentials. Must be same-origin. */
  sessionEndpoint?: string;
  brand: SiteChatBrand;
  placement?: SiteChatPlacement;
  /** Partial overrides of the standard copy deck. */
  copy?: Partial<SiteChatCopy>;
  rateLimit?: Partial<SiteChatRateLimit>;
  /**
   * Origins allowed to call the session endpoint. Defaults to same-origin only.
   * Add preview/apex domains here when a site is served from more than one host.
   */
  allowedOrigins?: string[];
  /** Values interpolated into the agent's prompt, e.g. `{ plan: "pro" }`. */
  dynamicVariables?: Record<string, string | number | boolean>;
  /** ElevenLabs environment for resolving workspace variables. */
  environment?: string;
  /** ElevenLabs agent branch id, for testing an unpublished branch. */
  branchId?: string;
  /** Data-residency region passed to the SDK. */
  serverLocation?: "us" | "eu-residency" | "in-residency" | "global";
  /** Render the surface at all. Set false to dark-launch on a site. */
  enabled?: boolean;
}

/** Fully resolved config, after defaults are applied. */
export interface SiteChatConfig {
  site: string;
  agentId: string;
  mode: SiteChatMode;
  auth: SiteChatAuth;
  sessionEndpoint: string;
  brand: Required<SiteChatBrand>;
  placement: SiteChatPlacement;
  copy: SiteChatCopy;
  rateLimit: SiteChatRateLimit;
  allowedOrigins?: string[];
  dynamicVariables?: Record<string, string | number | boolean>;
  environment?: string;
  branchId?: string;
  serverLocation: "us" | "eu-residency" | "in-residency" | "global";
  enabled: boolean;
  /** Version of this standard the config was written against. */
  standardVersion: string;
}

/** JSON returned by the session endpoint. */
export type SiteChatSessionResponse =
  | { transport: "websocket"; signedUrl: string; agentId: string }
  | {
      transport: "webrtc";
      conversationToken: string;
      agentId: string;
      conversationId?: string;
      expiresAt?: number;
    }
  | { transport: SiteChatTransport; agentId: string; publicAgent: true };
