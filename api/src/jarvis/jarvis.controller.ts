import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { JarvisService } from './services/jarvis.service';
import { ChatDto } from './dto/chat.dto';
import { ConfirmDto } from './dto/confirm.dto';

@Controller('jarvis')
export class JarvisController {
  constructor(private readonly jarvis: JarvisService) {}

  @Post('chat')
  chat(@Body() body: ChatDto) {
    return this.jarvis.chat(body.text, body.sessionId);
  }

  @Post('confirm')
  confirm(@Body() body: ConfirmDto) {
    return this.jarvis.confirm(body.actionId, body.sessionId);
  }

  @Get('status')
  status(@Query('sessionId') sessionId?: string) {
    return this.jarvis.status(sessionId);
  }
}
