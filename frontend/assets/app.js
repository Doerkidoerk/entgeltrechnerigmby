// Robust gegen Lade-/Reihenfolgeprobleme
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const els = {
    tariffDate: $("tariffDate"), eg: $("egSelect"), stufeWrap: $("stufeWrap"), stufe: $("stufeSelect"),
    irwaz: $("irwazHours"), irwazRange: $("irwazRange"),
    leistung: $("leistungsPct"), leistungRange: $("leistungsRange"),
    uTage: $("urlaubstage"), uTageRange: $("urlaubstageRange"),
    betriebs: $("betriebsMonate"), period: $("tZugBPeriod"),
    status: $("status"), tablesInfo: $("tablesInfo"),
    irwazBadge: $("irwazBadge"), leistungBadge: $("leistungBadge"), urlaubBadge: $("urlaubBadge"),
    result: $("result"),
    calcBtn: $("calcBtn"), resetBtn: $("resetBtn"), snapshotBtn: $("snapshotBtn"), clearSnapshotBtn: $("clearSnapshotBtn"),
    compareWrap: $("compare"), cmpNowMonth: $("cmpNowMonth"), cmpNowYear: $("cmpNowYear"), cmpNowAvg: $("cmpNowAvg"),
    cmpSnapMonth: $("cmpSnapMonth"), cmpSnapYear: $("cmpSnapYear"), cmpSnapAvg: $("cmpSnapAvg"),
    cmpDeltaMonth: $("cmpDeltaMonth"), cmpDeltaYear: $("cmpDeltaYear"), cmpDeltaAvg: $("cmpDeltaAvg"),
    themeToggle: $("themeToggle"), toast: $("toast")
  };

  const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const fmtPct = n => Number(n).toFixed(2) + " %";
  const fmtHours = n => Number(n).toFixed(1) + " h";
  let lastTotals = null;

  // Helpers
  function setStatus(text, cls){ els.status.textContent = text; els.status.className = `pill ${cls||""}`.trim(); }
  function toast(msg){
    const t = els.toast; t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove("show"), 2200);
  }
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

  // Theme toggle
  (function(){
    const saved = localStorage.getItem("theme") || "auto";
    document.documentElement.setAttribute("data-theme", saved);
    els.themeToggle.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "auto";
      const next = cur === "auto" ? "dark" : cur === "dark" ? "light" : "auto";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      toast(`Theme: ${next}`);
    });
  })();

  // API
  async function fetchJSON(url) {
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  // Init
  (async function init(){
    try { await fetchJSON("/api/health"); setStatus("API OK","ok"); }
    catch { setStatus("API down","err"); }

    try {
      const meta = await fetchJSON("/api/tables");
      els.tablesInfo.textContent = `Tabellen: ${meta.keys.join(", ")||"—"}`;
      els.tariffDate.innerHTML = meta.keys.map(k=>`<option value="${k}">${k}</option>`).join("");
      els.tariffDate.value = meta.keys.includes("current") ? "current" : meta.keys[0] || "";
      await loadEGs();
    } catch(e){ console.error(e); els.tablesInfo.textContent = "Tabellen: —"; }

    // Slider <-> Number verknüpfen + Badges
    link(els.irwaz, els.irwazRange, v => els.irwazBadge.textContent = fmtHours(v));
    link(els.leistung, els.leistungRange, v => els.leistungBadge.textContent = fmtPct(v));
    link(els.uTage, els.uTageRange, v => els.urlaubBadge.textContent = `${Number(v)} Tage`);

    // Recalc on input (debounced)
    const recalc = debounce(calculate, 120);
    [els.tariffDate, els.eg, els.stufe, els.irwaz, els.irwazRange, els.leistung, els.leistungRange,
     els.uTage, els.uTageRange, els.betriebs, els.period]
     .forEach(el => el && el.addEventListener("input", recalc));

    els.tariffDate.addEventListener("change", async () => {
      const data = await fetch(`/api/tables/${encodeURIComponent(els.tariffDate.value)}`).then(r=>r.json());
      updateStufen(data.table); recalc();
    });
    els.eg.addEventListener("change", async () => {
      const data = await fetch(`/api/tables/${encodeURIComponent(els.tariffDate.value)}`).then(r=>r.json());
      updateStufen(data.table); recalc();
    });

    els.calcBtn.addEventListener("click", calculate);
    els.resetBtn.addEventListener("click", resetForm);
    els.snapshotBtn.addEventListener("click", saveSnapshot);
    els.clearSnapshotBtn.addEventListener("click", clearSnapshot);

    // First calc
    calculate();
  })();

  async function loadEGs() {
    if (!els.tariffDate.value) return;
    const data = await fetchJSON(`/api/tables/${encodeURIComponent(els.tariffDate.value)}`);
    const table = data.table || {};
    const egs = Object.keys(table).sort();
    els.eg.innerHTML = egs.map(k=>`<option value="${k}">${k}</option>`).join("");
    updateStufen(table);
  }

  function updateStufen(table){
    const egKey = els.eg.value;
    const egObj = (table && table[egKey]) || {};
    const hasSalary = Object.prototype.hasOwnProperty.call(egObj, "salary");
    const isAzubi = /^AJ/.test(egKey);
    if (hasSalary){ els.stufeWrap.classList.add("hidden"); els.stufe.innerHTML = ""; }
    else {
      els.stufeWrap.classList.remove("hidden");
      const stufen = Object.keys(egObj || {}).sort();
      els.stufe.innerHTML = stufen.map(s=>`<option value="${s}">${s}</option>`).join("");
    }
    // Leistungszulage bei Ausbildungsvergütung deaktivieren
    if (isAzubi){
      els.leistung.value = els.leistungRange.value = 0;
      els.leistung.disabled = true;
      els.leistungRange.disabled = true;
      els.leistungBadge.textContent = fmtPct(0);
    } else {
      els.leistung.disabled = false;
      els.leistungRange.disabled = false;
    }
  }

  function link(numberEl, rangeEl, onChange){
    if (!numberEl || !rangeEl) return;
    const clamp = (v,min,max)=>Math.min(max,Math.max(min,v));
    const sync = (from,to,min,max) => () => {
      let v = Number(from.value);
      if (!Number.isFinite(v)) v = 0;
      v = clamp(v, Number(min), Number(max));
      from.value = v; to.value = v;
      onChange && onChange(v);
    };
    numberEl.addEventListener("input", sync(numberEl, rangeEl, numberEl.min, numberEl.max));
    rangeEl.addEventListener("input", sync(rangeEl, numberEl, rangeEl.min, rangeEl.max));
    // Initial Badge
    onChange && onChange(numberEl.value);
  }

  async function calculate(){
    const payload = {
      tariffDate: els.tariffDate.value, eg: els.eg.value, stufe: els.stufe.value || undefined,
      irwazHours: Number(els.irwaz.value), leistungsPct: Number(els.leistung.value),
      urlaubstage: Number(els.uTage.value),
      betriebsMonate: Number(els.betriebs.value), tZugBPeriod: els.period.value
    };
    setStatus("Berechne…","muted");
    try{
      const r = await fetch("/api/calc",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      if (!r.ok){ const e = await r.json().catch(()=>({})); throw new Error(e.error || `HTTP ${r.status}`); }
      const data = await r.json();
      renderResult(data); maybeCompare(data);
      lastTotals = data.totals;
      setStatus("OK","ok");
    }catch(e){
      els.result.innerHTML = `<div class="alert">Fehler: ${e.message}</div>`;
      setStatus("Fehler","err");
    }
  }

  function renderResult(d){
    const b = d.breakdown, t = d.totals;
    els.result.innerHTML = `
      <div class="subgrid">
        <div class="tile"><h3>Monat</h3><div class="big">${fmtEUR.format(t.monat)}</div>
          <div class="micro muted">Grund: ${fmtEUR.format(b.grund)} · Bonus: ${fmtEUR.format(b.bonus)}</div></div>
        <div class="tile"><h3>Jahr</h3><div class="big">${fmtEUR.format(t.jahr)}</div>
          <div class="micro muted">Ø Monat: ${fmtEUR.format(t.durchschnittMonat)}</div></div>
        <div class="tile">
          <h3>Zusatz­zahlungen</h3>
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

  // Snapshot
  function currentPayload(){
    return {
      tariffDate: els.tariffDate.value, eg: els.eg.value, stufe: els.stufe.value || undefined,
      irwazHours: Number(els.irwaz.value), leistungsPct: Number(els.leistung.value),
      urlaubstage: Number(els.uTage.value),
      betriebsMonate: Number(els.betriebs.value), tZugBPeriod: els.period.value
    };
  }
  function saveSnapshot(){
    if (!lastTotals) return;
    localStorage.setItem("rechner.snapshot.kpis", JSON.stringify({
      month: fmtEUR.format(lastTotals.monat),
      year: fmtEUR.format(lastTotals.jahr),
      avg: fmtEUR.format(lastTotals.durchschnittMonat)
    }));
    toast("Snapshot gespeichert");
    maybeCompare();
  }
  function clearSnapshot(){
    localStorage.removeItem("rechner.snapshot.kpis");
    els.compareWrap.classList.add("hidden");
    toast("Snapshot gelöscht");
  }
  function maybeCompare(now){
    const snap = JSON.parse(localStorage.getItem("rechner.snapshot.kpis")||"null");
    if (!snap){ els.compareWrap.classList.add("hidden"); return; }
    els.compareWrap.classList.remove("hidden");
    els.cmpSnapMonth.textContent = snap.month; els.cmpSnapYear.textContent = snap.year; els.cmpSnapAvg.textContent = snap.avg;
    if (!now) return;
    const t = now.totals;
    els.cmpNowMonth.textContent = fmtEUR.format(t.monat);
    els.cmpNowYear.textContent  = fmtEUR.format(t.jahr);
    els.cmpNowAvg.textContent   = fmtEUR.format(t.durchschnittMonat);
    const p = s => Number(String(s).replace(/[^\d,.-]/g,'').replace(/\./g, '').replace(',', '.'));
    const dM = p(els.cmpNowMonth.textContent)-p(snap.month);
    const dY = p(els.cmpNowYear.textContent)-p(snap.year);
    const dA = p(els.cmpNowAvg.textContent)-p(snap.avg);
    const f = n => (n>=0?"▲ ":"▼ ")+fmtEUR.format(Math.abs(n));
    els.cmpDeltaMonth.textContent=f(dM); els.cmpDeltaYear.textContent=f(dY); els.cmpDeltaAvg.textContent=f(dA);
  }

  function resetForm(){
    els.irwaz.value = els.irwazRange.value = 35;
    els.leistung.value = els.leistungRange.value = 0;
    els.uTage.value = els.uTageRange.value = 30;
    els.urlaubBadge.textContent = `${Number(els.uTage.value)} Tage`;
    els.betriebs.value = "0";
    els.period.value = "until2025";
    calculate(); toast("Formular zurückgesetzt");
  }
});
