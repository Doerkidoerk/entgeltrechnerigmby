"use strict";

/** Tarifliche Kenngrößen M+E Bayern */
const STANDARD_HOURS = 35;              // tarifliche Wochenarbeitszeit (Basis der Tabellen)
const T_GELD_RATE = 0.184;              // T-Geld: 18,4 % des Monatsentgelts
const T_ZUG_A_RATE = 0.275;             // T-ZUG A: 27,5 % des Monatsentgelts
const T_ZUG_B_RATES = { until2025: 0.185, from2026: 0.265 };
const T_ZUG_B_BASE = { eg: "EG05", stufe: "B" };   // Eckentgelt als Basis für T-ZUG B
const T_ZUG_B_TABLE_FROM_2026 = "april2026";
const KINDERZULAGE_AZUBI_RATE = 0.5;
const URLAUBSGELD_FAKTOR = 1.5 / 65.25; // 50 % des Tagesentgelts: 3 Monate / 65,25 Arbeitstage
/** 13. Monatseinkommen nach Betriebszugehörigkeit (Monate → Prozent), absteigend sortiert. */
const MON13_STAFFEL = [
  { abMonaten: 36, prozent: 55 },
  { abMonaten: 24, prozent: 45 },
  { abMonaten: 12, prozent: 35 },
  { abMonaten: 6, prozent: 25 }
];

/** Fehler, die auf ungültige Eingaben oder fehlende Tabellendaten zurückgehen. */
class CalculationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CalculationError";
    this.status = status;
  }
}

const euro = n => Math.round(n * 100) / 100;
const isAzubiGroup = eg => eg.startsWith("AJ");

function mon13Prozent(betriebsMonate) {
  return MON13_STAFFEL.find(s => betriebsMonate >= s.abMonaten)?.prozent ?? 0;
}

/** Ermittelt das Grundentgelt (35-h-Basis) einer Entgeltgruppe und ggf. Stufe. */
function grundentgelt35(table, tariffKey, eg, stufe) {
  if (!Object.hasOwn(table, eg)) {
    throw new CalculationError(`Entgeltgruppe '${eg}' existiert nicht in '${tariffKey}'`);
  }
  const group = table[eg];
  if (Object.hasOwn(group, "salary")) return group.salary;

  const effectiveStufe = stufe ?? Object.keys(group).sort()[0];
  if (!Object.hasOwn(group, effectiveStufe)) {
    throw new CalculationError(`Stufe '${effectiveStufe}' existiert nicht in ${eg} ('${tariffKey}')`);
  }
  return group[effectiveStufe];
}

/** Eckentgelt EG05/B für T-ZUG B; ab 2026 immer aus der Tabelle April 2026. */
function tZugBBasis(getTable, tariffKey, period) {
  const key = period === "from2026" ? T_ZUG_B_TABLE_FROM_2026 : tariffKey;
  const value = getTable(key)?.[T_ZUG_B_BASE.eg]?.[T_ZUG_B_BASE.stufe];
  if (!Number.isFinite(value)) {
    throw new CalculationError(`T-ZUG B Basis (${T_ZUG_B_BASE.eg}/${T_ZUG_B_BASE.stufe}) fehlt in Tabelle '${key}'`, 500);
  }
  return value;
}

/**
 * Berechnet Monats- und Jahresentgelt.
 *
 * @param {object} input       validierte Eingaben (siehe CalcInputSchema)
 * @param {(key: string) => object|null} getTable  liefert die Entgelttabelle zu einem Schlüssel
 */
function calculate(input, getTable) {
  const {
    tariffDate, eg, stufe, irwazHours, leistungsPct,
    urlaubstage, betriebsMonate, tZugBPeriod, eigeneKinder
  } = input;

  const table = getTable(tariffDate);
  if (!table) throw new CalculationError(`Tabelle '${tariffDate}' nicht verfügbar`);

  const isAzubi = isAzubiGroup(eg);
  const grund35 = grundentgelt35(table, tariffDate, eg, stufe);
  const grund = grund35 * (irwazHours / STANDARD_HOURS);
  const bonus = isAzubi ? 0 : grund * (leistungsPct / 100);
  const kinderZulage = isAzubi && eigeneKinder ? grund * KINDERZULAGE_AZUBI_RATE : 0;
  const monatsBasis = grund + bonus;

  const p13 = mon13Prozent(betriebsMonate);
  const mon13 = monatsBasis * (p13 / 100);
  const tGeld = monatsBasis * T_GELD_RATE;
  const tZugA = monatsBasis * T_ZUG_A_RATE;
  const tZugBRate = T_ZUG_B_RATES[tZugBPeriod];
  const tZugB = isAzubi
    ? grund * tZugBRate
    : tZugBBasis(getTable, tariffDate, tZugBPeriod) * tZugBRate;

  const urlaubProTag = urlaubstage > 0 ? monatsBasis * URLAUBSGELD_FAKTOR : 0;
  const urlaubGesamt = urlaubProTag * urlaubstage;

  const monat = monatsBasis + kinderZulage;
  const jahr = monat * 12 + mon13 + tGeld + tZugA + tZugB + urlaubGesamt;

  const breakdown = {
    grund35: euro(grund35),
    irwazHours,
    grund: euro(grund),
    kinderzulage: euro(kinderZulage),
    p13,
    mon13: euro(mon13),
    tGeld: euro(tGeld),
    tZugA: euro(tZugA),
    tZugB: euro(tZugB),
    urlaub: {
      entgeltProTag: euro(urlaubProTag),
      tage: urlaubstage,
      gesamt: euro(urlaubGesamt)
    }
  };
  if (!isAzubi) breakdown.bonus = euro(bonus);

  return {
    breakdown,
    totals: {
      monat: euro(monat),
      jahr: euro(jahr),
      durchschnittMonat: euro(jahr / 12)
    }
  };
}

module.exports = { calculate, CalculationError, mon13Prozent };
