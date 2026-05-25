import { DataSource } from 'typeorm';
import { ListingCategory } from '../entities/listing-category.entity';
import { Listing } from '../entities/listing.entity';
import { ListingTransaction } from '../entities/listing-transaction.entity';
import { ListingReport } from '../entities/listing-report.entity';
import { ListingModerationAction } from '../entities/listing-moderation-action.entity';
import { User } from '../../users/entities/user.entity';

describe('Listings & Payments Entities — TypeORM Metadata', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [
        User,
        ListingCategory,
        Listing,
        ListingTransaction,
        ListingReport,
        ListingModerationAction,
      ],
      synchronize: false,
    });
    dataSource.buildMetadatas();
  });

  // ─── ListingCategory (Requirement 5.1) ───────────────────────────────────────

  describe('ListingCategory entity', () => {
    it('should map to table "listing_category"', () => {
      const metadata = dataSource.getMetadata(ListingCategory);
      expect(metadata.tableName).toBe('listing_category');
    });

    it('should have a SERIAL (auto-increment) primary key "id"', () => {
      const metadata = dataSource.getMetadata(ListingCategory);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].isGenerated).toBe(true);
      expect(pkColumns[0].generationStrategy).toBe('increment');
    });

    it('should have a self-referencing nullable "parent_category" column', () => {
      const metadata = dataSource.getMetadata(ListingCategory);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'parent_category',
      );
      expect(col).toBeDefined();
      expect(col!.type === 'int' || col!.type === Number).toBe(true);
      expect(col!.isNullable).toBe(true);
    });

    it('should have a self-referencing ManyToOne relation (parentCategory)', () => {
      const metadata = dataSource.getMetadata(ListingCategory);
      const rel = metadata.relations.find(
        (r) => r.propertyName === 'parentCategory',
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(ListingCategory);
    });

    it('should have a OneToMany "children" relation', () => {
      const metadata = dataSource.getMetadata(ListingCategory);
      const rel = metadata.relations.find(
        (r) => r.propertyName === 'children',
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('one-to-many');
      expect(rel!.type).toBe(ListingCategory);
    });

    it('should have "category_name" VARCHAR NOT NULL', () => {
      const metadata = dataSource.getMetadata(ListingCategory);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'category_name',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('varchar');
      expect(col!.isNullable).toBe(false);
    });

    it('should have "created_at" and nullable "updated_at" timestamptz columns', () => {
      const metadata = dataSource.getMetadata(ListingCategory);
      const createdAt = metadata.columns.find(
        (c) => c.databaseName === 'created_at',
      );
      const updatedAt = metadata.columns.find(
        (c) => c.databaseName === 'updated_at',
      );
      expect(createdAt).toBeDefined();
      expect(createdAt!.type).toBe('timestamptz');
      expect(updatedAt).toBeDefined();
      expect(updatedAt!.type).toBe('timestamptz');
      expect(updatedAt!.isNullable).toBe(true);
    });
  });

  // ─── Listing (Requirements 5.2, 5.3) ─────────────────────────────────────────

  describe('Listing entity', () => {
    it('should map to table "listings"', () => {
      const metadata = dataSource.getMetadata(Listing);
      expect(metadata.tableName).toBe('listings');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(Listing);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe('uuid_generate_v7()');
    });

    it('should have CHECK constraint "chk_listing_price"', () => {
      const metadata = dataSource.getMetadata(Listing);
      const check = metadata.checks.find(
        (c) => c.name === 'chk_listing_price',
      );
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"price_cents" >= 0');
    });

    it('should have index "idx_listings_feed" on (neighbourhood_id, status, created_at)', () => {
      const metadata = dataSource.getMetadata(Listing);
      const idx = metadata.indices.find((i) => i.name === 'idx_listings_feed');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toEqual(
        expect.arrayContaining(['neighbourhood_id', 'status', 'created_at']),
      );
    });

    it('should have index "idx_listings_creator" on creator_id', () => {
      const metadata = dataSource.getMetadata(Listing);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_listings_creator',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('creator_id');
    });

    it('should have index "idx_listings_soft_delete" on deleted_at', () => {
      const metadata = dataSource.getMetadata(Listing);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_listings_soft_delete',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('deleted_at');
    });

    it('should have listing_type enum column with enumName "listing_type_enum"', () => {
      const metadata = dataSource.getMetadata(Listing);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'listing_type',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('listing_type_enum');
    });

    it('should have status enum column with enumName "listing_status_enum"', () => {
      const metadata = dataSource.getMetadata(Listing);
      const col = metadata.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('listing_status_enum');
    });

    it('should have a DeleteDateColumn "deleted_at"', () => {
      const metadata = dataSource.getMetadata(Listing);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'deleted_at',
      );
      expect(col).toBeDefined();
      expect(col!.isDeleteDate).toBe(true);
      expect(col!.type).toBe('timestamptz');
    });

    it('should have "price_cents" INT NOT NULL default 0', () => {
      const metadata = dataSource.getMetadata(Listing);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'price_cents',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('int');
      expect(col!.isNullable).toBe(false);
      expect(col!.default).toBe(0);
    });

    it('should have ManyToOne relations to User and ListingCategory', () => {
      const metadata = dataSource.getMetadata(Listing);
      const creatorRel = metadata.relations.find(
        (r) => r.propertyName === 'creator',
      );
      const categoryRel = metadata.relations.find(
        (r) => r.propertyName === 'category',
      );
      expect(creatorRel).toBeDefined();
      expect(creatorRel!.relationType).toBe('many-to-one');
      expect(creatorRel!.type).toBe(User);
      expect(categoryRel).toBeDefined();
      expect(categoryRel!.relationType).toBe('many-to-one');
      expect(categoryRel!.type).toBe(ListingCategory);
    });
  });

  // ─── ListingTransaction (Requirements 5.4, 5.5) ──────────────────────────────

  describe('ListingTransaction entity', () => {
    it('should map to table "listing_transactions"', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      expect(metadata.tableName).toBe('listing_transactions');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe('uuid_generate_v7()');
    });

    it('should have CHECK constraint "chk_ltx_parties"', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const check = metadata.checks.find(
        (c) => c.name === 'chk_ltx_parties',
      );
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"provider_id" != "requester_id"');
    });

    it('should have CHECK constraint "chk_ltx_amount"', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const check = metadata.checks.find(
        (c) => c.name === 'chk_ltx_amount',
      );
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"amount_cents" >= 0');
    });

    it('should have CHECK constraint "chk_ltx_commission"', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const check = metadata.checks.find(
        (c) => c.name === 'chk_ltx_commission',
      );
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"commission_cents" >= 0');
    });

    it('should have UNIQUE constraint on "stripe_session_id"', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'stripe_session_id',
      );
      expect(col).toBeDefined();
      expect(col!.isNullable).toBe(true);

      const hasUnique =
        metadata.uniques.some((u) =>
          u.columns.some((c) => c.databaseName === 'stripe_session_id'),
        ) || col!.isUnique === true;
      expect(hasUnique).toBe(true);
    });

    it('should have UNIQUE constraint on "stripe_payment_intent"', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'stripe_payment_intent',
      );
      expect(col).toBeDefined();
      expect(col!.isNullable).toBe(true);

      const hasUnique =
        metadata.uniques.some((u) =>
          u.columns.some((c) => c.databaseName === 'stripe_payment_intent'),
        ) || col!.isUnique === true;
      expect(hasUnique).toBe(true);
    });

    it('should have index on (listing_id, status)', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_ltx_listing_status',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toEqual(
        expect.arrayContaining(['listing_id', 'status']),
      );
    });

    it('should have index on provider_id', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_ltx_provider',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('provider_id');
    });

    it('should have index on requester_id', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_ltx_requester',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('requester_id');
    });

    it('should have "status" enum column with enumName "transaction_status_enum"', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const col = metadata.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('transaction_status_enum');
    });

    it('should have ManyToOne relations to Listing and User (provider, requester)', () => {
      const metadata = dataSource.getMetadata(ListingTransaction);
      const listingRel = metadata.relations.find(
        (r) => r.propertyName === 'listing',
      );
      const providerRel = metadata.relations.find(
        (r) => r.propertyName === 'provider',
      );
      const requesterRel = metadata.relations.find(
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

  // ─── ListingReport (Requirement 5.6) ─────────────────────────────────────────

  describe('ListingReport entity', () => {
    it('should map to table "listing_reports"', () => {
      const metadata = dataSource.getMetadata(ListingReport);
      expect(metadata.tableName).toBe('listing_reports');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(ListingReport);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe('uuid_generate_v7()');
    });

    it('should have index on listing_id', () => {
      const metadata = dataSource.getMetadata(ListingReport);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_listing_reports_listing',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('listing_id');
    });

    it('should have index on resolved_at', () => {
      const metadata = dataSource.getMetadata(ListingReport);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_listing_reports_resolved',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('resolved_at');
    });

    it('should have "reason" TEXT NOT NULL', () => {
      const metadata = dataSource.getMetadata(ListingReport);
      const col = metadata.columns.find((c) => c.databaseName === 'reason');
      expect(col).toBeDefined();
      expect(col!.type).toBe('text');
      expect(col!.isNullable).toBe(false);
    });

    it('should have ManyToOne relations to Listing and User', () => {
      const metadata = dataSource.getMetadata(ListingReport);
      const listingRel = metadata.relations.find(
        (r) => r.propertyName === 'listing',
      );
      const reporterRel = metadata.relations.find(
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

  // ─── ListingModerationAction (Requirement 5.7) ───────────────────────────────

  describe('ListingModerationAction entity', () => {
    it('should map to table "listing_moderation_actions"', () => {
      const metadata = dataSource.getMetadata(ListingModerationAction);
      expect(metadata.tableName).toBe('listing_moderation_actions');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(ListingModerationAction);
      const pkColumns = metadata.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe('uuid_generate_v7()');
    });

    it('should have "action" enum column with enumName "moderation_action_enum"', () => {
      const metadata = dataSource.getMetadata(ListingModerationAction);
      const col = metadata.columns.find((c) => c.databaseName === 'action');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('moderation_action_enum');
    });

    it('should have index on listing_id', () => {
      const metadata = dataSource.getMetadata(ListingModerationAction);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_listing_moderation_actions_listing',
      );
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('listing_id');
    });

    it('should have ManyToOne relations to Listing and User', () => {
      const metadata = dataSource.getMetadata(ListingModerationAction);
      const listingRel = metadata.relations.find(
        (r) => r.propertyName === 'listing',
      );
      const moderatorRel = metadata.relations.find(
        (r) => r.propertyName === 'moderator',
      );
      expect(listingRel).toBeDefined();
      expect(listingRel!.relationType).toBe('many-to-one');
      expect(listingRel!.type).toBe(Listing);
      expect(moderatorRel).toBeDefined();
      expect(moderatorRel!.relationType).toBe('many-to-one');
      expect(moderatorRel!.type).toBe(User);
    });

    it('should have "reason" TEXT NOT NULL', () => {
      const metadata = dataSource.getMetadata(ListingModerationAction);
      const col = metadata.columns.find((c) => c.databaseName === 'reason');
      expect(col).toBeDefined();
      expect(col!.type).toBe('text');
      expect(col!.isNullable).toBe(false);
    });
  });
});
