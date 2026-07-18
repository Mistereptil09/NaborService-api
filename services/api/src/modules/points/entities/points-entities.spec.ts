import { DataSource } from 'typeorm';
import { PointsLedgerEntry } from './points-ledger-entry.entity';
import { PointsTopup } from './points-topup.entity';
import { PointsCashout } from './points-cashout.entity';
import { User } from '../../users/entities/user.entity';

describe('Points Entities Metadata', () => {
  let ds: DataSource;

  beforeAll(() => {
    ds = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [PointsLedgerEntry, PointsTopup, PointsCashout, User],
      synchronize: false,
    });
    (ds as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  describe('PointsLedgerEntry', () => {
    it('should map to table "points_ledger_entries"', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      expect(meta.tableName).toBe('points_ledger_entries');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should have a nullable "user_id" column', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const col = meta.columns.find((c) => c.databaseName === 'user_id');
      expect(col).toBeDefined();
      expect(col!.isNullable).toBe(true);
    });

    it('should have "type" enum column with enumName "points_ledger_entry_type_enum"', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const col = meta.columns.find((c) => c.databaseName === 'type');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('points_ledger_entry_type_enum');
    });

    it('should have CHECK constraint "chk_ple_amount_nonzero"', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const check = meta.checks.find(
        (c) => c.name === 'chk_ple_amount_nonzero',
      );
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"amount_points" != 0');
    });

    it('should have index on (user_id, created_at)', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const idx = meta.indices.find((i) => i.name === 'idx_ple_user_created');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toEqual(
        expect.arrayContaining(['user_id', 'created_at']),
      );
    });

    it('should have index on "type"', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const idx = meta.indices.find((i) => i.name === 'idx_ple_type');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('type');
    });

    it('should have index on (reference_type, reference_id)', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const idx = meta.indices.find((i) => i.name === 'idx_ple_reference');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toEqual(
        expect.arrayContaining(['reference_type', 'reference_id']),
      );
    });

    it('should have a ManyToOne (nullable) relation to User', () => {
      const meta = ds.getMetadata(PointsLedgerEntry);
      const rel = meta.relations.find((r) => r.propertyName === 'user');
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(User);
      expect(rel!.isNullable).toBe(true);
    });
  });

  describe('PointsTopup', () => {
    it('should map to table "points_topups"', () => {
      const meta = ds.getMetadata(PointsTopup);
      expect(meta.tableName).toBe('points_topups');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const meta = ds.getMetadata(PointsTopup);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should have CHECK constraint "chk_topup_amount"', () => {
      const meta = ds.getMetadata(PointsTopup);
      const check = meta.checks.find((c) => c.name === 'chk_topup_amount');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"amount_cents" > 0');
    });

    it('should have CHECK constraint "chk_topup_points"', () => {
      const meta = ds.getMetadata(PointsTopup);
      const check = meta.checks.find((c) => c.name === 'chk_topup_points');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"points_purchased" > 0');
    });

    it('should have "status" enum column with enumName "points_topup_status_enum"', () => {
      const meta = ds.getMetadata(PointsTopup);
      const col = meta.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('points_topup_status_enum');
    });

    it('should have UNIQUE constraint on "stripe_checkout_session_id"', () => {
      const meta = ds.getMetadata(PointsTopup);
      const col = meta.columns.find(
        (c) => c.databaseName === 'stripe_checkout_session_id',
      );
      expect(col).toBeDefined();
      expect(col!.isNullable).toBe(true);
      const hasUnique =
        meta.uniques.some((u) =>
          u.columns.some(
            (c) => c.databaseName === 'stripe_checkout_session_id',
          ),
        ) || (col as { isUnique?: boolean }).isUnique === true;
      expect(hasUnique).toBe(true);
    });

    it('should have UNIQUE constraint on "stripe_payment_intent_id"', () => {
      const meta = ds.getMetadata(PointsTopup);
      const col = meta.columns.find(
        (c) => c.databaseName === 'stripe_payment_intent_id',
      );
      expect(col).toBeDefined();
      expect(col!.isNullable).toBe(true);
      const hasUnique =
        meta.uniques.some((u) =>
          u.columns.some((c) => c.databaseName === 'stripe_payment_intent_id'),
        ) || (col as { isUnique?: boolean }).isUnique === true;
      expect(hasUnique).toBe(true);
    });

    it('should have index on user_id', () => {
      const meta = ds.getMetadata(PointsTopup);
      const idx = meta.indices.find((i) => i.name === 'idx_topup_user');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('user_id');
    });

    it('should have a ManyToOne relation to User', () => {
      const meta = ds.getMetadata(PointsTopup);
      const rel = meta.relations.find((r) => r.propertyName === 'user');
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(User);
    });
  });

  describe('PointsCashout', () => {
    it('should map to table "points_cashouts"', () => {
      const meta = ds.getMetadata(PointsCashout);
      expect(meta.tableName).toBe('points_cashouts');
    });

    it('should have a UUID primary key with uuid_generate_v7() default', () => {
      const meta = ds.getMetadata(PointsCashout);
      const pkColumns = meta.primaryColumns;
      expect(pkColumns).toHaveLength(1);
      expect(pkColumns[0].databaseName).toBe('id');
      expect(pkColumns[0].type).toBe('uuid');
      expect(typeof pkColumns[0].default).toBe('function');
      expect((pkColumns[0].default as () => string)()).toBe(
        'uuid_generate_v7()',
      );
    });

    it('should have CHECK constraint "chk_cashout_points"', () => {
      const meta = ds.getMetadata(PointsCashout);
      const check = meta.checks.find((c) => c.name === 'chk_cashout_points');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"amount_points" > 0');
    });

    it('should have CHECK constraint "chk_cashout_amount"', () => {
      const meta = ds.getMetadata(PointsCashout);
      const check = meta.checks.find((c) => c.name === 'chk_cashout_amount');
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"amount_cents" > 0');
    });

    it('should have "status" enum column with enumName "points_cashout_status_enum"', () => {
      const meta = ds.getMetadata(PointsCashout);
      const col = meta.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('points_cashout_status_enum');
    });

    it('should have UNIQUE constraint on "stripe_transfer_id"', () => {
      const meta = ds.getMetadata(PointsCashout);
      const col = meta.columns.find(
        (c) => c.databaseName === 'stripe_transfer_id',
      );
      expect(col).toBeDefined();
      expect(col!.isNullable).toBe(true);
      const hasUnique =
        meta.uniques.some((u) =>
          u.columns.some((c) => c.databaseName === 'stripe_transfer_id'),
        ) || (col as { isUnique?: boolean }).isUnique === true;
      expect(hasUnique).toBe(true);
    });

    it('should have index on user_id', () => {
      const meta = ds.getMetadata(PointsCashout);
      const idx = meta.indices.find((i) => i.name === 'idx_cashout_user');
      expect(idx).toBeDefined();
      expect(idx!.columns.map((c) => c.databaseName)).toContain('user_id');
    });

    it('should have a ManyToOne relation to User', () => {
      const meta = ds.getMetadata(PointsCashout);
      const rel = meta.relations.find((r) => r.propertyName === 'user');
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.type).toBe(User);
    });
  });
});
