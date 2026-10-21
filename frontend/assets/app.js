// Entgeltrechner – Frontend
// Aufbau: Konstanten · Formatierung · HTML-Templates · Speicher · API ·
//         Steuerelemente · Fachlogik · Rendering · Ablauf

// ==== Konstanten ====
const DEFAULTS = Object.freeze({
  irwazHours: 35,
  leistungsPct: 14,
  urlaubstage: 30,
  betriebsMonate: 36,
  tZugBPeriod: "until2025",
  eg: "EG05",
  stufe: "B",
  atType: "monat",
  atHours: "35"
});
const MAX_HOURS = 40;
const MAX_HOURS_AZUBI = 35;
/** Bei Auszubildenden ergibt sich die Betriebszugehörigkeit aus dem Ausbildungsjahr. */
const AZUBI_BETRIEBSMONATE = Object.freeze({ AJ1: 0, AJ2: 12, AJ3: 24, AJ4: 36 });
const STORAGE_KEYS = Object.freeze({
  theme: "theme",
  snapshot: "rechner.snapshot.v2",
  legacySnapshot: "rechner.snapshot.kpis"
});
const THEMES = ["auto", "dark", "light"];
const RECALC_DELAY_MS = 120;
const TOAST_DURATION_MS = 2200;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_AMOUNT_DIGITS = 9;

const isAzubiGroup = eg => eg.startsWith("AJ");

// ==== Formatierung ====
const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const fmt1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDelta = n => {
  const cents = Math.round(n * 100) / 100;
  return `${cents >= 0 ? "▲" : "▼"} ${fmtEUR.format(Math.abs(cents))}`;
};

/** "1.234,56" → 1234.56; leere oder ungültige Eingaben → NaN */
function parseGermanNumber(text) {
  const normalized = text.trim().replace(/\./g, "").replace(",", ".");
  return normalized ? Number(normalized) : NaN;
}

