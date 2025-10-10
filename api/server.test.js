process.env.NODE_ENV = "test";

const fs = require("fs");
const path = require("path");
const request = require("supertest");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");

// Clean persisted auth data before loading the server
try { fs.unlinkSync(USERS_FILE); } catch (err) { if (err.code !== "ENOENT") throw err; }
try { fs.unlinkSync(INVITES_FILE); } catch (err) { if (err.code !== "ENOENT") throw err; }
try { fs.rmSync(SESSIONS_DIR, { recursive: true, force: true }); } catch (err) { if (err.code !== "ENOENT") throw err; }

const app = require("./server");

class SessionClient {
  constructor(appInstance) {
    this.app = appInstance;
    this.cookieJar = Object.create(null);
  }

  _cookieHeader() {
    const entries = Object.entries(this.cookieJar);
    if (!entries.length) return undefined;
    return entries.map(([name, value]) => `${name}=${value}`).join("; ");
  }

  _storeCookies(res) {
    const setCookie = res.headers?.["set-cookie"];
    if (!setCookie) return;
    setCookie.forEach(raw => {
      if (!raw) return;
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      if (idx === -1) return;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (name) {
        this.cookieJar[name] = value;
      }
    });
  }

  async get(path) {
    let req = request(this.app).get(path).set("Accept", "application/json");
    const cookies = this._cookieHeader();
    if (cookies) req = req.set("Cookie", cookies);
    const res = await req;
    this._storeCookies(res);
    return res;
  }

  async post(path, body, headers = {}) {
    let req = request(this.app).post(path).set("Accept", "application/json");
    const cookies = this._cookieHeader();
    if (cookies) req = req.set("Cookie", cookies);
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        req = req.set(key, value);
      }
    }
    if (body !== undefined) {
      req = req.send(body);
    }
    const res = await req;
    this._storeCookies(res);
    return res;
  }
}

let adminClient;

async function fetchCsrf(sessionClient) {
  const res = await sessionClient.get("/api/auth/csrf");
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty("csrfToken");
  return res.body.csrfToken;
}

beforeAll(async () => {
  // Tabellen & Stores werden beim Start asynchron geladen – kurzer Wait reicht
  await new Promise(res => setTimeout(res, 150));
  adminClient = new SessionClient(app);
  const csrfToken = await fetchCsrf(adminClient);
  const loginRes = await adminClient.post(
    "/api/auth/login",
    { username: "admin", password: "Admin123!Test" },
    { "x-csrf-token": csrfToken }
  );
  expect(loginRes.status).toBe(200);
});

describe("Authentifizierung & Zugriffskontrolle", () => {
  test("schützt Tabellenendpunkte ohne Anmeldung", async () => {
    const res = await request(app).get("/api/tables");
    expect(res.status).toBe(401);
  });

  test("liefert Tabellen nach erfolgreicher Anmeldung", async () => {
    const res = await adminClient.get("/api/tables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThan(0);
  });
});

describe("Berechnung nach Login", () => {
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
    const csrfToken = await fetchCsrf(adminClient);
    const res = await adminClient.post(
      "/api/calc",
      { ...payload, tZugBPeriod: "until2025" },
      { "x-csrf-token": csrfToken }
    );

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50260.97, 2);
  });

  test("berechnet Werte für Zeitraum ab 2026", async () => {
    const csrfToken = await fetchCsrf(adminClient);
    const res = await adminClient.post(
      "/api/calc",
      { ...payload, tZugBPeriod: "from2026" },
      { "x-csrf-token": csrfToken }
    );

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50567.59, 2);
  });
});

describe("Einladungsbasierte Registrierung", () => {
  test("Admin erstellt Einladung und neuer Benutzer registriert sich", async () => {
    const adminCsrf = await fetchCsrf(adminClient);
    const inviteRes = await adminClient.post(
      "/api/admin/invites",
      { role: "user", expiresInHours: 4 },
      { "x-csrf-token": adminCsrf }
    );
    expect(inviteRes.status).toBe(201);
    const { invite } = inviteRes.body;
    expect(invite).toHaveProperty("code");

    const userClient = new SessionClient(app);
    const registerCsrf = await fetchCsrf(userClient);
    const registerRes = await userClient.post(
      "/api/auth/register",
      {
        username: "neueruser",
        password: "SehrSicher123!",
        inviteCode: invite.code
      },
      { "x-csrf-token": registerCsrf }
    );
    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toHaveProperty("user");
    expect(registerRes.body.user.username).toBe("neueruser");

    const tablesRes = await userClient.get("/api/tables");
    expect(tablesRes.status).toBe(200);

    const adminRes = await userClient.get("/api/admin/users");
    expect(adminRes.status).toBe(403);
  });
});
