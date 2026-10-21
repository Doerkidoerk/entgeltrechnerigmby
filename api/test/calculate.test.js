"use strict";

const { calculate, CalculationError, mon13Prozent } = require("../lib/calculate");
const { loadRealTables } = require("./helpers");

let getTable;

beforeAll(async () => {
  const store = await loadRealTables();
  getTable = key => store.getTable(key);
});

const base = {
  tariffDate: "april2025",
  eg: "EG05",
  stufe: "B",
  irwazHours: 35,
  leistungsPct: 0,
  urlaubstage: 30,
  betriebsMonate: 36,
  tZugBPeriod: "until2025",
  eigeneKinder: false
};

describe("13. Monatseinkommen", () => {
  test.each([
    [0, 0], [5, 0], [6, 25], [11, 25], [12, 35], [23, 35], [24, 45], [35, 45], [36, 55], [480, 55]
  ])("%i Monate → %i %%", (monate, prozent) => {
    expect(mon13Prozent(monate)).toBe(prozent);
  });
});

describe("calculate", () => {
  test("rechnet Teilzeit anteilig zur 35-Stunden-Basis", () => {
    const voll = calculate(base, getTable);
    const teil = calculate({ ...base, irwazHours: 17.5 }, getTable);
    expect(teil.breakdown.grund).toBeCloseTo(voll.breakdown.grund / 2, 2);
    expect(teil.breakdown.grund35).toBe(3475);
  });

  test("verwendet die erste Stufe, wenn keine angegeben ist", () => {
    const result = calculate({ ...base, stufe: undefined }, getTable);
    expect(result.breakdown.grund35).toBe(3392); // EG05/A
  });

  test("ignoriert Leistungszulage bei Auszubildenden", () => {
    const result = calculate({ ...base, eg: "AJ2", stufe: undefined, leistungsPct: 20 }, getTable);
    expect(result.breakdown).not.toHaveProperty("bonus");
    expect(result.totals.monat).toBe(1324);
  });

  test("ohne Urlaubstage gibt es kein Urlaubsgeld", () => {
    const { urlaub } = calculate({ ...base, urlaubstage: 0 }, getTable).breakdown;
    expect(urlaub).toEqual({ entgeltProTag: 0, tage: 0, gesamt: 0 });
  });

  test("T-ZUG B ab 2026 basiert immer auf der Tabelle April 2026", () => {
    const result = calculate({ ...base, tariffDate: "mai2024", tZugBPeriod: "from2026" }, getTable);
    expect(result.breakdown.tZugB).toBeCloseTo(3583 * 0.265, 2);
  });

  test("Jahresentgelt setzt sich aus allen Bestandteilen zusammen", () => {
    const { breakdown: b, totals } = calculate({ ...base, leistungsPct: 10 }, getTable);
    const summe = totals.monat * 12 + b.mon13 + b.tGeld + b.tZugA + b.tZugB + b.urlaub.gesamt;
    expect(totals.jahr).toBeCloseTo(summe, 1);
    expect(Math.abs(totals.durchschnittMonat - totals.jahr / 12)).toBeLessThanOrEqual(0.01);
  });

  test("meldet unbekannte Entgeltgruppen als Eingabefehler", () => {
    expect(() => calculate({ ...base, eg: "EG42" }, getTable)).toThrow(CalculationError);
  });

  test("meldet fehlende T-ZUG-B-Basis als Serverfehler", () => {
    const ohneEckentgelt = key => (key === "x" ? { EG07: { A: 4000 } } : null);
    try {
      calculate({ ...base, tariffDate: "x", eg: "EG07", stufe: "A" }, ohneEckentgelt);
      throw new Error("erwarteter Fehler blieb aus");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      expect(err.status).toBe(500);
    }
  });
});
