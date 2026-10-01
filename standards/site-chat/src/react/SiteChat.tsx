"use client";

import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { supportsVoice } from "../config.js";
import type { SiteChatConfig, SiteChatTransport } from "../types.js";
import {
  initialTranscriptState,
  transcriptReducer,
  type TranscriptAction,
  type TranscriptState,
} from "./transcript.js";
import { toStartSessionOptions, useSessionCredential } from "./useSessionCredential.js";

export interface SiteChatProps {
  config: SiteChatConfig;
  /** Render the panel already open. Used by a full-page `/chat` route. */
  defaultOpen?: boolean;
  /** Extra class on the root, for the rare site that needs to shift the launcher. */
  className?: string;
}

/**
 * The standard chat surface. Mount once, near the end of the root layout:
 *
 * ```tsx
 * <SiteChat config={siteChat} />
 * ```
 *
 * Transcript state lives here, above `ConversationProvider`, so the SDK
 * callbacks can be registered once and stay stable across renders.
 */
export function SiteChat({ config, defaultOpen = false, className }: SiteChatProps) {
  const [transcript, dispatch] = useReducer(transcriptReducer, initialTranscriptState);

  const callbacks = useMemo(
    () => ({
      onMessage: ({
        message,
        role,
        source,
        event_id,
      }: {
        message: string;
        role?: "user" | "agent";
        source: "user" | "ai";
        event_id?: number;
      }) =>
        dispatch({
          type: "message",
          role: role ?? (source === "ai" ? "agent" : "user"),
          text: message,
          eventId: event_id,
        }),
      onAgentChatResponsePart: ({
        text,
        type,
        event_id,
      }: {
        text: string;
        type: "start" | "delta" | "stop";
        event_id: number;
      }) => dispatch({ type: "part", text, kind: type, eventId: event_id }),
      onAgentTyping: ({ is_typing }: { is_typing: boolean }) =>
        dispatch({ type: "typing", isTyping: is_typing }),
      onError: (message: string) => dispatch({ type: "error", message }),
      onDisconnect: () => dispatch({ type: "typing", isTyping: false }),
    }),
    [],
  );

  if (!config.enabled) return null;

  return (
    <ConversationProvider {...callbacks}>
      <SiteChatSurface
        config={config}
        defaultOpen={defaultOpen}
        className={className}
        transcript={transcript}
        dispatch={dispatch}
      />
    </ConversationProvider>
  );
}

interface SurfaceProps extends SiteChatProps {
  transcript: TranscriptState;
  dispatch: (action: TranscriptAction) => void;
}

