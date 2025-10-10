process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('./server');

beforeAll(async () => {
  // Tabellen werden beim Start asynchron geladen – kurze Pause reicht für Tests
  await new Promise(res => setTimeout(res, 100));
});

describe('öffentliche Tabellenendpunkte', () => {
  test('liefert verfügbare Tabellen', async () => {
    const res = await request(app).get('/api/tables');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThan(0);
    expect(res.body.keys).toEqual(expect.arrayContaining(['mai2024']));
  });

  test('liefert konkrete Tabelle', async () => {
    const res = await request(app).get('/api/tables/april2025');
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('april2025');
    expect(res.body.table).toHaveProperty('EG05');
  });
});

describe('POST /api/calc ohne Anmeldung', () => {
  const payload = {
    tariffDate: 'april2025',
    eg: 'EG05',
    stufe: 'B',
    irwazHours: 35,
    leistungsPct: 5,
    urlaubstage: 30,
    betriebsMonate: 24,
  };

  test('berechnet Werte für Zeitraum bis 2025', async () => {
    const res = await request(app)
      .post('/api/calc')
      .send({ ...payload, tZugBPeriod: 'until2025' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50260.97, 2);
  });

  test('berechnet Werte für Zeitraum ab 2026', async () => {
    const res = await request(app)
      .post('/api/calc')
      .send({ ...payload, tZugBPeriod: 'from2026' });

    expect(res.status).toBe(200);
    expect(res.body.totals.monat).toBeCloseTo(3648.75, 2);
    expect(res.body.totals.jahr).toBeCloseTo(50567.59, 2);
  });

  test('Azubis erhalten Kinderzulage und spezielle T-ZUG-Berechnung', async () => {
    const res = await request(app)
      .post('/api/calc')
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
