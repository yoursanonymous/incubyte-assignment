# Lotline — Car Dealership Inventory System

A full-stack inventory app for a car dealership. Customers browse, search and buy vehicles; administrators manage the catalogue and stock. Built for the _TDD Kata: Car Dealership Inventory System_ with a modular-monolith backend (Express 5 + TypeScript + PostgreSQL via Prisma) and a React 19 + Tailwind 4 single-page app.

|                                                 |                                                     |
| ----------------------------------------------- | --------------------------------------------------- |
| ![Inventory](docs/screenshots/02-inventory.png) | ![Mobile](docs/screenshots/06-inventory-mobile.png) |

More screenshots (all taken by the Playwright run against the real stack): [sign in](docs/screenshots/01-sign-in.png) · [purchase dialog](docs/screenshots/03-purchase-dialog.png) · [vehicle detail](docs/screenshots/04-vehicle-detail.png) · [my orders](docs/screenshots/05-my-orders.png) · [admin: add vehicle](docs/screenshots/07-admin-add-vehicle.png) · [admin table](docs/screenshots/08-admin-table.png)

## Highlights

- **No overselling.** A purchase is one transaction: an atomic `UPDATE … WHERE quantity >= n` (row-locked by PostgreSQL), the purchase record at the _live_ price, an audit event, and an idempotency record. Proven by 20 simultaneous buyers against 5 units, a purchase-vs-restock race, and a forced mid-transaction failure that must roll back.
- **Safe retries.** Optional `Idempotency-Key` header; concurrent and sequential replays return the original result and charge once.
- **Security by construction.** Argon2id; short-lived HS256 JWT (issuer/audience/algorithm checked); rotating refresh tokens in an HttpOnly `SameSite=Strict` cookie with replay detection; role re-read from the database on every request; strict request schemas (no mass assignment); rate limits; Helmet; CSRF origin guard; DB `CHECK` constraints as a second line of defence.
- **Exact money.** Integer cents in the database; API sends decimal strings; no floating point on prices.
- **Frontend.** Access token only in memory (never web storage), single-flight refresh, shareable URL filters, accessible modals (focus trap, Escape, focus restore), loading/empty/error states, responsive layout, parking-bay stock gauge.

## Quick start (local development)

**Prerequisites:** Node.js ≥ 22.12, PostgreSQL 16 (or run just the DB with Docker: `docker compose up db`).

```bash
npm install

# 1. Create the databases (dev, test, e2e) and a role. Adjust names/passwords as you like.
psql -U postgres -c "CREATE ROLE dealership LOGIN PASSWORD 'dealership_dev_pw' CREATEDB;"
for db in dealership_dev dealership_test dealership_e2e; do createdb -U postgres -O dealership $db; done

# 2. Configure and migrate the backend
cp backend/.env.example backend/.env          # defaults match the commands above
npm run prisma:generate -w backend            # generates the typed DB client (also runs automatically before dev/test)
npm run db:migrate:deploy -w backend          # applies the versioned SQL migrations
npm run db:seed -w backend                    # DEV sample data + demo accounts (refuses production)

# 3. Run (two terminals)
npm run dev -w backend                        # API on http://localhost:3000
npm run dev -w frontend                       # SPA on http://localhost:5173 (proxies /api to the API)
```

Demo accounts created by the dev seed (**local development only**):

| Role     | Email                      | Password              |
| -------- | -------------------------- | --------------------- |
| Admin    | `admin@dealership.test`    | `ChangeMe-Admin-123!` |
| Customer | `customer@dealership.test` | `Customer-Demo-123!`  |

Public registration always creates a **customer**. To create a real administrator: `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-secret' npm run admin:create -w backend` (idempotent; refuses the published default password in production).

### Useful commands

