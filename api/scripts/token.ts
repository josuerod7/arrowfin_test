// Dev stand-in for a login: `pnpm token T-005` mints a JWT for that trader using the broker
// stored in the DB. `pnpm token T-005 BRK-OTHER` forges a mismatched broker to test isolation.
import 'dotenv/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';

async function main() {
  const [traderId, brokerOverride] = process.argv.slice(2);
  if (!traderId) throw new Error('usage: pnpm token <traderId> [brokerId]');
  const prisma = new PrismaClient();
  const trader = await prisma.trader.findUnique({ where: { id: traderId }, select: { brokerId: true } });
  await prisma.$disconnect();
  if (!trader) throw new Error(`unknown trader ${traderId}`);

  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  console.log(jwt.sign({ sub: traderId, brokerId: brokerOverride ?? trader.brokerId }, { algorithm: 'HS256', expiresIn: '8h' }));
}

main();
