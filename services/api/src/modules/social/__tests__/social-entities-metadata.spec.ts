import { DataSource } from 'typeorm';
import { Follow } from '../entities/follow.entity';
import { Friendship } from '../entities/friendship.entity';
import { UserBlock } from '../entities/user-block.entity';
import { UserSwipe } from '../entities/user-swipe.entity';
import { User } from '../../users/entities/user.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { ListingCategory } from '../../listings/entities/listing-category.entity';

describe('Social Network Entities — TypeORM Metadata', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [
        User,
        ChatGroup,
        Listing,
        ListingCategory,
        Follow,
        Friendship,
        UserBlock,
        UserSwipe,
      ],
      synchronize: false,
    });
    (dataSource as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  describe('Follow entity', () => {
    it('should map to the "follow" table', () => {
      const metadata = dataSource.getMetadata(Follow);
      expect(metadata.tableName).toBe('follow');
    });

    it('should have composite primary key (follower_id, followed_id)', () => {
      const metadata = dataSource.getMetadata(Follow);
      const pkColumns = metadata.primaryColumns.map((c) => c.databaseName);
      expect(pkColumns).toContain('follower_id');
      expect(pkColumns).toContain('followed_id');
      expect(pkColumns).toHaveLength(2);
    });

    it('should define follower_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(Follow);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'follower_id',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define followed_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(Follow);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'followed_id',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define followed_at as timestamptz NOT NULL with default now()', () => {
      const metadata = dataSource.getMetadata(Follow);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'followed_at',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('timestamptz');
      expect(col!.isNullable).toBe(false);
      expect(typeof col!.default).toBe('function');
      expect((col!.default as () => string)()).toBe('now()');
    });

    it('should have CHECK constraint chk_follow_self', () => {
      const metadata = dataSource.getMetadata(Follow);
      const checks = metadata.checks;
      const chk = checks.find((c) => c.name === 'chk_follow_self');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe('"follower_id" != "followed_id"');
    });

    it('should have index idx_follow_reverse on (followed_id, follower_id)', () => {
      const metadata = dataSource.getMetadata(Follow);
      const idx = metadata.indices.find((i) => i.name === 'idx_follow_reverse');
      expect(idx).toBeDefined();
      const idxColumns = idx!.columns.map((c) => c.databaseName);
      expect(idxColumns).toEqual(['followed_id', 'follower_id']);
    });

    it('should have ManyToOne relations to User for follower and followed', () => {
      const metadata = dataSource.getMetadata(Follow);
      const relations = metadata.relations;

      const followerRel = relations.find((r) => r.propertyName === 'follower');
      expect(followerRel).toBeDefined();
      expect(followerRel!.relationType).toBe('many-to-one');
      expect(followerRel!.type).toBe(User);

      const followedRel = relations.find((r) => r.propertyName === 'followed');
      expect(followedRel).toBeDefined();
      expect(followedRel!.relationType).toBe('many-to-one');
      expect(followedRel!.type).toBe(User);
    });
  });

  describe('Friendship entity', () => {
    it('should map to the "friendships" table', () => {
      const metadata = dataSource.getMetadata(Friendship);
      expect(metadata.tableName).toBe('friendships');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should define user1_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const col = metadata.columns.find((c) => c.databaseName === 'user1_id');
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define user2_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const col = metadata.columns.find((c) => c.databaseName === 'user2_id');
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define friended_at as timestamptz NOT NULL with default now()', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'friended_at',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('timestamptz');
      expect(col!.isNullable).toBe(false);
      expect(typeof col!.default).toBe('function');
      expect((col!.default as () => string)()).toBe('now()');
    });

    it('should define unfriended_at as timestamptz nullable', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'unfriended_at',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('timestamptz');
      expect(col!.isNullable).toBe(true);
    });

    it('should define group_id as uuid nullable', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const col = metadata.columns.find((c) => c.databaseName === 'group_id');
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(true);
    });

    it('should have CHECK constraint chk_friendships_order', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const chk = metadata.checks.find(
        (c) => c.name === 'chk_friendships_order',
      );
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe('"user1_id" < "user2_id"');
    });

    it('should have UNIQUE constraint on (user1_id, user2_id)', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const uniq = metadata.uniques.find((u) =>
        u.columns.map((c) => c.propertyName).includes('user1Id'),
      );
      expect(uniq).toBeDefined();
      const uniqCols = uniq!.columns.map((c) => c.propertyName);
      expect(uniqCols).toContain('user1Id');
      expect(uniqCols).toContain('user2Id');
    });

    it('should have ManyToOne relations to User for user1 and user2', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const relations = metadata.relations;

      const user1Rel = relations.find((r) => r.propertyName === 'user1');
      expect(user1Rel).toBeDefined();
      expect(user1Rel!.relationType).toBe('many-to-one');
      expect(user1Rel!.type).toBe(User);

      const user2Rel = relations.find((r) => r.propertyName === 'user2');
      expect(user2Rel).toBeDefined();
      expect(user2Rel!.relationType).toBe('many-to-one');
      expect(user2Rel!.type).toBe(User);
    });

    it('should have ManyToOne relation to ChatGroup (nullable)', () => {
      const metadata = dataSource.getMetadata(Friendship);
      const groupRel = metadata.relations.find(
        (r) => r.propertyName === 'group',
      );
      expect(groupRel).toBeDefined();
      expect(groupRel!.relationType).toBe('many-to-one');
      expect(groupRel!.type).toBe(ChatGroup);
      expect(groupRel!.isNullable).toBe(true);
    });
  });

  describe('UserBlock entity', () => {
    it('should map to the "user_blocks" table', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      expect(metadata.tableName).toBe('user_blocks');
    });

    it('should have composite primary key (blocker_id, blocked_id)', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      const pkColumns = metadata.primaryColumns.map((c) => c.databaseName);
      expect(pkColumns).toContain('blocker_id');
      expect(pkColumns).toContain('blocked_id');
      expect(pkColumns).toHaveLength(2);
    });

    it('should define blocker_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      const col = metadata.columns.find((c) => c.databaseName === 'blocker_id');
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define blocked_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      const col = metadata.columns.find((c) => c.databaseName === 'blocked_id');
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define blocked_at as timestamptz NOT NULL with default now()', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      const col = metadata.columns.find((c) => c.databaseName === 'blocked_at');
      expect(col).toBeDefined();
      expect(col!.type).toBe('timestamptz');
      expect(col!.isNullable).toBe(false);
      expect(typeof col!.default).toBe('function');
      expect((col!.default as () => string)()).toBe('now()');
    });

    it('should have CHECK constraint chk_block_self', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      const chk = metadata.checks.find((c) => c.name === 'chk_block_self');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe('"blocker_id" != "blocked_id"');
    });

    it('should have index on blocked_id', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_user_blocks_blocked',
      );
      expect(idx).toBeDefined();
      const idxColumns = idx!.columns.map((c) => c.databaseName);
      expect(idxColumns).toEqual(['blocked_id']);
    });

    it('should have ManyToOne relations to User for blocker and blocked', () => {
      const metadata = dataSource.getMetadata(UserBlock);
      const relations = metadata.relations;

      const blockerRel = relations.find((r) => r.propertyName === 'blocker');
      expect(blockerRel).toBeDefined();
      expect(blockerRel!.relationType).toBe('many-to-one');
      expect(blockerRel!.type).toBe(User);

      const blockedRel = relations.find((r) => r.propertyName === 'blocked');
      expect(blockedRel).toBeDefined();
      expect(blockedRel!.relationType).toBe('many-to-one');
      expect(blockedRel!.type).toBe(User);
    });
  });

  describe('UserSwipe entity', () => {
    it('should map to the "user_swipes" table', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      expect(metadata.tableName).toBe('user_swipes');
    });

    it('should have composite primary key (swiper_id, swiped_id)', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const pkColumns = metadata.primaryColumns.map((c) => c.databaseName);
      expect(pkColumns).toContain('swiper_id');
      expect(pkColumns).toContain('swiped_id');
      expect(pkColumns).toHaveLength(2);
    });

    it('should define swiper_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const col = metadata.columns.find((c) => c.databaseName === 'swiper_id');
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define swiped_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const col = metadata.columns.find((c) => c.databaseName === 'swiped_id');
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define direction as enum using swipe_direction_enum', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const col = metadata.columns.find((c) => c.databaseName === 'direction');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('swipe_direction_enum');
      expect(col!.enum).toEqual(['like', 'dislike']);
    });

    it('should define swiped_at as timestamptz NOT NULL with default now()', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const col = metadata.columns.find((c) => c.databaseName === 'swiped_at');
      expect(col).toBeDefined();
      expect(col!.type).toBe('timestamptz');
      expect(col!.isNullable).toBe(false);
      expect(typeof col!.default).toBe('function');
      expect((col!.default as () => string)()).toBe('now()');
    });

    it('should have CHECK constraint chk_swipe_self', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const chk = metadata.checks.find((c) => c.name === 'chk_swipe_self');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe('"swiper_id" != "swiped_id"');
    });

    it('should have index idx_user_swipes_swiped_dir on (swiped_id, direction)', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_user_swipes_swiped_dir',
      );
      expect(idx).toBeDefined();
      const idxColumns = idx!.columns.map((c) => c.databaseName);
      expect(idxColumns).toEqual(['swiped_id', 'direction']);
    });

    it('should have ManyToOne relations to User for swiper and swiped', () => {
      const metadata = dataSource.getMetadata(UserSwipe);
      const relations = metadata.relations;

      const swiperRel = relations.find((r) => r.propertyName === 'swiper');
      expect(swiperRel).toBeDefined();
      expect(swiperRel!.relationType).toBe('many-to-one');
      expect(swiperRel!.type).toBe(User);

      const swipedRel = relations.find((r) => r.propertyName === 'swiped');
      expect(swipedRel).toBeDefined();
      expect(swipedRel!.relationType).toBe('many-to-one');
      expect(swipedRel!.type).toBe(User);
    });
  });
});
