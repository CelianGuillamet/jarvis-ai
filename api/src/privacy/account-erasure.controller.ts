import {
  Body,
  Controller,
  ConflictException,
  Get,
  Header,
  HttpCode,
  HttpException,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountErasureStore } from './account-erasure.store';
import {
  AccountErasureReceiptSchema,
  AccountErasureRequestSchema,
  AccountErasureStatusSchema,
} from '../contracts/v1';
import type { AccountErasureRequest } from '../contracts/v1';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { PublicEndpoint } from '../auth/public-endpoint';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import { RequestQuotaService } from '../http/request-quota.service';
import { dataUnavailable } from '../http/data-unavailable';

@Controller('account/deletion')
export class AccountErasureController {
  constructor(
    private readonly store: AccountErasureStore,
    private readonly quotas: RequestQuotaService,
  ) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ResponseContract(AccountErasureStatusSchema)
  async request(
    @Req() request: AuthenticatedRequest,
    @Body(new RequestContract(AccountErasureRequestSchema))
    input: AccountErasureRequest,
  ) {
    if (
      input.expectedAccountId &&
      input.expectedAccountId !== request.identity.userId
    ) {
      throw new ConflictException(
        'Votre compte a changé. Rechargez cette page avant de supprimer.',
      );
    }
    try {
      return await this.store.request(request.identity.userId, input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw dataUnavailable();
    }
  }

  @PublicEndpoint()
  @Get('status')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @ResponseContract(AccountErasureStatusSchema)
  async status(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Public only to signed-session auth: a 256-bit capability still authenticates this read.
    const retry = this.quotas.consume(
      `erasure-status:${request.ip ?? 'unknown'}`,
      20,
    );
    if (retry !== null) {
      response.setHeader('Retry-After', retry);
      throw new HttpException(
        { code: 'RATE_LIMIT', message: 'Réessaie plus tard.' },
        429,
      );
    }
    const receipt = AccountErasureReceiptSchema.safeParse(
      request.get('x-erasure-receipt'),
    );
    if (!receipt.success) throw new NotFoundException('Demande indisponible.');
    try {
      return await this.store.status(receipt.data);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw dataUnavailable();
    }
  }
}
