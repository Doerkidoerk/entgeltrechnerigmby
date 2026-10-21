"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { TableStore } = require("../lib/tables");
const { silentLogger } = require("./helpers");

const validFile = (overrides = {}) => JSON.stringify({
  table: { EG01: { salary: 2000 }, EG05: { A: 3000, B: 3100 } },
  atMin: { 35: { monat: 8000, jahr: 100000 } },
  ...overrides
});

let dir;
let logger;
let store;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tables-"));
  logger = silentLogger();
  store = new TableStore(dir, { logger });
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (name, content) => fs.writeFileSync(path.join(dir, name), content);

test("lädt gültige Tabellen sortiert nach Gültigkeitsbeginn", async () => {
  write("neu.json", validFile({ validFrom: "2026-01-01", label: "Neu" }));
  write("alt.json", validFile({ validFrom: "2024-01-01" }));
  write("ohneDatum.json", validFile());
  await store.load();

  expect(store.keys()).toEqual(["alt", "neu", "ohneDatum"]);
  expect(store.get("neu").label).toBe("Neu");
  expect(store.get("alt").label).toBe("alt");
  expect(store.getTable("alt").EG05.B).toBe(3100);
});

test("akzeptiert das alte Format ohne table-Hülle", async () => {
  write("legacy.json", JSON.stringify({ EG01: { salary: 2000 } }));
  await store.load();
  expect(store.getTable("legacy")).toEqual({ EG01: { salary: 2000 } });
  expect(store.get("legacy").atMin).toEqual({});
});

test.each([
  ["kaputtes JSON", "{"],
  ["Text statt Zahl", validFile({ table: { EG05: { B: "3100" } } })],
  ["negativer Betrag", validFile({ table: { EG05: { B: -1 } } })],
  ["unbekannte Entgeltgruppe", validFile({ table: { XY: { salary: 1 } } })],
  ["leere Entgeltgruppe", validFile({ table: { EG05: {} } })],
  ["ungültiges Datum", validFile({ validFrom: "2025-13-01" })]
])("ignoriert fehlerhafte Dateien (%s)", async (_name, content) => {
  write("kaputt.json", content);
  write("ok.json", validFile());
  await store.load();

  expect(store.keys()).toEqual(["ok"]);
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("kaputt.json"));
});

test("ignoriert Dateien mit ungültigem Namen", async () => {
  write("mit leerzeichen.json", validFile());
  await store.load();
  expect(store.size).toBe(0);
});

test("behält beim Neuladen die letzte gültige Version einer defekten Datei", async () => {
  write("t.json", validFile());
  await store.load();

  write("t.json", "{ halb geschrieben");
  await store.load();

  expect(store.getTable("t").EG05.B).toBe(3100);
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("vorherige Version bleibt aktiv"));
});

test("entfernt gelöschte Dateien beim Neuladen", async () => {
  write("a.json", validFile());
  write("b.json", validFile());
  await store.load();
  fs.unlinkSync(path.join(dir, "b.json"));
  await store.load();
  expect(store.keys()).toEqual(["a"]);
});

test("übersteht ein fehlendes Verzeichnis", async () => {
  const missing = new TableStore(path.join(dir, "gibtsnicht"), { logger });
  await expect(missing.load()).resolves.toBeUndefined();
  expect(missing.size).toBe(0);
});
