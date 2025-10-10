process.env.NODE_ENV = 'test';
process.env.SESSION_TTL_MS = '100';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const ORIGINAL_USERS = fs.existsSync(USERS_FILE)
  ? fs.readFileSync(USERS_FILE, 'utf8')
  : null;
const https = r => r.set('X-Forwarded-Proto', 'https');

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.resetModules();
  if (ORIGINAL_USERS === null) {
    if (fs.existsSync(USERS_FILE)) {
      fs.unlinkSync(USERS_FILE);
    }
  } else {
    fs.writeFileSync(USERS_FILE, ORIGINAL_USERS);
  }
});

test('creates default admin when users file is missing', async () => {
  if (fs.existsSync(USERS_FILE)) {
    fs.unlinkSync(USERS_FILE);
  }

  const app = require('./server');
  const res = await https(request(app).post('/api/login')).send({ username: 'admin', password: 'Admin123!Test' });

  expect(res.status).toBe(200);
  expect(res.body.mustChangePassword).toBe(true);
});

test('repairs default admin password when stored hash is invalid', async () => {
  const corrupted = {
    admin: {
      salt: 'ffff',
      hash: 'deadbeef',
      isAdmin: true,
      mustChangePassword: true
    }
  };
  fs.writeFileSync(USERS_FILE, JSON.stringify(corrupted, null, 2));

  const app = require('./server');
  const res = await https(request(app).post('/api/login')).send({ username: 'admin', password: 'Admin123!Test' });

  expect(res.status).toBe(200);
  expect(res.body.mustChangePassword).toBe(true);
});
