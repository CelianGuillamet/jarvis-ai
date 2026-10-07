import { Controller, Get, Header } from '@nestjs/common';
import { PrivacyDisclosureService } from './privacy-disclosure.service';
import { PrivacyDisclosureSchema } from '../contracts/v1';
import { ResponseContract } from '../http/response-contract';
import { dataUnavailable } from '../http/data-unavailable';

@Controller('account/privacy')
export class PrivacyDisclosureController {
  constructor(private readonly disclosure: PrivacyDisclosureService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ResponseContract(PrivacyDisclosureSchema)
  read() {
    try {
      return this.disclosure.read();
    } catch {
      throw dataUnavailable();
    }
  }
}
