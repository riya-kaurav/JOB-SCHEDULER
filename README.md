# Distributed Job Scheduler & Task Manager

A multi-tenant job queue and scheduling system built with Fastify, BullMQ, PostgreSQL, and Redis. It lets teams submit background jobs, schedule recurring tasks via cron, and monitor execution — all behind a secure dual-auth API.

**Ideal for:** SaaS platforms that need reliable async task processing (email delivery, report generation, data pipelines) with tenant isolation and observability built in.

---

## Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │                  Docker Network              │
                        │                                              │
  Client (HTTP)         │  ┌─────────┐     ┌───────────────────────┐  │
 ──────────────────────►│  │  Nginx  │────►│     Fastify API        │  │
  JWT / API Key         │  │ :80/:443│     │       :3000            │  │
                        │  └─────────┘     │                        │  │
                        │                  │  Auth Middleware        │  │
                        │                  │  ├─ JWT (userId+role)   │  │
                        │                  │  └─ API Key (tenantId)  │  │
                        │                  │                        │  │
                        │                  │  Routes                │  │
                        │                  │  ├─ /auth              │  │
                        │                  │  ├─ /jobs              │  │
                        │                  │  ├─ /schedules         │  │
                        │                  │  ├─ /health            │  │
                        │                  │  └─ /metrics           │  │
                        │                  └────────┬──────────────┘  │
                        │                           │                  │
                        │              ┌────────────┼────────────┐     │
                        │              │            │            │     │
                        │              ▼            ▼            │     │
                        │       ┌────────────┐ ┌─────────┐      │     │
                        │       │  BullMQ    │ │  Redis  │      │     │
                        │       │  Queue     │ │  :6379  │      │     │
                        │       │            │ │         │      │     │
                        │       │ ├─ Jobs    │ │ ├─ JWT  │      │     │
                        │       │ ├─ Retry   │ │ │  BL   │      │     │
                        │       │ └─ DLQ     │ │ ├─ Rate │      │     │
                        │       └─────┬──────┘ │ │  Limit│      │     │
                        │             │        │ └─ Tenant│     │     │
                        │             │        │   Cache  │     │     │
                        │             ▼        └─────────┘      │     │
                        │       ┌────────────┐                  │     │
                        │       │   Worker   │                  │     │
                        │       │  Process   │                  │     │
                        │       │            │                  │     │
                        │       │ ├─ email   │                  │     │
                        │       │ └─ report  │                  │     │
                        │       └─────┬──────┘                  │     │
                        │             │                          │     │
                        │             ▼                          │     │
                        │       ┌────────────┐                  │     │
                        │       │ PostgreSQL  │◄─────────────────┘     │
                        │       │   :5432    │                        │
                        │       │            │                        │
                        │       │ tenants    │                        │
                        │       │ users      │                        │
                        │       │ api_keys   │                        │
                        │       │ jobs       │                        │
                        │       │ job_exec.  │                        │
                        │       │ schedules  │                        │
                        │       └────────────┘                        │
                        │                                              │
                        │  ┌────────────────────┐                     │
                        │  │  node-cron          │                     │
                        │  │  Scheduler          │                     │
                        │  │  (ticks every min)  │                     │
                        │  └────────────────────┘                     │
                        └─────────────────────────────────────────────┘
