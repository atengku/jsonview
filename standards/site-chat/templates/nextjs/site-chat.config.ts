/**
 * The ONLY file this project is allowed to change about its chat surface.
 *
 * Everything else — markup, styles, transport, auth, rate limiting — comes from
 * @atengku/site-chat so that every site behaves the same. If you need something
 * this file cannot express, change the standard, not the site.
 */
import { defineSiteChat } from "@atengku/site-chat";

export default defineSiteChat({
  // Slug for this site. Shows up in logs and rate-limit keys.
  site: "example",

  // Public agent id. Safe in the browser bundle; the API key is not.
  agentId: process.env.NEXT_PUBLIC_SITE_CHAT_AGENT_ID ?? "",

  // "text-only" | "text-first" | "voice-first"
  mode: "text-first",

  // "signed" mints a short-lived credential per session. Keep this unless the
  // agent is deliberately public.
  auth: "signed",

  brand: {
    name: "Example Assistant",
    accent: "#111827",
    // avatarUrl: "https://example.com/avatar.png",
  },

  // Only override the lines that are genuinely site-specific.
  copy: {
    launcher: "Chat with us",
    tagline: "AI assistant",
  },

  // Add every host this site is served from, including the apex and any custom
  // domain. Leave undefined to allow same-origin only (correct for most sites).
  // allowedOrigins: ["https://example.com", "https://www.example.com"],
});
