import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Principal } from '../snapshot/application/get-snapshot';

// Algorithm pinned: tokens signed with "none" or RS/HS confusion are rejected by verify().
export const JWT_ALGORITHMS = ['HS256' as const];

@Injectable()
export class TokenVerifier {
  constructor(private readonly jwt: JwtService) {}

  verify(token: string | undefined): Principal {
    if (!token) throw new UnauthorizedException();
    try {
      const p = this.jwt.verify<{ sub?: unknown; brokerId?: unknown }>(token, { algorithms: JWT_ALGORITHMS });
      if (typeof p.sub !== 'string' || typeof p.brokerId !== 'string') throw new Error('bad claims');
      return { traderId: p.sub, brokerId: p.brokerId };
    } catch {
      throw new UnauthorizedException(); // no detail: don't help token forgers
    }
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    req.principal = this.verifier.verify(scheme === 'Bearer' ? token : undefined);
    return true;
  }
}

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().principal,
);