```
[View on Eraser![](https://app.eraser.io/workspace/XjjzSV9Rs3ILigDAGjA9/preview?diagram=ns7McMqjJSBdwwFg74hi&type=embed)](https://app.eraser.io/workspace/XjjzSV9Rs3ILigDAGjA9?diagram=ns7McMqjJSBdwwFg74hi)
---

## Tech Stack

| Technology | Why |
|---|---|
| **Fastify** | Faster than Express, schema-first validation, plugin system |
| **PostgreSQL** | Durable source of truth — jobs survive Redis restarts |
| **Redis** | Ephemeral fast store for queue state, JWT blacklist, rate limits |
| **BullMQ** | Production-grade job queue on Redis; handles retries, DLQ, priorities |
| **node-cron** | Lightweight cron scheduler; ticks every minute to dispatch scheduled jobs |
| **cron-parser** | Validates cron expressions and computes `next_run` accurately |
| **bcrypt** | Secure password hashing with per-user salts |
| **JWT (jsonwebtoken)** | Stateless short-lived access tokens (15m) |
| **Zod** | Runtime schema validation on all request bodies |
| **Pino** | Structured JSON logging with child loggers bound to `tenantId` |
| **Docker + Compose** | Full local stack in one command; mirrors production topology |
| **GitHub Actions** | Lint → migrate → test → docker build CI pipeline |
| **Vitest** | Fast test runner; `fileParallelism: false` prevents DB deadlocks |
| **Nginx** | Reverse proxy; terminates TLS, forwards headers |

---

## Key Design Decisions

- **Separate Worker Process** — The worker runs as its own Node process, not inside the Fastify server. This means it can be scaled, deployed, and restarted independently. A crash in job processing never takes down the API.

- **PostgreSQL as Source of Truth** — Every job is inserted into Postgres *before* it's enqueued in BullMQ. If Redis goes down and comes back up, job state is recovered from the DB. Redis is ephemeral; Postgres is not.

- **Dual Auth (JWT + API Key)** — JWT tokens are for human users (short-lived, carry `userId` + `role`). API keys are for machine clients (hashed with SHA-256 in DB, carry `tenantId` only). Both paths produce an authenticated context the rest of the app treats identically.

- **Commit-Before-Enqueue Pattern** — In the scheduler, the Postgres transaction commits *first*, then BullMQ is enqueued. This prevents the race condition where Redis gets a job that the DB doesn't know about (e.g. if the process crashes between the two operations).

- **`FOR UPDATE SKIP LOCKED` on Schedules** — Multiple scheduler instances (or restarts) won't double-process the same schedule. Postgres row-level locking ensures only one worker claims each due schedule.

- **BullMQ `jobId` = `job.id`** — Using the Postgres job ID as the BullMQ job ID provides idempotency. Re-enqueueing the same job won't create duplicates.

---

## Database Schema

```
tenants          users              api_keys
────────         ──────────         ────────────
id               id                 id
name             tenant_id ──►      tenant_id ──►
plan             email              key_hash
daily_job_limit  password_hash      name
created_at       role               last_used_at
                 created_at         created_at

jobs                        job_executions
────────────────────         ──────────────────────
id                           id
tenant_id ──►                job_id ──►
type                         attempt_number
payload (jsonb)              status
status                       started_at
priority                     completed_at
attempts_made                error_message
max_attempts                 created_at
scheduled_at
created_at                  job_schedules
                             ──────────────────────
                             id
                             tenant_id ──►
                             name
                             cron_expression
                             job_type
                             payload (jsonb)
                             is_active
                             next_run
                             last_run
                             created_at
```

---

## How to Run Locally

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (via `nvm` recommended)

### 1. Clone the repo

```bash
git clone https://github.com/your-org/jobqueue.git
cd jobqueue
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET, DB credentials, Redis URL
```

Key variables:

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=jobqueue
DB_USER=postgres
DB_PASSWORD=postgres

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
```

### 4. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 5. Run migrations

```bash
node src/db/migrate.js
```

### 6. Start the API server

```bash
node src/server.js
```

### 7. Start the worker (separate terminal)

```bash
node src/worker/worker.js
```

### 8. (Optional) Start the scheduler

```bash
node src/worker/scheduler.js
```

### Full stack via Docker

To run everything (API + worker + scheduler + Nginx + Postgres + Redis):

```bash
docker compose up --build
```

API will be available at `http://localhost` (Nginx → API:3000).

---

## Running Tests

