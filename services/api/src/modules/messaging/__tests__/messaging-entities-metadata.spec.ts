import { DataSource } from 'typeorm';
import { ChatGroup } from '../entities/chat-group.entity';
import { UsersInGroup } from '../entities/users-in-group.entity';
import { MessageMetadata } from '../entities/message-metadata.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { User } from '../../users/entities/user.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { ListingCategory } from '../../listings/entities/listing-category.entity';

describe('Messaging Entities — TypeORM Metadata', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [
        ChatGroup,
        UsersInGroup,
        MessageMetadata,
        MessageReadReceipt,
        User,
        Listing,
        ListingCategory,
      ],
      synchronize: false,
    });
    (dataSource as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  describe('ChatGroup', () => {
    it('should map to table "chat_groups"', () => {
      const meta = dataSource.getMetadata(ChatGroup);
      expect(meta.tableName).toBe('chat_groups');
    });

    it('should have UUID primary key "id"', () => {
      const meta = dataSource.getMetadata(ChatGroup);
      const pkColumns = meta.primaryColumns.map((c) => c.databaseName);
      expect(pkColumns).toEqual(['id']);
      const idCol = meta.findColumnWithDatabaseName('id')!;
      expect(idCol.type).toBe('uuid');
    });

    it('should have correct columns with types and nullability', () => {
      const meta = dataSource.getMetadata(ChatGroup);

      const nameCol = meta.findColumnWithDatabaseName('name')!;
      expect(nameCol.type).toBe('varchar');
      expect(nameCol.isNullable).toBe(true);

      const descCol = meta.findColumnWithDatabaseName('description')!;
      expect(descCol.type).toBe('text');
      expect(descCol.isNullable).toBe(true);

      const createdByCol = meta.findColumnWithDatabaseName('created_by')!;
      expect(createdByCol.type).toBe('uuid');
      expect(createdByCol.isNullable).toBe(false);

      const listingIdCol = meta.findColumnWithDatabaseName('listing_id')!;
      expect(listingIdCol.type).toBe('uuid');
      expect(listingIdCol.isNullable).toBe(true);

      const createdAtCol = meta.findColumnWithDatabaseName('created_at')!;
      expect(createdAtCol.type).toBe('timestamptz');

      const updatedAtCol = meta.findColumnWithDatabaseName('updated_at')!;
      expect(updatedAtCol.type).toBe('timestamptz');
      expect(updatedAtCol.isNullable).toBe(true);

      const deletedAtCol = meta.findColumnWithDatabaseName('deleted_at')!;
      expect(deletedAtCol.type).toBe('timestamptz');
    });

    it('should have enum column "type" with enumName "chat_group_type_enum"', () => {
      const meta = dataSource.getMetadata(ChatGroup);
      const typeCol = meta.findColumnWithDatabaseName('type')!;
      expect(typeCol.type).toBe('enum');
      expect(typeCol.enumName).toBe('chat_group_type_enum');
    });

    it('should have indexes on "type" and "listing_id"', () => {
      const meta = dataSource.getMetadata(ChatGroup);
      const indexNames = meta.indices.map((i) => i.name);
      expect(indexNames).toContain('idx_chat_groups_type');
      expect(indexNames).toContain('idx_chat_groups_listing');
    });

    it('should support soft delete via deleted_at', () => {
      const meta = dataSource.getMetadata(ChatGroup);
      const deletedAtCol = meta.findColumnWithDatabaseName('deleted_at')!;
      expect(deletedAtCol.isDeleteDate).toBe(true);
    });

    it('should have ManyToOne relation to User (created_by)', () => {
      const meta = dataSource.getMetadata(ChatGroup);
      const creatorRelation = meta.relations.find(
        (r) => r.propertyName === 'creator',
      )!;
      expect(creatorRelation.relationType).toBe('many-to-one');
      expect(creatorRelation.type).toBe(User);
    });

    it('should have ManyToOne relation to Listing (nullable)', () => {
      const meta = dataSource.getMetadata(ChatGroup);
      const listingRelation = meta.relations.find(
        (r) => r.propertyName === 'listing',
      )!;
      expect(listingRelation.relationType).toBe('many-to-one');
      expect(listingRelation.isNullable).toBe(true);
    });
  });

  describe('UsersInGroup', () => {
    it('should map to table "users_in_group"', () => {
      const meta = dataSource.getMetadata(UsersInGroup);
      expect(meta.tableName).toBe('users_in_group');
    });

    it('should have composite primary key (user_id, group_id)', () => {
      const meta = dataSource.getMetadata(UsersInGroup);
      const pkColumns = meta.primaryColumns
        .map((c) => c.databaseName)
        .sort();
      expect(pkColumns).toEqual(['group_id', 'user_id']);
    });

    it('should have CHECK constraint chk_uig_left', () => {
      const meta = dataSource.getMetadata(UsersInGroup);
      const checks = meta.checks.map((c) => c.name);
      expect(checks).toContain('chk_uig_left');
      const chk = meta.checks.find((c) => c.name === 'chk_uig_left')!;
      expect(chk.expression).toContain('"left_at" IS NULL OR "left_at" > "joined_at"');
    });

    it('should have CHECK constraint chk_uig_kicked', () => {
      const meta = dataSource.getMetadata(UsersInGroup);
      const checks = meta.checks.map((c) => c.name);
      expect(checks).toContain('chk_uig_kicked');
      const chk = meta.checks.find((c) => c.name === 'chk_uig_kicked')!;
      expect(chk.expression).toContain('"kicked_at" IS NULL OR "kicked_at" > "joined_at"');
    });

    it('should have enum column "role_in_group" with default "message"', () => {
      const meta = dataSource.getMetadata(UsersInGroup);
      const roleCol = meta.findColumnWithDatabaseName('role_in_group')!;
      expect(roleCol.type).toBe('enum');
      expect(roleCol.enumName).toBe('group_role_enum');
      expect(roleCol.default).toBe("message");
    });

    it('should have index on group_id', () => {
      const meta = dataSource.getMetadata(UsersInGroup);
      const indexNames = meta.indices.map((i) => i.name);
      expect(indexNames).toContain('idx_uig_group');
    });

    it('should have correct columns with types and nullability', () => {
      const meta = dataSource.getMetadata(UsersInGroup);

      const joinedAtCol = meta.findColumnWithDatabaseName('joined_at')!;
      expect(joinedAtCol.type).toBe('timestamptz');
      expect(joinedAtCol.isNullable).toBe(false);

      const leftAtCol = meta.findColumnWithDatabaseName('left_at')!;
      expect(leftAtCol.type).toBe('timestamptz');
      expect(leftAtCol.isNullable).toBe(true);

      const kickedAtCol = meta.findColumnWithDatabaseName('kicked_at')!;
      expect(kickedAtCol.type).toBe('timestamptz');
      expect(kickedAtCol.isNullable).toBe(true);

      const isMutedCol = meta.findColumnWithDatabaseName('is_muted')!;
      expect(isMutedCol.type).toBe('boolean');
      expect(isMutedCol.isNullable).toBe(false);
      expect(isMutedCol.default).toBe(false);

      const mutedUntilCol = meta.findColumnWithDatabaseName('muted_until')!;
      expect(mutedUntilCol.type).toBe('timestamptz');
      expect(mutedUntilCol.isNullable).toBe(true);
    });

    it('should have ManyToOne relations to User and ChatGroup', () => {
      const meta = dataSource.getMetadata(UsersInGroup);
      const userRelation = meta.relations.find(
        (r) => r.propertyName === 'user',
      )!;
      expect(userRelation.relationType).toBe('many-to-one');
      expect(userRelation.type).toBe(User);

      const groupRelation = meta.relations.find(
        (r) => r.propertyName === 'group',
      )!;
      expect(groupRelation.relationType).toBe('many-to-one');
      expect(groupRelation.type).toBe(ChatGroup);
    });
  });

  describe('MessageMetadata', () => {
    it('should map to table "message_metadata"', () => {
      const meta = dataSource.getMetadata(MessageMetadata);
      expect(meta.tableName).toBe('message_metadata');
    });

    it('should have UUID primary key "id"', () => {
      const meta = dataSource.getMetadata(MessageMetadata);
      const pkColumns = meta.primaryColumns.map((c) => c.databaseName);
      expect(pkColumns).toEqual(['id']);
      const idCol = meta.findColumnWithDatabaseName('id')!;
      expect(idCol.type).toBe('uuid');
    });

    it('should have correct columns with types and nullability', () => {
      const meta = dataSource.getMetadata(MessageMetadata);

      const mongoCol = meta.findColumnWithDatabaseName('mongo_message_id')!;
      expect(mongoCol.type).toBe('text');
      expect(mongoCol.isNullable).toBe(false);

      const groupIdCol = meta.findColumnWithDatabaseName('group_id')!;
      expect(groupIdCol.type).toBe('uuid');
      expect(groupIdCol.isNullable).toBe(false);

      const senderIdCol = meta.findColumnWithDatabaseName('sender_id')!;
      expect(senderIdCol.type).toBe('uuid');
      expect(senderIdCol.isNullable).toBe(false);

      const sentAtCol = meta.findColumnWithDatabaseName('sent_at')!;
      expect(sentAtCol.type).toBe('timestamptz');
      expect(sentAtCol.isNullable).toBe(false);

      const editedAtCol = meta.findColumnWithDatabaseName('edited_at')!;
      expect(editedAtCol.type).toBe('timestamptz');
      expect(editedAtCol.isNullable).toBe(true);

      const isDeletedCol = meta.findColumnWithDatabaseName('is_deleted')!;
      expect(isDeletedCol.type).toBe('boolean');
      expect(isDeletedCol.isNullable).toBe(false);
      expect(isDeletedCol.default).toBe(false);

      const deletedAtCol = meta.findColumnWithDatabaseName('deleted_at')!;
      expect(deletedAtCol.type).toBe('timestamptz');
      expect(deletedAtCol.isNullable).toBe(true);

      const parentCol = meta.findColumnWithDatabaseName('parent_message_id')!;
      expect(parentCol.type).toBe('uuid');
      expect(parentCol.isNullable).toBe(true);
    });

    it('should have self-referencing ManyToOne relation (parent_message_id)', () => {
      const meta = dataSource.getMetadata(MessageMetadata);
      const parentRelation = meta.relations.find(
        (r) => r.propertyName === 'parentMessage',
      )!;
      expect(parentRelation.relationType).toBe('many-to-one');
      expect(parentRelation.type).toBe(MessageMetadata);
      expect(parentRelation.isNullable).toBe(true);
    });

    it('should have ManyToOne relation to ChatGroup', () => {
      const meta = dataSource.getMetadata(MessageMetadata);
      const groupRelation = meta.relations.find(
        (r) => r.propertyName === 'group',
      )!;
      expect(groupRelation.relationType).toBe('many-to-one');
      expect(groupRelation.type).toBe(ChatGroup);
    });

    it('should have ManyToOne relation to User (sender)', () => {
      const meta = dataSource.getMetadata(MessageMetadata);
      const senderRelation = meta.relations.find(
        (r) => r.propertyName === 'sender',
      )!;
      expect(senderRelation.relationType).toBe('many-to-one');
      expect(senderRelation.type).toBe(User);
    });

    it('should have indexes idx_msg_group_sent and idx_msg_sender', () => {
      const meta = dataSource.getMetadata(MessageMetadata);
      const indexNames = meta.indices.map((i) => i.name);
      expect(indexNames).toContain('idx_msg_group_sent');
      expect(indexNames).toContain('idx_msg_sender');

      const groupSentIdx = meta.indices.find(
        (i) => i.name === 'idx_msg_group_sent',
      )!;
      const groupSentCols = groupSentIdx.columns.map(
        (c) => c.databaseName,
      );
      expect(groupSentCols).toEqual(['group_id', 'sent_at']);

      const senderIdx = meta.indices.find(
        (i) => i.name === 'idx_msg_sender',
      )!;
      const senderCols = senderIdx.columns.map((c) => c.databaseName);
      expect(senderCols).toEqual(['sender_id']);
    });
  });

  describe('MessageReadReceipt', () => {
    it('should map to table "message_read_receipts"', () => {
      const meta = dataSource.getMetadata(MessageReadReceipt);
      expect(meta.tableName).toBe('message_read_receipts');
    });

    it('should have composite primary key (message_id, user_id)', () => {
      const meta = dataSource.getMetadata(MessageReadReceipt);
      const pkColumns = meta.primaryColumns
        .map((c) => c.databaseName)
        .sort();
      expect(pkColumns).toEqual(['message_id', 'user_id']);
    });

    it('should have read_at column with correct type and default', () => {
      const meta = dataSource.getMetadata(MessageReadReceipt);
      const readAtCol = meta.findColumnWithDatabaseName('read_at')!;
      expect(readAtCol.type).toBe('timestamptz');
      expect(readAtCol.isNullable).toBe(false);
    });

    it('should have ManyToOne relation to MessageMetadata', () => {
      const meta = dataSource.getMetadata(MessageReadReceipt);
      const msgRelation = meta.relations.find(
        (r) => r.propertyName === 'message',
      )!;
      expect(msgRelation.relationType).toBe('many-to-one');
      expect(msgRelation.type).toBe(MessageMetadata);
    });

    it('should have ManyToOne relation to User', () => {
      const meta = dataSource.getMetadata(MessageReadReceipt);
      const userRelation = meta.relations.find(
        (r) => r.propertyName === 'user',
      )!;
      expect(userRelation.relationType).toBe('many-to-one');
      expect(userRelation.type).toBe(User);
    });
  });
});
