# Testing

## Suites and commands

| Suite               | Location                       | Command                               | What it uses                                                       |
| ------------------- | ------------------------------ | ------------------------------------- | ------------------------------------------------------------------ |
| Backend unit        | `backend/tests/unit`           | `npm run test:unit -w backend`        | pure logic: env, money, Argon2id, JWT, retry policy, log redaction |
| Backend integration | `backend/tests/integration`    | `npm run test:integration -w backend` | real Express app + real PostgreSQL (`dealership_test`)             |
| Frontend            | `frontend/src/**/*.test.ts(x)` | `npm test -w frontend`                | Testing Library + jsdom, mocked `fetch`                            |
| End-to-end          | `e2e/tests`                    | `npm run test:e2e`                    | Chromium + built SPA + real API + PostgreSQL (`dealership_e2e`)    |
| Everything + report | —                              | `node scripts/test-report.mjs`        | writes `reports/TEST_REPORT.md` from real results                  |

Safety: the integration setup drops and recreates the `public` schema, so it **refuses to run unless the database name ends in `_test`**; the e2e reset requires `_e2e`. Test files run one at a time because they share a database, and each test file closes the connection pools it opens.

## How TDD was applied (honest account)

- Backend modules (config, database constraints, money, passwords, tokens, auth, vehicles, purchases, provisioning, retry, OpenAPI): the failing tests were written and **committed first** (`test: … (red)`), observed failing for the intended reason, then implemented (`feat: … (green)`). See `git log`.
- Not strictly test-first: the log-redaction and database-outage tests were written together with a small `createLogger` signature change and passed immediately; the frontend component tests and Playwright journeys were written after the components existed (the frontend API client, validation and money helpers _were_ test-first).
- Two defects were found _by_ tests and fixed at the root: `new URL()` throwing inside a Zod refinement (env), and LIKE wildcards not being escaped by Prisma's `contains` (search).

## Mutation checks (are the tests able to fail?)

After the suites passed, critical behaviours were deliberately broken to confirm specific tests fail. Result:

| Broken behaviour                                                                             | Detected by                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Registration schema no longer strict (role escalation)                                       | auth tests                                                                          |
| Refresh replay no longer revokes the family                                                  | auth tests                                                                          |
| JWT algorithm allowlist removed                                                              | `tokens.test.ts`                                                                    |
| Racy read-then-write instead of atomic conditional UPDATE                                    | 3 concurrency tests                                                                 |
| Request-hash check removed (idempotency key reuse)                                           | purchases tests                                                                     |
| Advisory lock removed                                                                        | **not detected at first** → forced-overlap test added, then detected                |
| Role taken from token instead of DB                                                          | **not detected at first** → forged-claim tests on gated routes added, then detected |
| Sold-out guard / idempotency header / admin guard / single-flight refresh removed (frontend) | frontend tests                                                                      |

## What is not tested

- Docker images and the GitHub Actions workflow were written but never executed here (no Docker daemon; no GitHub runner).
- `prisma migrate deploy` / `migrate diff` were not run here (the Prisma engine binary cannot be downloaded in this sandbox); tests apply the same SQL files directly.
- No load or latency benchmarking was done, so no performance targets are claimed.
- Accessibility is covered by role/label/focus-management assertions, not by an automated audit (axe) or screen-reader testing.
