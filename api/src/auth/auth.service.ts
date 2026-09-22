import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { RequestHandler } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { readAuthConfig } from './auth-config';
import { createAuth } from './create-auth';
import { isAccountAdmitted, normalizeAccountEmail } from './auth-policy';

@Injectable()
export class AuthService {
  readonly config = readAuthConfig(process.env);
  private readonly instance: ReturnType<typeof createAuth>;

  constructor(private readonly prisma: PrismaService) {
    this.instance = createAuth(prisma, this.config);
  }

  async nodeHandler(): Promise<RequestHandler> {
    const auth = await this.instance;
    const { toNodeHandler } = await import('better-auth/node');
    return toNodeHandler(auth);
  }

  async requireIdentity(
    headers: Headers,
  ): Promise<{ userId: string; sessionId: string }> {
    const auth = await this.instance;
    const current = await auth.api.getSession({
      headers,
      query: { disableCookieCache: true },
    });
    if (!current || current.session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Connexion requise.');
    }
    // Admission is checked for every private request, so revoking an invite or
    // disabling an account invalidates existing access without a cache window.
    const user = await this.prisma.user.findUnique({
      where: { id: current.user.id },
    });
    const invite = user
      ? await this.prisma.betaInvite.findUnique({
          where: { email: normalizeAccountEmail(user.email) },
        })
      : null;
    if (!user || !isAccountAdmitted(user, invite)) {
      throw new UnauthorizedException('Accès révoqué.');
    }
    return { userId: user.id, sessionId: current.session.id };
  }
}