function localIsoDate(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ==== HTML-Templates ====
// Alle eingesetzten Werte werden escaped; nur verschachtelte html``-Fragmente bleiben unverändert.
class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

function html(strings, ...values) {
  const render = v => (v instanceof SafeHtml ? v.value : v == null || v === false ? "" : escapeHtml(v));
  return new SafeHtml(strings.reduce((out, str, i) => out + render(values[i - 1]) + str));
}

const signedAmount = n => html`<span class="${n >= 0 ? "pos" : "neg"}"><span class="icon">${n >= 0 ? "▲" : "▼"}</span> ${fmtEUR.format(Math.abs(n))}</span>`;

function tileTemplate(title, value, subtitle) {
  return html`
    <div class="tile">
      <h3>${title}</h3>
      <div class="big">${value}</div>
      ${subtitle ? html`<div class="micro muted">${subtitle}</div>` : ""}
    </div>`;
}

function resultTemplate({ breakdown: b, totals: t }) {
  const details = [`Grund: ${fmtEUR.format(b.grund)}`];
  if (b.bonus !== undefined) details.push(`Bonus: ${fmtEUR.format(b.bonus)}`);
  if (b.kinderzulage) details.push(`Zulage: ${fmtEUR.format(b.kinderzulage)}`);

  return html`
    <div class="subgrid">
      ${tileTemplate("Monat", fmtEUR.format(t.monat), details.join(" · "))}
      ${tileTemplate("Jahr", fmtEUR.format(t.jahr), `Ø Monat: ${fmtEUR.format(t.durchschnittMonat)}`)}
      <div class="tile">
        <h3>Zusatzzahlungen</h3>
        <ul class="list">
          <li>13. Monat (${b.p13} %): <strong>${fmtEUR.format(b.mon13)}</strong></li>
          <li>T-Geld (18,4 %): <strong>${fmtEUR.format(b.tGeld)}</strong></li>
          <li>T-ZUG A (27,5 %): <strong>${fmtEUR.format(b.tZugA)}</strong></li>
          <li>T-ZUG B: <strong>${fmtEUR.format(b.tZugB)}</strong></li>
        </ul>
      </div>
      <div class="tile">
        <h3>Urlaub</h3>
        <ul class="list">
          <li>Entgelt/Tag: <strong>${fmtEUR.format(b.urlaub.entgeltProTag)}</strong></li>
          <li>Gesamt (${b.urlaub.tage} Tage): <strong>${fmtEUR.format(b.urlaub.gesamt)}</strong></li>
        </ul>
      </div>
    </div>`;
}

function atComparisonTemplate(c) {
  const period = c.perMonth ? "Monat" : "Jahr";
  return html`
    <div class="tile">
      <h3>AT-Vergleich</h3>
      <ul class="list">
        <li>AT-Angebot (${c.basis} h):
          <span class="muted">Monat:</span> <strong>${fmtEUR.format(c.monat)}</strong>
          <span class="muted">Jahr:</span> <strong>${fmtEUR.format(c.jahr)}</strong>
        </li>
        <li>AT-Mindestentgelt (${c.basis} h):
          <span class="muted">${period}:</span> <strong>${fmtEUR.format(c.minimum)}</strong>
        </li>
        <li>
          <span class="icon ${c.meetsMinimum ? "pos" : "neg"}">${c.meetsMinimum ? "▲" : "▼"}</span>
          Angebot ${c.meetsMinimum ? "über" : "unter"} Mindestentgelt (${period})
        </li>
        <li>Tarif:
          <span class="muted">Monat:</span> <strong>${fmtEUR.format(c.tarif.monat)}</strong>
          <span class="muted">Jahr:</span> <strong>${fmtEUR.format(c.tarif.jahr)}</strong>
        </li>
        <li>Δ zum Tarif:
          <span class="muted">Monat:</span> ${signedAmount(c.deltaMonat)}
          <span class="muted">Jahr:</span> ${signedAmount(c.deltaJahr)}
        </li>
      </ul>
      <p class="hint small">Hinweis: AT-Angestellte haben keinen Anspruch auf tarifliche Leistungen (z. B. T-ZUG-Tage, besonderer Kündigungsschutz).</p>
    </div>`;
}

const errorTemplate = message => html`<div class="alert">Fehler: ${message}</div>`;

// ==== Browser-Speicher (kann z. B. im privaten Modus blockiert sein) ====
const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* nicht verfügbar */ }
  }
};

const SNAPSHOT_FIELDS = ["monat", "jahr", "durchschnittMonat"];
const isValidSnapshot = s => Boolean(s) && SNAPSHOT_FIELDS.every(k => Number.isFinite(s[k]));

