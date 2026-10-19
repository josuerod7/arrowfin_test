import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, JwtAuthGuard } from '../../auth/jwt.guard';
import { GetSnapshot, Principal } from '../application/get-snapshot';

const ACCOUNT_ID = /^ACC-\d{1,10}$/;

@Controller('snapshot')
@UseGuards(JwtAuthGuard)
export class SnapshotController {
  constructor(private readonly getSnapshot: GetSnapshot) {}

  // traderId / brokerId come only from the verified token. accountId is a *selector*
  // inside the trader's own accounts, never an authority.
  @Get()
  async get(@CurrentPrincipal() who: Principal, @Query('accountId') accountId?: string) {
    if (accountId !== undefined && !ACCOUNT_ID.test(accountId)) throw new NotFoundException();
    const view = await this.getSnapshot.execute(who, accountId);
    if (!view) throw new NotFoundException(); // same response for "not yours" and "doesn't exist"
    return view;
  }
}
