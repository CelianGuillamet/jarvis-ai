import { ConversationHistoryService } from './services/conversation-history.service';
import type { ConversationHistoryQuery } from '../contracts/v1';
import {
  ConversationHistoryQuerySchema,
  ConversationHistoryResponseSchema,
  ChatRequestSchema,
  ConfirmRequestSchema,
  ConversationQuerySchema,
} from '../contracts/v1';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import {
  JarvisChatResponseSchema,
  JarvisStatusSnapshotSchema,
} from '../contracts/v1';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ConversationService } from '../auth/conversation.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { JarvisService } from './services/jarvis.service';
import type { ChatDto } from './dto/chat.dto';
import type { ConfirmDto } from './dto/confirm.dto';
import type { ConversationQueryDto } from '../http/query.dto';

@Controller('jarvis')
export class JarvisController {
  constructor(
    private readonly jarvis: JarvisService,
    private readonly conversations: ConversationService,
    private readonly history: ConversationHistoryService,
  ) {}

  @Post('chat')
  @ResponseContract(JarvisChatResponseSchema)
  async chat(
    @Body(new RequestContract(ChatRequestSchema)) body: ChatDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const conversationId = await this.conversations.resolve(
      request.identity.userId,
      body.sessionId,
    );
    return this.history.capture(
      request.identity.userId,
      conversationId,
      'chat',
      body.text,
      () => this.jarvis.chat(body.text, conversationId),
    );
  }

  @Post('confirm')
  @ResponseContract(JarvisChatResponseSchema)
  async confirm(
    @Body(new RequestContract(ConfirmRequestSchema)) body: ConfirmDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const conversationId = await this.conversations.resolve(
      request.identity.userId,
      body.sessionId,
    );
    return this.history.capture(
      request.identity.userId,
      conversationId,
      'confirm',
      body.actionId,
      () => this.jarvis.confirm(body.actionId, conversationId),
    );
  }

  @Get('history')
  @ResponseContract(ConversationHistoryResponseSchema)
  async conversationHistory(
    @Req() request: AuthenticatedRequest,
    @Query(new RequestContract(ConversationHistoryQuerySchema))
    query: ConversationHistoryQuery,
  ) {
    const conversationId = await this.conversations.resolve(
      request.identity.userId,
      query.sessionId,
    );
    return this.history.list(request.identity.userId, conversationId, query);
  }

  @Get('status')
  @ResponseContract(JarvisStatusSnapshotSchema)
  async status(
    @Req() request: AuthenticatedRequest,
    @Query(new RequestContract(ConversationQuerySchema))
    query: ConversationQueryDto,
  ) {
    return this.jarvis.status(
      await this.conversations.resolve(
        request.identity.userId,
        query.sessionId,
      ),
    );
  }
}
