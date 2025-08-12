const request = require('supertest');
const app = require('./server');

describe('POST /api/calc', () => {
  beforeAll(async () => {
    // wait until tables are loaded
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/api/health');
      if (res.body.tables && res.body.tables.length) return;
      await new Promise(r => setTimeout(r, 50));
    }
  });

  const basePayload = {
    tariffDate: 'april2025',
    eg: 'EG05',
    stufe: 'B',
    irwazHours: 35,
    leistungsPct: 0,
    urlaubsanspruchTage: 30,
    urlaubstage: 0,
    betriebsMonate: 0
  };

  test.each([
    ['until2025', 3475, 43937.9],
    ['from2026', 3475, 44244.52]
  ])('calculates totals for tZugBPeriod %s', async (period, monat, jahr) => {
    const res = await request(app)
      .post('/api/calc')
      .send({ ...basePayload, tZugBPeriod: period })
      .expect(200);

    expect(res.body.totals.monat).toBeCloseTo(monat, 2);
    expect(res.body.totals.jahr).toBeCloseTo(jahr, 2);
  });
});
