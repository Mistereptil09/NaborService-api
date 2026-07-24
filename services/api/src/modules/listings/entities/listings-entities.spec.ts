import { DataSource } from 'typeorm';
import { ListingCategory } from './listing-category.entity';
import { Listing } from './listing.entity';
import { ListingTransaction } from './listing-transaction.entity';
import { ListingReport } from './listing-report.entity';
import { ListingModerationAction } from './listing-moderation-action.entity';
import { User } from '../../users/entities/user.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';

describe('Listings & Payments Entities Metadata', () => {
  let ds: DataSource;

  beforeAll(() => {
    ds = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [
        ListingCategory,
        Listing,
        ListingTransaction,
        ListingReport,
        ListingModerationAction,
        User,
        ChatGroup,
      ],
      synchronize: false,
    });
    (ds as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  describe('ListingCategory', () => {
    it('should map to table "listing_category"', () => {
      const meta = ds.getMetadata(ListingCategory);
      expect(meta.tableName).toBe('listing_category');
    });

    it('should have a SERIAL (auto-increment) primary key "id"', () => {
      const meta = ds.getMetadata(ListingCategory);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].isGenerated).toBe(true);
      expect(pkColumns[0].generationStrategy).toBe('increment');
    });

    it('should have a self-referencing nullable "parent_category" column', () => {
      const meta = ds.getMetadata(ListingCategory);
      const col = meta.columns.find(
        (c) => c.databaseName === 'parent_category',
      );
      expect(col).toBeDefined();
      expect(col!.type === 'int' || col!.type === Number).toBe(true);
      expect(col!.isNullable).toBe(true);
    });

    it('should have a self-referencing ManyToOne relation (parentCategory)', () => {
      const meta = ds.getMetadata(ListingCategory);
      const rel = meta.relations.find(
        (r) => r.propertyName === 'parentCategory',
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(ListingCategory);
    });

    it('should have a OneToMany "children" relation', () => {
      const meta = ds.getMetadata(ListingCategory);
      const rel = meta.relations.find((r) => r.propertyName === 'children');
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('one-to-many');
      expect(rel!.type).toBe(ListingCategory);
    });

    it('should have "category_name" VARCHAR NOT NULL', () => {
      const meta = ds.getMetadata(ListingCategory);
      const col = meta.columns.find((c) => c.databaseName === 'category_name');
      expect(col).toBeDefined();
      expect(col!.type).toBe('varchar');
      expect(col!.isNullable).toBe(false);
    });
  });

  describe('Listing', () => {
    it('should map to table "listings"', () => {
      const meta = ds.getMetadata(Listing);
      expect(meta.tableName).toBe('listings');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const meta = ds.getMetadata(Listing);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should have "listing_type" enum column with enumName "listing_type_enum"', () => {
      const meta = ds.getMetadata(Listing);
      const col = meta.columns.find((c) => c.databaseName === 'listing_type');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('listing_type_enum');
    });

    it('should have "status" enum column with enumName "listing_status_enum"', () => {
      const meta = ds.getMetadata(Listing);
      const col = meta.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('listing_status_enum');
    });

    it('should have CHECK constraint "chk_listing_price"', () => {
      const meta = ds.getMetadata(Listing);
      const check = meta.checks.find((c) => c.name === 'chk_listing_price');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"price_cents" >= 0');
    });

    it('should have index "idx_listings_feed" on (neighbourhood_id, status, created_at)', () => {
      const meta = ds.getMetadata(Listing);
      const idx = meta.indices.find((i) => i.name === 'idx_listings_feed');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toEqual(
        expect.arrayContaining(['neighbourhood_id', 'status', 'created_at']),
      );
    });

    it('should have index "idx_listings_creator" on creator_id', () => {
      const meta = ds.getMetadata(Listing);
      const idx = meta.indices.find((i) => i.name === 'idx_listings_creator');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('creator_id');
    });

    it('should have index "idx_listings_soft_delete" on deleted_at', () => {
      const meta = ds.getMetadata(Listing);
      const idx = meta.indices.find(
        (i) => i.name === 'idx_listings_soft_delete',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('deleted_at');
    });

    it('should have a DeleteDateColumn "deleted_at" (soft delete)', () => {
      const meta = ds.getMetadata(Listing);
      const col = meta.columns.find((c) => c.databaseName === 'deleted_at');
      expect(col).toBeDefined();
      expect(col!.isDeleteDate).toBe(true);
      expect(col!.type).toBe('timestamptz');
    });

    it('should have ManyToOne relation to User (creator)', () => {
      const meta = ds.getMetadata(Listing);
      const rel = meta.relations.find((r) => r.propertyName === 'creator');
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(User);
    });

    it('should have ManyToOne relation to ListingCategory (nullable)', () => {
      const meta = ds.getMetadata(Listing);
      const rel = meta.relations.find((r) => r.propertyName === 'category');
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(ListingCategory);
    });
  });

  describe('ListingTransaction', () => {
    it('should map to table "listing_transactions"', () => {
      const meta = ds.getMetadata(ListingTransaction);
      expect(meta.tableName).toBe('listing_transactions');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should have CHECK constraint "chk_ltx_parties"', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const check = meta.checks.find((c) => c.name === 'chk_ltx_parties');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"provider_id" != "requester_id"');
    });

    it('should have CHECK constraint "chk_ltx_amount"', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const check = meta.checks.find((c) => c.name === 'chk_ltx_amount');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"amount_points" >= 0');
    });

    it('should have CHECK constraint "chk_ltx_commission"', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const check = meta.checks.find((c) => c.name === 'chk_ltx_commission');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"commission_points" >= 0');
    });

    it('should have index on (listing_id, status)', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const idx = meta.indices.find((i) => i.name === 'idx_ltx_listing_status');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toEqual(
        expect.arrayContaining(['listing_id', 'status']),
      );
    });

    it('should have index on provider_id', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const idx = meta.indices.find((i) => i.name === 'idx_ltx_provider');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('provider_id');
    });

    it('should have index on requester_id', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const idx = meta.indices.find((i) => i.name === 'idx_ltx_requester');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('requester_id');
    });

    it('should have "status" enum column with enumName "transaction_status_enum"', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const col = meta.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('transaction_status_enum');
    });

    it('should have ManyToOne relations to Listing and User (provider, requester)', () => {
      const meta = ds.getMetadata(ListingTransaction);
      const listingRel = meta.relations.find(
        (r) => r.propertyName === 'listing',
      );
      const providerRel = meta.relations.find(
        (r) => r.propertyName === 'provider',
      );
      const requesterRel = meta.relations.find(
        (r) => r.propertyName === 'requester',
      );
      expect(listingRel).toBeDefined();
      expect(listingRel!.relationType).toBe('many-to-one');
      expect(listingRel!.type).toBe(Listing);
      expect(providerRel).toBeDefined();
      expect(providerRel!.relationType).toBe('many-to-one');
      expect(providerRel!.type).toBe(User);
      expect(requesterRel).toBeDefined();
      expect(requesterRel!.relationType).toBe('many-to-one');
      expect(requesterRel!.type).toBe(User);
    });
  });

  describe('ListingReport', () => {
    it('should map to table "listing_reports"', () => {
      const meta = ds.getMetadata(ListingReport);
      expect(meta.tableName).toBe('listing_reports');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const meta = ds.getMetadata(ListingReport);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should have index on listing_id', () => {
      const meta = ds.getMetadata(ListingReport);
      const idx = meta.indices.find(
        (i) => i.name === 'idx_listing_reports_listing',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('listing_id');
    });

    it('should have index on resolved_at', () => {
      const meta = ds.getMetadata(ListingReport);
      const idx = meta.indices.find(
        (i) => i.name === 'idx_listing_reports_resolved',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('resolved_at');
    });

    it('should have ManyToOne relations to Listing and User', () => {
      const meta = ds.getMetadata(ListingReport);
      const listingRel = meta.relations.find(
        (r) => r.propertyName === 'listing',
      );
      const reporterRel = meta.relations.find(
        (r) => r.propertyName === 'reporter',
      );
      expect(listingRel).toBeDefined();
      expect(listingRel!.relationType).toBe('many-to-one');
      expect(listingRel!.type).toBe(Listing);
      expect(reporterRel).toBeDefined();
      expect(reporterRel!.relationType).toBe('many-to-one');
      expect(reporterRel!.type).toBe(User);
    });
  });

  describe('ListingModerationAction', () => {
    it('should map to table "listing_moderation_actions"', () => {
      const meta = ds.getMetadata(ListingModerationAction);
      expect(meta.tableName).toBe('listing_moderation_actions');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const meta = ds.getMetadata(ListingModerationAction);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should have "action" enum column with enumName "moderation_action_enum"', () => {
      const meta = ds.getMetadata(ListingModerationAction);
      const col = meta.columns.find((c) => c.databaseName === 'action');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('moderation_action_enum');
    });

    it('should have index on listing_id', () => {
      const meta = ds.getMetadata(ListingModerationAction);
      const idx = meta.indices.find(
        (i) => i.name === 'idx_listing_moderation_actions_listing',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('listing_id');
    });

    it('should have ManyToOne relations to Listing and User', () => {
      const meta = ds.getMetadata(ListingModerationAction);
      const listingRel = meta.relations.find(
        (r) => r.propertyName === 'listing',
      );
      const moderatorRel = meta.relations.find(
        (r) => r.propertyName === 'moderator',
      );
      expect(listingRel).toBeDefined();
      expect(listingRel!.relationType).toBe('many-to-one');
      expect(listingRel!.type).toBe(Listing);
      expect(moderatorRel).toBeDefined();
      expect(moderatorRel!.relationType).toBe('many-to-one');
      expect(moderatorRel!.type).toBe(User);
    });
  });
});
