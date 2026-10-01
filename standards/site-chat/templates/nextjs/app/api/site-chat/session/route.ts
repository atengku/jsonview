/**
 * Standard session endpoint. Copy verbatim — no per-site logic belongs here.
 *
 * Mints one short-lived ElevenLabs credential per call. ELEVENLABS_API_KEY is
 * read on the server and never reaches the browser.
 */
import { createSessionRoute } from "@atengku/site-chat/server";
import siteChat from "@/site-chat.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createSessionRoute(siteChat);
