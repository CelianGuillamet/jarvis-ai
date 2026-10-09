import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import {
  HomeConnectRequestSchema,
  HomeDiscoverySchema,
  HomeEntitiesRequestSchema,
  HomeStatusSchema,
} from '../contracts/v1';
import type { HomeConnectRequest, HomeEntitiesRequest } from '../contracts/v1';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  @ResponseContract(HomeStatusSchema)
  status(@Req() request: AuthenticatedRequest) {
    return this.home.status(request.identity.userId);
  }

  @Post('connect')
  @ResponseContract(HomeStatusSchema)
  connect(
    @Req() request: AuthenticatedRequest,
    @Body(new RequestContract(HomeConnectRequestSchema))
    body: HomeConnectRequest,
  ) {
    return this.home.connect(request.identity.userId, body.baseUrl, body.token);
  }

  @Post('disconnect')
  @ResponseContract(HomeStatusSchema)
  disconnect(@Req() request: AuthenticatedRequest) {
    return this.home.disconnect(request.identity.userId);
  }

  @Get('discover')
  @ResponseContract(HomeDiscoverySchema)
  async discover(@Req() request: AuthenticatedRequest) {
    return { entities: await this.home.discover(request.identity.userId) };
  }

  @Post('entities')
  @ResponseContract(HomeStatusSchema)
  entities(
    @Req() request: AuthenticatedRequest,
    @Body(new RequestContract(HomeEntitiesRequestSchema))
    body: HomeEntitiesRequest,
  ) {
    return this.home.setEntities(request.identity.userId, body.entityIds);
  }
}
