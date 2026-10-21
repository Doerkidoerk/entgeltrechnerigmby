"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { z } = require("zod");
const { TABLE_KEY_PATTERN, TableFileSchema } = require("./schemas");

const RELOAD_DEBOUNCE_MS = 150;

/** Sortiert nach Gültigkeitsbeginn; Tabellen ohne Datum folgen alphabetisch. */
function compareEntries(a, b) {
  if (a.validFrom && b.validFrom && a.validFrom !== b.validFrom) {
    return a.validFrom < b.validFrom ? -1 : 1;
  }
  if (a.validFrom && !b.validFrom) return -1;
  if (!a.validFrom && b.validFrom) return 1;
  return a.key.localeCompare(b.key);
}

function describeError(err) {
  return err instanceof z.ZodError ? z.prettifyError(err).replace(/\n/g, "; ") : err.message;
}

/**
 * Hält die Tariftabellen aus einem Verzeichnis im Speicher.
 *
 * Beim (Neu-)Laden wird jede Datei validiert. Ist eine Datei fehlerhaft – etwa weil
 * ein Editor sie gerade schreibt –, bleibt die zuletzt gültige Version aktiv.
 */
class TableStore {
  constructor(dir, { logger = console } = {}) {
    this.dir = dir;
    this.logger = logger;
    this.entries = new Map();
    this.watcher = null;
    this.reloadTimer = null;
  }

  async load() {
    let files;
    try {
      files = (await fsp.readdir(this.dir)).filter(f => f.endsWith(".json")).sort();
    } catch (err) {
      this.logger.error(`[tables] Verzeichnis ${this.dir} nicht lesbar: ${err.message}`);
      files = [];
    }

    const next = new Map();
    for (const file of files) {
      const key = path.basename(file, ".json");
      if (!TABLE_KEY_PATTERN.test(key)) {
        this.logger.warn(`[tables] Überspringe ${file}: ungültiger Dateiname`);
        continue;
      }
      try {
        next.set(key, await this.readEntry(key, path.join(this.dir, file)));
      } catch (err) {
        const previous = this.entries.get(key);
        if (previous) {
          next.set(key, previous);
          this.logger.error(`[tables] ${file} fehlerhaft, vorherige Version bleibt aktiv: ${describeError(err)}`);
        } else {
          this.logger.error(`[tables] ${file} fehlerhaft, wird ignoriert: ${describeError(err)}`);
        }
      }
    }

    this.entries = new Map([...next.values()].sort(compareEntries).map(entry => [entry.key, entry]));
    if (this.entries.size === 0) {
      this.logger.warn("[tables] Keine gültigen Tabellen gefunden.");
    } else {
      this.logger.info(`[tables] geladen: ${this.keys().join(", ")}`);
    }
  }

  async readEntry(key, file) {
    const [stat, content] = await Promise.all([fsp.stat(file), fsp.readFile(file, "utf8")]);
    const data = TableFileSchema.parse(JSON.parse(content));
    return {
      key,
      label: data.label || key,
      validFrom: data.validFrom || null,
      azubiHint: data.azubiHint || null,
      table: data.table,
      atMin: data.atMin,
      meta: { mtimeMs: stat.mtimeMs, bytes: stat.size }
    };
  }

  /** Lädt die Tabellen neu, sobald sich eine JSON-Datei im Verzeichnis ändert. */
  watch() {
    if (this.watcher) return;
    try {
      this.watcher = fs.watch(this.dir, (_event, filename) => {
        if (filename && !filename.endsWith(".json")) return;
        // Editoren schreiben oft mehrfach kurz hintereinander
        clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => {
          this.load().catch(err => this.logger.error("[tables] Neuladen fehlgeschlagen:", err));
        }, RELOAD_DEBOUNCE_MS);
      });
      this.watcher.on("error", err => this.logger.warn(`[tables] Dateiüberwachung beendet: ${err.message}`));
    } catch (err) {
      this.logger.warn(`[tables] Dateiüberwachung nicht verfügbar: ${err.message}`);
    }
  }

  close() {
    clearTimeout(this.reloadTimer);
    this.watcher?.close();
    this.watcher = null;
  }

  get(key) {
    return this.entries.get(key) ?? null;
  }

  getTable(key) {
    return this.get(key)?.table ?? null;
  }

  /** Schlüssel in fachlicher Reihenfolge (älteste Tabelle zuerst). */
  keys() {
    return [...this.entries.keys()];
  }

  list() {
    return [...this.entries.values()];
  }

  get size() {
    return this.entries.size;
  }
}

module.exports = { TableStore };
