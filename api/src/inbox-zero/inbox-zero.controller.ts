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

import { InboxZeroApplyDto } from './dto/inbox-zero-apply.dto';
import { InboxZeroDraftReplyDto } from './dto/inbox-zero-draft-reply.dto';
import { InboxZeroScanDto } from './dto/inbox-zero-scan.dto';
import { InboxZeroStepDto } from './dto/inbox-zero-step.dto';
import { InboxZeroService } from './inbox-zero.service';
import { ConversationQueryDto, MessageQueryDto } from '../http/query.dto';

@Controller('inbox-zero')
export class InboxZeroController {
  constructor(
    private readonly inboxZero: InboxZeroService,
    private readonly conversations: ConversationService,
  ) {}

  @Post('scan')
  async scan(
    @Body() body: InboxZeroScanDto,
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
  async session(
    @Req() request: AuthenticatedRequest,
    @Query() query: ConversationQueryDto,
  ) {
    return this.inboxZero.getSession(
      await this.conversations.resolve(
        request.identity.userId,
        query.sessionId,
      ),
    );
  }

  @Post('step')
  async step(
    @Body() body: InboxZeroStepDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inboxZero.setStep(
      await this.conversations.resolve(request.identity.userId, body.sessionId),
      body.step,
    );
  }

  @Post('apply')
  async apply(
    @Body() body: InboxZeroApplyDto,
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
  async message(
    @Req() request: AuthenticatedRequest,
    @Query() query: MessageQueryDto,
  ) {
    const { sessionId, messageId } = query;
    if (!messageId?.trim()) throw new BadRequestException('messageId manquant');
    return this.inboxZero.getMessage(
      await this.conversations.resolve(request.identity.userId, sessionId),
      messageId.trim(),
    );
  }

  @Post('draft-reply')
  async draftReply(
    @Body() body: InboxZeroDraftReplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inboxZero.draftReply(
      await this.conversations.resolve(request.identity.userId, body.sessionId),
      body.messageId,
    );
  }
}