function SiteChatSurface({ config, defaultOpen, className, transcript, dispatch }: SurfaceProps) {
  const { copy, brand } = config;
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [draft, setDraft] = useState("");
  const [connecting, setConnecting] = useState(false);

  const { startSession, endSession, sendUserMessage } = useConversationControls();
  const { status } = useConversationStatus();
  const { isMuted, setMuted } = useConversationInput();
  const { isSpeaking } = useConversationMode();
  const fetchCredential = useSessionCredential(config);

  const panelId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const connected = status === "connected";
  const voiceAvailable = supportsVoice(config.mode);
  const [voice, setVoice] = useState(config.mode === "voice-first");

  const connect = useCallback(
    async (transport: SiteChatTransport) => {
      setConnecting(true);
      dispatch({ type: "error", message: null });
      try {
        const credential = await fetchCredential(transport);
        startSession(toStartSessionOptions(credential, config, transport));
      } catch {
        dispatch({ type: "error", message: copy.error });
      } finally {
        setConnecting(false);
      }
    },
    [config, copy.error, dispatch, fetchCredential, startSession],
  );

  // Open the panel and the session together, so the first keystroke is not
  // spent waiting on a handshake.
  useEffect(() => {
    if (!open || connected || connecting || status === "connecting") return;
    void connect(voice ? "webrtc" : "websocket");
  }, [open, connected, connecting, status, voice, connect]);

  // Keep the newest turn in view without yanking focus out of the composer.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [transcript.messages, transcript.agentTyping]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    endSession();
    dispatch({ type: "reset" });
    setVoice(config.mode === "voice-first");
  }, [config.mode, dispatch, endSession]);

  const submit = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text || !connected) return;
      dispatch({ type: "local-user", text });
      sendUserMessage(text);
      setDraft("");
    },
    [connected, dispatch, draft, sendUserMessage],
  );

  const toggleVoice = useCallback(async () => {
    endSession();
    dispatch({ type: "reset" });
    const next = !voice;
    setVoice(next);
    await connect(next ? "webrtc" : "websocket");
  }, [connect, dispatch, endSession, voice]);

  const rootStyle = {
    "--sc-accent": brand.accent,
    "--sc-accent-foreground": brand.accentForeground,
  } as CSSProperties;

  return (
    <div
      className={["sc-root", `sc-${config.placement}`, className].filter(Boolean).join(" ")}
      style={rootStyle}
      data-site-chat={config.site}
      data-standard-version={config.standardVersion}
    >
      {!open && (
        <button
          type="button"
          className="sc-launcher"
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
        >
          <span className="sc-launcher-icon" aria-hidden="true">
            {brand.avatarUrl ? <img src={brand.avatarUrl} alt="" /> : <ChatIcon />}
          </span>
          <span className="sc-launcher-label">{copy.launcher}</span>
        </button>
      )}

      {open && (
        <section
          id={panelId}
          className="sc-panel"
          role="dialog"
          aria-modal={false}
          aria-label={`${brand.name} — ${copy.tagline}`}
        >
          <header className="sc-header">
            <div className="sc-identity">
              {brand.avatarUrl ? (
                <img className="sc-avatar" src={brand.avatarUrl} alt="" />
              ) : (
                <span className="sc-avatar sc-avatar-fallback" aria-hidden="true">
                  {brand.name.slice(0, 1)}
                </span>
              )}
              <span className="sc-identity-text">
                <span className="sc-name">{brand.name}</span>
                <span className="sc-status" data-status={status}>
                  {statusLabel(status, connecting, isSpeaking)}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="sc-icon-button"
              onClick={close}
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          </header>

          <div
            className="sc-log"
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {transcript.messages.length === 0 && !transcript.agentTyping && (
              <p className="sc-empty">{copy.empty}</p>
            )}
            {transcript.messages.map((message) => (
              <div key={message.id} className={`sc-message sc-${message.role}`}>
                <span className="sc-bubble">{message.text}</span>
              </div>
            ))}
            {transcript.agentTyping && (
              <div className="sc-message sc-agent">
                <span className="sc-bubble sc-typing" aria-label={`${brand.name} is typing`}>
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>

          {transcript.error && (
            <p className="sc-error" role="alert">
              {transcript.error}
            </p>
          )}

          <form className="sc-composer" onSubmit={submit}>
            <textarea
              className="sc-input"
              rows={1}
              value={draft}
              placeholder={copy.inputPlaceholder}
              aria-label={copy.inputPlaceholder}
              disabled={!connected}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit(event);
                }
              }}
            />
            <div className="sc-actions">
              {voiceAvailable && (
                <button
                  type="button"
                  className="sc-icon-button"
                  onClick={() => void toggleVoice()}
                  aria-pressed={voice}
                  aria-label={voice ? copy.endVoice : copy.startVoice}
                  title={voice ? copy.endVoice : copy.startVoice}
                >
                  {voice ? <HangUpIcon /> : <MicIcon />}
                </button>
              )}
              {voice && connected && (
                <button
                  type="button"
                  className="sc-icon-button"
                  onClick={() => setMuted(!isMuted)}
                  aria-pressed={isMuted}
                  aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                  title={isMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {isMuted ? <MicOffIcon /> : <MicIcon />}
                </button>
              )}
              <button type="submit" className="sc-send" disabled={!connected || !draft.trim()}>
                <SendIcon />
                <span className="sc-sr-only">Send message</span>
              </button>
            </div>
          </form>

          <p className="sc-disclosure">{copy.disclosure}</p>
        </section>
      )}
    </div>
  );
}

function statusLabel(status: string, connecting: boolean, isSpeaking: boolean): string {
  if (connecting || status === "connecting") return "Connecting…";
  if (status === "error") return "Unavailable";
  if (status !== "connected") return "Offline";
  return isSpeaking ? "Speaking" : "Online";
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5.2A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function HangUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.2 10.6c5-4.1 12.6-4.1 17.6 0v3.1a1.6 1.6 0 0 1-1.9 1.6l-2.8-.6a1.6 1.6 0 0 1-1.2-1.5v-1.3a10.4 10.4 0 0 0-5.8 0v1.3a1.6 1.6 0 0 1-1.2 1.5l-2.8.6a1.6 1.6 0 0 1-1.9-1.6Z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3a3 3 0 0 1 3 3v5M9 9v3a3 3 0 0 0 4.5 2.6" />
      <path d="M5 11a7 7 0 0 0 10.9 5.8M12 18v3M4 4l16 16" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12 20 4l-8 16-2-6-6-2Z" />
    </svg>
  );
}