function readSnapshot() {
  try {
    const snapshot = JSON.parse(storage.get(STORAGE_KEYS.snapshot));
    return isValidSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

function writeSnapshot(totals) {
  const snapshot = Object.fromEntries(SNAPSHOT_FIELDS.map(k => [k, totals[k]]));
  return storage.set(STORAGE_KEYS.snapshot, JSON.stringify(snapshot));
}

/** Übernimmt Snapshots aus Version ≤ 1.13, die formatierte Texte statt Zahlen enthielten. */
function migrateLegacySnapshot() {
  const raw = storage.get(STORAGE_KEYS.legacySnapshot);
  if (raw === null) return;
  storage.remove(STORAGE_KEYS.legacySnapshot);
  try {
    const old = JSON.parse(raw);
    const toNumber = s => parseGermanNumber(String(s).replace(/[^\d,.-]/g, ""));
    const snapshot = { monat: toNumber(old.month), jahr: toNumber(old.year), durchschnittMonat: toNumber(old.avg) };
    if (isValidSnapshot(snapshot) && !readSnapshot()) writeSnapshot(snapshot);
  } catch { /* defekter Altbestand wird verworfen */ }
}

// ==== API ====
async function requestJSON(url, { method = "GET", body } = {}) {
  const options = { method, headers: { Accept: "application/json" } };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    options.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw new Error(err.name === "TimeoutError" ? "Zeitüberschreitung der Anfrage" : "Server nicht erreichbar", { cause: err });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `${response.status} ${response.statusText}`.trim());
  if (data === null) throw new Error("Ungültige Antwort vom Server");
  return data;
}

const api = {
  health: () => requestJSON("/api/health"),
  tables: () => requestJSON("/api/tables"),
  table: key => requestJSON(`/api/tables/${encodeURIComponent(key)}`),
  calculate: input => requestJSON("/api/calc", { method: "POST", body: input })
};

// ==== Zustand & DOM ====
const state = {
  tableCache: new Map(), // Schlüssel → Promise der Tabellendaten
  table: null,           // aktuell gewählte Tabelle { table, atMin, azubiHint }
  lastTotals: null,      // Ergebnis der letzten erfolgreichen Berechnung
  calcSeq: 0,            // verwirft Antworten überholter Berechnungen
  azubiMode: false       // erkennt den Wechsel zwischen Ausbildung und Beschäftigung
};
let els;
let controls;
let toastTimer;

function getElements() {
  const ids = {
    form: "calculator-form",
    tariffDate: "tariffDate", azubiHint: "azubiHint",
    ausbildung: "ausbildung", kinderWrap: "kinderWrap", kinder: "eigeneKinder",
    eg: "egSelect", egLabel: "egLabel", stufeWrap: "stufeWrap", stufe: "stufeSelect",
    irwaz: "irwazHours", irwazRange: "irwazRange", irwazBadge: "irwazBadge",
    leistung: "leistungsPct", leistungRange: "leistungsRange", leistungBadge: "leistungBadge",
    urlaub: "urlaubstage", urlaubRange: "urlaubstageRange", urlaubBadge: "urlaubBadge",
    betriebs: "betriebsMonate", period: "tZugBPeriod",
    atCompare: "atCompare", atWrap: "atWrap", atAmount: "atAmount", atType: "atType",
    atHours: "atHours", atResult: "atCompareResult",
    result: "result",
    compareWrap: "compare",
    cmpNowMonth: "cmpNowMonth", cmpNowYear: "cmpNowYear", cmpNowAvg: "cmpNowAvg",
    cmpSnapMonth: "cmpSnapMonth", cmpSnapYear: "cmpSnapYear", cmpSnapAvg: "cmpSnapAvg",
    cmpDeltaMonth: "cmpDeltaMonth", cmpDeltaYear: "cmpDeltaYear", cmpDeltaAvg: "cmpDeltaAvg",
    resetBtn: "resetBtn", snapshotBtn: "snapshotBtn", clearSnapshotBtn: "clearSnapshotBtn",
    themeToggle: "themeToggle", status: "status", toast: "toast", version: "appVersion"
  };
  return Object.fromEntries(Object.entries(ids).map(([name, id]) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element #${id} fehlt im HTML`);
    return [name, el];
  }));
}

const setVisible = (el, visible) => el.classList.toggle("hidden", !visible);
const setHtml = (el, fragment) => { el.innerHTML = String(fragment); };
const isAzubiMode = () => els.ausbildung.value === "ja";

function replaceOptions(select, values, labelOf = v => v) {
  select.replaceChildren(...values.map(v => new Option(labelOf(v), v)));
}

/** Erster Kandidat, der in den Optionen vorkommt, sonst die erste Option. */
const pickOption = (candidates, options) => candidates.find(c => options.includes(c)) ?? options[0] ?? "";

function setStatus(text, kind = "") {
  els.status.textContent = text;
  els.status.className = kind ? `pill ${kind}` : "pill";
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), TOAST_DURATION_MS);
}

