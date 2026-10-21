"use strict";

const { z } = require("zod");

/** Erlaubte Tabellenschlüssel (= Dateiname ohne .json), z. B. "april2025". */
const TABLE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Entgeltgruppen EG01…EG99 sowie Ausbildungsjahre AJ1…AJ4. */
const EG_PATTERN = /^(EG\d{2}|AJ[1-4])$/;
/** Stufen innerhalb einer Entgeltgruppe, z. B. "A", "B", "C". */
const STUFE_PATTERN = /^[A-Z]$/;

const amount = z.number().positive();

/** Entgeltgruppe: entweder ein fester Betrag (salary) oder gestaffelt nach Stufen. */
const EntgeltgruppeSchema = z.union([
  z.object({ salary: amount }).strict(),
  z.record(z.string().regex(STUFE_PATTERN), amount)
    .refine(stufen => Object.keys(stufen).length > 0, "Entgeltgruppe ohne Stufen")
]);

const TableSchema = z.record(z.string().regex(EG_PATTERN), EntgeltgruppeSchema)
  .refine(table => Object.keys(table).length > 0, "Tabelle enthält keine Entgeltgruppen");

/** AT-Mindestentgelte je Stundenbasis ("35", "40"). */
const AtMinSchema = z.record(
  z.string().regex(/^\d{2}$/),
  z.object({ monat: amount, jahr: amount })
);

const TableFileObjectSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  validFrom: z.iso.date().optional(),
  azubiHint: z.string().min(1).max(500).optional(),
  table: TableSchema,
  atMin: AtMinSchema.optional().default({})
});

/**
 * Inhalt einer Datei in api/data/*.json.
 * Ältere Dateien ohne "table"-Hülle (nur die Entgeltgruppen) werden weiterhin akzeptiert.
 */
const TableFileSchema = z.preprocess(
  value => (value && typeof value === "object" && !Array.isArray(value) && !("table" in value))
    ? { table: value }
    : value,
  TableFileObjectSchema
);

/** Eingaben für POST /api/calc. */
const CalcInputSchema = z.object({
  tariffDate: z.string().regex(TABLE_KEY_PATTERN),
  eg: z.string().regex(EG_PATTERN),
  stufe: z.string().regex(STUFE_PATTERN).optional(), // nur bei gestaffelten Entgeltgruppen nötig
  irwazHours: z.number().min(0).max(40),
  leistungsPct: z.number().min(0).max(28),
  urlaubstage: z.number().int().min(0).max(36),
  betriebsMonate: z.number().int().min(0).max(480),
  tZugBPeriod: z.enum(["until2025", "from2026"]),
  eigeneKinder: z.boolean().optional().default(false)
});

module.exports = {
  TABLE_KEY_PATTERN,
  TableFileSchema,
  CalcInputSchema
};
