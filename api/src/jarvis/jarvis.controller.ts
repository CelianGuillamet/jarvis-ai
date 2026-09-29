import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ConversationService } from '../auth/conversation.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { JarvisService } from './services/jarvis.service';
import { ChatDto } from './dto/chat.dto';
import { ConfirmDto } from './dto/confirm.dto';
import { ConversationQueryDto } from '../http/query.dto';

@Controller('jarvis')
export class JarvisController {
  constructor(
    private readonly jarvis: JarvisService,
    private readonly conversations: ConversationService,
  ) {}

  @Post('chat')
  async chat(@Body() body: ChatDto, @Req() request: AuthenticatedRequest) {
    return this.jarvis.chat(
      body.text,
      await this.conversations.resolve(request.identity.userId, body.sessionId),
    );
  }

  @Post('confirm')
  async confirm(
    @Body() body: ConfirmDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.jarvis.confirm(
      body.actionId,
      await this.conversations.resolve(request.identity.userId, body.sessionId),
    );
  }

  @Get('status')
  async status(
    @Req() request: AuthenticatedRequest,
    @Query() query: ConversationQueryDto,
  ) {
    return this.jarvis.status(
      await this.conversations.resolve(
        request.identity.userId,
        query.sessionId,
      ),
    );
  }
}
