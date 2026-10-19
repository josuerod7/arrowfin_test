import { Inject, Logger } from '@nestjs/common';
import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { TokenVerifier } from '../../auth/jwt.guard';
import { SNAPSHOT_REPOSITORY, SnapshotRepository } from '../application/get-snapshot';

// Exactly what the client needs to know a fill happened. No balance, no trader data.
export interface FillEvent {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  filledAt: string;
}

export const roomFor = (brokerId: string, accountId: string) => `broker:${brokerId}:account:${accountId}`;

@WebSocketGateway({ namespace: '/snapshot', cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' } })
export class SnapshotGateway implements OnGatewayInit {
  private readonly logger = new Logger(SnapshotGateway.name);
  @WebSocketServer() private ns!: Namespace;

  constructor(
    private readonly verifier: TokenVerifier,
    @Inject(SNAPSHOT_REPOSITORY) private readonly repo: SnapshotRepository,
  ) {}

  // Auth + room selection happen once, at handshake. Failing here yields `connect_error`
  // on the client and the socket never reaches any room. There is no subscribe message.
  afterInit(ns: Namespace) {
    ns.use(async (socket: Socket, next) => {
      try {
        const who = this.verifier.verify(socket.handshake.auth?.token);
        const requested = socket.handshake.auth?.accountId;
        const account = await this.repo.findAccount(
          who.brokerId,
          who.traderId,
          typeof requested === 'string' ? requested : undefined,
        );
        if (!account) return next(new Error('not_found'));
        await socket.join(roomFor(who.brokerId, account.id));
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  emitFill(brokerId: string, accountId: string, fill: FillEvent) {
    this.ns.to(roomFor(brokerId, accountId)).emit('fill', fill);
    this.logger.log(`fill ${fill.id} → ${accountId}`); // ids only, never payloads
  }
}