// ==== Steuerelemente ====
/**
 * Verknüpft Eingabefeld, Schieberegler und Badge zu einem Steuerelement.
 *
 * Das Eingabefeld ist bewusst ein Textfeld: Zahlenfelder verwerfen in manchen Browsern das
 * Dezimalkomma ("35,5" → "355"). Akzeptiert werden Komma und Punkt; Grenzen und Schrittweite
 * kommen vom Schieberegler. Unvollständige Eingaben (leer, "35,") werden toleriert und erst
 * beim Verlassen bereinigt. onChange wird nur bei Nutzereingaben ausgelöst; wer Werte per
 * set() ändert, rechnet selbst neu.
 */
function createLinkedInput({ field, range, badge, format, describe = format, integer = false, onChange }) {
  const parse = text => {
    const normalized = text.trim().replace(",", ".");
    return normalized === "" ? NaN : Number(normalized);
  };
  const clamp = value => {
    const v = integer ? Math.round(value) : Math.round(value * 100) / 100;
    return Math.min(Number(range.max), Math.max(Number(range.min), v));
  };
  let current = clamp(parse(field.value));

  const render = (value, { keepField = false, notify = false } = {}) => {
    const changed = value !== current;
    current = value;
    if (!keepField) field.value = String(value).replace(".", ",");
    range.value = String(value);
    badge.textContent = format(value);
    range.setAttribute("aria-valuetext", describe(value));
    if (notify && changed) onChange?.(value);
  };

  field.addEventListener("input", () => {
    const value = parse(field.value);
    if (!Number.isFinite(value)) return;
    const clamped = clamp(value);
    render(clamped, { keepField: clamped === value, notify: true });
  });
  field.addEventListener("change", () => {
    const value = parse(field.value);
    render(Number.isFinite(value) ? clamp(value) : current, { notify: true });
  });
  field.addEventListener("keydown", e => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = Number(range.step) || 1;
    render(clamp(current + (e.key === "ArrowUp" ? step : -step)), { notify: true });
  });
  range.addEventListener("input", () => render(clamp(Number(range.value)), { notify: true }));

  render(current);

  return {
    get value() { return current; },
    set(value) { render(clamp(value)); },
    setMax(max) {
      range.max = String(max);
      if (current > max) render(max);
    },
    setDisabled(disabled) {
      field.disabled = range.disabled = disabled;
    }
  };
}

function formatAmountInput(input) {
  const [intDigits = "", decimals] = input.value.replace(/[^0-9,]/g, "").split(",");
  const digits = intDigits.slice(0, MAX_AMOUNT_DIGITS);
  const int = digits ? Number(digits).toLocaleString("de-DE") : "";
  input.value = decimals === undefined ? int : `${int},${decimals.slice(0, 2)}`;
}

function finalizeAmountInput(input) {
  formatAmountInput(input);
  const value = parseGermanNumber(input.value);
  input.value = Number.isFinite(value) ? fmt2.format(value) : "";
}

function initTheme() {
  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  const stored = storage.get(STORAGE_KEYS.theme);
  let preference = THEMES.includes(stored) ? stored : "auto";

  const apply = () => {
    const effective = preference === "auto" ? (media?.matches ? "light" : "dark") : preference;
    document.documentElement.dataset.theme = effective;
    els.themeToggle.setAttribute("aria-label", `Theme umschalten (aktuell: ${preference})`);
  };

  apply();
  media?.addEventListener?.("change", () => { if (preference === "auto") apply(); });
  els.themeToggle.addEventListener("click", () => {
    preference = THEMES[(THEMES.indexOf(preference) + 1) % THEMES.length];
    storage.set(STORAGE_KEYS.theme, preference);
    apply();
    toast(`Theme: ${preference}`);
  });
}

