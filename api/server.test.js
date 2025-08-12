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

  beforeAll(async () => {
    // wait for tables to load
    await new Promise(res => setTimeout(res, 100));
  });

  test('tZugBPeriod until2025', async () => {
    const res = await request(app)
      .post('/api/calc')
      .send({ ...payload, tZugBPeriod: 'until2025' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50260.97, 2);
  });

  test('tZugBPeriod from2026', async () => {
    const res = await request(app)
      .post('/api/calc')
      .send({ ...payload, tZugBPeriod: 'from2026' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50567.59, 2);
  });
});
