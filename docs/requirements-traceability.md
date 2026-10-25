# Requirements traceability

Legend: ☐ not started · ◐ in progress · ☑ implemented **and** verified by the listed tests. This table is updated only from real test runs.

| #   | Requirement (source)                                       | Implementation                                        | Tests                                      | Status |
| --- | ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------ |
| R1  | `POST /api/auth/register`                                  | auth module                                           | `tests/integration/auth.test.ts`           | ☑      |
| R2  | `POST /api/auth/login`, JWT                                | auth module, `tokens.ts`                              | auth integration + `tokens.test.ts`        | ☑      |
| R3  | Registration cannot create ADMIN                           | register schema `.strict()`, service forces CUSTOMER  | auth integration                           | ☑      |
| R4  | `POST /api/vehicles` (admin)                               | vehicles module                                       | vehicles integration                       | ☐      |
| R5  | `GET /api/vehicles`                                        | vehicles module                                       | vehicles integration                       | ☐      |
| R6  | `GET /api/vehicles/search` make/model/category/price range | vehicles module                                       | vehicles integration                       | ☐      |
| R7  | `PUT /api/vehicles/:id`                                    | vehicles module                                       | vehicles integration                       | ☐      |
| R8  | `DELETE /api/vehicles/:id` (admin)                         | soft delete                                           | vehicles integration                       | ☐      |
| R9  | `POST /api/vehicles/:id/purchase` decreases stock          | purchases module                                      | purchases unit + integration + concurrency | ☐      |
| R10 | `POST /api/vehicles/:id/restock` (admin)                   | purchases/inventory module                            | restock integration                        | ☐      |
| R11 | Vehicle has id, make, model, category, price, quantity     | Prisma schema + DB CHECKs                             | db-constraints test                        | ☐      |
| R12 | Real database, not in-memory                               | PostgreSQL 16 + Prisma migrations                     | all integration tests                      | ☐      |
| R13 | Frontend: register/login                                   | `features/auth`                                       | RTL + E2E                                  | ☐      |
| R14 | Frontend: dashboard, search/filter                         | `features/inventory`                                  | RTL + E2E                                  | ☐      |
| R15 | Frontend: Purchase disabled at qty 0                       | `features/purchase`                                   | RTL + E2E                                  | ☐      |
| R16 | Frontend: admin add/update/delete/restock                  | `features/admin`                                      | RTL + E2E                                  | ☐      |
| R17 | TDD red/green history                                      | git log                                               | —                                          | ◐      |
| R18 | AI co-author trailers, README "My AI Usage", PROMPTS.md    | commits, README                                       | —                                          | ◐      |
| R19 | README, screenshots, test report                           | docs                                                  | —                                          | ☐      |
| R20 | Stock never negative, no oversell under concurrency        | conditional UPDATE + CHECK                            | concurrency test                           | ☐      |
| R21 | Purchase idempotency                                       | `idempotency_keys`                                    | purchases integration                      | ☐      |
| R22 | Refresh rotation + replay detection                        | `refresh_tokens`                                      | auth integration                           | ☑      |
| R23 | CI, Docker, health, OpenAPI                                | `.github`, Dockerfiles, `health`, `docs/openapi.json` | CI run / spec test                         | ☐      |

## Inventory invariants (basis for tests)

- **I1** `vehicles.quantity >= 0` always (DB CHECK + conditional UPDATE).
- **I2** For every vehicle: `initial + Σ restocks − Σ purchased quantity = quantity`.
- **I3** A purchase row exists iff its stock decrement committed (single transaction).
- **I4** `purchases.unit_price_cents` is the vehicle price at purchase time and is never rewritten.
- **I5** `purchases.total_cents = unit_price_cents × quantity`, computed exactly in integers.
- **I6** Archived vehicles cannot be purchased or restocked; their purchase history stays readable.
- **I7** A given `(user, Idempotency-Key)` produces at most one purchase.
- **I8** Per-request quantity is an integer in `[1, 10]` for purchases and `[1, 1000]` for restocks; stock is capped at 100 000 (prevents overflow and absurd values).

## Known test gaps (found by mutation checks)

- Role-from-token vs role-from-database is only observable through a role-gated route; it is covered by the forged-ADMIN-claim test in `vehicles.test.ts` (added with the vehicles module). Until then `/me` re-reads the DB itself and cannot detect that regression.