// ==== Fachlogik ====
/** Aktuell gültige Tabelle (jüngster Gültigkeitsbeginn ≤ heute), sonst die erste. */
function pickDefaultTariff(tariffs, today = new Date()) {
  const iso = localIsoDate(today);
  const current = tariffs
    .filter(t => t.validFrom && t.validFrom <= iso)
    .reduce((best, t) => (!best || t.validFrom > best.validFrom ? t : best), null);
  return (current ?? tariffs[0])?.key ?? "";
}

function compareAtOffer({ amount, type, basis, atMin, totals }) {
  const minimum = atMin?.[basis];
  if (!Number.isFinite(amount) || amount <= 0 || !minimum || !totals) return null;
  const perMonth = type === "monat";
  const monat = perMonth ? amount : amount / 12;
  const jahr = perMonth ? amount * 12 : amount;
  return {
    basis,
    perMonth,
    monat,
    jahr,
    minimum: perMonth ? minimum.monat : minimum.jahr,
    meetsMinimum: perMonth ? monat >= minimum.monat : jahr >= minimum.jahr,
    deltaMonat: monat - totals.monat,
    deltaJahr: jahr - totals.jahr,
    tarif: totals
  };
}

function buildCalcInput() {
  if (!state.table || !els.eg.value) return null;
  return {
    tariffDate: els.tariffDate.value,
    eg: els.eg.value,
    stufe: els.stufe.value || undefined,
    irwazHours: controls.irwaz.value,
    leistungsPct: controls.leistung.value,
    urlaubstage: controls.urlaub.value,
    betriebsMonate: Number(els.betriebs.value),
    tZugBPeriod: els.period.value,
    eigeneKinder: els.kinder.value === "ja"
  };
}

// ==== Rendering ====
function renderEgOptions() {
  const table = state.table?.table ?? {};
  const azubi = isAzubiMode();
  const groups = Object.keys(table).filter(eg => isAzubiGroup(eg) === azubi).sort();
  const previous = els.eg.value;

  replaceOptions(els.eg, groups);
  els.eg.value = pickOption([previous, DEFAULTS.eg], groups);
  els.egLabel.textContent = azubi ? "Auszubildendenvergütung" : "Entgeltgruppe";
  renderStufeOptions();
}

function renderStufeOptions() {
  const group = state.table?.table?.[els.eg.value] ?? {};
  const stufen = Object.hasOwn(group, "salary") ? [] : Object.keys(group).sort();
  const previous = els.stufe.value;

  replaceOptions(els.stufe, stufen);
  els.stufe.value = pickOption([previous, DEFAULTS.stufe], stufen);
  setVisible(els.stufeWrap, stufen.length > 0);
}

/** Passt die Felder an Ausbildung/Beschäftigung an; Nutzereingaben bleiben ohne Moduswechsel erhalten. */
function applyEmploymentMode() {
  const azubi = isAzubiMode();
  const modeChanged = azubi !== state.azubiMode;
  state.azubiMode = azubi;

  // Leistungszulage ist für Auszubildende nicht vorgesehen
  controls.leistung.setDisabled(azubi);
  if (azubi) controls.leistung.set(0);
  else if (modeChanged) controls.leistung.set(DEFAULTS.leistungsPct);

  els.betriebs.disabled = azubi;
  if (azubi) {
    const monate = AZUBI_BETRIEBSMONATE[els.eg.value];
    if (monate !== undefined) els.betriebs.value = String(monate);
  } else if (modeChanged) {
    els.betriebs.value = String(DEFAULTS.betriebsMonate);
  }

  controls.irwaz.setMax(azubi ? MAX_HOURS_AZUBI : MAX_HOURS);

  setVisible(els.kinderWrap, azubi);
  if (!azubi) els.kinder.value = "nein";

  els.atCompare.disabled = azubi;
  if (azubi) els.atCompare.value = "nein";
  updateAtSection();

  const hint = azubi ? state.table?.azubiHint : null;
  els.azubiHint.textContent = hint ?? "";
  setVisible(els.azubiHint, Boolean(hint));
}

