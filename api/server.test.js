process.env.NODE_ENV = 'test';
process.env.SESSION_TTL_MS = '100';
const request = require('supertest');
const app = require('./server');

const https = r => r.set('X-Forwarded-Proto', 'https');
// Starkes Passwort für Tests: mind. 12 Zeichen, Groß-/Kleinbuchstaben, Zahlen, Sonderzeichen
const STRONG_PASS = 'Admin123!Test';
const loginAs = (username = 'admin', password = STRONG_PASS) =>
  https(request(app).post('/api/login')).send({ username, password });

describe('csrf token endpoint', () => {
  test('returns token and sets cookie', async () => {
    const res = await request(app).get('/api/csrf-token');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some(c => /^__Host-csrf=/.test(c))).toBe(true);
  });
});

describe('POST /api/calc', () => {
  const payload = {
    tariffDate: 'april2025',
    eg: 'EG05',
    stufe: 'B',
    irwazHours: 35,
    leistungsPct: 5,
    urlaubstage: 30,
    betriebsMonate: 24,
  };

  let token;
  beforeAll(async () => {
    await new Promise(res => setTimeout(res, 100));
    const login = await loginAs();
    token = login.body.token;
  });

  // Helper für fresh token wenn alter abgelaufen ist
  const getToken = async () => {
    const login = await loginAs();
    return login.body.token;
  };

  test('tZugBPeriod until2025', async () => {
    const res = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, tZugBPeriod: 'until2025' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50260.97, 2);
  });

  test('tZugBPeriod from2026', async () => {
    const res = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, tZugBPeriod: 'from2026' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50567.59, 2);
  });

  test('urlaubsgeld reflects provided days', async () => {
    const freshToken = await getToken();
    const res30 = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ ...payload, urlaubstage: 30, tZugBPeriod: 'until2025' });
    const res20 = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ ...payload, urlaubstage: 20, tZugBPeriod: 'until2025' });

    expect(res20.status).toBe(200);
    expect(res20.body.breakdown.urlaub.gesamt)
      .toBeCloseTo(res30.body.breakdown.urlaub.gesamt * (20 / 30), 2);
  });

  test('Azubis erhalten Kinderzulage und T-ZUG B basiert auf Ausbildungsvergütung', async () => {
    // Fresh login für diesen Test, da Session kurz ist
    const freshLogin = await loginAs();
    const freshToken = freshLogin.body.token;

    const res = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${freshToken}`)
      .send({
        tariffDate: 'april2025',
        eg: 'AJ1',
        irwazHours: 35,
        leistungsPct: 0,
        urlaubstage: 0,
        betriebsMonate: 0,
        tZugBPeriod: 'until2025',
        eigeneKinder: true
      });

    expect(res.status).toBe(200);
    expect(res.body.breakdown.kinderzulage).toBeCloseTo(632, 2);
    expect(res.body.breakdown.tZugB).toBeCloseTo(233.84, 2);
  });
});

describe('security features', () => {
  test('rejects weak passwords on user creation', async () => {
    const login = await loginAs();
    const res = await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`))
      .send({ username: 'testuser', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/12-128 characters/i);
  });

  test('lists users for admin', async () => {
    const login = await loginAs();
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: 'admin' })
    ]));
  });

  test('sessions expire after ttl', async () => {
    const login = await loginAs();
    const token = login.body.token;
    await new Promise(r => setTimeout(r, 200));
    const res = await request(app)
      .get('/api/tables')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('logout invalidates session', async () => {
    const login = await loginAs();
    const token = login.body.token;
    const out = await request(app)
      .post('/api/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(200);
    const res = await request(app)
      .get('/api/tables')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('admin user management', () => {
  test('newly created users need not change password', async () => {
    const loginAdmin = await loginAs();
    const token = loginAdmin.body.token;
    const username = 'alice' + Date.now();
    const userPass = 'AlicePass123!';
    const res = await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`))
      .send({ username, password: userPass });
    expect(res.status).toBe(200);
    const loginUser = await loginAs(username, userPass);
    expect(loginUser.status).toBe(200);
    expect(loginUser.body.mustChangePassword).toBe(false);
  });

  test('admin can reset passwords', async () => {
    const admin1 = await loginAs();
    const username = 'bob' + Date.now();
    const bobOldPass = 'BobOldPass123!';
    const bobNewPass = 'BobNewPass456@';
    await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin1.body.token}`))
      .send({ username, password: bobOldPass });
    const admin2 = await loginAs();
    const reset = await https(request(app)
      .put(`/api/users/${username}/password`)
      .set('Authorization', `Bearer ${admin2.body.token}`))
      .send({ password: bobNewPass });
    expect(reset.status).toBe(200);
    const oldLogin = await loginAs(username, bobOldPass);
    expect(oldLogin.status).toBe(401);
    const newLogin = await loginAs(username, bobNewPass);
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.mustChangePassword).toBe(false);
  });

  test('admin can delete users', async () => {
    const admin1 = await loginAs();
    const username = 'charlie' + Date.now();
    const charliePass = 'CharliePass123!';
    await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin1.body.token}`))
      .send({ username, password: charliePass });
    const admin2 = await loginAs();
    const del = await request(app)
      .delete(`/api/users/${username}`)
      .set('Authorization', `Bearer ${admin2.body.token}`);
    expect(del.status).toBe(200);
    const admin3 = await loginAs();
    const list = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${admin3.body.token}`);
    expect(list.body.users.find(u => u.username === username)).toBeUndefined();
  });
});

