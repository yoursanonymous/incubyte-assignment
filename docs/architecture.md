# Architecture

Status: **design accepted before implementation** (Milestone 1). Sections marked _(planned)_ are updated as milestones land.

## Style: modular monolith

One deployable backend (Express 5 + TypeScript, ESM) and one SPA (React 19 + Vite + Tailwind 4), both talking to a single PostgreSQL 16 database. No queues, caches or extra services: nothing in the workload justifies them, and every shared piece of state lives in PostgreSQL so several backend instances can run side by side.

```
Browser (React SPA)
   |  HTTPS, JSON, access token in memory, refresh token in HttpOnly cookie
   v
Express app  ── requestContext → helmet/cors → rateLimit → routes
   routes ── authenticate/authorize ── validate(zod) ── controller
   controller ── service (business rules, transactions) ── repository (Prisma) ── PostgreSQL
```

## Backend layers (`backend/src`)

| Layer          | Location                     | Responsibility                                                                | May depend on           |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| Routes         | `modules/*/*.routes.ts`      | URL → middleware chain → controller                                           | controllers, middleware |
| Controllers    | `modules/*/*.controller.ts`  | HTTP in/out only, no business rules                                           | services, schemas       |
| Schemas        | `modules/*/*.schemas.ts`     | Zod request validation, `.strict()` to block mass assignment                  | domain                  |
| Services       | `modules/*/*.service.ts`     | Use cases, authorization at resource level, transactions                      | repositories, domain    |
| Repositories   | `modules/*/*.repository.ts`  | The only code that talks to Prisma                                            | infrastructure/db       |
| Domain         | `domain/`                    | Roles, money, error types, inventory limits. Pure TypeScript, no I/O          | nothing                 |
| Middleware     | `middleware/`                | authenticate, authorize, validate, rate limit, error handler, request context | domain                  |
| Infrastructure | `infrastructure/`, `config/` | env parsing, Prisma client, logger, health                                    | —                       |

Dependency direction: routes → controllers → services → repositories → infrastructure. Domain is imported by everyone and imports nothing. Services receive repositories and clock/ID helpers through factory functions (`createXService(deps)`), which keeps unit tests free of a database without introducing a DI framework.

## Modules

- **auth** – register, login, refresh (rotating), logout, `GET /api/auth/me`.
- **vehicles** – list/search/get/create/update/archive.
- **inventory/purchases** – purchase (transactional, idempotent), restock (admin), purchase history (`GET /api/purchases/mine`, admin `GET /api/purchases`).
- **audit** – append-only `audit_events`, written inside the same transaction as the change it records.
- **health** – `/health/live`, `/health/ready`.

## Key decisions and trade-offs

1. **Admin-only catalog mutation.** The assignment marks POST/PUT as "Protected" but the UI section says only admins add/update/delete. I treat _create, update, delete, restock_ as ADMIN-only and _list, search, view, purchase_ as any authenticated user. Letting every customer edit prices would be a business-logic vulnerability. This is a documented interpretation, easy to relax in one place (`vehicles.routes.ts`).
2. **Money is integer cents** in the database (`price_cents`, `total_cents`), converted at the API boundary by `domain/money.ts`. The API sends/receives decimal strings (`"24999.99"`), never floats. Requests may send a JSON number or string; parsing is string-based and rejects more than 2 decimals.
3. **Soft delete.** `DELETE /api/vehicles/:id` sets `archived_at`. Purchases reference vehicles with `ON DELETE RESTRICT`, so history can never be orphaned or cascaded away.
4. **Quantity is not editable via PUT.** Stock changes only through purchase (decrement) and restock (increment), so every change is atomic, bounded and audited. Initial stock is set at creation.
5. **Auth freshness.** Access tokens (15 min, HS256, `iss`/`aud` checked, algorithm allowlisted) are verified, then the user row is loaded by primary key. Disabling or demoting a user takes effect immediately instead of at token expiry, at the cost of one indexed read per request.
6. **Sessions.** Refresh tokens are opaque 256-bit random values stored only as SHA-256 hashes, rotated on every use, grouped in a _family_; replaying a rotated token revokes the whole family. Cookie: `HttpOnly; SameSite=Strict; Path=/api/auth; Secure` in production.
7. **Idempotency for purchases** is stored in PostgreSQL in the same transaction as the purchase (see data-model.md), so a key row exists iff the purchase committed.
8. **Rate limiting** uses an in-process store. Correct for one instance; with N instances the effective limit is N× — a documented residual risk (see security.md) rather than a reason to add Redis now.
9. **Validation errors return 400**, with a stable error envelope.

## Frontend structure _(planned, Milestone 6)_

`src/app` (router, providers), `src/features/{auth,inventory,purchase,admin}`, `src/shared/{api,ui,lib}`. The API client owns token refresh; auth state lives in one context; everything else is local state. The UI hides admin controls for UX only — the backend enforces every rule.

## Error envelope

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 1 unit(s) available.",
    "details": null,
    "requestId": "…"
  }
}
```

Codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `EMAIL_TAKEN` 409, `INSUFFICIENT_STOCK` 409, `IDEMPOTENCY_KEY_REUSED` 422, `RATE_LIMITED` 429, `SERVICE_UNAVAILABLE` 503, `INTERNAL_ERROR` 500.
