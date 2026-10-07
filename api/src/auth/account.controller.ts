import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PublicEndpoint } from './public-endpoint';
import type { AuthenticatedRequest } from './session.guard';
import {
  AccountPreferencesSchema,
  AccountProfileSchema,
  AccountProfileExportSchema,
  SignInOptionsSchema,
} from '../contracts/v1';
import type { AccountPreferences } from '../contracts/v1';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import { dataUnavailable } from '../http/data-unavailable';

const preferenceFields = {
  displayTimezone: true,
  theme: true,
  onboardingCompleted: true,
} as const;

@Controller('account')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @PublicEndpoint()
  @Get('sign-in-options')
  @ResponseContract(SignInOptionsSchema)
  signInOptions() {
    return { google: Boolean(this.auth.config.google) };
  }

  @Get('me')
  @ResponseContract(AccountProfileSchema)
  me(@Req() request: AuthenticatedRequest) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: request.identity.userId },
      select: { id: true, name: true, email: true },
    });
  }

  @Get('export/profile')
  @ResponseContract(AccountProfileExportSchema)
  async exportProfile(@Req() request: AuthenticatedRequest) {
    try {
      // Explicit projection excludes login credentials and provider tokens.
      const account = await this.prisma.user.findUniqueOrThrow({
        where: { id: request.identity.userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
          ...preferenceFields,
        },
      });
      const {
        displayTimezone,
        theme,
        onboardingCompleted,
        createdAt,
        updatedAt,
        ...profile
      } = account;
      return {
        formatVersion: 1 as const,
        exportedAt: new Date().toISOString(),
        profile: {
          ...profile,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
        preferences: { displayTimezone, theme, onboardingCompleted },
      };
    } catch {
      throw dataUnavailable();
    }
  }

  @Get('preferences')
  @ResponseContract(AccountPreferencesSchema)
  async preferences(@Req() request: AuthenticatedRequest) {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { id: request.identity.userId },
        select: preferenceFields,
      });
    } catch {
      throw dataUnavailable();
    }
  }

  @Post('preferences')
  @ResponseContract(AccountPreferencesSchema)
  async savePreferences(
    @Req() request: AuthenticatedRequest,
    @Body(new RequestContract(AccountPreferencesSchema))
    body: AccountPreferences,
  ) {
    try {
      return await this.prisma.user.update({
        where: { id: request.identity.userId },
        data: body,
        select: preferenceFields,
      });
    } catch {
      throw dataUnavailable();
    }
  }
}
