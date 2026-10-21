"use strict";

const path = require("path");
const request = require("supertest");
const { createApp } = require("../lib/app");
const { TableStore } = require("../lib/tables");
const { silentLogger, loadRealTables } = require("./helpers");

const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");

let store;
let app;

beforeAll(async () => {
  store = await loadRealTables();
  app = createApp({ store, logger: silentLogger() });
});

describe("GET /api/health", () => {
  test("meldet Version und geladene Tabellen", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBe(require("../package.json").version);
    expect(res.body.tables).toEqual(["mai2024", "april2025", "april2026"]);
  });

  test("liefert 503 ohne Tabellen", async () => {
    const empty = new TableStore("/nicht/vorhanden", { logger: silentLogger() });
    await empty.load();
    const res = await request(createApp({ store: empty })).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

describe("öffentliche Tabellenendpunkte", () => {
  test("liefert verfügbare Tabellen in zeitlicher Reihenfolge", async () => {
    const res = await request(app).get("/api/tables");
    expect(res.status).toBe(200);
    expect(res.body.keys).toEqual(["mai2024", "april2025", "april2026"]);
    expect(res.body.tables[1]).toEqual({ key: "april2025", label: "01. April 2025", validFrom: "2025-04-01" });
    expect(res.body.meta.april2025).toHaveProperty("bytes");
  });

  test("liefert konkrete Tabelle", async () => {
    const res = await request(app).get("/api/tables/april2025");
    expect(res.status).toBe(200);
    expect(res.body.key).toBe("april2025");
    expect(res.body.table).toHaveProperty("EG05");
    expect(res.body.atMin).toHaveProperty("35");
    expect(res.body.azubiHint).toMatch(/Auszubildendenvergütung/);
  });

  test("liefert 404 für unbekannte Tabelle statt einer Ersatztabelle", async () => {
    const res = await request(app).get("/api/tables/current");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/nicht gefunden/);
  });
});

describe("POST /api/calc", () => {
  const payload = {
    tariffDate: "april2025",
    eg: "EG05",
    stufe: "B",
    irwazHours: 35,
    leistungsPct: 5,
    urlaubstage: 30,
    betriebsMonate: 24
  };

  test("berechnet Werte für Zeitraum bis 2025", async () => {
    const res = await request(app).post("/api/calc").send({ ...payload, tZugBPeriod: "until2025" });
    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50260.97, 2);
  });

  test("berechnet Werte für Zeitraum ab 2026", async () => {
    const res = await request(app).post("/api/calc").send({ ...payload, tZugBPeriod: "from2026" });
    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50567.59, 2);
  });

  test("Azubis erhalten Kinderzulage und spezielle T-ZUG-Berechnung", async () => {
    const res = await request(app).post("/api/calc").send({
      tariffDate: "april2025",
      eg: "AJ1",
      irwazHours: 35,
      leistungsPct: 0,
      urlaubstage: 0,
      betriebsMonate: 0,
      tZugBPeriod: "until2025",
      eigeneKinder: true
    });
    expect(res.status).toBe(200);
    expect(res.body.breakdown.kinderzulage).toBeCloseTo(632, 2);
    expect(res.body.breakdown.tZugB).toBeCloseTo(233.84, 2);
  });

  test("lehnt ungültige Eingaben mit Details ab", async () => {
    const res = await request(app).post("/api/calc").send({ ...payload, tZugBPeriod: "until2025", irwazHours: 99 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ungültige Eingabe");
    expect(res.body.details.fieldErrors).toHaveProperty("irwazHours");
  });

  test.each([
    ["unbekannte Tabelle", { tariffDate: "current" }, /Tabelle 'current' nicht verfügbar/],
    ["unbekannte Entgeltgruppe", { eg: "EG99" }, /Entgeltgruppe 'EG99' existiert nicht/],
    ["unbekannte Stufe", { stufe: "C" }, /Stufe 'C' existiert nicht/]
  ])("liefert 400 für %s", async (_name, override, message) => {
    const res = await request(app).post("/api/calc").send({ ...payload, tZugBPeriod: "until2025", ...override });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  test("lehnt Stufen außerhalb des erlaubten Musters ab", async () => {
    const res = await request(app).post("/api/calc").send({ ...payload, tZugBPeriod: "until2025", stufe: "constructor" });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors).toHaveProperty("stufe");
  });

  test("beantwortet kaputtes JSON mit JSON-Fehler", async () => {
    const res = await request(app).post("/api/calc").set("Content-Type", "application/json").send("{kaputt");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBe("Ungültiger JSON-Body");
  });

  test("beantwortet zu große Anfragen mit 413", async () => {
    const res = await request(app).post("/api/calc").send({ ...payload, padding: "x".repeat(25 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("Anfrage zu groß");
  });
});

describe("Infrastruktur", () => {
  test("unbekannte API-Pfade liefern JSON-404", async () => {
    const res = await request(app).get("/api/gibtsnicht");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Endpunkt nicht gefunden");
  });

  test("Rate-Limit unterscheidet Clients hinter dem lokalen Proxy", async () => {
    const limited = createApp({ store, trustProxy: "loopback", rateLimit: { windowMs: 60_000, max: 2 } });
    const get = ip => request(limited).get("/api/tables").set("X-Forwarded-For", ip);

    expect((await get("203.0.113.1")).status).toBe(200);
    expect((await get("203.0.113.1")).status).toBe(200);
    const blocked = await get("203.0.113.1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Zu viele Anfragen/);
    // ein anderer Client hat sein eigenes Kontingent
    expect((await get("203.0.113.2")).status).toBe(200);
  });

  test("liefert das Frontend mit CSP aus", async () => {
    const withFrontend = createApp({ store, frontendDir: FRONTEND_DIR });
    const res = await request(withFrontend).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<title>Entgeltrechner/);
    expect(res.headers["content-security-policy"]).toMatch(/script-src 'self'/);
  });
});
