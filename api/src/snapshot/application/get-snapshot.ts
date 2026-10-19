import { computeSnapshot, FillInput, Snapshot } from '../domain/snapshot';
import { cmeSessionStart } from '../domain/session';

// Who is asking. Built only from a verified JWT, never from request params.
export interface Principal {
  traderId: string;
  brokerId: string;
}

export interface AccountRow {
  id: string;
  status: string;
  balance: number;
}

// Port. Every method takes brokerId explicitly: there is no way to call it unscoped.
export interface SnapshotRepository {
  findAccount(brokerId: string, traderId: string, accountId?: string): Promise<AccountRow | null>;
  findFills(brokerId: string, accountId: string, until: Date): Promise<FillInput[]>;
  findMarket(): Promise<{ pointValues: Record<string, number>; marks: Record<string, number> }>;
}
export const SNAPSHOT_REPOSITORY = Symbol('SnapshotRepository');

export interface SnapshotView extends Snapshot {
  accountId: string;
  accountStatus: string;
  asOf: string;
  sessionStart: string;
}

export class GetSnapshot {
  constructor(
    private readonly repo: SnapshotRepository,
    private readonly now: () => Date,
  ) {}

  // Returns null when the account does not exist OR belongs to someone else:
  // callers cannot distinguish the two (→ 404, never 403).
  async execute(who: Principal, accountId?: string): Promise<SnapshotView | null> {
    const account = await this.repo.findAccount(who.brokerId, who.traderId, accountId);
    if (!account) return null;

    const asOf = this.now();
    const sessionStart = cmeSessionStart(asOf);
    const [fills, market] = await Promise.all([
      this.repo.findFills(who.brokerId, account.id, asOf),
      this.repo.findMarket(),
    ]);

    const snapshot = computeSnapshot({ fills, ...market, balance: account.balance, sessionStart });
    return {
      accountId: account.id,
      accountStatus: account.status,
      asOf: asOf.toISOString(),
      sessionStart: sessionStart.toISOString(),
      ...snapshot,
    };
  }
}
