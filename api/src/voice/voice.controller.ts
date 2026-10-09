import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  VoiceSpeakRequestSchema,
  VoiceStatusSchema,
  VoiceTranscriptSchema,
} from '../contracts/v1';
import type { VoiceSpeakRequest } from '../contracts/v1';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import { VoiceService } from './voice.service';

/** Aborts engine work when the client goes away, so a stopped request leaves nothing running. */
function abortOnClose(request: Request, response: Response): AbortSignal {
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) controller.abort();
  });
  request.on('aborted', () => controller.abort());
  return controller.signal;
}

@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Get()
  @ResponseContract(VoiceStatusSchema)
  status() {
    return this.voice.status();
  }

  @Post('transcribe')
  @ResponseContract(VoiceTranscriptSchema)
  async transcribe(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!Buffer.isBuffer(body))
      throw new BadRequestException('Audio WAV attendu.');
    return {
      text: await this.voice.transcribe(body, abortOnClose(request, response)),
    };
  }

  @Post('speak')
  async speak(
    @Body(new RequestContract(VoiceSpeakRequestSchema)) body: VoiceSpeakRequest,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const audio = await this.voice.speak(
      body.text,
      abortOnClose(request, response),
    );
    response
      .status(200)
      .type('audio/wav')
      .set('Content-Length', String(audio.length))
      .end(audio);
  }
}
