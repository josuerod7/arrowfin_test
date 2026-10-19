# Security & PII

Scope: what this repo actually does today, with file:line references, and — kept separate — what
it does not do yet. Threat that drives every decision: **a trader of broker A sees anything that
belongs to broker B** (P0), followed by **regulated PII leaving the place it is stored**.

## 1. Auth model

**REST.** The frontend sends `Authorization: Bearer <JWT>` ([web/lib/api.ts:33](web/lib/api.ts)).
`JwtAuthGuard` verifies it ([api/src/auth/jwt.guard.ts:37](api/src/auth/jwt.guard.ts)) and builds a
`Principal { traderId: sub, brokerId }` from the claims only ([jwt.guard.ts:21-23](api/src/auth/jwt.guard.ts)).
The algorithm list is pinned to `HS256` on both sign and verify ([jwt.guard.ts:12](api/src/auth/jwt.guard.ts),
[app.module.ts:22](api/src/app.module.ts)), so `alg: none` and HS/RS confusion tokens are rejected
(tested: [tenant-isolation.int-spec.ts:71](api/test/tenant-isolation.int-spec.ts)). There is no
fallback secret: the app refuses to boot without `JWT_SECRET` ([app.module.ts:11-14](api/src/app.module.ts)).
Every failure is a bare 401 with no reason ([jwt.guard.ts:25](api/src/auth/jwt.guard.ts)).

There is no login: dev tokens are minted by `api/scripts/token.ts` and pasted into the page, which
keeps them in `sessionStorage` ([web/app/page.tsx:16](web/app/page.tsx)). That is a dev stand-in and
is XSS-readable; see §5.

**WebSocket.** The token travels in the Socket.IO handshake `auth` payload
([web/lib/useSnapshot.ts:33](web/lib/useSnapshot.ts)), not the URL, so it does not land in proxy or
access logs. The gateway authenticates in a namespace middleware that runs **before** the connection
is accepted ([api/src/snapshot/infrastructure/snapshot.gateway.ts:32-46](api/src/snapshot/infrastructure/snapshot.gateway.ts))
using the same `TokenVerifier` as REST.

**What stops a trader subscribing to another tenant's stream.** The client never names a room.
The server resolves the account through the same tenant-scoped `findAccount(brokerId, traderId, accountId?)`
used by REST ([snapshot.gateway.ts:36](api/src/snapshot/infrastructure/snapshot.gateway.ts)) and joins
`broker:{brokerId}:account:{accountId}` built from the principal ([snapshot.gateway.ts:17,42](api/src/snapshot/infrastructure/snapshot.gateway.ts)).
There is no `subscribe` handler at all, so there is nothing to abuse after the handshake. Verified
manually: a BRK-ARWP token asking for a BRK-SMPT account gets `connect_error: not_found`.

## 2. Tenant isolation

Enforced in three layers, from most to least likely to be the one that matters:

1. **Application port.** Every `SnapshotRepository` method takes `brokerId` as a required argument
   ([get-snapshot.ts:18](api/src/snapshot/application/get-snapshot.ts)); the use case only ever passes
   the principal's values ([get-snapshot.ts:40](api/src/snapshot/application/get-snapshot.ts)). The
   Prisma adapter puts `brokerId` **and** `traderId` in the `WHERE`
   ([prisma-snapshot.repository.ts:13,22](api/src/snapshot/infrastructure/prisma-snapshot.repository.ts)).
2. **Schema.** `broker_id` is denormalised onto `accounts` and `fills` and tied to the parent with
   composite foreign keys `(trader_id, broker_id)` and `(account_id, broker_id)`
   ([schema.prisma:45,82](api/prisma/schema.prisma)). A fill can't be stored under a broker different
   from its account's, so a bug that writes the wrong tenant fails at insert time instead of leaking
   later. The main index is tenant-prefixed: `(broker_id, account_id, filled_at)` ([schema.prisma:86](api/prisma/schema.prisma)).
3. **Tests.** [api/test/tenant-isolation.int-spec.ts](api/test/tenant-isolation.int-spec.ts) runs the
   real Nest app against the seeded DB: foreign account → 404 (l.46), validly-signed token with the
   wrong broker → 404 (l.50), extra `brokerId`/`traderId` query params are ignored (l.54), dev fill
   into a foreign account → 404 (l.61).

**If someone forgets `WHERE broker_id = ?` in six months, what catches it?** Honestly, today: only
the port signature, code review and the integration test — and only for code paths that test covers.
A new repository method that skips the filter would compile and ship. The next step I'd take is a
**tenant-scoped Prisma client** built with `$extends`: a per-request client created from the
`Principal` that adds `broker_id` to every `where`/`data` on tenant models (`Account`, `Fill`,
`Trader`) and throws if a tenant model is queried through the unscoped client. Repositories would
receive only the scoped client. Known gap I'd state up front: it does not cover `$queryRaw`, so raw
SQL would be banned on tenant tables by lint rule. Postgres RLS is the stronger guarantee and the
layer I'd add after that, once we can afford a per-request transaction with `SET LOCAL`.

