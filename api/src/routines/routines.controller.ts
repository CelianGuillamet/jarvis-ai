import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ConversationService } from '../auth/conversation.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
import {
  RoutineEnabledRequestSchema,
  RoutineListSchema,
  RoutineResumeRequestSchema,
  RoutineRunSchema,
  RoutineStartRequestSchema,
} from '../contracts/v1';
import type {
  RoutineEnabledRequest,
  RoutineResumeRequest,
  RoutineStartRequest,
} from '../contracts/v1';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import { RoutineService } from './routine.service';

@Controller('routines')
export class RoutinesController {
  constructor(
    private readonly routines: RoutineService,
    private readonly conversations: ConversationService,
  ) {}

  @Get()
  @ResponseContract(RoutineListSchema)
  list(@Req() request: AuthenticatedRequest) {
    return this.routines.list(request.identity.userId);
  }

  @Post(':key/enabled')
  @ResponseContract(RoutineListSchema)
  setEnabled(
    @Req() request: AuthenticatedRequest,
    @Param('key') key: string,
    @Body(new RequestContract(RoutineEnabledRequestSchema))
    body: RoutineEnabledRequest,
  ) {
    return this.routines.setEnabled(request.identity.userId, key, body.enabled);
  }

  @Post(':key/runs')
  @ResponseContract(RoutineRunSchema)
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('key') key: string,
    @Body(new RequestContract(RoutineStartRequestSchema))
    body: RoutineStartRequest,
  ) {
    const conversationId = await this.conversations.resolve(
      request.identity.userId,
      body.sessionId,
    );
    return this.routines.start(
      request.identity.userId,
      conversationId,
      key,
      body.requestId,
    );
  }

  @Post('runs/:id/continue')
  @ResponseContract(RoutineRunSchema)
  continue(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.routines.advance(request.identity.userId, id);
  }

  @Post('runs/:id/cancel')
  @ResponseContract(RoutineRunSchema)
  cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.routines.cancel(request.identity.userId, id);
  }

  @Post('runs/:id/resume')
  @ResponseContract(RoutineRunSchema)
  resume(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new RequestContract(RoutineResumeRequestSchema))
    body: RoutineResumeRequest,
  ) {
    return this.routines.resume(request.identity.userId, id, body);
  }
}
