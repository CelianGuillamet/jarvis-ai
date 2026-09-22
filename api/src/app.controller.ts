import { PublicEndpoint } from './auth/public-endpoint';
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @PublicEndpoint()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