function updateAtSection() {
  setVisible(els.atWrap, els.atCompare.value === "ja");
  renderAtComparison();
}

function renderAtComparison() {
  const comparison = els.atCompare.value === "ja" && compareAtOffer({
    amount: parseGermanNumber(els.atAmount.value),
    type: els.atType.value,
    basis: els.atHours.value,
    atMin: state.table?.atMin,
    totals: state.lastTotals
  });
  setHtml(els.atResult, comparison ? atComparisonTemplate(comparison) : "");
  setVisible(els.atResult, Boolean(comparison));
}

function renderSnapshotComparison() {
  const snapshot = readSnapshot();
  setVisible(els.compareWrap, Boolean(snapshot));
  if (!snapshot) return;

  const now = state.lastTotals;
  const rows = [
    ["monat", els.cmpNowMonth, els.cmpSnapMonth, els.cmpDeltaMonth],
    ["jahr", els.cmpNowYear, els.cmpSnapYear, els.cmpDeltaYear],
    ["durchschnittMonat", els.cmpNowAvg, els.cmpSnapAvg, els.cmpDeltaAvg]
  ];
  for (const [key, nowEl, snapEl, deltaEl] of rows) {
    snapEl.textContent = fmtEUR.format(snapshot[key]);
    nowEl.textContent = now ? fmtEUR.format(now[key]) : "—";
    deltaEl.textContent = now ? formatDelta(now[key] - snapshot[key]) : "—";
  }
}

// ==== Ablauf ====
async function calculate() {
  const input = buildCalcInput();
  if (!input) return;

  const seq = ++state.calcSeq;
  setStatus("Berechne…", "muted");
  try {
    const result = await api.calculate(input);
    if (seq !== state.calcSeq) return;
    setHtml(els.result, resultTemplate(result));
    state.lastTotals = result.totals;
    setStatus("OK", "ok");
  } catch (err) {
    if (seq !== state.calcSeq) return;
    setHtml(els.result, errorTemplate(err.message));
    state.lastTotals = null;
    setStatus("Fehler", "err");
  }
  renderSnapshotComparison();
  renderAtComparison();
}

const scheduleCalc = debounce(calculate, RECALC_DELAY_MS);

function loadTable(key) {
  if (!state.tableCache.has(key)) {
    const promise = api.table(key).then(data => ({
      table: data.table ?? {},
      atMin: data.atMin ?? {},
      azubiHint: data.azubiHint ?? null
    }));
    promise.catch(() => state.tableCache.delete(key)); // Fehlschläge nicht cachen
    state.tableCache.set(key, promise);
  }
  return state.tableCache.get(key);
}

/** Lädt die gewählte Tabelle und baut die abhängigen Felder neu auf. */
async function selectTariff() {
  const key = els.tariffDate.value;
  if (!key) return false;
  let table;
  try {
    table = await loadTable(key);
  } catch {
    setStatus("Fehler beim Laden", "err");
    toast("Tarifdaten konnten nicht geladen werden");
    return false;
  }
  if (els.tariffDate.value !== key) return false; // inzwischen anderer Tarif gewählt
  state.table = table;
  renderEgOptions();
  applyEmploymentMode();
  return true;
}

async function loadTariffs() {
  const data = await api.tables();
  const tariffs = data.tables ?? data.keys.map(key => ({ key, label: key, validFrom: null }));
  if (tariffs.length === 0) throw new Error("keine Tabellen verfügbar");
  const labels = new Map(tariffs.map(t => [t.key, t.label || t.key]));
  replaceOptions(els.tariffDate, tariffs.map(t => t.key), key => labels.get(key));
  els.tariffDate.value = pickDefaultTariff(tariffs);
}

async function checkHealth() {
  try {
    const health = await api.health();
    if (health.version) els.version.textContent = health.version;
    setStatus("API OK", "ok");
  } catch {
    setStatus("API down", "err");
  }
}

