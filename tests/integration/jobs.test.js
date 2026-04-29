import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { buildApp } from '../../src/app.js';
import pool  from '../../src/db/index.js';

let app;
let accessToken;

// --- helper: clean DB ---
async function cleanDb() {
  await pool.query(`
    TRUNCATE TABLE job_executions, jobs, users, tenants, api_keys
    RESTART IDENTITY CASCADE;
  `);
}

// --- helper: create user + login ---
async function createAndLogin() {
  const registerRes = await request(app.server)
    .post('/api/v1/auth/register')
    .send({
      tenantName: 'Test Org',
      email: 'test@example.com',
      password: 'password123'
    });

  const loginRes = await request(app.server)
    .post('/api/v1/auth/login')
    .send({
      email: 'test@example.com',
      password: 'password123'
    });

  return loginRes.body.accessToken;
}

// --- setup ---
beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanDb();
  accessToken = await createAndLogin();
});


// ================== TESTS ==================

describe('Jobs API', () => {

  test('POST /api/v1/jobs — authenticated → 201 with job id', async () => {
    const res = await request(app.server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${accessToken}`) // attach JWT
      .send({
        name: 'Test Email Job',
        type: 'email',
        payload: { to: 'user@example.com' },
        
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
  });


  test('POST /api/v1/jobs — no auth → 401', async () => {
    const res = await request(app.server)
      .post('/api/v1/jobs')
      .send({
        job_type: 'email',
        payload: {},
        schedule: '* * * * *'
      });

    expect(res.status).toBe(401);
  });
 

  test('GET /api/v1/jobs — authenticated → 200 with array', async () => {
    // create one job first
    await request(app.server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        job_type: 'email',
        payload: {},
        schedule: '* * * * *'
      });

    const res = await request(app.server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });


  test('GET /api/v1/jobs/:id — valid id → 200 with job', async () => {
    // create job
    const createRes = await request(app.server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
         name: 'Test Email Job',
         type: 'email',
         payload: {}
      });

    const jobId = createRes.body.data.id;

    const res = await request(app.server)
      .get(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id', jobId);
  });


  test('DELETE /api/v1/jobs/:id — cancel pending job → 200', async () => {
    // create job
    const createRes = await request(app.server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Email Job',
        type: 'email',
        payload: {},

        schedule: '* * * * *'
      });

    const jobId = createRes.body.data.id;

    const res = await request(app.server)
      .delete(`/api/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

});