describe('invitation registration', () => {
  test('users can register with invite code and codes are single-use', async () => {
    const admin = await loginAs();
    const gen = await request(app)
      .post('/api/invites')
      .set('Authorization', `Bearer ${admin.body.token}`);
    expect(gen.status).toBe(200);
    const code = gen.body.code;
    expect(code).toMatch(/^[A-Z0-9]{12}$/); // 12 Zeichen jetzt
    const dave = 'dave' + Date.now();
    const davePass = 'DavePass123!';
    const reg = await https(request(app).post('/api/register'))
      .send({ username: dave, password: davePass, code });
    expect(reg.status).toBe(200);
    const loginDave = await loginAs(dave, davePass);
    expect(loginDave.status).toBe(200);
    const eve = 'eve' + Date.now();
    const evePass = 'EvePass123!';
    const reuse = await https(request(app).post('/api/register'))
      .send({ username: eve, password: evePass, code });
    expect(reuse.status).toBe(400);
    const admin2 = await loginAs();
    await request(app)
      .delete(`/api/users/${dave}`)
      .set('Authorization', `Bearer ${admin2.body.token}`);
    const frank = 'frank' + Date.now();
    const frankPass = 'FrankPass123!';
    const reuse2 = await https(request(app).post('/api/register'))
      .send({ username: frank, password: frankPass, code });
    expect(reuse2.status).toBe(400);
  });
});

describe('user password change', () => {
  test('user can change own password', async () => {
    const admin = await loginAs();
    const username = 'testuser' + Date.now();
    const selfOldPass = 'SelfOldPass123!';
    const selfNewPass = 'SelfNewPass456@';
    await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.body.token}`))
      .send({ username, password: selfOldPass });

    // Warte kurz und mache einen fresh login
    await new Promise(r => setTimeout(r, 50));
    const loginSelf = await loginAs(username, selfOldPass);

    const change = await https(request(app)
      .post('/api/change-password')
      .set('Authorization', `Bearer ${loginSelf.body.token}`))
      .send({ oldPassword: selfOldPass, newPassword: selfNewPass });
    expect(change.status).toBe(200);

    const failOld = await loginAs(username, selfOldPass);
    expect(failOld.status).toBe(401);
    const okNew = await loginAs(username, selfNewPass);
    expect(okNew.status).toBe(200);
  });
});
