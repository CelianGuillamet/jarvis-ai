import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ConversationService } from '../auth/conversation.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import {
  TodayQuerySchema,
  TodayPageResponseSchema,
  TodayMutationRequestSchema,
  TodayCommandResponseSchema,
} from '../contracts/v1';
import type { TodayQuery, TodayMutationRequest } from '../contracts/v1';
import { JarvisService } from '../jarvis/services/jarvis.service';
import { TodayReadService } from './today-read.service';

@Controller('today')
export class TodayController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly reads: TodayReadService,
    private readonly jarvis: JarvisService,
  ) {}

  @Get()
  @ResponseContract(TodayPageResponseSchema)
  async snapshot(
    @Req() request: AuthenticatedRequest,
    @Query(new RequestContract(TodayQuerySchema))
    query: TodayQuery,
  ) {
    const conversationId = await this.conversations.resolve(
      request.identity.userId,
      query.sessionId,
    );
    return {
      ...(await this.reads.snapshot(request.identity.userId, query)),
      conversationId,
    };
  }

  @Post('mutations')
  @ResponseContract(TodayCommandResponseSchema)
  async mutate(
    @Req() request: AuthenticatedRequest,
    @Body(new RequestContract(TodayMutationRequestSchema))
    body: TodayMutationRequest,
  ) {
    const sessionId = await this.conversations.resolve(
      request.identity.userId,
      body.sessionId,
    );
    return this.jarvis.mutateToday({ ...body, sessionId });
  }
}
