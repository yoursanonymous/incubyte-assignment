# API reference

The machine-readable contract is [`openapi.json`](openapi.json) (also served at `GET /api/docs/openapi.json`). A test requests every documented operation to prove it exists and enforces its declared authentication.

## Conventions

- JSON in/out. Money is an **exact decimal string** (`"24999.99"`); requests may send a number or string, never more than 2 decimals.
- Auth: `Authorization: Bearer <access token>` (15 min). Refresh uses an HttpOnly cookie on `/api/auth`.
- Errors: `{ "error": { "code", "message", "details", "requestId" } }` — 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict/insufficient stock, 422 idempotency-key reuse, 429 rate limit, 503 database unavailable, 500 unexpected.
- Lists: `{ data: [...], pagination: { page, pageSize, total, totalPages } }`, `pageSize ≤ 100`, stable total ordering.

## Access policy

| Operation                                        | Who                                                           |
| ------------------------------------------------ | ------------------------------------------------------------- |
| register, login, refresh, logout                 | public (refresh/logout need the cookie and an allowed Origin) |
| list, search, get vehicle, purchase, own history | any authenticated user                                        |
| create, update, delete, restock, all purchases   | ADMIN only                                                    |

## Examples

```bash
curl -c jar -H 'Content-Type: application/json' -d '{"email":"me@example.com","password":"a-long-password"}' localhost:3000/api/auth/register
TOKEN=...   # accessToken from the response
curl -H "Authorization: Bearer $TOKEN" 'localhost:3000/api/vehicles/search?make=toy&minPrice=10000&maxPrice=30000&inStock=true'
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: 7c1f-order-1' -H 'Content-Type: application/json' \
     -d '{"quantity":2}' localhost:3000/api/vehicles/<id>/purchase
```

Replaying the same `Idempotency-Key` with the same body returns the original response with `Idempotent-Replayed: true` and does not purchase again; a different body with that key returns `422`. A failed purchase does not consume the key.
