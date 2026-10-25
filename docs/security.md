# Security: controls and threat model

## Assets and actors

Assets: user credentials, session tokens, inventory/price integrity, purchase records. Actors: anonymous internet user, authenticated customer, admin, compromised customer account, a malicious script in the browser.

## Threat model (STRIDE-style, by area)

| Area           | Threat                                      | Control                                                                                                             | Test                       |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Authentication | Password theft from DB                      | Argon2id (m=19 MiB, t=2, p=1), per-hash salt                                                                        | `password.test.ts`         |
|                | Credential stuffing / brute force           | Rate limit on login & register; generic "invalid credentials"; equal work for unknown email (dummy hash)            | auth integration           |
|                | Forged / tampered / expired JWT, `alg=none` | `jose` verify with `algorithms:['HS256']`, `issuer`, `audience`, expiry; 32+ byte secret enforced at boot           | `tokens.test.ts`           |
|                | Token theft via XSS                         | Access token only in JS memory; refresh token HttpOnly cookie; strict CSP from Helmet; no `dangerouslySetInnerHTML` | review + E2E               |
|                | Refresh-token theft/replay                  | Hashed storage, rotation, family revocation on reuse                                                                | auth integration           |
|                | CSRF on refresh/logout (cookie auth)        | `SameSite=Strict`, `Origin` allowlist check on cookie-authenticated POSTs, JSON-only                                | auth integration           |
| Authorization  | Customer calls admin endpoint               | Central `requireRole` middleware, deny by default                                                                   | per-endpoint 403 tests     |
|                | Privilege escalation at register            | Strict schema rejects `role`; service always sets CUSTOMER                                                          | auth integration           |
|                | Stale privileges after demotion             | User re-loaded per request; DISABLED rejected                                                                       | auth integration           |
|                | IDOR on purchases                           | `GET /purchases/mine` filters by authenticated id; admin list requires role                                         | purchases integration      |
| Input          | SQL injection                               | Prisma parameterization; no string-built SQL (raw SQL uses tagged templates)                                        | search tests with payloads |
|                | Mass assignment                             | Zod `.strict()` on every body                                                                                       | validation tests           |
|                | LIKE-wildcard abuse (`%`)                   | Filters treated literally                                                                                           | search test                |
|                | Oversized body / pagination abuse           | `express.json({limit:'10kb'})`, `pageSize ≤ 100`                                                                    | validation tests           |
| Business logic | Overselling via race                        | Atomic conditional UPDATE in a transaction + DB CHECK                                                               | concurrency test           |
|                | Double submit / retry duplicates            | Idempotency-Key                                                                                                     | purchases integration      |
|                | Price tampering                             | Price is never accepted from the purchase request; captured server-side                                             | purchases integration      |
|                | Integer overflow / absurd quantities        | Bounds I8, DB CHECKs                                                                                                | boundary tests             |
| Data exposure  | Hash/secret leakage in responses or logs    | DTO mappers whitelist fields; pino redaction of `authorization`, `cookie`, `password`, `token`                      | logging test               |
|                | Stack traces to clients                     | Central error handler returns generic 500                                                                           | error-handler test         |
| Availability   | Abuse of expensive endpoints                | Rate limits, request-size limit, DB statement/pool timeouts                                                         | —                          |

## Residual risks / deliberately deferred

- **Rate-limit store is per-process.** Behind N instances the limit is N×. Mitigation for production: edge/WAF limits or a shared store.
- **No email verification, password reset or MFA.** Out of scope for the assignment; documented as next steps.
- **Access tokens are valid until expiry (≤15 min) for stateless checks**, but because the user row is re-read per request, disabling a user is effective immediately.
- **Account enumeration** via registration (`409 EMAIL_TAKEN`) is accepted for UX; login does not leak existence.
- **Audit log tamper-resistance** relies on DB grants, not cryptographic chaining.
- **HTTPS termination** is the deployment platform's job; `Secure` cookies and HSTS activate when `NODE_ENV=production`.
- Dependency scanning is `npm audit` in CI; it is advisory, not proof of safety.
