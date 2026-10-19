'use client';
import { HttpError, type Snapshot } from '@/lib/api';
import { type LinkStatus, useSnapshotQuery, useSnapshotSocket } from '@/lib/useSnapshot';

const HIGH_RISK = 75;

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const pnlColor = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-zinc-300');

export function SnapshotWidget({ token }: { token: string }) {
  const query = useSnapshotQuery(token);
  const link = useSnapshotSocket(token);

  if (query.isPending) return <Shell><p className="animate-pulse text-zinc-500">Loading snapshot…</p></Shell>;
  if (query.isError) return <Shell><ErrorState error={query.error} onRetry={() => query.refetch()} /></Shell>;

  const s = query.data;
  const stale = link !== 'live';
  const high = s.risk.score !== null && s.risk.score > HIGH_RISK;

  return (
    <Shell high={high}>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Daily snapshot</h1>
          <p className="text-xs text-zinc-500">
            {s.accountId} · {s.accountStatus} · session from {new Date(s.sessionStart).toUTCString()}
          </p>
        </div>
        <LinkBadge status={link} />
      </header>

      {stale && (
        <p role="status" className="mt-3 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Live feed {link === 'rejected' ? 'unavailable' : 'disconnected'} — figures may be out of date.
        </p>
      )}

      <div className={stale ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
        <Risk score={s.risk.score} notional={s.risk.notional} />
        <Pnl s={s} />
        <Positions s={s} />
      </div>
    </Shell>
  );
}

function Shell({ children, high = false }: { children: React.ReactNode; high?: boolean }) {
  return (
    <section
      className={`mx-auto mt-10 max-w-3xl rounded-lg border p-5 ${
        high ? 'border-red-500 bg-red-950/40 ring-2 ring-red-500/60' : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      {children}
    </section>
  );
}

function Risk({ score, notional }: { score: number | null; notional: number }) {
  if (score === null) {
    return (
      <div className="mt-5 rounded border border-amber-600/50 bg-amber-950/30 p-3 text-sm text-amber-200">
        Risk unavailable: account has no balance. Open notional {usd(notional)}.
      </div>
    );
  }
  const high = score > HIGH_RISK;
  return (
    <div className="mt-5" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-zinc-400">Risk</span>
        {high && (
          <span className="animate-pulse rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase text-white">
            ⚠ High risk
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className={`text-3xl font-bold ${high ? 'text-red-400' : 'text-zinc-100'}`}>{score.toFixed(0)}</span>
        <div className="h-2 flex-1 rounded bg-zinc-800" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-2 rounded ${high ? 'bg-red-500' : score > 50 ? 'bg-amber-400' : 'bg-emerald-500'}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500">Open notional {usd(notional)}</p>
    </div>
  );
}

function Pnl({ s }: { s: Snapshot }) {
  const cells = [
    ['Day P&L', s.dayPnl],
    ['Realized', s.realizedPnl],
    ['Unrealized', s.unrealizedPnl],
    ['Commissions', -s.commissions],
  ] as const;
  return (
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map(([label, v]) => (
        <div key={label} className="rounded bg-zinc-950/60 p-3">
          <dt className="text-xs text-zinc-500">{label}</dt>
          <dd className={`text-lg font-semibold ${pnlColor(v)}`}>{usd(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Positions({ s }: { s: Snapshot }) {
  if (s.positions.length === 0) {
    return <p className="mt-5 text-sm text-zinc-500">No open positions.</p>;
  }
  return (
    <table className="mt-5 w-full text-sm">
      <thead className="text-left text-xs uppercase text-zinc-500">
        <tr>
          <th className="py-1">Instrument</th>
          <th className="text-right">Net qty</th>
          <th className="text-right">Avg</th>
          <th className="text-right">Mark</th>
          <th className="text-right">Unrealized</th>
        </tr>
      </thead>
      <tbody>
        {s.positions.map((p) => (
          <tr key={p.symbol} className="border-t border-zinc-800">
            <td className="py-1.5 font-medium">{p.symbol}</td>
            <td className={`text-right ${p.netQty > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {p.netQty > 0 ? `+${p.netQty}` : p.netQty}
            </td>
            <td className="text-right">{p.avgPrice.toFixed(4)}</td>
            <td className="text-right">{p.markPrice?.toFixed(4) ?? '—'}</td>
            <td className={`text-right ${pnlColor(p.unrealizedPnl)}`}>{usd(p.unrealizedPnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinkBadge({ status }: { status: LinkStatus }) {
  const style: Record<LinkStatus, string> = {
    live: 'bg-emerald-500/15 text-emerald-300',
    connecting: 'bg-zinc-700 text-zinc-300',
    reconnecting: 'bg-amber-500/15 text-amber-300',
    rejected: 'bg-red-500/15 text-red-300',
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${style[status]}`}>● {status}</span>;
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const status = error instanceof HttpError ? error.status : null;
  const msg =
    status === 401 ? 'Session expired or invalid token.' : status === 404 ? 'No account found for this trader.' : 'Could not load the snapshot.';
  return (
    <div role="alert" className="text-sm">
      <p className="text-red-300">{msg}</p>
      {status !== 401 && status !== 404 && (
        <button onClick={onRetry} className="mt-2 rounded bg-zinc-800 px-3 py-1 text-zinc-200 hover:bg-zinc-700">
          Retry
        </button>
      )}
    </div>
  );
}
