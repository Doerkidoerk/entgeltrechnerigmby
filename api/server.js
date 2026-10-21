#!/usr/bin/env node
"use strict";

const path = require("path");
const { loadConfig } = require("./lib/config");
const { TableStore } = require("./lib/tables");
const { createApp } = require("./lib/app");

const DATA_DIR = path.join(__dirname, "data");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const SHUTDOWN_TIMEOUT_MS = 5000;

async function main() {
  const config = loadConfig();

  // Tabellen vor dem Start laden, damit die ersten Anfragen nicht ins Leere laufen
  const store = new TableStore(DATA_DIR);
  await store.load();
  store.watch();

  const app = createApp({ ...config, store, frontendDir: FRONTEND_DIR });
  const server = app.listen(config.port, config.host, err => {
    if (err) {
      console.error(`[server] Start auf ${config.host}:${config.port} fehlgeschlagen: ${err.message}`);
      process.exit(1);
    }
    console.log(`API listening on http://${config.host}:${config.port}`);
  });

  const shutdown = signal => {
    console.log(`[server] ${signal} empfangen, fahre herunter…`);
    store.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch(err => {
  console.error("[server] Start fehlgeschlagen:", err.message);
  process.exit(1);
});
