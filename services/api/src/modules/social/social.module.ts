import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Follow } from './entities/follow.entity';
import { Friendship } from './entities/friendship.entity';
import { UserBlock } from './entities/user-block.entity';
import { UserSwipe } from './entities/user-swipe.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Follow, Friendship, UserBlock, UserSwipe]),
  ],
  exports: [TypeOrmModule],
})
export class SocialModule {}
