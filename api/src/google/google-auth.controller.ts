import { Controller, Get, Post, Query, Res, Req } from '@nestjs/common';
import { ConversationService } from '../auth/conversation.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
import type { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';

@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly auth: GoogleAuthService,
    private readonly conversations: ConversationService,
  ) {}

  @Get()
  async start(
    @Query('sessionId') sessionId = 'default',
    @Res() res: Response,
    @Req() request: AuthenticatedRequest,
  ) {
    const url = await this.auth.getAuthUrl(
      await this.conversations.resolve(request.identity.userId, sessionId),
      request.identity.userId,
      request.identity.sessionId,
    );
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.auth.handleCallback(
      code,
      state,
      request.identity.userId,
      request.identity.sessionId,
    );

    res
      .status(200)
      .send(
        `<html><body style="font-family:system-ui"><h2>Google connecté ✅</h2><p>Tu peux revenir dans Jarvis pour vérifier les services connectés.</p></body></html>`,
      );
  }

  @Get('status')
  async status(
    @Query('sessionId') sessionId = 'default',
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.status(
      await this.conversations.resolve(request.identity.userId, sessionId),
    );
  }

  @Post('disconnect')
  disconnect(@Req() request: AuthenticatedRequest) {
    return this.auth.disconnect(request.identity.userId);
  }
}
