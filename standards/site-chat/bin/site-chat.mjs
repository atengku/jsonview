#!/usr/bin/env node
/**
 * Conformance checker. Run in any project that claims to follow the standard:
 *
 *   npx @atengku/site-chat check
 *
 * It verifies the four things that make a site's chat surface *the same* as
 * every other site's, and exits non-zero when one is missing — so it can sit in
 * CI and in the Vercel build command.
 */

import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const CWD = process.cwd();
const PACKAGE_NAME = "@atengku/site-chat";

const problems = [];
const notes = [];

function fail(message, fix) {
  problems.push({ message, fix });
}

async function exists(relative) {
  try {
    await access(path.join(CWD, relative), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function readJson(relative) {
  try {
    return JSON.parse(await readFile(path.join(CWD, relative), "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const pkg = await readJson("package.json");
  if (!pkg) {
    fail("No package.json here.", `Run this from the root of a site that uses ${PACKAGE_NAME}.`);
    return report();
  }

  // 1. The standard is a pinned dependency, not a copy-paste.
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const range = deps[PACKAGE_NAME];
  if (!range) {
    fail(`${PACKAGE_NAME} is not a dependency.`, `npm install ${PACKAGE_NAME}`);
  } else if (range.startsWith("*") || range === "latest") {
    fail(
      `${PACKAGE_NAME} is pinned to "${range}".`,
      "Use a caret range so every site moves together on a known version.",
    );
  } else {
    notes.push(`${PACKAGE_NAME}@${range}`);
  }

  // 2. Exactly one config file, at the root.
  const configPath = await firstExisting([
    "site-chat.config.ts",
    "site-chat.config.js",
    "site-chat.config.mjs",
  ]);
  if (!configPath) {
    fail(
      "No site-chat.config.ts at the project root.",
      "Copy templates/nextjs/site-chat.config.ts from the standard and fill it in.",
    );
  } else {
    const source = await readFile(path.join(CWD, configPath), "utf8");
    if (!source.includes("defineSiteChat")) {
      fail(
        `${configPath} does not call defineSiteChat().`,
        "Config must go through defineSiteChat() so defaults and validation apply.",
      );
    }
    if (/ELEVENLABS_API_KEY|ANTHROPIC_API_KEY|sk-ant-|sk_[a-f0-9]{32}/.test(source)) {
      fail(
        `${configPath} references an API key.`,
        "Keys belong in the session route only. This file reaches the browser.",
      );
    }
    notes.push(configPath);
  }

  // 3. The session route exists and is not a fork of the standard one.
  const routePath = await firstExisting([
    "app/api/site-chat/session/route.ts",
    "app/api/site-chat/session/route.js",
    "src/app/api/site-chat/session/route.ts",
    "src/app/api/site-chat/session/route.js",
  ]);
  if (!routePath) {
    fail(
      "No session route at app/api/site-chat/session/route.ts.",
      "Copy templates/nextjs/app/api/site-chat/session/route.ts verbatim.",
    );
  } else {
    const source = await readFile(path.join(CWD, routePath), "utf8");
    if (!source.includes("createSessionRoute")) {
      fail(
        `${routePath} does not use createSessionRoute().`,
        "Do not hand-roll credential minting; the standard route handles auth and rate limits.",
      );
    }
    notes.push(routePath);
  }

  // 4. The surface is actually mounted somewhere.
  const mounted = await grepForMount();
  if (!mounted) {
    fail(
      "<SiteChat /> is not mounted in any layout.",
      "Add it to app/layout.tsx, per templates/nextjs/layout.snippet.tsx.",
    );
  } else {
    notes.push(mounted);
  }

  // 5. Environment. Warn only — CI often runs without production secrets.
  if (!process.env.ELEVENLABS_API_KEY) {
    notes.push("ELEVENLABS_API_KEY not set in this shell (fine in CI, required on Vercel)");
  }

  return report();
}

async function grepForMount() {
  const candidates = [
    "app/layout.tsx",
    "src/app/layout.tsx",
    "app/layout.jsx",
    "src/app/layout.jsx",
  ];
  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    const source = await readFile(path.join(CWD, candidate), "utf8");
    if (source.includes("<SiteChat")) return candidate;
  }
  return null;
}

function report() {
  if (notes.length > 0) {
    console.log("site-chat:");
    for (const note of notes) console.log(`  · ${note}`);
  }

  if (problems.length === 0) {
    console.log("\n✓ This site conforms to the site-chat standard.");
    process.exitCode = 0;
    return;
  }

  console.error(`\n✗ ${problems.length} problem(s):\n`);
  for (const { message, fix } of problems) {
    console.error(`  ✗ ${message}`);
    console.error(`    → ${fix}\n`);
  }
  process.exitCode = 1;
}

const command = process.argv[2] ?? "check";
if (command !== "check") {
  console.error(`Unknown command "${command}". Usage: site-chat check`);
  process.exitCode = 2;
} else {
  await main();
}
