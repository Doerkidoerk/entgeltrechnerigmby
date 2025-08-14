process.env.SESSION_TTL_MS = '100';
const request = require('supertest');
const app = require('./server');

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
    const login = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' });
    token = login.body.token;
  });

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
    const res30 = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, urlaubstage: 30, tZugBPeriod: 'until2025' });
    const res20 = await request(app)
      .post('/api/calc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, urlaubstage: 20, tZugBPeriod: 'until2025' });

    expect(res20.status).toBe(200);
    expect(res20.body.breakdown.urlaub.gesamt)
      .toBeCloseTo(res30.body.breakdown.urlaub.gesamt * (20 / 30), 2);
  });

  test('Azubis erhalten Kinderzulage und T-ZUG B basiert auf Ausbildungsvergütung', async () => {
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
    const login = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ username: 'u1', password: '123' });
    expect(res.status).toBe(400);
  });

  test('lists users for admin', async () => {
    const login = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' });
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: 'admin' })
    ]));
  });

  test('sessions expire after ttl', async () => {
    const login = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' });
    const token = login.body.token;
    await new Promise(r => setTimeout(r, 200));
    const res = await request(app)
      .get('/api/tables')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('logout invalidates session', async () => {
    const login = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin' });
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
