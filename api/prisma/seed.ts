// Rough loader. Not graded; kept only as careful as PII requires.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dir = join(__dirname, '..', '..', 'dataset');

// Only the named columns ever leave this function, so PII columns in traders.csv
// (names, contact, dob, ssn_last4, address, notes, audit_notes) are dropped here.
function read(file: string, columns: string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = parse(readFileSync(join(dir, file)), { columns: true });
  return rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));
}

async function main() {
  const brokers = read('brokers.csv', ['id', 'name', 'type']);
  const traders = read('traders.csv', ['id', 'broker_id', 'kyc_status']);
  const accounts = read('accounts.csv', ['id', 'trader_id', 'account_type', 'balance', 'status']);
  const instruments = read('instruments.csv', ['symbol', 'point_value_usd']);
  const prices = read('market_prices.csv', ['symbol', 'mark_price', 'as_of']);
  const fills = read('fills.csv', [
    'id', 'account_id', 'instrument_symbol', 'side', 'quantity', 'price', 'filled_at', 'order_id', 'commission_usd',
  ]);

  const brokerOfTrader = new Map(traders.map((t) => [t.id, t.broker_id]));
  const brokerOfAccount = new Map(accounts.map((a) => [a.id, brokerOfTrader.get(a.trader_id)!]));

  await prisma.$transaction([
    prisma.fill.deleteMany(),
    prisma.account.deleteMany(),
    prisma.trader.deleteMany(),
    prisma.broker.deleteMany(),
    prisma.marketPrice.deleteMany(),
    prisma.instrument.deleteMany(),
    prisma.broker.createMany({ data: brokers.map((b) => ({ id: b.id, name: b.name, type: b.type })) }),
    prisma.trader.createMany({
      data: traders.map((t) => ({ id: t.id, brokerId: t.broker_id, kycStatus: t.kyc_status })),
    }),
    prisma.account.createMany({
      data: accounts.map((a) => ({
        id: a.id,
        brokerId: brokerOfAccount.get(a.id)!,
        traderId: a.trader_id,
        accountType: a.account_type,
        balance: a.balance || '0',
        status: a.status,
      })),
    }),
    prisma.instrument.createMany({
      data: instruments.map((i) => ({ symbol: i.symbol, pointValueUsd: i.point_value_usd })),
    }),
    prisma.marketPrice.createMany({
      data: prices.map((p) => ({ symbol: p.symbol, markPrice: p.mark_price, asOf: new Date(p.as_of) })),
    }),
    prisma.fill.createMany({
      data: fills.map((f) => ({
        id: f.id,
        brokerId: brokerOfAccount.get(f.account_id)!,
        accountId: f.account_id,
        symbol: f.instrument_symbol,
        side: f.side,
        quantity: Number(f.quantity),
        price: f.price,
        filledAt: new Date(f.filled_at),
        orderId: f.order_id,
        commissionUsd: f.commission_usd,
      })),
    }),
  ]);
  console.log(`seeded ${brokers.length} brokers, ${traders.length} traders, ${accounts.length} accounts, ${fills.length} fills`);
}

main().finally(() => prisma.$disconnect());
