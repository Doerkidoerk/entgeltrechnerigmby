const APP_VERSION = "2.0";
const TARIFF_ORDER = ["mai2024", "april2025", "april2026"];

// Robust gegen Lade-/Reihenfolgeprobleme
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
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
    appRoot: $("app"),
    themeToggle: $("themeToggle"), toast: $("toast"), version: $("appVersion"),
    authView: $("authView"), authTitle: $("authTitle"), authError: $("authError"),
    loginForm: $("loginForm"), loginUsername: $("loginUsername"), loginPassword: $("loginPassword"),
    registerForm: $("registerForm"), registerUsername: $("registerUsername"), registerPassword: $("registerPassword"), registerCode: $("registerCode"),
    showRegister: $("showRegister"), showLogin: $("showLogin"),
    userControls: $("userControls"), userBadge: $("userBadge"), logoutBtn: $("logoutBtn"), accountBtn: $("accountBtn"),
    accountPanel: $("accountPanel"), passwordForm: $("passwordForm"), currentPassword: $("currentPassword"), newPassword: $("newPassword"), passwordCancel: $("passwordCancel"), passwordMessage: $("passwordMessage"),
    adminPanel: $("adminPanel"), adminRefreshBtn: $("adminRefreshBtn"), adminMessage: $("adminMessage"),
    userCreateForm: $("userCreateForm"), userCreateName: $("userCreateName"), userCreatePassword: $("userCreatePassword"), userCreateRole: $("userCreateRole"), userCreateMustChange: $("userCreateMustChange"),
    userTableBody: $("userTableBody"),
    inviteForm: $("inviteForm"), inviteRole: $("inviteRole"), inviteExpires: $("inviteExpires"), inviteNote: $("inviteNote"), inviteTableBody: $("inviteTableBody")
  };

  els.version.textContent = APP_VERSION;

  const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const fmtPct = n => Number(n).toFixed(2) + " %";
  const fmtHours = n => Number(n).toFixed(1) + " h";
  let atMin = {};
  let currentTable = {};
  let lastTotals = null;
  let csrfToken = null;
  let currentUser = null;
  let calculatorReady = false;
  let adminUsers = [];
  let adminInvites = [];

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

  els.loginForm?.addEventListener("submit", handleLoginSubmit);
  els.registerForm?.addEventListener("submit", handleRegisterSubmit);
  els.showRegister?.addEventListener("click", () => switchAuthMode("register"));
  els.showLogin?.addEventListener("click", () => switchAuthMode("login"));
  els.logoutBtn?.addEventListener("click", handleLogoutClick);
  els.accountBtn?.addEventListener("click", () => toggleAccountPanel());
  els.passwordCancel?.addEventListener("click", () => toggleAccountPanel(false));
  els.passwordForm?.addEventListener("submit", handlePasswordSubmit);
  els.adminRefreshBtn?.addEventListener("click", loadAdminData);
  els.userCreateForm?.addEventListener("submit", handleUserCreate);
  els.inviteForm?.addEventListener("submit", handleInviteCreate);
  els.userTableBody?.addEventListener("click", handleUserTableClick);
  els.inviteTableBody?.addEventListener("click", handleInviteTableClick);
  switchAuthMode("login");

  async function fetchJSON(url, opts = {}) {
    const options = { ...opts };
    options.method = (options.method || "GET").toUpperCase();
    options.credentials = "include";

    const headers = {
      "Accept": "application/json",
      ...(options.headers || {})
    };

    if (options.body && !(options.body instanceof FormData) && typeof options.body === "object") {
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      if (headers["Content-Type"].includes("application/json")) {
        options.body = JSON.stringify(options.body);
      }
    }

    if (!("headers" in options) || options.headers !== headers) {
      options.headers = headers;
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(options.method)) {
      try {
        const token = await ensureCsrfToken();
        headers["X-CSRF-Token"] = token;
      } catch (err) {
        console.error("CSRF Token fehlgeschlagen", err);
      }
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      throw new Error("Netzwerkfehler: " + error.message);
    }

    let payload = null;
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch (error) {
        if (response.ok) {
          payload = null;
        }
      }
    }

    if (response.status === 401) {
      handleUnauthenticated();
      throw new Error(payload?.error || "Anmeldung erforderlich.");
    }

    if (!response.ok) {
      const message = payload?.error || `${response.status} ${response.statusText}`;
      const err = new Error(message);
      err.status = response.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  async function ensureCsrfToken(force = false) {
    if (!force && csrfToken) {
      return csrfToken;
    }
    try {
      const res = await fetch("/api/auth/csrf", { credentials: "include" });
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      csrfToken = data?.csrfToken || null;
    } catch (err) {
      csrfToken = null;
      console.error("CSRF-Anforderung fehlgeschlagen", err);
      throw err;
    }
    return csrfToken;
  }

  function handleUnauthenticated() {
    currentUser = null;
    calculatorReady = false;
    adminUsers = [];
    adminInvites = [];
    els.appRoot?.classList.add("hidden");
    els.accountPanel?.classList.add("hidden");
    els.adminPanel?.classList.add("hidden");
    els.authView?.classList.remove("hidden");
    els.userControls?.classList.add("hidden");
    setStatus("Nicht angemeldet", "err");
    switchAuthMode("login");
  }

  function updateUserBadge() {
    if (!currentUser) {
      els.userBadge.textContent = "Nicht angemeldet";
      els.userBadge.className = "pill muted";
      return;
    }
    const roleLabel = currentUser.role === "admin" ? "Administrator" : "Benutzer";
    els.userBadge.textContent = `${currentUser.username} · ${roleLabel}`;
    const cls = currentUser.role === "admin" ? "pill ok" : "pill";
    els.userBadge.className = cls;
  }

  function formatTariffDate(k){
    const map = {
      mai2024: "01. Mai 2024",
      april2025: "01. April 2025",
      april2026: "01. April 2026"
    };
    return map[k] || k;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  }

  function formatTimestamp(value) {
    if (!value) return "–";
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "–";
      return date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return "–";
    }
  }

  function switchAuthMode(mode) {
    const isRegister = mode === "register";
    els.authTitle.textContent = isRegister ? "Registrierung" : "Anmeldung";
    els.loginForm.classList.toggle("hidden", isRegister);
    els.registerForm.classList.toggle("hidden", !isRegister);
    els.showRegister.classList.toggle("hidden", isRegister);
    els.showLogin.classList.toggle("hidden", !isRegister);
    els.authError.classList.add("hidden");
    if (isRegister) {
      els.registerUsername.focus();
    } else {
      els.loginUsername.focus();
    }
  }

  function resetAuthForms() {
    els.loginForm.reset();
    els.registerForm.reset();
    els.authError.classList.add("hidden");
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const username = els.loginUsername.value.trim();
    const password = els.loginPassword.value;
    if (!username || !password) {
      els.authError.textContent = "Bitte Benutzername und Passwort eingeben.";
      els.authError.classList.remove("hidden");
      return;
    }
    try {
      const data = await fetchJSON("/api/auth/login", {
        method: "POST",
        body: { username, password }
      });
      els.authError.classList.add("hidden");
      els.loginPassword.value = "";
      currentUser = data?.user || null;
      await ensureCsrfToken(true);
      resetAuthForms();
      await showApp();
      toast(`Angemeldet als ${currentUser.username}`);
    } catch (err) {
      els.authError.textContent = err.message || "Anmeldung fehlgeschlagen.";
      els.authError.classList.remove("hidden");
      setStatus("Anmeldung fehlgeschlagen", "err");
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    const username = els.registerUsername.value.trim();
    const password = els.registerPassword.value;
    const inviteCode = els.registerCode.value.trim();
    if (!username || !password || !inviteCode) {
      els.authError.textContent = "Bitte alle Felder ausfüllen.";
      els.authError.classList.remove("hidden");
      return;
    }
    try {
      const data = await fetchJSON("/api/auth/register", {
        method: "POST",
        body: { username, password, inviteCode }
      });
      els.authError.classList.add("hidden");
      currentUser = data?.user || null;
      await ensureCsrfToken(true);
      resetAuthForms();
      await showApp();
      toast(`Willkommen ${currentUser.username}!`);
    } catch (err) {
      els.authError.textContent = err.message || "Registrierung fehlgeschlagen.";
      els.authError.classList.remove("hidden");
      setStatus("Registrierung fehlgeschlagen", "err");
    }
  }

  async function handleLogoutClick() {
    try {
      await fetchJSON("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Logout-Fehler", err);
    }
    await ensureCsrfToken(true).catch(() => {});
    resetAuthForms();
    handleUnauthenticated();
    toast("Abgemeldet.");
  }

  function toggleAccountPanel(show) {
    const shouldShow = typeof show === "boolean" ? show : els.accountPanel.classList.contains("hidden");
    if (shouldShow) {
      els.accountPanel.classList.remove("hidden");
      els.currentPassword?.focus();
    } else {
      els.accountPanel.classList.add("hidden");
      els.passwordForm.reset();
      els.passwordMessage.textContent = "";
      els.passwordMessage.className = "small muted";
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const currentPassword = els.currentPassword?.value || "";
    const newPassword = els.newPassword?.value || "";
    if (!currentPassword || !newPassword) {
      els.passwordMessage.textContent = "Bitte beide Felder ausfüllen.";
      els.passwordMessage.className = "small error-text";
      return;
    }
    try {
      await fetchJSON("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword }
      });
      els.passwordMessage.textContent = "Passwort aktualisiert.";
      els.passwordMessage.className = "small ok-text";
      els.passwordForm.reset();
      await ensureCsrfToken(true);
      toast("Passwort geändert.");
      if (currentUser) {
        currentUser.mustChangePassword = false;
      }
    } catch (err) {
      els.passwordMessage.textContent = err.message || "Aktualisierung fehlgeschlagen.";
      els.passwordMessage.className = "small error-text";
    }
  }

  async function refreshSession() {
    try {
      const data = await fetchJSON("/api/auth/session");
      if (data?.authenticated) {
        currentUser = data.user;
        await showApp();
        return;
      }
    } catch (err) {
      console.warn("Session-Check fehlgeschlagen", err);
    }
    handleUnauthenticated();
  }

  async function showApp() {
    if (!currentUser) {
      handleUnauthenticated();
      return;
    }
    els.authView.classList.add("hidden");
    els.appRoot.classList.remove("hidden");
    els.userControls.classList.remove("hidden");
    updateUserBadge();
    toggleAccountPanel(false);
    setStatus("Angemeldet", "ok");
    if (!calculatorReady) {
      await initCalculator();
      calculatorReady = true;
    } else {
      await loadEGs();
      calculate();
    }
    setStatus("Angemeldet", "ok");
    if (currentUser.mustChangePassword) {
      toggleAccountPanel(true);
      toast("Bitte Passwort aktualisieren.");
    }
    if (currentUser.role === "admin") {
      els.adminPanel.classList.remove("hidden");
      await loadAdminData();
    } else {
      els.adminPanel.classList.add("hidden");
    }
  }

  function setAdminMessage(text, variant = "muted") {
    if (!els.adminMessage) return;
    els.adminMessage.textContent = text || "";
    els.adminMessage.className = `small ${variant === "error" ? "error-text" : "muted"}`;
  }

  async function loadAdminData() {
    if (!currentUser || currentUser.role !== "admin") return;
    try {
      setAdminMessage("Lade Daten…", "muted");
      const [usersRes, invitesRes] = await Promise.all([
        fetchJSON("/api/admin/users"),
        fetchJSON("/api/admin/invites")
      ]);
      adminUsers = Array.isArray(usersRes?.users) ? usersRes.users : [];
      adminInvites = Array.isArray(invitesRes?.invites) ? invitesRes.invites : [];
      renderUserTable(adminUsers);
      renderInviteTable(adminInvites);
      setAdminMessage(`Aktualisiert: ${new Date().toLocaleTimeString("de-DE")}`);
    } catch (err) {
      console.error("Admin laden fehlgeschlagen", err);
      setAdminMessage(err.message || "Fehler beim Laden", "error");
    }
  }

  function renderUserTable(users) {
    if (!els.userTableBody) return;
    els.userTableBody.innerHTML = users.map(user => {
      const roleTag = `<span class="tag ${user.role === "admin" ? "ok" : "info"}">${escapeHtml(user.role)}</span>`;
      const locked = user.locked ? "Gesperrt" : "Aktiv";
      const statusFragments = [];
      statusFragments.push(`<span class="tag ${user.locked ? "err" : "ok"}">${locked}</span>`);
      if (user.mustChangePassword) {
        statusFragments.push('<span class="tag info">Passwortwechsel erforderlich</span>');
      }
      const actions = [];
      const isSelf = currentUser && user.id === currentUser.id;
      actions.push(`<button type="button" class="btn ghost admin-action" data-action="toggle-lock" ${isSelf ? "disabled" : ""}>${user.locked ? "Entsperren" : "Sperren"}</button>`);
      actions.push(`<button type="button" class="btn ghost admin-action" data-action="toggle-role" ${isSelf ? "disabled" : ""}>${user.role === "admin" ? "Zu Benutzer" : "Zu Admin"}</button>`);
      actions.push(`<button type="button" class="btn ghost admin-action" data-action="reset-password">Passwort zurücksetzen</button>`);
      actions.push(`<button type="button" class="btn ghost admin-action" data-action="delete" ${isSelf ? "disabled" : ""}>Löschen</button>`);
      return `<tr data-user-id="${escapeHtml(user.id)}">
        <td>${escapeHtml(user.username)}</td>
        <td>${roleTag}</td>
        <td>${statusFragments.join(" ")}</td>
        <td>${formatTimestamp(user.lastLoginAt)}</td>
        <td class="actions">${actions.join("")}</td>
      </tr>`;
    }).join("");
  }

  function renderInviteTable(invites) {
    if (!els.inviteTableBody) return;
    els.inviteTableBody.innerHTML = invites.map(inv => {
      const isUsed = Boolean(inv.usedAt);
      const isExpired = Boolean(inv.expired);
      let status = "Aktiv";
      let statusClass = "tag ok";
      if (isUsed) {
        status = inv.usedBy ? `Verwendet (${escapeHtml(inv.usedBy)})` : "Verwendet";
        statusClass = "tag info";
      } else if (isExpired) {
        status = "Abgelaufen";
        statusClass = "tag err";
      }
      const actions = [];
      actions.push(`<button type="button" class="btn ghost admin-invite" data-action="copy">Kopieren</button>`);
      actions.push(`<button type="button" class="btn ghost admin-invite" data-action="delete">Löschen</button>`);
      return `<tr data-invite-code="${escapeHtml(inv.code)}">
        <td><code>${escapeHtml(inv.code)}</code></td>
        <td><span class="tag info">${escapeHtml(inv.role)}</span></td>
        <td>${inv.expiresAt ? formatTimestamp(inv.expiresAt) : "Ohne Ablauf"}</td>
        <td><span class="${statusClass}">${status}</span></td>
        <td class="actions">${actions.join("")}</td>
      </tr>`;
    }).join("");
  }

  async function handleUserCreate(event) {
    event.preventDefault();
    if (!currentUser || currentUser.role !== "admin") return;
    const username = els.userCreateName.value.trim();
    const password = els.userCreatePassword.value;
    const role = els.userCreateRole.value;
    const mustChangePassword = Boolean(els.userCreateMustChange.checked);
    if (!username || !password) {
      setAdminMessage("Benutzername und Passwort erforderlich.", "error");
      return;
    }
    try {
      await fetchJSON("/api/admin/users", {
        method: "POST",
        body: { username, password, role, mustChangePassword }
      });
      els.userCreateForm.reset();
      setAdminMessage(`Benutzer ${username} angelegt.`);
      await loadAdminData();
    } catch (err) {
      console.error("Benutzer anlegen fehlgeschlagen", err);
      setAdminMessage(err.message || "Anlegen fehlgeschlagen", "error");
    }
  }

  async function handleInviteCreate(event) {
    event.preventDefault();
    if (!currentUser || currentUser.role !== "admin") return;
    const role = els.inviteRole.value;
    const expires = Number(els.inviteExpires.value) || 72;
    const note = els.inviteNote.value.trim();
    try {
      const invite = await fetchJSON("/api/admin/invites", {
        method: "POST",
        body: { role, expiresInHours: expires, note }
      });
      const code = invite?.invite?.code;
      if (code) {
        try { await navigator.clipboard.writeText(code); toast("Einladungscode kopiert."); }
        catch { /* ignore clipboard errors */ }
      }
      els.inviteForm.reset();
      els.inviteExpires.value = expires;
      setAdminMessage(code ? `Einladung erstellt: ${code}` : "Einladung erstellt.");
      await loadAdminData();
    } catch (err) {
      console.error("Einladung erstellen fehlgeschlagen", err);
      setAdminMessage(err.message || "Erstellung fehlgeschlagen", "error");
    }
  }

  async function handleUserTableClick(event) {
    const button = event.target.closest(".admin-action");
    if (!button) return;
    const row = button.closest("tr");
    const userId = row?.dataset?.userId;
    const action = button.dataset.action;
    if (!userId || !action) return;

    const user = adminUsers.find(u => u.id === userId);
    if (!user) return;

    try {
      switch (action) {
        case "toggle-lock":
          await fetchJSON(`/api/admin/users/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: { locked: !user.locked }
          });
          setAdminMessage(`Benutzer ${user.username} ${user.locked ? "entsperrt" : "gesperrt"}.`);
          break;
        case "toggle-role":
          await fetchJSON(`/api/admin/users/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: { role: user.role === "admin" ? "user" : "admin" }
          });
          setAdminMessage(`Rolle von ${user.username} aktualisiert.`);
          break;
        case "reset-password": {
          const newPassword = window.prompt(`Neues Passwort für ${user.username} eingeben:`);
          if (!newPassword) return;
          if (newPassword.length < 12) {
            alert("Das Passwort muss mindestens 12 Zeichen haben.");
            return;
          }
          await fetchJSON(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
            method: "POST",
            body: { newPassword }
          });
          setAdminMessage(`Passwort für ${user.username} zurückgesetzt.`, "muted");
          break;
        }
        case "delete":
          if (!window.confirm(`Benutzer ${user.username} wirklich löschen?`)) return;
          await fetchJSON(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
          setAdminMessage(`Benutzer ${user.username} gelöscht.`);
          break;
        default:
          return;
      }
      await loadAdminData();
    } catch (err) {
      console.error("Benutzeraktion fehlgeschlagen", err);
      setAdminMessage(err.message || "Aktion fehlgeschlagen", "error");
    }
  }

  async function handleInviteTableClick(event) {
    const button = event.target.closest(".admin-invite");
    if (!button) return;
    const row = button.closest("tr");
    const code = row?.dataset?.inviteCode;
    const action = button.dataset.action;
    if (!code || !action) return;

    try {
      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(code);
          toast("Einladungscode kopiert.");
          setAdminMessage("Code in Zwischenablage.");
        } catch (error) {
          window.prompt("Einladungscode kopieren: STRG+C", code);
          setAdminMessage("Code angezeigt.");
        }
        return;
      }
      if (action === "delete") {
        if (!window.confirm("Einladung wirklich löschen?")) return;
        await fetchJSON(`/api/admin/invites/${encodeURIComponent(code)}`, { method: "DELETE" });
        setAdminMessage("Einladung entfernt.");
        await loadAdminData();
      }
    } catch (err) {
      console.error("Einladungsaktion fehlgeschlagen", err);
      setAdminMessage(err.message || "Aktion fehlgeschlagen", "error");
    }
  }


  // Init
  async function initCalculator(){
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

  // initCalculator wird erst nach erfolgreicher Anmeldung aufgerufen

  async function bootstrap() {
    try {
      await ensureCsrfToken();
    } catch (err) {
      console.error("CSRF-Initialisierung fehlgeschlagen", err);
    }
    await refreshSession();
  }

  bootstrap().catch(err => {
    console.error("Start fehlgeschlagen", err);
    handleUnauthenticated();
  });

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
