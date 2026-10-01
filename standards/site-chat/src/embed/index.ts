/**
 * Fallback surface for sites that are not React: plain HTML, Astro/Hugo output,
 * marketing pages built by someone else. It mounts ElevenLabs' own
 * `<elevenlabs-convai>` custom element instead of our component.
 *
 * This is the *second-choice* path. It gives up the shared markup and most of
 * the styling contract, so a site should only use it when React is genuinely
 * unavailable. Everything else in the standard still applies: same config file,
 * same session endpoint, same disclosure copy.
 */

import type { SiteChatConfig, SiteChatSessionResponse } from "../types.js";

const WIDGET_SCRIPT = "https://unpkg.com/@elevenlabs/convai-widget-embed";
const WIDGET_TAG = "elevenlabs-convai";

export interface MountOptions {
  /** Where to append the widget. Defaults to `document.body`. */
  container?: HTMLElement;
  /** Override the CDN URL, e.g. to serve the script from your own origin. */
  scriptSrc?: string;
}

interface ConvaiElement extends HTMLElement {
  startConversation?: () => void;
  endConversation?: () => void;
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.type = "text/javascript";
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
    document.head.appendChild(script);
  });
}

/**
 * Mounts the widget and returns a teardown function.
 *
 * With `auth: "signed"` the widget is created without an agent id and given a
 * signed URL fetched from the site's own session endpoint, so the agent can stay
 * locked to our domains. With `auth: "public"` the agent id is enough, but the
 * agent must have authentication disabled in ElevenLabs.
 */
export async function mountSiteChat(
  config: SiteChatConfig,
  options: MountOptions = {},
): Promise<() => void> {
  if (!config.enabled) return () => {};
  if (typeof document === "undefined") {
    throw new Error("[site-chat] mountSiteChat must run in the browser.");
  }

  await loadScript(options.scriptSrc ?? WIDGET_SCRIPT);

  const widget = document.createElement(WIDGET_TAG) as ConvaiElement;
  widget.setAttribute("action-text", config.copy.launcher);
  widget.setAttribute("start-call-text", config.copy.startVoice);
  widget.setAttribute("end-call-text", config.copy.endVoice);
  widget.setAttribute("server-location", config.serverLocation);
  widget.setAttribute("dismissible", "true");
  if (config.brand.avatarUrl) widget.setAttribute("avatar-image-url", config.brand.avatarUrl);
  if (config.brand.accent) widget.setAttribute("avatar-orb-color-1", config.brand.accent);
  widget.dataset.siteChat = config.site;
  widget.dataset.standardVersion = config.standardVersion;

  if (config.auth === "public") {
    widget.setAttribute("agent-id", config.agentId);
  } else {
    const response = await fetch(`${config.sessionEndpoint}?transport=websocket`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`[site-chat] session endpoint responded ${response.status}`);
    }
    const credential = (await response.json()) as SiteChatSessionResponse;
    if (!("signedUrl" in credential)) {
      throw new Error("[site-chat] session endpoint did not return a signed URL.");
    }
    widget.setAttribute("signed-url", credential.signedUrl);
  }

  (options.container ?? document.body).appendChild(widget);

  return () => {
    widget.endConversation?.();
    widget.remove();
  };
}
