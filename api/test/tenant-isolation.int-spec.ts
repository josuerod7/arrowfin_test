// Integration: real Nest app + real Prisma against the seeded DB. Run `pnpm seed` first.
import 'dotenv/config';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('GET /snapshot tenant isolation', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let mine: { id: string; traderId: string; brokerId: string };
  let foreign: { id: string; brokerId: string };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    jwt = mod.get(JwtService);

    const prisma = mod.get(PrismaService);
    const accounts = await prisma.account.findMany({
      where: { status: 'active' },
      select: { id: true, traderId: true, brokerId: true },
      orderBy: { id: 'asc' },
    });
    mine = accounts[0];
    foreign = accounts.find((a) => a.brokerId !== mine.brokerId)!;
  });

  afterAll(() => app.close());

  const get = (token: string | null, accountId?: string) => {
    const r = request(app.getHttpServer()).get('/snapshot').query(accountId ? { accountId } : {});
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const tokenFor = (sub: string, brokerId: string) => jwt.sign({ sub, brokerId });

  it('returns my own snapshot', async () => {
    const res = await get(tokenFor(mine.traderId, mine.brokerId), mine.id).expect(200);
    expect(res.body.accountId).toBe(mine.id);
  });

  it('404s (not 403) when asking for another tenant\'s account', async () => {
    await get(tokenFor(mine.traderId, mine.brokerId), foreign.id).expect(404);
  });

  it('404s when a validly-signed token carries the wrong broker for the trader', async () => {
    await get(tokenFor(mine.traderId, foreign.brokerId), mine.id).expect(404);
  });

  it('cannot widen scope via query params', async () => {
    const res = await get(tokenFor(mine.traderId, mine.brokerId))
      .query({ brokerId: foreign.brokerId, traderId: 'anything' })
      .expect(200);
    expect(res.body.accountId).toBe(mine.id);
  });

  it('POST /dev/fills cannot write into another tenant\'s account', async () => {
    const body = { account_id: foreign.id, instrument_symbol: 'MES', side: 'BUY', quantity: 1, price: 5600 };
    await request(app.getHttpServer()).post('/dev/fills').send(body).expect(401);
    await request(app.getHttpServer())
      .post('/dev/fills')
      .set('Authorization', `Bearer ${tokenFor(mine.traderId, mine.brokerId)}`)
      .send(body)
      .expect(404);
  });

  it('rejects missing and unsigned ("alg: none") tokens with 401', async () => {
    await get(null).expect(401);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: mine.traderId, brokerId: mine.brokerId })}.`;
    await get(none).expect(401);
  });
});
