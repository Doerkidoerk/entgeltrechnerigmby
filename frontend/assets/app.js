const APP_VERSION = "1.11";
const TARIFF_ORDER = ["mai2024", "april2025", "april2026"];

// Robust gegen Lade-/Reihenfolgeprobleme
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const loginPanel = $("loginPanel"), loginUser = $("loginUser"), loginPass = $("loginPass"), loginBtn = $("loginBtn"), loginError = $("loginError"), appWrap = $("app");
  let authToken = localStorage.getItem("token") || "";
  let isAdmin = localStorage.getItem("isAdmin") === "1";
    const els = {
      tariffDate: $("tariffDate"), ausbildung: $("ausbildung"), kinderWrap: $("kinderWrap"), kinder: $("eigeneKinder"), eg: $("egSelect"), egLabel: $("egLabel"),
      stufeWrap: $("stufeWrap"), stufe: $("stufeSelect"),
      irwaz: $("irwazHours"), irwazRange: $("irwazRange"),
      leistung: $("leistungsPct"), leistungRange: $("leistungsRange"),
      uTage: $("urlaubstage"), uTageRange: $("urlaubstageRange"),
      betriebs: $("betriebsMonate"), period: $("tZugBPeriod"),
      status: $("status"), azubiHint: $("azubiHint"),
      irwazBadge: $("irwazBadge"), leistungBadge: $("leistungBadge"), urlaubBadge: $("urlaubBadge"),
      result: $("result"),
      resetBtn: $("resetBtn"), snapshotBtn: $("snapshotBtn"), clearSnapshotBtn: $("clearSnapshotBtn"),
      compareWrap: $("compare"), cmpNowMonth: $("cmpNowMonth"), cmpNowYear: $("cmpNowYear"), cmpNowAvg: $("cmpNowAvg"),
      cmpSnapMonth: $("cmpSnapMonth"), cmpSnapYear: $("cmpSnapYear"), cmpSnapAvg: $("cmpSnapAvg"),
      cmpDeltaMonth: $("cmpDeltaMonth"), cmpDeltaYear: $("cmpDeltaYear"), cmpDeltaAvg: $("cmpDeltaAvg"),
      atCompare: $("atCompare"), atWrap: $("atWrap"), atAmount: $("atAmount"), atType: $("atType"), atHours: $("atHours"),
      atResult: $("atCompareResult"),
      themeToggle: $("themeToggle"), toast: $("toast"), version: $("appVersion"),
      logoutBtn: $("logoutBtn"), adminLink: $("adminLink"), pwLink: $("pwChangeLink")
    };

  els.version.textContent = APP_VERSION;
  els.logoutBtn.addEventListener("click", logout);

    const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
    const fmtPct = n => Number(n).toFixed(2) + " %";
    const fmtHours = n => Number(n).toFixed(1) + " h";
    let atMin = {};
    let currentTable = {};
    let lastTotals = null;

  // Helpers
  function setStatus(text, cls){ els.status.textContent = text; els.status.className = `pill ${cls||""}`.trim(); }
  function toast(msg){
    const t = els.toast; t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove("show"), 2200);
  }
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

  const parseNumber = s => {
    const n = s.replace(/\./g, "").replace(",", ".");
    return n ? Number(n) : NaN;
  };
  function formatAtAmountInput(e){
    const el = e.target;
    let v = el.value.replace(/[^0-9,]/g, "");
    const parts = v.split(",");
    let int = parts[0] || "";
    let dec = parts[1] || "";
    if (dec.length > 2) dec = dec.slice(0, 2);
    int = int ? parseInt(int, 10).toLocaleString("de-DE") : "";
    el.value = dec ? `${int},${dec}` : int;
  }
  function finalizeAtAmount(e){
    formatAtAmountInput(e);
    const val = e.target.value;
    if (!val) return;
    const n = parseNumber(val);
    e.target.value = n.toLocaleString("de-DE", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }

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

  async function logout(){
    if (authToken) {
      try { await fetch("/api/logout", { method: "POST", headers: { "Authorization": `Bearer ${authToken}` } }); } catch {}
    }
    authToken = "";
    localStorage.removeItem("token");
    localStorage.removeItem("isAdmin");
    els.adminLink.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    appWrap.classList.add("hidden");
  }

  // API
  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, {
      ...opts,
      headers: {
        "Accept": "application/json",
        ...(opts.headers || {}),
        ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {})
      }
    });
    if (r.status === 401) {
      logout();
      throw new Error("Unauthorized");
    }
    if (!r.ok) {
      let msg = `${r.status} ${r.statusText}`;
      try { const e = await r.json(); msg = e.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  function formatTariffDate(k){
    const map = {
      mai2024: "01. Mai 2024",
      april2025: "01. April 2025",
      april2026: "01. April 2026"
    };
    return map[k] || k;
  }

  // Init
  async function init(){
    try { await fetchJSON("/api/health"); setStatus("API OK","ok"); }
    catch { setStatus("API down","err"); }

      try {
        const meta = await fetchJSON("/api/tables");
        const keys = meta.keys.slice().sort((a, b) => {
          const ia = TARIFF_ORDER.indexOf(a);
          const ib = TARIFF_ORDER.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.localeCompare(b);
        });
        els.tariffDate.innerHTML = keys.map(k=>`<option value="${k}">${formatTariffDate(k)}</option>`).join("");
        let def = "mai2024";
        const now = new Date();
        if (now >= new Date("2025-04-01") && now < new Date("2026-04-01")) def = "april2025";
        else if (now >= new Date("2026-04-01")) def = "april2026";
        if (!keys.includes(def)) def = keys[0] || "";
        els.tariffDate.value = def;
        await loadEGs();
        updateAzubiHint();
      } catch(e){ console.error(e); }

    // Slider <-> Number verknüpfen + Badges
    link(els.irwaz, els.irwazRange, v => els.irwazBadge.textContent = fmtHours(v));
    link(els.leistung, els.leistungRange, v => els.leistungBadge.textContent = fmtPct(v));
    link(els.uTage, els.uTageRange, v => els.urlaubBadge.textContent = `${Number(v)} Tage`);

    // Recalc on input (debounced)
    const recalc = debounce(calculate, 120);
    [els.tariffDate, els.ausbildung, els.kinder, els.eg, els.stufe, els.irwaz, els.irwazRange, els.leistung, els.leistungRange,
     els.uTage, els.uTageRange, els.betriebs, els.period]
     .forEach(el => el && el.addEventListener("input", recalc));

      els.tariffDate.addEventListener("change", async () => {
        await loadEGs();
        updateAzubiHint();
        recalc();
      });
      els.eg.addEventListener("change", () => {
        updateStufen(currentTable);
        updateBetriebsFromAJ();
        recalc();
      });
      els.ausbildung.addEventListener("change", async () => {
        await loadEGs();
        updateAzubiHint();
        recalc();
      });

    [els.atType, els.atHours].forEach(el => el && el.addEventListener("input", renderATComparison));
    if (els.atAmount) {
      els.atAmount.addEventListener("input", e => {
        formatAtAmountInput(e);
        renderATComparison();
      });
      els.atAmount.addEventListener("blur", finalizeAtAmount);
    }
    els.atCompare.addEventListener("change", () => {
      if (els.atCompare.value === "ja") {
        els.atWrap.classList.remove("hidden");
      } else {
        els.atWrap.classList.add("hidden");
        els.atResult.classList.add("hidden");
      }
      renderATComparison();
    });

    els.resetBtn.addEventListener("click", resetForm);
    els.snapshotBtn.addEventListener("click", saveSnapshot);
    els.clearSnapshotBtn.addEventListener("click", clearSnapshot);

    // First calc
    calculate();
  }

  async function startApp(){
    loginPanel.classList.add("hidden");
    appWrap.classList.remove("hidden");
    if (isAdmin) els.adminLink.classList.remove("hidden");
    try {
      await init();
    } catch {
      loginPanel.classList.remove("hidden");
      appWrap.classList.add("hidden");
      authToken = "";
      localStorage.removeItem("token");
    }
  }

  async function handleLogin(){
    loginError.textContent = "";
    if (location.protocol !== 'https:') {
      loginError.textContent = 'HTTPS erforderlich';
      return;
    }
    try {
      const res = await fetchJSON("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser.value, password: loginPass.value })
      });
      authToken = res.token;
      localStorage.setItem("token", authToken);
      localStorage.setItem("isAdmin", res.isAdmin ? "1" : "0");
      isAdmin = res.isAdmin;
      if (res.mustChangePassword) {
        window.location.href = "/change-password.html";
        return;
      }
      await startApp();
    } catch(e) {
      loginError.textContent = "Login fehlgeschlagen";
    }
  }

  if (authToken) {
    startApp();
  } else {
    loginPanel.classList.remove("hidden");
  }
  loginBtn.addEventListener("click", handleLogin);

    async function loadEGs() {
      if (!els.tariffDate.value) return;
      const data = await fetchJSON(`/api/tables/${encodeURIComponent(els.tariffDate.value)}`);
      currentTable = data.table || {};
      atMin = data.atMin || {};
      const table = currentTable;
      const prevEg = els.eg.value;
      const prevStufe = els.stufe.value;
      let egs = Object.keys(table).sort();
    if (els.ausbildung.value === "ja") {
      egs = egs.filter(k=>/^AJ/.test(k));
      els.egLabel.textContent = "Auszubildendenvergütung";
    } else {
      egs = egs.filter(k=>!/^AJ/.test(k));
      els.egLabel.textContent = "Entgeltgruppe";
    }
    els.eg.innerHTML = egs.map(k=>`<option value="${k}">${k}</option>`).join("");
    let egVal = prevEg && egs.includes(prevEg) ? prevEg : (egs.includes("EG05") ? "EG05" : egs[0]);
    els.eg.value = egVal;
    updateStufen(table);
    if (els.stufe.options.length){
      const options = Array.from(els.stufe.options).map(o=>o.value);
      if (prevStufe && options.includes(prevStufe)){
        els.stufe.value = prevStufe;
      } else if (options.includes("B")){
        els.stufe.value = "B";
      }
    }
      updateBetriebsFromAJ();
      updateAusbildungSettings();
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
      els.leistung.value = els.leistungRange.value = 14;
      els.leistungBadge.textContent = fmtPct(14);
    }
  }

  function updateBetriebsFromAJ(){
    if (els.ausbildung.value === "ja"){
      const map = { AJ1:0, AJ2:12, AJ3:24, AJ4:36 };
      const v = map[els.eg.value];
      if (v !== undefined){
        els.betriebs.value = String(v);
      }
      els.betriebs.disabled = true;
    } else {
      els.betriebs.disabled = false;
      els.betriebs.value = "36";
    }
  }

  function updateAzubiHint(){
    if (els.ausbildung.value === "ja" && els.tariffDate.value === "april2025"){
      els.azubiHint.classList.remove("hidden");
    } else {
      els.azubiHint.classList.add("hidden");
    }
  }

  function updateAusbildungSettings(){
    const isAzubi = els.ausbildung.value === "ja";
    const max = isAzubi ? 35 : 40;
    els.irwaz.max = els.irwazRange.max = max;
    if (Number(els.irwaz.value) > max){
      els.irwaz.value = els.irwazRange.value = max;
      els.irwazBadge.textContent = fmtHours(max);
    }
    if (isAzubi){
      els.atCompare.value = "nein";
      els.atCompare.disabled = true;
      els.atWrap.classList.add("hidden");
      els.atResult.classList.add("hidden");
      els.kinderWrap.classList.remove("hidden");
    } else {
      els.atCompare.disabled = false;
      els.kinderWrap.classList.add("hidden");
      els.kinder.value = "nein";
    }
  }

  function link(numberEl, rangeEl, onChange){
    if (!numberEl || !rangeEl) return;
    const clamp = (v,min,max)=>Math.min(max,Math.max(min,v));
    const sync = (from,to) => () => {
      let v = Number(from.value);
      if (!Number.isFinite(v)) v = 0;
      const min = Number(from.min);
      const max = Number(from.max);
      v = clamp(v, min, max);
      from.value = v; to.value = v;
      onChange && onChange(v);
    };
    numberEl.addEventListener("input", sync(numberEl, rangeEl));
    rangeEl.addEventListener("input", sync(rangeEl, numberEl));
    // Initial Badge
    onChange && onChange(numberEl.value);
  }

  async function calculate(){
    const payload = {
      tariffDate: els.tariffDate.value, eg: els.eg.value, stufe: els.stufe.value || undefined,
      irwazHours: Number(els.irwaz.value), leistungsPct: Number(els.leistung.value),
      urlaubstage: Number(els.uTage.value),
      betriebsMonate: Number(els.betriebs.value), tZugBPeriod: els.period.value,
      eigeneKinder: els.kinder.value === "ja"
    };
    setStatus("Berechne…","muted");
    try{
      const data = await fetchJSON("/api/calc",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      renderResult(data); maybeCompare(data);
      lastTotals = data.totals;
      renderATComparison();
      setStatus("OK","ok");
    }catch(e){
      els.result.innerHTML = `<div class="alert">Fehler: ${e.message}</div>`;
      setStatus("Fehler","err");
    }
  }

  function renderResult(d){
    const b = d.breakdown, t = d.totals;
    const bonusTxt = b.bonus !== undefined ? ` · Bonus: ${fmtEUR.format(b.bonus)}` : "";
    const kinderTxt = b.kinderzulage ? ` · Zulage: ${fmtEUR.format(b.kinderzulage)}` : "";
    els.result.innerHTML = `
      <div class="subgrid">
        <div class="tile"><h3>Monat</h3><div class="big">${fmtEUR.format(t.monat)}</div>
          <div class="micro muted">Grund: ${fmtEUR.format(b.grund)}${bonusTxt}${kinderTxt}</div></div>
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

  async function renderATComparison(){
    if (els.atCompare.value !== "ja"){
      els.atResult.classList.add("hidden");
      return;
    }
    if (!lastTotals){
      await calculate();
      return;
    }
    const amount = parseNumber(els.atAmount.value);
    if (!Number.isFinite(amount) || amount <= 0){
      els.atResult.classList.add("hidden");
      return;
    }
    const isMon = els.atType.value === "monat";
    const monat = isMon ? amount : amount / 12;
    const jahr = isMon ? amount * 12 : amount;
    const basis = els.atHours.value;
    const min = atMin?.[basis];
    if (!min){
      els.atResult.classList.add("hidden");
      return;
    }
    const diffIcon = n => `<span class="icon">${n >= 0 ? "▲" : "▼"}</span>`;
    const diffVal = n => fmtEUR.format(Math.abs(n));
    const minOk = isMon ? monat >= min.monat : jahr >= min.jahr;
    const dMonat = monat - lastTotals.monat;
    const dJahr = jahr - lastTotals.jahr;
    els.atResult.innerHTML = `
      <div class="tile">
        <h3>AT-Vergleich</h3>
        <ul class="list">
          <li>AT-Angebot (${basis} h):
            <span class="muted">Monat:</span> <strong>${fmtEUR.format(monat)}</strong>
            <span class="muted">Jahr:</span> <strong>${fmtEUR.format(jahr)}</strong>
          </li>
          <li>AT-Mindestentgelt (${basis} h):
            <span class="muted">${isMon ? "Monat" : "Jahr"}:</span>
            <strong>${fmtEUR.format(isMon ? min.monat : min.jahr)}</strong>
          </li>
          <li>
            ${minOk
              ? `<span class="icon pos">▲</span> Angebot über Mindestentgelt (${isMon ? "Monat" : "Jahr"})`
              : `<span class="icon neg">▼</span> Angebot unter Mindestentgelt (${isMon ? "Monat" : "Jahr"})`}
          </li>
          <li>Tarif:
            <span class="muted">Monat:</span> <strong>${fmtEUR.format(lastTotals.monat)}</strong>
            <span class="muted">Jahr:</span> <strong>${fmtEUR.format(lastTotals.jahr)}</strong>
          </li>
          <li>Δ zum Tarif:
            <span class="muted">Monat:</span>
            <span class="${dMonat>=0?"pos":"neg"}">${diffIcon(dMonat)} ${diffVal(dMonat)}</span>
            <span class="muted">Jahr:</span>
            <span class="${dJahr>=0?"pos":"neg"}">${diffIcon(dJahr)} ${diffVal(dJahr)}</span>
          </li>
        </ul>
        <p class="hint small">Hinweis: AT-Angestellte haben keinen Anspruch auf tarifliche Leistungen (z. B. T-ZUG-Tage, besonderer Kündigungsschutz).</p>
      </div>`;
    els.atResult.classList.remove("hidden");
  }

  // Snapshot
  function currentPayload(){
    return {
      tariffDate: els.tariffDate.value, eg: els.eg.value, stufe: els.stufe.value || undefined,
      irwazHours: Number(els.irwaz.value), leistungsPct: Number(els.leistung.value),
      urlaubstage: Number(els.uTage.value),
      betriebsMonate: Number(els.betriebs.value), tZugBPeriod: els.period.value,
      eigeneKinder: els.kinder.value === "ja"
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
    maybeCompare({ totals: lastTotals });
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

  async function resetForm(){
    els.irwaz.value = els.irwazRange.value = 35;
    els.leistung.value = els.leistungRange.value = 14;
    els.leistungBadge.textContent = fmtPct(14);
    els.uTage.value = els.uTageRange.value = 30;
    els.urlaubBadge.textContent = `${Number(els.uTage.value)} Tage`;
    els.betriebs.value = "36";
    els.period.value = "until2025";
    els.ausbildung.value = "nein";
    els.kinder.value = "nein";
    els.kinderWrap.classList.add("hidden");
    els.atCompare.value = "nein";
    els.atWrap.classList.add("hidden");
    els.atAmount.value = "";
    els.atType.value = "monat";
    els.atHours.value = "35";
    els.atResult.classList.add("hidden");
    await loadEGs();
    updateAzubiHint();
    calculate();
    toast("Formular zurückgesetzt");
  }
});
