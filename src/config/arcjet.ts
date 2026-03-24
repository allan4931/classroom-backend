/**
 * Arcjet security client.
 * In development (or when ARCJET_KEY is absent) all rules run in DRY_RUN mode
 * so they log but never block — the server always starts cleanly.
 */
import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

const key  = process.env.ARCJET_KEY ?? "MISSING";
const isProd = process.env.NODE_ENV === "production";

// In production without a key we still want a valid client, just warn loudly
if (isProd && !process.env.ARCJET_KEY) {
  console.warn("⚠️  ARCJET_KEY not set — Arcjet running in DRY_RUN (protection disabled)");
}

const mode = (isProd && process.env.ARCJET_KEY) ? "LIVE" : "DRY_RUN";

const aj = arcjet({
  key,
  rules: [
    shield({ mode }),
    detectBot({ mode, allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"] }),
    slidingWindow({ mode, interval: "2s", max: isProd ? 5 : 200 }),
  ],
});

export default aj;