function saveSnapshot() {
  if (!state.lastTotals) {
    toast("Noch kein Ergebnis vorhanden");
    return;
  }
  if (!writeSnapshot(state.lastTotals)) {
    toast("Snapshot konnte nicht gespeichert werden");
    return;
  }
  renderSnapshotComparison();
  toast("Snapshot gespeichert");
}

function clearSnapshot() {
  storage.remove(STORAGE_KEYS.snapshot);
  renderSnapshotComparison();
  toast("Snapshot gelöscht");
}

function resetForm() {
  els.ausbildung.value = "nein";
  renderEgOptions();
  applyEmploymentMode();

  controls.irwaz.set(DEFAULTS.irwazHours);
  controls.leistung.set(DEFAULTS.leistungsPct);
  controls.urlaub.set(DEFAULTS.urlaubstage);
  els.betriebs.value = String(DEFAULTS.betriebsMonate);
  els.period.value = DEFAULTS.tZugBPeriod;
  els.atCompare.value = "nein";
  els.atAmount.value = "";
  els.atType.value = DEFAULTS.atType;
  els.atHours.value = DEFAULTS.atHours;
  updateAtSection();

  calculate();
  toast("Formular zurückgesetzt");
}

function setupControls() {
  controls = {
    irwaz: createLinkedInput({
      field: els.irwaz, range: els.irwazRange, badge: els.irwazBadge,
      format: v => `${fmt1.format(v)} h`, describe: v => `${fmt1.format(v)} Stunden`,
      onChange: scheduleCalc
    }),
    leistung: createLinkedInput({
      field: els.leistung, range: els.leistungRange, badge: els.leistungBadge,
      format: v => `${fmt2.format(v)} %`, describe: v => `${fmt2.format(v)} Prozent`,
      onChange: scheduleCalc
    }),
    urlaub: createLinkedInput({
      field: els.urlaub, range: els.urlaubRange, badge: els.urlaubBadge,
      format: v => `${v} Tage`, integer: true,
      onChange: scheduleCalc
    })
  };
}

function bindEvents() {
  els.form.addEventListener("submit", e => e.preventDefault());

  els.tariffDate.addEventListener("change", async () => {
    if (await selectTariff()) calculate();
  });
  els.ausbildung.addEventListener("change", () => {
    renderEgOptions();
    applyEmploymentMode();
    calculate();
  });
  els.eg.addEventListener("change", () => {
    renderStufeOptions();
    applyEmploymentMode();
    calculate();
  });
  [els.stufe, els.kinder, els.betriebs, els.period].forEach(el => el.addEventListener("change", scheduleCalc));

  els.atCompare.addEventListener("change", updateAtSection);
  [els.atType, els.atHours].forEach(el => el.addEventListener("change", renderAtComparison));
  els.atAmount.addEventListener("input", () => {
    formatAmountInput(els.atAmount);
    renderAtComparison();
  });
  els.atAmount.addEventListener("blur", () => {
    finalizeAmountInput(els.atAmount);
    renderAtComparison();
  });

  els.resetBtn.addEventListener("click", resetForm);
  els.snapshotBtn.addEventListener("click", saveSnapshot);
  els.clearSnapshotBtn.addEventListener("click", clearSnapshot);
}

async function main() {
  els = getElements();
  initTheme();
  setupControls();
  bindEvents();
  migrateLegacySnapshot();
  renderSnapshotComparison();

  await checkHealth();
  try {
    await loadTariffs();
  } catch (err) {
    setStatus("Fehler beim Laden", "err");
    setHtml(els.result, errorTemplate(`Tarifdaten konnten nicht geladen werden (${err.message})`));
    return;
  }
  if (await selectTariff()) await calculate();
}

main().catch(err => {
  console.error(err);
  document.getElementById("status")?.replaceChildren("Fehler");
});
