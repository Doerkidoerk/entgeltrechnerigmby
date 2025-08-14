process.env.SESSION_TTL_MS = '100';
const request = require('supertest');
const app = require('./server');

const https = r => r.set('X-Forwarded-Proto', 'https');
const loginAs = (username = 'admin', password = 'admin') =>
  https(request(app).post('/api/login')).send({ username, password });

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

  beforeAll(async () => {
    await new Promise(res => setTimeout(res, 100));
  });

  test('tZugBPeriod until2025', async () => {
    const token = (await loginAs()).body.token;
    const res = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, tZugBPeriod: 'until2025' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50260.97, 2);
  });

  test('tZugBPeriod from2026', async () => {
    const token = (await loginAs()).body.token;
    const res = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, tZugBPeriod: 'from2026' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50567.59, 2);
  });

  test('urlaubsgeld reflects provided days', async () => {
    const token30 = (await loginAs()).body.token;
    const res30 = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token30}`)
      .send({ ...payload, urlaubstage: 30, tZugBPeriod: 'until2025' });
    const token20 = (await loginAs()).body.token;
    const res20 = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token20}`)
      .send({ ...payload, urlaubstage: 20, tZugBPeriod: 'until2025' });

    expect(res20.status).toBe(200);
    expect(res20.body.breakdown.urlaub.gesamt)
      .toBeCloseTo(res30.body.breakdown.urlaub.gesamt * (20 / 30), 2);
  });

  test('Azubis erhalten Kinderzulage und T-ZUG B basiert auf Ausbildungsvergütung', async () => {
    const token = (await loginAs()).body.token;
    const res = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token}`)
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
      .send({ username: 'u1', password: '123' });
    expect(res.status).toBe(400);
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
    await request(app).delete('/api/users/alice').set('Authorization', `Bearer ${token}`).catch(()=>{});
    const res = await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`))
      .send({ username: 'alice', password: 'Pass1234!' });
    expect(res.status).toBe(200);
    const loginUser = await loginAs('alice', 'Pass1234!');
    expect(loginUser.status).toBe(200);
    expect(loginUser.body.mustChangePassword).toBe(false);
  });

  test('admin can reset passwords', async () => {
    const admin1 = await loginAs();
    await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin1.body.token}`))
      .send({ username: 'bob', password: 'Oldpass123!' });
    const admin2 = await loginAs();
    const reset = await https(request(app)
      .put('/api/users/bob/password')
      .set('Authorization', `Bearer ${admin2.body.token}`))
      .send({ password: 'Newpass123!' });
    expect(reset.status).toBe(200);
    const oldLogin = await loginAs('bob', 'Oldpass123!');
    expect(oldLogin.status).toBe(401);
    const newLogin = await loginAs('bob', 'Newpass123!');
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.mustChangePassword).toBe(false);
  });

  test('admin can delete users', async () => {
    const admin1 = await loginAs();
    await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin1.body.token}`))
      .send({ username: 'charlie', password: 'Pass1234!' });
    const admin2 = await loginAs();
    const del = await request(app)
      .delete('/api/users/charlie')
      .set('Authorization', `Bearer ${admin2.body.token}`);
    expect(del.status).toBe(200);
    const admin3 = await loginAs();
    const list = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${admin3.body.token}`);
    expect(list.body.users.find(u => u.username === 'charlie')).toBeUndefined();
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
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const reg = await https(request(app).post('/api/register'))
      .send({ username: 'dave', password: 'Pass1234!', code });
    expect(reg.status).toBe(200);
    const loginDave = await loginAs('dave', 'Pass1234!');
    expect(loginDave.status).toBe(200);
    const reuse = await https(request(app).post('/api/register'))
      .send({ username: 'eve', password: 'Pass1234!', code });
    expect(reuse.status).toBe(400);
    const admin2 = await loginAs();
    await request(app)
      .delete('/api/users/dave')
      .set('Authorization', `Bearer ${admin2.body.token}`);
    const reuse2 = await https(request(app).post('/api/register'))
      .send({ username: 'frank', password: 'Pass1234!', code });
    expect(reuse2.status).toBe(400);
  });
});

describe('user password change', () => {
  test('user can change own password', async () => {
    const admin = await loginAs();
    await request(app).delete('/api/users/self').set('Authorization', `Bearer ${admin.body.token}`).catch(()=>{});
    await https(request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.body.token}`))
      .send({ username: 'self', password: 'Pass1234!' });
    const loginSelf = await loginAs('self', 'Pass1234!');
    const change = await https(request(app)
      .post('/api/change-password')
      .set('Authorization', `Bearer ${loginSelf.body.token}`))
      .send({ oldPassword: 'Pass1234!', newPassword: 'Newpass123!' });
    expect(change.status).toBe(200);
    const failOld = await loginAs('self', 'Pass1234!');
    expect(failOld.status).toBe(401);
    const okNew = await loginAs('self', 'Newpass123!');
    expect(okNew.status).toBe(200);
  });
});