| Task                                                               | Command                                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| All unit/integration/UI tests                                      | `npm test`                                                                                                                          |
| Backend only / unit / integration / coverage                       | `npm test -w backend` · `npm run test:unit -w backend` · `npm run test:integration -w backend` · `npm run test:coverage -w backend` |
| End-to-end (builds the SPA, starts API + preview, drives Chromium) | `npm run test:e2e` (first run: `npx playwright install chromium`)                                                                   |
| Full report from real runs                                         | `node scripts/test-report.mjs` → `reports/TEST_REPORT.md`                                                                           |
| Typecheck · lint · format check · build                            | `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run build`                                                     |
| Regenerate OpenAPI file                                            | `npm run openapi:generate -w backend`                                                                                               |

The integration tests need `dealership_test` reachable at `TEST_DATABASE_URL` (default `postgresql://dealership:dealership_dev_pw@localhost:5432/dealership_test`). They **drop and recreate that database's schema**, so they refuse any database whose name does not end in `_test`.

## Configuration

All configuration is validated at startup; the process exits with a readable error (variable names only, never values) if it is invalid. See [`backend/.env.example`](backend/.env.example).

| Variable                                                             | Purpose                                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                       | PostgreSQL connection string (required)                                             |
| `JWT_SECRET`                                                         | ≥ 32 chars; the published dev value is rejected in production                       |
| `CORS_ORIGINS`                                                       | Comma-separated browser origins; wildcards rejected; must be explicit in production |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`                 | Session lifetimes (900 s / 7 d)                                                     |
| `ARGON2_MEMORY_KIB`, `ARGON2_TIME_COST`                              | Hash cost (19 MiB / 2, the OWASP minimum)                                           |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`                   | Auth endpoint abuse limits                                                          |
| `TRUST_PROXY_HOPS`                                                   | Reverse-proxy hops to trust for client IPs                                          |
| `DB_POOL_MAX`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` | Bounded pool and timeouts                                                           |

## API

Required endpoints are implemented unchanged (`POST /api/auth/register|login`, `POST|GET /api/vehicles`, `GET /api/vehicles/search`, `PUT|DELETE /api/vehicles/:id`, `POST /api/vehicles/:id/purchase|restock`), plus `refresh`, `logout`, `me`, `GET /api/vehicles/:id`, purchase history and health checks. Full details: [docs/api.md](docs/api.md) and [docs/openapi.json](docs/openapi.json).

**Policy decision:** the assignment marks create/update as merely "protected" while its UI section says admins add/update/delete. I made _create, update, delete, restock_ **ADMIN-only** (customers could otherwise change prices). Relaxing this is a one-line change in `vehicle.routes.ts`. Delete is a **soft delete** so purchase history is never orphaned.

## Architecture

Modular monolith, strict layers (routes → controllers → services → repositories → Prisma), pure domain code, central middleware. Details and trade-offs: [docs/architecture.md](docs/architecture.md) · [data model](docs/data-model.md) · [security & threat model](docs/security.md) · [testing](docs/testing.md) · [requirements traceability](docs/requirements-traceability.md).

```
backend/   Express API, Prisma schema + SQL migrations, scripts (admin, OpenAPI), tests
frontend/  React + Vite + Tailwind SPA, tests
e2e/       Playwright journeys against the real stack
docs/      architecture, data model, security, API, testing, screenshots
```

## Test report

Generated from real executions by `node scripts/test-report.mjs` (full file: [reports/TEST_REPORT.md](reports/TEST_REPORT.md)):

| Suite                                    | Tests | Passed | Failed | Skipped |
| ---------------------------------------- | ----: | -----: | -----: | ------: |
| Backend unit                             |    80 |     80 |      0 |       0 |
| Backend integration (real PostgreSQL 16) |   174 |    174 |      0 |       0 |
| Frontend (Testing Library)               |    80 |     80 |      0 |       0 |
| End-to-end (Chromium, real API + DB)     |     4 |      4 |      0 |       0 |

Coverage: backend 97.6 % lines / 89.6 % branches; frontend 90.6 % lines / 77.5 % branches. Typecheck, lint, formatting and both production builds pass; `npm audit --omit=dev` reports 0 vulnerabilities.

## Deployment

A `docker-compose.yml`, two Dockerfiles (non-root, multi-stage), an nginx config and a GitHub Actions workflow are provided:

```bash
cp .env.example .env            # set POSTGRES_PASSWORD and JWT_SECRET
docker compose run --rm migrate # reviewed SQL migrations (never db push)
docker compose up --build       # web on :8080, API behind nginx at /api
```

**Not verified:** these files were written but _not executed_ in the authoring environment (no Docker daemon, no GitHub runner). Treat the first CI/Docker run as the real test. No live deployment exists; no deployment link is claimed. Production notes: serve SPA and API from **one origin** (the nginx config does this) because the refresh cookie is `SameSite=Strict`; terminate TLS in front; run migrations as a separate explicit step; back up with `pg_dump --format=custom` and restore with `pg_restore --clean --if-exists`.

## Known limitations and next steps

- Rate-limit counters are per process (N instances ⇒ N× the limit); use an edge/WAF limit or a shared store when scaling out.
- No email verification, password reset, MFA, or per-account lockout.
- `Idempotency-Key` is optional; without it, two identical requests are two purchases (by design, documented and tested).
- No load testing was done; no performance targets are claimed.
- Prisma migrations were authored as SQL and checked by applying them directly; `prisma migrate deploy`/`migrate diff` could not run in the authoring sandbox. CI includes a drift check that will confirm it on first run.
- Accessibility: keyboard/focus/labels are tested, but no automated audit or screen-reader pass has been done.

## Troubleshooting

| Symptom                                                        | Fix                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Invalid configuration: …` at start                            | Set the named variable(s) in `backend/.env`                                                            |
| `ECONNREFUSED :5432`                                           | PostgreSQL is not running / wrong `DATABASE_URL`                                                       |
| `Refusing to reset "…": test database names must end in _test` | Point `TEST_DATABASE_URL` at a `*_test` database                                                       |
| `Too many database connections` in tests                       | Raise PostgreSQL `max_connections` or lower `DB_POOL_MAX`                                              |
| Frontend shows "Cannot reach the server"                       | Start the API; the Vite dev server proxies `/api` to `localhost:3000` (`API_URL` overrides)            |
| `prisma generate` fails downloading engines                    | Network blocks `binaries.prisma.sh`; set `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true` for generate-only use |

