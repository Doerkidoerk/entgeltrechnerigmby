"use strict";

const DEFAULT_ORIGINS = ["https://entgeltrechner.cbmeyer.xyz"];

function parseInteger(name, raw, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Ungültiger Wert für ${name}: '${raw}' (erwartet: Ganzzahl ${min}–${max})`);
  }
  return value;
}

function parseList(raw, fallback) {
  if (raw === undefined) return fallback;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

/** Werte für Express' "trust proxy": true/false, Anzahl Hops oder Adressliste (z. B. "loopback"). */
function parseTrustProxy(raw, fallback) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/** Liest die Konfiguration aus Umgebungsvariablen; ungültige Werte führen zum Abbruch beim Start. */
function loadConfig(env = process.env) {
  return {
    port: parseInteger("PORT", env.PORT, 3001, { min: 1, max: 65535 }),
    host: "127.0.0.1",
    allowedOrigins: parseList(env.ALLOWED_ORIGINS, DEFAULT_ORIGINS),
    // Die API lauscht nur auf 127.0.0.1 hinter nginx: dem lokalen Proxy vertrauen,
    // damit Rate-Limiting und Logs die echte Client-IP sehen.
    trustProxy: parseTrustProxy(env.TRUST_PROXY, "loopback"),
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: parseInteger("RATE_LIMIT_MAX", env.RATE_LIMIT_MAX, 100, { min: 1 })
    },
    logRequests: env.NODE_ENV !== "test"
  };
}

module.exports = { loadConfig };
