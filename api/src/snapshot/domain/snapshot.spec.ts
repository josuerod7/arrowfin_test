import { computeSnapshot, FillInput } from './snapshot';

const sessionStart = new Date('2026-08-24T22:00:00Z');
const pointValues = { MES: 5, MNQ: 2, ES: 50 };
const marks = { MES: 5642.25, MNQ: 19845.5, ES: 5642.25 };

const fill = (f: Partial<FillInput> & Pick<FillInput, 'symbol' | 'side' | 'quantity' | 'price'>): FillInput => ({
  filledAt: new Date('2026-08-25T13:00:00Z'),
  commissionUsd: 0.7 * f.quantity,
  ...f,
});

describe('computeSnapshot', () => {
  it('applies each instrument multiplier separately (MES ×5, MNQ ×2)', () => {
    const s = computeSnapshot({
      fills: [
        fill({ symbol: 'MES', side: 'BUY', quantity: 2, price: 5640 }),
        fill({ symbol: 'MNQ', side: 'SELL', quantity: 1, price: 19850 }),
      ],
      pointValues,
      marks,
      balance: 50_000,
      sessionStart,
    });

    expect(s.positions).toEqual([
      { symbol: 'MES', netQty: 2, avgPrice: 5640, markPrice: 5642.25, unrealizedPnl: 22.5 }, // 2.25×2×5
      { symbol: 'MNQ', netQty: -1, avgPrice: 19850, markPrice: 19845.5, unrealizedPnl: 9 }, // 4.5×1×2
    ]);
    expect(s.unrealizedPnl).toBe(31.5);
    expect(s.commissions).toBe(2.1); // 3 contracts × 0.70, one side each
    expect(s.dayPnl).toBe(29.4);
    // notional = 2×5642.25×5 + 1×19845.5×2 = 56422.5 + 39691 = 96113.5 → capped at 100
    expect(s.risk).toEqual({ score: 100, notional: 96113.5 });
  });

  it('realizes P&L only for closes in the current session and treats partial fills as one position', () => {
    const s = computeSnapshot({
      fills: [
        // Opened yesterday (previous session) in two partial fills of the same order.
        fill({ symbol: 'ES', side: 'BUY', quantity: 1, price: 5600, filledAt: new Date('2026-08-24T15:00:00Z') }),
        fill({ symbol: 'ES', side: 'BUY', quantity: 1, price: 5610, filledAt: new Date('2026-08-24T15:00:01Z') }),
        // Half closed today at 5620: (5620 - 5605) × 1 × 50 = 750
        fill({ symbol: 'ES', side: 'SELL', quantity: 1, price: 5620 }),
      ],
      pointValues,
      marks,
      balance: 100_000,
      sessionStart,
    });

    expect(s.realizedPnl).toBe(750);
    expect(s.commissions).toBe(0.7); // yesterday's commissions are not today's
    expect(s.positions).toEqual([
      { symbol: 'ES', netQty: 1, avgPrice: 5605, markPrice: 5642.25, unrealizedPnl: 1862.5 },
    ]);
  });

  it('returns an empty snapshot for a trader with no fills', () => {
    const s = computeSnapshot({ fills: [], pointValues, marks, balance: 25_000, sessionStart });
    expect(s).toEqual({
      positions: [],
      realizedPnl: 0,
      unrealizedPnl: 0,
      commissions: 0,
      dayPnl: 0,
      risk: { score: 0, notional: 0 },
    });
  });

  it('does not divide by zero when the account has no balance', () => {
    const s = computeSnapshot({
      fills: [fill({ symbol: 'MES', side: 'BUY', quantity: 1, price: 5640 })],
      pointValues,
      marks,
      balance: 0,
      sessionStart,
    });
    expect(s.risk.score).toBeNull();
    expect(s.risk.notional).toBe(28211.25);
  });

  it('fails loudly on an instrument without a contract spec', () => {
    expect(() =>
      computeSnapshot({
        fills: [fill({ symbol: 'ZZ', side: 'BUY', quantity: 1, price: 1 })],
        pointValues,
        marks,
        balance: 1,
        sessionStart,
      }),
    ).toThrow('Unknown instrument: ZZ');
  });
});