## My AI Usage

> **Author: review and edit this section so it reflects your own experience. It currently records factually what was done.**

**Tool.** Claude (Anthropic) in a chat interface with a sandboxed shell, driven by a long "Master Engineering Prompt" plus the assignment PDF.

**How it was used.** The assistant did the implementation end to end: it checked the toolchain, selected and verified dependency versions against peer ranges, wrote the design docs _before_ code, then built the backend, frontend, tests, Docker/CI files and documentation. It ran every test suite itself, and the results above are from those runs.

- _Architecture and planning:_ module boundaries, data model, threat model, auth/session strategy, purchase concurrency design.
- _Tests first:_ failing tests for each backend rule were committed before the implementation (`test: … (red)` then `feat: … (green)`).
- _Debugging:_ four real issues were diagnosed from evidence rather than guessed — Prisma's `contains` not escaping LIKE wildcards (probed directly, then fixed), a Zod refinement that threw, a test-harness connection-pool leak, and the sandbox's blocked Prisma engine download.
- _Verification beyond "tests pass":_ critical behaviours were deliberately broken (mutation checks) to prove tests fail when they should; this exposed two weak tests, which were strengthened.

**Human review.** The repository owner should add their review and reflection before submission.

**AI co-authorship.** Every commit made with the assistant carries `Co-authored-by: Claude <noreply@anthropic.com>`. The Git author on those commits is a placeholder (`Project Author <author@example.invalid>`); re-author them with your own identity before publishing, e.g. `git rebase -r --root --exec 'git commit --amend --reset-author --no-edit'` after setting `git config user.name/email`.

**Chat logs.** See [PROMPTS.md](PROMPTS.md).
