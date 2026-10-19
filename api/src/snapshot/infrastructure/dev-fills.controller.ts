import { BadRequestException, Body, Controller, Inject, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, JwtAuthGuard } from '../../auth/jwt.guard';
import { PrismaService } from '../../prisma.service';
import { Principal, SNAPSHOT_REPOSITORY, SnapshotRepository } from '../application/get-snapshot';
import { SnapshotGateway } from './snapshot.gateway';

// Registered only when devFillsEnabled() (see app.module.ts). Not a feature: a test harness.
export const devFillsEnabled = () =>
  process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_FILLS === 'true';

interface DevFillBody {
  account_id: string;
  instrument_symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  commission_usd?: number;
}

@Controller('dev/fills')
@UseGuards(JwtAuthGuard)
export class DevFillsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SNAPSHOT_REPOSITORY) private readonly repo: SnapshotRepository,
    private readonly gateway: SnapshotGateway,
  ) {}

  // Even a test harness only writes into the caller's own accounts: same ownership check as GET /snapshot.
  @Post()
  async create(@CurrentPrincipal() who: Principal, @Body() b: DevFillBody) {
    if (!['BUY', 'SELL'].includes(b?.side) || !(b.quantity > 0) || !(b.price > 0)) throw new BadRequestException();

    const account = await this.repo.findAccount(who.brokerId, who.traderId, String(b.account_id));
    if (!account) throw new NotFoundException();

    const stamp = Date.now();
    const fill = await this.prisma.fill.create({
      data: {
        id: `FIL-DEV-${stamp}`,
        orderId: `ORD-DEV-${stamp}`,
        brokerId: who.brokerId, // from the token; the composite FK rejects any mismatch with the account
        accountId: account.id,
        symbol: b.instrument_symbol,
        side: b.side,
        quantity: b.quantity,
        price: b.price,
        commissionUsd: b.commission_usd ?? 0,
        filledAt: new Date(process.env.SNAPSHOT_AS_OF ?? Date.now()), // stay inside the "today" window
      },
    });

    this.gateway.emitFill(who.brokerId, fill.accountId, {
      id: fill.id,
      symbol: fill.symbol,
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price.toNumber(),
      filledAt: fill.filledAt.toISOString(),
    });
    return { id: fill.id };
  }
}
