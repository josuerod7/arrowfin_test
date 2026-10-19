import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AccountRow, SnapshotRepository } from '../application/get-snapshot';
import { FillInput, Side } from '../domain/snapshot';

@Injectable()
export class PrismaSnapshotRepository implements SnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccount(brokerId: string, traderId: string, accountId?: string): Promise<AccountRow | null> {
    const row = await this.prisma.account.findFirst({
      // brokerId AND traderId always present. Without accountId: the trader's first active account.
      where: { brokerId, traderId, ...(accountId ? { id: accountId } : { status: 'active' }) },
      orderBy: { id: 'asc' },
      select: { id: true, status: true, balance: true },
    });
    return row && { id: row.id, status: row.status, balance: row.balance.toNumber() };
  }

  async findFills(brokerId: string, accountId: string, until: Date): Promise<FillInput[]> {
    const rows = await this.prisma.fill.findMany({
      where: { brokerId, accountId, filledAt: { lte: until } }, // uses (broker_id, account_id, filled_at)
      orderBy: [{ filledAt: 'asc' }, { id: 'asc' }],
      select: { symbol: true, side: true, quantity: true, price: true, filledAt: true, commissionUsd: true },
    });
    return rows.map((r) => ({
      symbol: r.symbol,
      side: r.side as Side,
      quantity: r.quantity,
      price: r.price.toNumber(),
      filledAt: r.filledAt,
      commissionUsd: r.commissionUsd.toNumber(),
    }));
  }

  // Reference data: not tenant-owned, so no broker filter.
  async findMarket() {
    const [instruments, prices] = await Promise.all([
      this.prisma.instrument.findMany(),
      this.prisma.marketPrice.findMany(),
    ]);
    return {
      pointValues: Object.fromEntries(instruments.map((i) => [i.symbol, i.pointValueUsd.toNumber()])),
      marks: Object.fromEntries(prices.map((p) => [p.symbol, p.markPrice.toNumber()])),
    };
  }
}
