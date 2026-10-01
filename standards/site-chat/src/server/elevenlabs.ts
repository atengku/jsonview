/**
 * Thin, dependency-free wrappers over the two ElevenLabs endpoints a browser
 * session needs. Both require the workspace API key and therefore may only ever
 * run on the server.
 *
 * Docs: https://elevenlabs.io/docs/eleven-agents/integrate/overview
 */

const API_BASE = "https://api.elevenlabs.io";

export class ElevenLabsCredentialError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ElevenLabsCredentialError";
    this.status = status;
  }
}

export interface CredentialRequest {
  agentId: string;
  apiKey: string;
  /** Workspace environment used to resolve variables, e.g. "production". */
  environment?: string;
  /** Agent branch id, for testing an unpublished branch. */
  branchId?: string;
  signal?: AbortSignal;
}

function buildUrl(path: string, params: Record<string, string | undefined>): string {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

async function callElevenLabs(url: string, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    throw new ElevenLabsCredentialError(
      `Could not reach the ElevenLabs API: ${(cause as Error).message}`,
      502,
    );
  }

  if (!response.ok) {
    // Never forward the upstream status to the browser: a 401 here means our
    // key is wrong, which is a server fault, not the caller's.
    const detail =
      response.status === 401 || response.status === 403
        ? "ELEVENLABS_API_KEY is missing, revoked, or lacks access to this agent"
        : `ElevenLabs returned ${response.status}`;
    throw new ElevenLabsCredentialError(`Could not mint a session credential: ${detail}.`, 502);
  }

  return (await response.json()) as unknown;
}

/**
 * Mints a signed WebSocket URL. Valid for 15 minutes — the session must be
 * *started* inside that window, but may then run for as long as it likes.
 */
export async function createSignedUrl(request: CredentialRequest): Promise<string> {
  const url = buildUrl("/v1/convai/conversation/get-signed-url", {
    agent_id: request.agentId,
    environment: request.environment,
    branch_id: request.branchId,
  });
  const body = (await callElevenLabs(url, request.apiKey, request.signal)) as {
    signed_url?: string;
  };
  if (!body?.signed_url) {
    throw new ElevenLabsCredentialError("ElevenLabs did not return a signed URL.", 502);
  }
  return body.signed_url;
}

export interface ConversationToken {
  conversationToken: string;
  conversationId?: string;
  /** Unix seconds. */
  expiresAt?: number;
}

/** Mints a WebRTC conversation token, used for voice sessions. */
export async function createConversationToken(
  request: CredentialRequest & { participantName?: string },
): Promise<ConversationToken> {
  const url = buildUrl("/v1/convai/conversation/token", {
    agent_id: request.agentId,
    participant_name: request.participantName,
    environment: request.environment,
    branch_id: request.branchId,
  });
  const body = (await callElevenLabs(url, request.apiKey, request.signal)) as {
    conversation_token?: string;
    conversation_id?: string;
    expiration_time_unix_secs?: number;
  };
  if (!body?.conversation_token) {
    throw new ElevenLabsCredentialError("ElevenLabs did not return a conversation token.", 502);
  }
  return {
    conversationToken: body.conversation_token,
    conversationId: body.conversation_id,
    expiresAt: body.expiration_time_unix_secs,
  };
}
