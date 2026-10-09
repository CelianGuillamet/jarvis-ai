import { Module } from '@nestjs/common';
import { TokenEncryptionService } from '../google/token-encryption.service';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  controllers: [HomeController],
  providers: [HomeService, TokenEncryptionService],
  exports: [HomeService],
})
export class HomeModule {}
