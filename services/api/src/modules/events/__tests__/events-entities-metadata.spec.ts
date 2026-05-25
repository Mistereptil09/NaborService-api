import { DataSource } from 'typeorm';
import { EvenementsCategory } from '../entities/evenements-category.entity';
import { Evenement } from '../entities/evenement.entity';
import { EventParticipant } from '../entities/event-participant.entity';
import { EventSwipe } from '../entities/event-swipe.entity';
import { EventReport } from '../entities/event-report.entity';
import { EventModerationAction } from '../entities/event-moderation-action.entity';
import { User } from '../../users/entities/user.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { ListingCategory } from '../../listings/entities/listing-category.entity';

describe('Events Entities — TypeORM Metadata', () => {
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
        EvenementsCategory,
        Evenement,
        EventParticipant,
        EventSwipe,
        EventReport,
        EventModerationAction,
      ],
      synchronize: false,
    });
    (dataSource as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  // ─── EvenementsCategory ───────────────────────────────────────────────

  describe('EvenementsCategory entity', () => {
    it('should map to the "evenements_category" table', () => {
      const metadata = dataSource.getMetadata(EvenementsCategory);
      expect(metadata.tableName).toBe('evenements_category');
    });

    it('should have a SERIAL (auto-increment) primary key', () => {
      const metadata = dataSource.getMetadata(EvenementsCategory);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].isGenerated).toBe(true);
      expect(pkColumns[0].generationStrategy).toBe('increment');
    });

    it('should define parent_category as int nullable (self-reference)', () => {
      const metadata = dataSource.getMetadata(EvenementsCategory);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'parent_category',
      );
      expect(col).toBeDefined();
      expect(col!.type === 'int' || col!.type === Number).toBe(true);
      expect(col!.isNullable).toBe(true);
    });

    it('should define category_name as varchar NOT NULL', () => {
      const metadata = dataSource.getMetadata(EvenementsCategory);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'category_name',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('varchar');
      expect(col!.isNullable).toBe(false);
    });

    it('should have a self-referencing ManyToOne relation (parentCategory)', () => {
      const metadata = dataSource.getMetadata(EvenementsCategory);
      const rel = metadata.relations.find(
        (r) => r.propertyName === 'parentCategory',
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(EvenementsCategory);
      expect(rel!.isNullable).toBe(true);
    });

    it('should have a OneToMany relation (children)', () => {
      const metadata = dataSource.getMetadata(EvenementsCategory);
      const rel = metadata.relations.find(
        (r) => r.propertyName === 'children',
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('one-to-many');
      expect(rel!.type).toBe(EvenementsCategory);
    });
  });

  // ─── Evenement ────────────────────────────────────────────────────────

  describe('Evenement entity', () => {
    it('should map to the "evenements" table', () => {
      const metadata = dataSource.getMetadata(Evenement);
      expect(metadata.tableName).toBe('evenements');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe('uuid_generate_v7()');
    });

    it('should define creator_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'creator_id',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define neighbourhood_id as text nullable', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'neighbourhood_id',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('text');
      expect(col!.isNullable).toBe(true);
    });

    it('should define status as enum using event_status_enum with default draft', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const col = metadata.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('event_status_enum');
      expect(col!.enum).toEqual([
        'draft', 'published', 'open', 'cancelled', 'completed',
      ]);
      expect(col!.default).toBe("draft");
    });

    it('should define cost_cents as int NOT NULL with default 0', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'cost_cents',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('int');
      expect(col!.isNullable).toBe(false);
      expect(col!.default).toBe(0);
    });

    it('should define max_participants as int nullable', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'max_participants',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('int');
      expect(col!.isNullable).toBe(true);
    });

    it('should define refund_deadline_hours as int NOT NULL with default 48', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'refund_deadline_hours',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('int');
      expect(col!.isNullable).toBe(false);
      expect(col!.default).toBe(48);
    });

    it('should define starts_at and ends_at as timestamptz nullable', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const startsAt = metadata.columns.find(
        (c) => c.databaseName === 'starts_at',
      );
      const endsAt = metadata.columns.find(
        (c) => c.databaseName === 'ends_at',
      );
      expect(startsAt).toBeDefined();
      expect(startsAt!.type).toBe('timestamptz');
      expect(startsAt!.isNullable).toBe(true);
      expect(endsAt).toBeDefined();
      expect(endsAt!.type).toBe('timestamptz');
      expect(endsAt!.isNullable).toBe(true);
    });

    it('should have deleted_at as DeleteDateColumn (timestamptz)', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'deleted_at',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('timestamptz');
      expect(col!.isDeleteDate).toBe(true);
    });

    it('should have CHECK constraint chk_event_dates', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const chk = metadata.checks.find((c) => c.name === 'chk_event_dates');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe(
        '"ends_at" IS NULL OR "ends_at" > "starts_at"',
      );
    });

    it('should have CHECK constraint chk_event_cost', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const chk = metadata.checks.find((c) => c.name === 'chk_event_cost');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe('"cost_cents" >= 0');
    });

    it('should have CHECK constraint chk_event_participants', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const chk = metadata.checks.find(
        (c) => c.name === 'chk_event_participants',
      );
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe(
        '"max_participants" IS NULL OR "max_participants" >= 1',
      );
    });

    it('should have CHECK constraint chk_event_refund', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const chk = metadata.checks.find((c) => c.name === 'chk_event_refund');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe('"refund_deadline_hours" >= 0');
    });

    it('should have index idx_events_feed on (neighbourhood_id, status, starts_at)', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const idx = metadata.indices.find((i) => i.name === 'idx_events_feed');
      expect(idx).toBeDefined();
      const idxColumns = idx!.columns.map((c) => c.databaseName);
      expect(idxColumns).toEqual(['neighbourhood_id', 'status', 'starts_at']);
    });

    it('should have index idx_events_creator on creator_id', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_events_creator',
      );
      expect(idx).toBeDefined();
      const idxColumns = idx!.columns.map((c) => c.databaseName);
      expect(idxColumns).toEqual(['creator_id']);
    });

    it('should have index idx_events_group on group_id', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const idx = metadata.indices.find((i) => i.name === 'idx_events_group');
      expect(idx).toBeDefined();
      const idxColumns = idx!.columns.map((c) => c.databaseName);
      expect(idxColumns).toEqual(['group_id']);
    });

    it('should have ManyToOne relation to User (creator)', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const rel = metadata.relations.find(
        (r) => r.propertyName === 'creator',
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(User);
    });

    it('should have ManyToOne relation to EvenementsCategory (nullable)', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const rel = metadata.relations.find(
        (r) => r.propertyName === 'category',
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(EvenementsCategory);
      expect(rel!.isNullable).toBe(true);
    });

    it('should have ManyToOne relation to ChatGroup (nullable)', () => {
      const metadata = dataSource.getMetadata(Evenement);
      const rel = metadata.relations.find((r) => r.propertyName === 'group');
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(ChatGroup);
      expect(rel!.isNullable).toBe(true);
    });
  });

  // ─── EventParticipant ─────────────────────────────────────────────────

  describe('EventParticipant entity', () => {
    it('should map to the "event_participants" table', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      expect(metadata.tableName).toBe('event_participants');
    });

    it('should have composite primary key (user_id, event_id)', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const pkColumns = metadata.primaryColumns.map((c) => c.databaseName);
      expect(pkColumns).toContain('user_id');
      expect(pkColumns).toContain('event_id');
      expect(pkColumns).toHaveLength(2);
    });

    it('should define user_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'user_id',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define event_id as uuid NOT NULL', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'event_id',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(false);
    });

    it('should define status as enum using participant_status_enum with default waitlisted', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('participant_status_enum');
      expect(col!.enum).toEqual(['registered', 'waitlisted', 'cancelled']);
      expect(col!.default).toBe("waitlisted");
    });

    it('should define payment_status as enum using payment_status_enum with default free', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'payment_status',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('payment_status_enum');
      expect(col!.enum).toEqual(['free', 'pending', 'completed', 'refunded']);
      expect(col!.default).toBe("free");
    });

    it('should define stripe_session_id as varchar nullable UNIQUE', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'stripe_session_id',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('varchar');
      expect(col!.isNullable).toBe(true);
      const hasUnique = (col as { isUnique?: boolean }).isUnique === true ||
        metadata.uniques.some((u) => u.columns.some((c) => c.databaseName === 'stripe_session_id'));
      expect(hasUnique).toBe(true);
    });

    it('should define stripe_payment_intent as varchar nullable UNIQUE', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'stripe_payment_intent',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('varchar');
      expect(col!.isNullable).toBe(true);
      const hasUnique = (col as { isUnique?: boolean }).isUnique === true ||
        metadata.uniques.some((u) => u.columns.some((c) => c.databaseName === 'stripe_payment_intent'));
      expect(hasUnique).toBe(true);
    });

    it('should define amount_cents as int NOT NULL with default 0', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'amount_cents',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('int');
      expect(col!.isNullable).toBe(false);
      expect(col!.default).toBe(0);
    });

    it('should define registered_at as timestamptz NOT NULL with default now()', () => {
      const metadata = dataSource.getMetadata(EventParticipant);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'registered_at',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('timestamptz');
      expect(col!.isNullable).toBe(false);
      expect(typeof col!.default).toBe('function');
      expect((col!.default as () => string)()).toBe('now()');
    });
  });
});
