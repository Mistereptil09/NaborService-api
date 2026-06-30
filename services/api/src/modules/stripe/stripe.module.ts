import { StripeService } from './stripe.service';
import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [ConfigModule, AuthModule, ListingsModule],
  providers: [StripeService],
  controllers: [StripeController],
  exports: [StripeService],
})
export class StripeModule {}
