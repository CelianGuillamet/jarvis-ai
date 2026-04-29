import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';

import { InboxZeroApplyDto } from './dto/inbox-zero-apply.dto';
import { InboxZeroDraftReplyDto } from './dto/inbox-zero-draft-reply.dto';
import { InboxZeroScanDto } from './dto/inbox-zero-scan.dto';
import { InboxZeroStepDto } from './dto/inbox-zero-step.dto';
import { InboxZeroService } from './inbox-zero.service';

@Controller('inbox-zero')
export class InboxZeroController {
  constructor(private readonly inboxZero: InboxZeroService) {}

  @Post('scan')
  scan(@Body() body: InboxZeroScanDto) {
    return this.inboxZero.scan(body);
  }

  @Get('session')
  session(@Query('sessionId') sessionId?: string) {
    return this.inboxZero.getSession(sessionId);
  }

  @Post('step')
  step(@Body() body: InboxZeroStepDto) {
    return this.inboxZero.setStep(body.sessionId, body.step);
  }

  @Post('apply')
  apply(@Body() body: InboxZeroApplyDto) {
    return this.inboxZero.apply(body);
  }

  @Get('message')
  message(
    @Query('sessionId') sessionId: string | undefined,
    @Query('messageId') messageId: string | undefined,
  ) {
    if (!messageId?.trim()) throw new BadRequestException('messageId manquant');
    return this.inboxZero.getMessage(sessionId, messageId.trim());
  }

  @Post('draft-reply')
  draftReply(@Body() body: InboxZeroDraftReplyDto) {
    return this.inboxZero.draftReply(body.sessionId, body.messageId);
  }
}

