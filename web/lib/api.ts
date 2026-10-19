export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Mirrors SnapshotView in api/src/snapshot/application/get-snapshot.ts.
// A shared package would remove the duplication; cut for time.
export interface Position {
  symbol: string;
  netQty: number;
  avgPrice: number;
  markPrice: number | null;
  unrealizedPnl: number;
}

export interface Snapshot {
  accountId: string;
  accountStatus: string;
  asOf: string;
  sessionStart: string;
  positions: Position[];
  realizedPnl: number;
  unrealizedPnl: number;
  commissions: number;
  dayPnl: number;
  risk: { score: number | null; notional: number };
}

export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export async function fetchSnapshot(token: string): Promise<Snapshot> {
  const res = await fetch(`${API_URL}/snapshot`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}
