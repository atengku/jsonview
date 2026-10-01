"use client";

import type { HookOptions } from "@elevenlabs/react";
import { useCallback, useRef } from "react";
import { defaultTransportForMode } from "../config.js";
import type { SiteChatConfig, SiteChatSessionResponse, SiteChatTransport } from "../types.js";

export class SessionCredentialError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SessionCredentialError";
    this.code = code;
  }
}

/**
 * Fetches a session credential from the site's own `/api/site-chat/session`
 * route. Credentials are single-use, so this never caches — but it does
 * de-duplicate concurrent calls, because double-clicking the launcher should
 * not burn two of them.
 */
export function useSessionCredential(config: SiteChatConfig) {
  const inFlight = useRef<Map<SiteChatTransport, Promise<SiteChatSessionResponse>>>(new Map());

  return useCallback(
    (transport: SiteChatTransport = defaultTransportForMode(config.mode)) => {
      const existing = inFlight.current.get(transport);
      if (existing) return existing;

      const url = `${config.sessionEndpoint}?transport=${transport}`;
      const request = fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new SessionCredentialError(
              body?.error ?? `http_${response.status}`,
              `Session endpoint responded ${response.status}.`,
            );
          }
          return (await response.json()) as SiteChatSessionResponse;
        })
        .finally(() => {
          inFlight.current.delete(transport);
        });

      inFlight.current.set(transport, request);
      return request;
    },
    [config.mode, config.sessionEndpoint],
  );
}

/**
 * Maps a session response onto the options `startSession` expects. The SDK
 * infers the transport from which credential is present: `signedUrl` is
 * WebSocket-only, `conversationToken` selects WebRTC.
 */
export function toStartSessionOptions(
  credential: SiteChatSessionResponse,
  config: SiteChatConfig,
  transport: SiteChatTransport,
): HookOptions {
  const shared: Record<string, unknown> = {
    textOnly: transport === "websocket" && config.mode !== "voice-first",
    serverLocation: config.serverLocation,
  };
  if (config.dynamicVariables) shared.dynamicVariables = config.dynamicVariables;
  if (config.environment) shared.environment = config.environment;

  // `SessionConfig` is a union whose members mark the other credentials as
  // `never`, so the object has to be assembled untyped and asserted once here.
  if ("signedUrl" in credential) {
    return {
      ...shared,
      signedUrl: credential.signedUrl,
      connectionType: "websocket",
    } as HookOptions;
  }
  if ("conversationToken" in credential) {
    return {
      ...shared,
      conversationToken: credential.conversationToken,
      connectionType: "webrtc",
    } as HookOptions;
  }
  return { ...shared, agentId: credential.agentId, connectionType: transport } as HookOptions;
}
