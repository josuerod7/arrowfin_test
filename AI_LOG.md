# AI log

Working log for the "LLM use" section of the README. Claude Code (Opus) as pair programmer.

## Setup + data review
- **Claude generated:** monorepo skeleton (pnpm workspace, docker-compose Postgres), header-only
  inspection of the CSVs (never opened `traders.csv` rows), data findings: today's CME session is
  2026-08-24T22:00Z → 2026-08-25T21:00Z; `commission_usd` is already qty × rate per fill;
  ACC-1013 has balance 0; ACC-1010 restricted, ACC-1012 closed.
- **I decided:** one snapshot per account (risk divides by an account balance); no login, dev JWTs
  minted by a script; pnpm.
- **Changed afterwards:** _(fill in)_

## Task 1 – Backend
- **Claude generated:** Prisma schema (broker_id denormalised on accounts/fills, composite FKs
  `(trader_id, broker_id)` / `(account_id, broker_id)`, index `fills(broker_id, account_id, filled_at)`,
  no PII columns on traders), CSV seed that whitelists columns, pure `computeSnapshot` (average cost,
  history replayed for carried positions, realized/commissions only inside today's session, risk
  `null` when balance ≤ 0, throws on unknown instrument), pure `cmeSessionStart` (Intl +
  America/Chicago, DST-safe), `GetSnapshot` use case behind a `SnapshotRepository` port, Prisma
  adapter, controller (404 for not-found and not-yours), JWT guard with HS256 pinned, dev token
  script, unit tests (9) and a tenant-isolation integration test.
- **I decided:** one account per snapshot; default = first active account; `accountId` query is a
  selector validated against the JWT principal.
- **Rejected (by me / by us):** FIFO lots, Prisma `$extends` tenant injection, Postgres RLS
  (→ SECURITY.md "what I'd do"), float-free money math (Decimal → number in the domain).
- **Changed afterwards:** _(fill in)_

## Task 2 – Frontend + WebSocket
- **Claude generated:** `SnapshotGateway` (auth + room selection in a handshake middleware, no
  subscribe handler, room `broker:{b}:account:{a}`, minimal `fill` payload), `POST /dev/fills`
  (registered only when `NODE_ENV !== 'production' && ENABLE_DEV_FILLS === 'true'`, tenant looked
  up from the account, never from the body), Next 15 app: TanStack query + `useSnapshotSocket`
  (token in handshake `auth`, refetch on every connect/fill, cleanup on unmount, auth errors stop
  retrying), widget with loading/error/empty, stale banner + dimmed numbers while disconnected,
  risk > 75 red border + pulsing "HIGH RISK" label. Dev token pasted into sessionStorage.
- **Verified end-to-end:** fill pushed → risk 53 → 89 HIGH RISK; WS cross-tenant (BRK-ARWP token
  asking for a BRK-SMPT account) → `not_found`; no token → `unauthorized`; API stopped → banner;
  fill inserted while offline → picked up by the refetch on reconnect.
- **I decided:** keep the WS payload a minimal fill event + client refetch of `GET /snapshot`
  (over debounced refetch and over pushing the full snapshot): one source of truth for P&L, the
  socket carries as little as possible, and a mis-routed event would leak a fill, not a balance.
  Accepted cost: one REST call per fill; debounce is the next step if bursts become a problem.
- **Changed afterwards:** _(fill in)_

## Task 3 – SECURITY.md
- **Claude generated:** first draft of SECURITY.md with file:line citations (all verified against
  the code), and the auth guard + ownership check on `POST /dev/fills` plus its integration test.
- **I decided:** (1) propose a tenant-scoped Prisma `$extends` client as the next safety net for a
  forgotten `WHERE broker_id` (RLS after it); (2) feature IDOR on `accountId` as the prevented
  vulnerability (ties to the Task 4 PR); (3) protect `/dev/fills` with JWT + ownership now instead
  of only documenting the gap.
- **Changed afterwards:** _(my own wording edits after the mock interview questions)_

## Task 4 – Code review
- **Written by me.** Claude did not draft any of the review text.
- **Claude's role:** feedback on two drafts, limited to blind spots and clarity: auth guard missing
  as a prerequisite for the IDOR fix, `...p` over-exposure, missing isolation test, log injection
  via `accountId`; flagged that I had downgraded the logging issue, lost the "fix first", mixed
  404/403 against my own SECURITY.md, and duplicated the analysis.
- **Changed afterwards:** logging back to blocker, explicit "fix first", 404 with reason, sign of
  `qty` turned into a question to the author, single PR comment in English.

## Task 5 – Reflection
- **Written by me.** Claude did not draft any of the three paragraphs.
- **Claude's role:** feedback on one draft: my first "most proud" decision (composite FKs /
  denormalised broker_id) was logged here as Claude-generated, so I switched to a decision that
  was mine (minimal WS event + refetch); "second day" listed three things instead of one; the
  handoff only listed what not to change; "prove" overstated test coverage; fills are scoped by
  broker + a trader-resolved account, not by trader directly.
- **Changed afterwards:** all of the above.
