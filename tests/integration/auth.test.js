import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { buildApp } from '../../src/app.js';
import  pool from '../../src/db/index.js';

let app;

// Clean database before each test
async function cleanDb() {
  await pool.query(`
    TRUNCATE TABLE job_executions, jobs, api_keys, users, tenants
    RESTART IDENTITY CASCADE;
  `);
}

// Start app before all tests
beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

// Close app after all tests
afterAll(async () => {
  await app.close();
});

// Reset DB before each test
beforeEach(async () => {
  await cleanDb();
});

describe('Auth API', () => {

  test('register: valid body → 201', async () => {
    const res = await request(app.server)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        tenantName: 'Test Org'
      });
      console.log(res.body);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('tenant');
  });

  test('register: duplicate email → 400', async () => {
    const payload = {
      email: 'test@example.com',
      password: 'password123',
      tenantName: 'Test Org'
    };
      console.log(res.body)
    // First insert
    await request(app.server).post('/api/v1/auth/register').send(payload);

    // Second insert (duplicate)
    const res = await request(app.server)
      .post('/api/v1/auth/register')
      .send(payload);

    expect(res.status).toBe(409);
  });

  test('login: valid credentials → tokens', async () => {
    const payload = {
      email: 'test@example.com',
      password: 'password123',
      tenantName: 'Test Org'
    };

    // Create user first
    await request(app.server).post('/api/v1/auth/register').send(payload);

    // Login
    const res = await request(app.server)
      .post('/api/v1/auth/login')
      .send({
        email: payload.email,
        password: payload.password
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  test('login: wrong password → 401', async () => {
    await request(app.server).post('/api/v1/auth/register').send({
      email: 'test@example.com',
      password: 'correct-password',
      tenantName: 'Test Org'
    });

    const res = await request(app.server)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrong-password'
      });

    expect(res.status).toBe(401);
  });

  test('login: non-existent email → 401', async () => {
    const res = await request(app.server)
      .post('/api/v1/auth/login')
      .send({
        email: 'nouser@example.com',
        password: 'password123'
      });

    expect(res.status).toBe(401);
  });

});