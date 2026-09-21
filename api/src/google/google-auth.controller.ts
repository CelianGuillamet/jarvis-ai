import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';

@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly auth: GoogleAuthService) {}

  @Get()
  start(@Query('sessionId') sessionId = 'default', @Res() res: Response) {
    const url = this.auth.getAuthUrl(sessionId);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.auth.handleCallback(code, state);

    res
      .status(200)
      .send(
        `<html><body style="font-family:system-ui"><h2>Google connecté ✅</h2><p>Tu peux revenir dans Jarvis pour vérifier les services connectés.</p></body></html>`,
      );
  }

  @Get('status')
  async status(@Query('sessionId') sessionId = 'default') {
    return this.auth.status(sessionId);
  }
}
