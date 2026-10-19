import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, JWT_ALGORITHMS, TokenVerifier } from './auth/jwt.guard';
import { PrismaService } from './prisma.service';
import { GetSnapshot, SNAPSHOT_REPOSITORY, SnapshotRepository } from './snapshot/application/get-snapshot';
import { PrismaSnapshotRepository } from './snapshot/infrastructure/prisma-snapshot.repository';
import { SnapshotController } from './snapshot/infrastructure/snapshot.controller';
import { DevFillsController, devFillsEnabled } from './snapshot/infrastructure/dev-fills.controller';
import { SnapshotGateway } from './snapshot/infrastructure/snapshot.gateway';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`); // no fallback secret, ever
  return v;
}

@Module({
  imports: [
    JwtModule.register({
      secret: requiredEnv('JWT_SECRET'),
      signOptions: { algorithm: 'HS256', expiresIn: '1h' },
      verifyOptions: { algorithms: JWT_ALGORITHMS },
    }),
  ],
  // The dev route is not merely guarded in production: it is never registered.
  controllers: [SnapshotController, ...(devFillsEnabled() ? [DevFillsController] : [])],
  providers: [
    PrismaService,
    TokenVerifier,
    JwtAuthGuard,
    SnapshotGateway,
    { provide: SNAPSHOT_REPOSITORY, useClass: PrismaSnapshotRepository },
    {
      provide: GetSnapshot,
      inject: [SNAPSHOT_REPOSITORY],
      useFactory: (repo: SnapshotRepository) => {
        const asOf = process.env.SNAPSHOT_AS_OF; // dataset cut; unset → real clock
        return new GetSnapshot(repo, () => (asOf ? new Date(asOf) : new Date()));
      },
    },
  ],
})
export class AppModule {}
