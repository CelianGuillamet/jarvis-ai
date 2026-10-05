import { InboxReplyDraftService } from './inbox-reply-draft.service';
import {
  InboxReplyDraftResponseSchema,
  InboxReplyDraftSaveRequestSchema,
  type InboxReplyDraftSaveRequest,
} from '../contracts/v1';
import {
  ConversationQuerySchema,
  MessageQuerySchema,
  InboxZeroApplyRequestSchema,
  InboxZeroScanRequestSchema,
  InboxZeroStepRequestSchema,
  InboxZeroDraftReplyRequestSchema,
} from '../contracts/v1';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import {
  InboxZeroApplyResponseSchema,
  InboxZeroDraftReplyResponseSchema,
  InboxZeroMessageResponseSchema,
  InboxZeroScanResponseSchema,
} from '../contracts/v1';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConversationService } from '../auth/conversation.service';
import type { AuthenticatedRequest } from '../auth/session.guard';

import type { InboxZeroApplyDto } from './dto/inbox-zero-apply.dto';
import type { InboxZeroDraftReplyDto } from './dto/inbox-zero-draft-reply.dto';
import type { InboxZeroScanDto } from './dto/inbox-zero-scan.dto';
import type { InboxZeroStepDto } from './dto/inbox-zero-step.dto';
import { InboxZeroService } from './inbox-zero.service';
import type { ConversationQueryDto, MessageQueryDto } from '../http/query.dto';

@Controller('inbox-zero')
export class InboxZeroController {
  constructor(
    private readonly inboxZero: InboxZeroService,
    private readonly conversations: ConversationService,
    private readonly drafts: InboxReplyDraftService,
  ) {}

  @Post('scan')
  @ResponseContract(InboxZeroScanResponseSchema)
  async scan(
    @Body(new RequestContract(InboxZeroScanRequestSchema))
    body: InboxZeroScanDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inboxZero.scan({
      ...body,
      sessionId: await this.conversations.resolve(
        request.identity.userId,
        body.sessionId,
      ),
    });
  }

  @Get('session')
  @ResponseContract(InboxZeroScanResponseSchema)
  async session(
    @Req() request: AuthenticatedRequest,
    @Query(new RequestContract(ConversationQuerySchema))
    query: ConversationQueryDto,
  ) {
    return this.inboxZero.getSession(
      await this.conversations.resolve(
        request.identity.userId,
        query.sessionId,
      ),
    );
  }

  @Post('step')
  @ResponseContract(InboxZeroScanResponseSchema)
  async step(
    @Body(new RequestContract(InboxZeroStepRequestSchema))
    body: InboxZeroStepDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inboxZero.setStep(
      await this.conversations.resolve(request.identity.userId, body.sessionId),
      body.step,
    );
  }

  @Post('apply')
  @ResponseContract(InboxZeroApplyResponseSchema)
  async apply(
    @Body(new RequestContract(InboxZeroApplyRequestSchema))
    body: InboxZeroApplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inboxZero.apply({
      ...body,
      sessionId: await this.conversations.resolve(
        request.identity.userId,
        body.sessionId,
      ),
    });
  }

  @Get('message')
  @ResponseContract(InboxZeroMessageResponseSchema)
  async message(
    @Req() request: AuthenticatedRequest,
    @Query(new RequestContract(MessageQuerySchema)) query: MessageQueryDto,
  ) {
    const { sessionId, messageId } = query;
    if (!messageId?.trim()) throw new BadRequestException('messageId manquant');
    return this.inboxZero.getMessage(
      await this.conversations.resolve(request.identity.userId, sessionId),
      messageId.trim(),
    );
  }

  @Get('reply-draft')
  @ResponseContract(InboxReplyDraftResponseSchema)
  async savedDraft(
    @Req() request: AuthenticatedRequest,
    @Query(new RequestContract(MessageQuerySchema)) query: MessageQueryDto,
  ) {
    const conversationId = await this.conversations.resolve(
      request.identity.userId,
      query.sessionId,
    );
    return this.drafts.read(
      request.identity.userId,
      conversationId,
      query.messageId,
    );
  }

  @Post('reply-draft')
  @ResponseContract(InboxReplyDraftResponseSchema)
  async saveDraft(
    @Req() request: AuthenticatedRequest,
    @Body(new RequestContract(InboxReplyDraftSaveRequestSchema))
    body: InboxReplyDraftSaveRequest,
  ) {
    const conversationId = await this.conversations.resolve(
      request.identity.userId,
      body.sessionId,
    );
    return this.drafts.save(request.identity.userId, conversationId, body);
  }

  @Post('draft-reply')
  @ResponseContract(InboxZeroDraftReplyResponseSchema)
  async draftReply(
    @Body(new RequestContract(InboxZeroDraftReplyRequestSchema))
    body: InboxZeroDraftReplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inboxZero.draftReply(
      await this.conversations.resolve(request.identity.userId, body.sessionId),
      body.messageId,
    );
  }
}
