/**
 * Turns the agent's event stream into a chat transcript.
 *
 * Two things make this less trivial than "append every message":
 *  - In text mode the agent streams `text_response_part` deltas *and* then sends
 *    a final `agent_response`. Both carry the same `event_id`, so we key on it
 *    and let the final message replace the streamed draft.
 *  - Typed user messages are echoed optimistically for latency, and the server
 *    may also report them back. We drop the echo when it matches.
 */

export type SiteChatRole = "user" | "agent";

export interface SiteChatMessage {
  id: string;
  role: SiteChatRole;
  text: string;
  /** True while the agent is still streaming this message. */
  streaming: boolean;
}

export interface TranscriptState {
  messages: SiteChatMessage[];
  /** Agent is composing but has not emitted text yet. */
  agentTyping: boolean;
  /** Last error surfaced to the user, if any. */
  error: string | null;
}

export const initialTranscriptState: TranscriptState = {
  messages: [],
  agentTyping: false,
  error: null,
};

export type TranscriptAction =
  | { type: "reset" }
  | { type: "local-user"; text: string }
  | { type: "message"; role: SiteChatRole; text: string; eventId?: number }
  | { type: "part"; text: string; kind: "start" | "delta" | "stop"; eventId: number }
  | { type: "typing"; isTyping: boolean }
  | { type: "error"; message: string | null };

let localCounter = 0;
function localId(prefix: string): string {
  localCounter += 1;
  return `${prefix}-local-${localCounter}`;
}

function upsert(
  messages: SiteChatMessage[],
  id: string,
  update: (previous: SiteChatMessage | undefined) => SiteChatMessage,
): SiteChatMessage[] {
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) return [...messages, update(undefined)];
  const next = messages.slice();
  next[index] = update(messages[index]);
  return next;
}

export function transcriptReducer(
  state: TranscriptState,
  action: TranscriptAction,
): TranscriptState {
  switch (action.type) {
    case "reset":
      return initialTranscriptState;

    case "local-user":
      return {
        ...state,
        error: null,
        messages: [
          ...state.messages,
          { id: localId("user"), role: "user", text: action.text, streaming: false },
        ],
      };

    case "message": {
      const { role, text, eventId } = action;

      if (role === "user") {
        // Drop the server echo of a message we already rendered optimistically.
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === "user" && last.text === text) return state;
        return {
          ...state,
          messages: [
            ...state.messages,
            { id: localId("user"), role: "user", text, streaming: false },
          ],
        };
      }

      const id = eventId === undefined ? localId("agent") : `agent-${eventId}`;
      return {
        ...state,
        agentTyping: false,
        messages: upsert(state.messages, id, () => ({
          id,
          role: "agent",
          text,
          streaming: false,
        })),
      };
    }

    case "part": {
      const id = `agent-${action.eventId}`;
      if (action.kind === "stop") {
        return {
          ...state,
          agentTyping: false,
          messages: state.messages.map((message) =>
            message.id === id ? { ...message, streaming: false } : message,
          ),
        };
      }
      // "start" opens a fresh draft; "delta" appends to it.
      return {
        ...state,
        agentTyping: false,
        messages: upsert(state.messages, id, (previous) => ({
          id,
          role: "agent",
          text: previous && action.kind === "delta" ? previous.text + action.text : action.text,
          streaming: true,
        })),
      };
    }

    case "typing":
      return { ...state, agentTyping: action.isTyping };

    case "error":
      return { ...state, agentTyping: false, error: action.message };

    default:
      return state;
  }
}
