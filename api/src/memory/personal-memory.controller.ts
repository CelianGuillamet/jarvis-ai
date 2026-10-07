import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import {
  PersonalFactInputSchema,
  PersonalFactListSchema,
  PersonalFactSchema,
} from '../contracts/v1';
import type { PersonalFactInput } from '../contracts/v1';
import { RequestContract } from '../http/request-contract';
import { ResponseContract } from '../http/response-contract';
import { dropFactFromMemoryLists } from '../jarvis/tools/tools';
import {
  PersonalMemoryService,
  serializeFact,
} from './personal-memory.service';

@Controller('account/memory')
export class PersonalMemoryController {
  constructor(private readonly memory: PersonalMemoryService) {}

  @Get()
  @ResponseContract(PersonalFactListSchema)
  async list(@Req() request: AuthenticatedRequest) {
    const facts = await this.memory.list(request.identity.userId);
    return { facts: facts.map(serializeFact) };
  }

  @Post()
  @ResponseContract(PersonalFactSchema)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new RequestContract(PersonalFactInputSchema)) body: PersonalFactInput,
  ) {
    return serializeFact(
      await this.memory.create(request.identity.userId, body.text, 'settings'),
    );
  }

  @Post(':id')
  @ResponseContract(PersonalFactSchema)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new RequestContract(PersonalFactInputSchema)) body: PersonalFactInput,
  ) {
    const fact = await this.memory.update(
      request.identity.userId,
      id,
      body.text,
    );
    dropFactFromMemoryLists(id);
    return serializeFact(fact);
  }

  @Post(':id/forget')
  @ResponseContract(PersonalFactListSchema)
  async forget(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    await this.memory.forget(request.identity.userId, id);
    dropFactFromMemoryLists(id);
    return this.list(request);
  }
}