```bash
# Ensure test DB is running
docker compose up -d postgres redis

# Run migrations against test DB
NODE_ENV=test node src/db/migrate.js

# Run tests
npm test
```

Tests use `fileParallelism: false` in Vitest config to prevent DB deadlocks across test files. Each file truncates tables in dependency order before running.

---

## API Endpoints

### Auth

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | None | Create a new tenant + admin user |
| `POST` | `/api/v1/auth/login` | None | Returns JWT access token (15m) + refresh token (7d) |
| `POST` | `/api/v1/auth/logout` | JWT | Blacklists current token in Redis |
| `POST` | `/api/v1/auth/refresh` | Refresh Token | Rotates refresh token, returns new access token |

### API Keys

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/api-keys` | JWT | Generate a new API key (stored as SHA-256 hash) |

### Jobs

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/jobs` | JWT or API Key | Submit a new job |
| `GET` | `/api/v1/jobs` | JWT or API Key | List jobs (paginated, filterable by status) |
| `GET` | `/api/v1/jobs/:id` | JWT or API Key | Get job detail with execution history |
| `DELETE` | `/api/v1/jobs/:id` | JWT or API Key | Cancel a job (PENDING status only) |
| `GET` | `/api/v1/jobs/dead-letter` | JWT (admin only) | List all dead-lettered jobs |
| `POST` | `/api/v1/jobs/:id/retry` | JWT (admin only) | Re-enqueue a dead/failed job |

### Schedules

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/schedules` | JWT | Create a recurring cron schedule |
| `GET` | `/api/v1/schedules` | JWT | List schedules for current tenant |
| `PATCH` | `/api/v1/schedules/:id` | JWT | Update cron expression, payload, or active state |

### Observability

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | DB + Redis health check; 503 on any failure |
| `GET` | `/metrics` | JWT (admin only) | Job counts by status + BullMQ queue depth |

---

### Job Submission Payload

```json
{
  "type": "email",
  "payload": { "to": "user@example.com", "subject": "Hello" },
  "priority": 1,
  "scheduledAt": "2024-12-01T10:00:00Z",
  "maxAttempts": 3
}
```

Priority levels: `1` (high) → `2` (normal) → `3` (low)

### Schedule Payload

```json
{
  "name": "Daily report",
  "cronExpression": "0 9 * * *",
  "jobType": "report",
  "payload": { "reportId": "monthly-summary" }
}
```

---

## Retry & Dead Letter Queue

Failed jobs are retried with exponential backoff:

| Attempt | Delay |
|---|---|
| 1st retry | 2s |
| 2nd retry | 4s |
| 3rd retry | 8s |

After all attempts are exhausted, the job is marked `DEAD` in Postgres and moved to the dead letter queue. Admin users can inspect dead jobs at `GET /api/v1/jobs/dead-letter` and requeue them via `POST /api/v1/jobs/:id/retry`.

---

## Rate Limiting

Each tenant has a configurable daily job submission limit (`tenants.daily_job_limit`). Limits are enforced atomically in Redis using `INCR` with a TTL keyed to `ratelimit:{tenantId}:{date}`. Tenant limits are cached separately for 5 minutes to avoid repeated DB lookups. Requests over the limit receive a `429 Too Many Requests` response.

---

## Logging

All log lines are structured JSON (Pino). In development, `pino-pretty` formats output. Every line after auth includes `tenantId` and `requestId` via a child logger bound in the auth middleware.

```json
{
  "level": "info",
  "time": 1700000000000,
  "requestId": "req-abc123",
  "tenantId": "tenant-xyz",
  "msg": "Job submitted",
  "jobId": "job-456"
}
```

---

## CI/CD Pipeline

GitHub Actions runs on every push:

```
lint → migrate (test DB) → integration tests → docker build (api + worker)
```

Service containers for Postgres and Redis spin up in CI automatically. Docker images are built but not pushed — add a deploy step targeting Render.com or your platform of choice.