## 3. PII handling

**Considered sensitive:** everything on `traders.csv` except `id`, `broker_id`, `kyc_status`
(names, email, phone, DOB, `ssn_last4`, address, and above all the free-text `notes` /
`audit_notes`), plus account balances and buying power (the brief lists balances as regulated).

**Stored vs not stored.** PII is never loaded: the seed whitelists columns per file
([seed.ts:13-15,20](api/prisma/seed.ts)) and the `traders` table has no PII columns
([schema.prisma:22](api/prisma/schema.prisma)). The cheapest PII to protect is the PII you don't have.
Caveat: the CSV parser holds whole rows in memory during the seed before projection; they are never
logged or written.

**Logged vs redacted.** We log identifiers only — fill id and account id when a fill is pushed
([snapshot.gateway.ts:52](api/src/snapshot/infrastructure/snapshot.gateway.ts)), never payloads or
request bodies. Both values are server-generated or come from the DB, which also removes the log
injection vector of echoing user input.

**DB vs WebSocket.** In the DB the risk is bulk access, so the control is "don't store it" and
tenant-scoped queries. On the socket the risk is mis-routing, so the control is *minimisation*: the
`fill` event carries id, symbol, side, qty, price, time — no balance, no P&L, no trader fields
([snapshot.gateway.ts:8-15](api/src/snapshot/infrastructure/snapshot.gateway.ts)). The client refetches
numbers over REST. A wrong-room event leaks one execution, not an account. **Known leak:** the REST
snapshot omits `balance` but returns `risk.score` and `risk.notional`, from which the balance can be
derived (`notional / score × 100`, when score < 100). Acceptable for the account owner; it would not
be acceptable in any response shown to anyone else.

## 4. A vulnerability we didn't introduce: IDOR on `accountId`

The attack: authenticated trader changes `?accountId=ACC-1006` to an account they don't own — the
exact bug in the Task 4 PR (`where: { accountId }`). Prevented by design, not by a check bolted on:

- `accountId` is a **selector inside the principal's accounts**, never an authority. It only ever
  reaches the DB alongside `brokerId` and `traderId` from the token
  ([prisma-snapshot.repository.ts:13](api/src/snapshot/infrastructure/prisma-snapshot.repository.ts)).
  There is no code path that loads an account by id alone and checks ownership afterwards (the
  "check" form is the one people forget).
- "Doesn't exist" and "not yours" return the **same 404** ([snapshot.controller.ts:18](api/src/snapshot/infrastructure/snapshot.controller.ts)),
  so the endpoint can't be used to enumerate which account ids exist in other tenants. Malformed ids
  get the same 404 ([snapshot.controller.ts:16](api/src/snapshot/infrastructure/snapshot.controller.ts)).
- The same rule applies to the WebSocket handshake and to the dev endpoint
  ([dev-fills.controller.ts:34-35](api/src/snapshot/infrastructure/dev-fills.controller.ts)), each
  covered by a test or manual check above.

**Dev endpoint.** `POST /dev/fills` is not merely disabled in production, it is **never
registered** unless `NODE_ENV !== 'production'` **and** `ENABLE_DEV_FILLS=true`
([app.module.ts:26](api/src/app.module.ts), [dev-fills.controller.ts:8-9](api/src/snapshot/infrastructure/dev-fills.controller.ts)).
It also requires a JWT and only writes into the caller's own account, with `broker_id` taken from
the token ([dev-fills.controller.ts:42](api/src/snapshot/infrastructure/dev-fills.controller.ts)), so a
shared staging box can't be used to push fills into someone else's stream.

## 5. What I'd do in production but didn't

Real login with short-lived access tokens in an **httpOnly, Secure, SameSite cookie** behind a
Next.js route handler (BFF), instead of a token in `sessionStorage`; the socket would authenticate
with the same cookie or a one-time ticket. **Re-check auth on long-lived sockets**: today a socket
authenticated at handshake stays in its room after the token expires or the account is closed — I'd
disconnect on `exp` and on account status changes. Asymmetric signing (RS256/EdDSA via KMS, `kid`
rotation) so services that verify can't mint. **Tenant-scoped Prisma client**, then **RLS** (§2).
**Structured logging with a redaction allow-list** (pino) and a global exception filter, because
Nest's default filter logs raw error messages and Prisma errors can include query arguments.
**Rate limiting** per principal and per IP on REST and on socket connects (Redis-backed throttler).
**Audit log** of who read which account's snapshot, append-only, as the regulator will ask.
If PII has to be stored: **column-level encryption with KMS envelope keys** for SSN/DOB/address, and
`notes`/`audit_notes` in a separate store with its own access policy, never in the trading DB.
Dependency and secret scanning in CI, and `Decimal` end-to-end for money instead of `number`.
