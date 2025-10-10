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

test('persists users.json only after the admin password is changed', async () => {
  if (fs.existsSync(USERS_FILE)) {
    fs.unlinkSync(USERS_FILE);
  }

  const app = require('./server');
  const login = await https(request(app).post('/api/login')).send({ username: 'admin', password: 'Admin123!Test' });

  expect(login.status).toBe(200);
  expect(fs.existsSync(USERS_FILE)).toBe(false);

  const newPassword = 'AdminFresh123!';
  const change = await https(request(app)
    .post('/api/change-password')
    .set('Authorization', `Bearer ${login.body.token}`))
    .send({ oldPassword: 'Admin123!Test', newPassword });

  expect(change.status).toBe(200);
  expect(fs.existsSync(USERS_FILE)).toBe(true);
  const stored = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  expect(stored.admin.mustChangePassword).toBe(false);
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

test('default admin login works with CSRF in production mode', async () => {
  if (fs.existsSync(USERS_FILE)) {
    fs.unlinkSync(USERS_FILE);
  }

  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const app = require('./server');
    const agent = request.agent(app);

    const csrf = await agent.get('/api/csrf-token');
    expect(csrf.status).toBe(200);
    const token = csrf.body.token;
    expect(typeof token).toBe('string');
    const cookieHeader = (csrf.headers['set-cookie'] || []).find(c => /^__Host-csrf=/.test(c));
    expect(cookieHeader).toBeDefined();

    const res = await agent
      .post('/api/login')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookieHeader.split(';')[0])
      .set('X-CSRF-Token', token)
      .send({ username: 'admin', password: 'Admin123!Test' });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
