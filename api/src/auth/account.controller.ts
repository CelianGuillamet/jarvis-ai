import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PublicEndpoint } from './public-endpoint';
import type { AuthenticatedRequest } from './session.guard';

@Controller('account')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @PublicEndpoint()
  @Get('sign-in-options')
  signInOptions() {
    return { google: Boolean(this.auth.config.google) };
  }

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: request.identity.userId },
      select: { id: true, name: true, email: true },
    });
  }
}
