import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { isTrustedMutationOrigin } from './auth-policy';
import { PUBLIC_ENDPOINT } from './public-endpoint';
import { RequestQuotaService } from '../http/request-quota.service';
import { REQUEST_QUOTAS } from '../http/request-limits';
import type { Response } from 'express';

export type AuthenticatedRequest = Request & {
  identity: { userId: string; sessionId: string };
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
    private readonly quotas: RequestQuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !isTrustedMutationOrigin(
        request.get('origin'),
        this.auth.config.trustedOrigins,
      )
    ) {
      throw new ForbiddenException('Origine de la requête non autorisée.');
    }
    const headers = new Headers();
    // Only signed session cookies participate in identity; conversation IDs and
    // client-supplied user/session headers are never authentication credentials.
    if (request.headers.cookie) headers.set('cookie', request.headers.cookie);
    request.identity = await this.auth.requireIdentity(headers);
    const owner = request.identity.userId;
    const costly =
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
      request.path.toLowerCase().replace(/\/$/, '') === '/auth/google';
    const retryAfter =
      this.quotas.consume(`account:${owner}`, REQUEST_QUOTAS.account) ??
      (costly
        ? this.quotas.consume(`costly:${owner}`, REQUEST_QUOTAS.costly)
        : null);
    if (retryAfter !== null) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        'Trop de requêtes. Réessaie dans un instant.',
        429,
      );
    }
    return true;
  }
}
