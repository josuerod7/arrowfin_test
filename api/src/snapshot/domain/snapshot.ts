// Pure snapshot calculation. No I/O, no framework: everything it needs is passed in.

export type Side = 'BUY' | 'SELL';

export interface FillInput {
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  filledAt: Date;
  commissionUsd: number; // total for the fill (already qty × per-side rate in the dataset)
}

export interface SnapshotInput {
  fills: FillInput[]; // full account history up to asOf; positions carry across sessions
  pointValues: Record<string, number>; // USD per 1.0 price move per contract
  marks: Record<string, number>;
  balance: number;
  sessionStart: Date;
}

export interface Position {
  symbol: string;
  netQty: number; // + long, - short
  avgPrice: number;
  markPrice: number | null; // null = no mark available; position valued at avgPrice
  unrealizedPnl: number;
}

export interface Snapshot {
  positions: Position[];
  realizedPnl: number; // closes executed in today's session only
  unrealizedPnl: number;
  commissions: number; // today's session only
  dayPnl: number; // realized + unrealized - commissions
  risk: { score: number | null; notional: number }; // score null when balance <= 0
}

interface Book {
  qty: number;
  avg: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeSnapshot(input: SnapshotInput): Snapshot {
  const books = new Map<string, Book>();
  let realized = 0;
  let commissions = 0;

  const ordered = [...input.fills].sort((a, b) => a.filledAt.getTime() - b.filledAt.getTime());

  for (const f of ordered) {
    const pv = pointValueOf(input.pointValues, f.symbol);
    const inSession = f.filledAt >= input.sessionStart;
    const book = books.get(f.symbol) ?? { qty: 0, avg: 0 };
    const delta = f.side === 'BUY' ? f.quantity : -f.quantity;

    if (book.qty === 0 || Math.sign(book.qty) === Math.sign(delta)) {
      // Opening or adding: weighted average. Partial fills of one order just average in.
      const total = Math.abs(book.qty) + Math.abs(delta);
      book.avg = (book.avg * Math.abs(book.qty) + f.price * Math.abs(delta)) / total;
      book.qty += delta;
    } else {
      // Reducing, closing or flipping.
      const closed = Math.min(Math.abs(delta), Math.abs(book.qty));
      if (inSession) realized += (f.price - book.avg) * closed * Math.sign(book.qty) * pv;
      const flipped = Math.abs(delta) > Math.abs(book.qty);
      book.qty += delta;
      if (book.qty === 0) book.avg = 0;
      else if (flipped) book.avg = f.price;
    }

    if (inSession) commissions += f.commissionUsd;
    books.set(f.symbol, book);
  }

  const positions: Position[] = [];
  let unrealized = 0;
  let notional = 0;
  for (const [symbol, book] of books) {
    if (book.qty === 0) continue;
    const pv = pointValueOf(input.pointValues, symbol);
    const mark = input.marks[symbol] ?? null;
    const upnl = mark === null ? 0 : (mark - book.avg) * book.qty * pv;
    unrealized += upnl;
    notional += Math.abs(book.qty) * (mark ?? book.avg) * pv;
    positions.push({
      symbol,
      netQty: book.qty,
      avgPrice: book.avg,
      markPrice: mark,
      unrealizedPnl: round2(upnl),
    });
  }
  positions.sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Brief's formula: min(100, |notional| / balance × 100). No balance → no meaningful ratio.
  const score = input.balance > 0 ? round2(Math.min(100, (notional / input.balance) * 100)) : null;

  return {
    positions,
    realizedPnl: round2(realized),
    unrealizedPnl: round2(unrealized),
    commissions: round2(commissions),
    dayPnl: round2(realized + unrealized - commissions),
    risk: { score, notional: round2(notional) },
  };
}

// A missing contract spec would silently produce P&L off by 2–125,000×. Fail loudly instead.
function pointValueOf(pointValues: Record<string, number>, symbol: string): number {
  const pv = pointValues[symbol];
  if (pv === undefined) throw new Error(`Unknown instrument: ${symbol}`);
  return pv;
}
