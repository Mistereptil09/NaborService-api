import { DataSource } from 'typeorm';
import { Poll } from '../entities/poll.entity';
import { PollOption } from '../entities/poll-option.entity';
import { Vote } from '../entities/vote.entity';
import { Incident } from '../../incidents/entities/incident.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Validates: Requirements 7.1–7.5, 8.1–8.3
 *
 * Combined metadata tests for Polls & Incidents entities verifying
 * CHECK constraints, composite PKs, indexes, and relations.
 */
describe('Polls & Incidents Entities — TypeORM Metadata', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [Poll, PollOption, Vote, Incident, User],
      synchronize: false,
    });
    (dataSource as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  // ─── Poll ─────────────────────────────────────────────────────────────

  describe('Poll entity', () => {
    it('should map to the "polls" table with UUID PK', () => {
      const metadata = dataSource.getMetadata(Poll);
      expect(metadata.tableName).toBe('polls');
      expect(metadata.primaryColumns).toHaveLength(1);
      expect(metadata.primaryColumns[0].databaseName).toBe('id');
      expect(metadata.primaryColumns[0].type).toBe('uuid');
    });

    it('should have CHECK constraint chk_poll_dates', () => {
      const metadata = dataSource.getMetadata(Poll);
      const chk = metadata.checks.find((c) => c.name === 'chk_poll_dates');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe(
        '"ends_at" IS NULL OR "ends_at" > "starts_at"',
      );
    });

    it('should have index idx_polls_active on (neighbourhood_id, ends_at)', () => {
      const metadata = dataSource.getMetadata(Poll);
      const idx = metadata.indices.find((i) => i.name === 'idx_polls_active');
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toEqual(['neighbourhood_id', 'ends_at']);
    });

    it('should have index idx_polls_creator on creator_id', () => {
      const metadata = dataSource.getMetadata(Poll);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_polls_creator',
      );
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toEqual(['creator_id']);
    });

    it('should have nullable closed_by FK column (uuid)', () => {
      const metadata = dataSource.getMetadata(Poll);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'closed_by',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('uuid');
      expect(col!.isNullable).toBe(true);
    });

    it('should define poll_type as enum with enumName poll_type_enum', () => {
      const metadata = dataSource.getMetadata(Poll);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'poll_type',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('poll_type_enum');
      expect(col!.enum).toEqual(['single', 'multiple', 'weighted']);
    });

    it('should have DeleteDateColumn for soft delete', () => {
      const metadata = dataSource.getMetadata(Poll);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'deleted_at',
      );
      expect(col).toBeDefined();
      expect(col!.isDeleteDate).toBe(true);
      expect(col!.type).toBe('timestamptz');
    });

    it('should have ManyToOne to User for creator (NOT NULL) and closedBy (nullable)', () => {
      const metadata = dataSource.getMetadata(Poll);
      const creatorRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'creator_id'),
      );
      const closedByRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'closed_by'),
      );
      expect(creatorRel).toBeDefined();
      expect(creatorRel!.relationType).toBe('many-to-one');
      expect(creatorRel!.inverseEntityMetadata.target).toBe(User);

      expect(closedByRel).toBeDefined();
      expect(closedByRel!.relationType).toBe('many-to-one');
      expect(closedByRel!.inverseEntityMetadata.target).toBe(User);
      expect(closedByRel!.isNullable).toBe(true);
    });
  });

  // ─── PollOption ───────────────────────────────────────────────────────

  describe('PollOption entity', () => {
    it('should map to the "poll_options" table with UUID PK', () => {
      const metadata = dataSource.getMetadata(PollOption);
      expect(metadata.tableName).toBe('poll_options');
      expect(metadata.primaryColumns).toHaveLength(1);
      expect(metadata.primaryColumns[0].databaseName).toBe('id');
      expect(metadata.primaryColumns[0].type).toBe('uuid');
    });

    it('should have index idx_poll_options_poll on poll_id', () => {
      const metadata = dataSource.getMetadata(PollOption);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_poll_options_poll',
      );
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toEqual(['poll_id']);
    });

    it('should have ManyToOne relation to Poll', () => {
      const metadata = dataSource.getMetadata(PollOption);
      const rel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'poll_id'),
      );
      expect(rel).toBeDefined();
      expect(rel!.relationType).toBe('many-to-one');
      expect(rel!.inverseEntityMetadata.target).toBe(Poll);
    });
  });

  // ─── Vote ─────────────────────────────────────────────────────────────

  describe('Vote entity', () => {
    it('should map to the "votes" table', () => {
      const metadata = dataSource.getMetadata(Vote);
      expect(metadata.tableName).toBe('votes');
    });

    it('should have composite primary key (user_id, option_id)', () => {
      const metadata = dataSource.getMetadata(Vote);
      const pkNames = metadata.primaryColumns
        .map((c) => c.databaseName)
        .sort();
      expect(pkNames).toEqual(['option_id', 'user_id']);
    });

    it('should have CHECK constraint chk_vote_weight', () => {
      const metadata = dataSource.getMetadata(Vote);
      const chk = metadata.checks.find((c) => c.name === 'chk_vote_weight');
      expect(chk).toBeDefined();
      expect(chk!.expression).toBe('"weight" >= 1');
    });

    it('should define weight as integer with default 1', () => {
      const metadata = dataSource.getMetadata(Vote);
      const col = metadata.columns.find((c) => c.databaseName === 'weight');
      expect(col).toBeDefined();
      expect(col!.type).toBe('integer');
      expect(col!.default).toBe(1);
    });

    it('should have ManyToOne relations to User and PollOption', () => {
      const metadata = dataSource.getMetadata(Vote);
      const userRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'user_id'),
      );
      const optionRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'option_id'),
      );
      expect(userRel).toBeDefined();
      expect(userRel!.relationType).toBe('many-to-one');
      expect(userRel!.inverseEntityMetadata.target).toBe(User);
      expect(optionRel).toBeDefined();
      expect(optionRel!.relationType).toBe('many-to-one');
      expect(optionRel!.inverseEntityMetadata.target).toBe(PollOption);
    });
  });

  // ─── Incident ─────────────────────────────────────────────────────────

  describe('Incident entity', () => {
    it('should map to the "incidents" table with UUID PK', () => {
      const metadata = dataSource.getMetadata(Incident);
      expect(metadata.tableName).toBe('incidents');
      expect(metadata.primaryColumns).toHaveLength(1);
      expect(metadata.primaryColumns[0].databaseName).toBe('id');
      expect(metadata.primaryColumns[0].type).toBe('uuid');
    });

    it('should have index idx_incidents_feed on (neighbourhood_id, status)', () => {
      const metadata = dataSource.getMetadata(Incident);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_incidents_feed',
      );
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toContain('neighbourhood_id');
      expect(colNames).toContain('status');
    });

    it('should define severity as enum with enumName incident_severity_enum', () => {
      const metadata = dataSource.getMetadata(Incident);
      const col = metadata.columns.find(
        (c) => c.databaseName === 'severity',
      );
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('incident_severity_enum');
      expect(col!.enum).toEqual(['low', 'medium', 'high', 'critical']);
    });

    it('should define status as enum with enumName incident_status_enum', () => {
      const metadata = dataSource.getMetadata(Incident);
      const col = metadata.columns.find((c) => c.databaseName === 'status');
      expect(col).toBeDefined();
      expect(col!.type).toBe('enum');
      expect(col!.enumName).toBe('incident_status_enum');
      expect(col!.enum).toEqual(['open', 'in_progress', 'resolved']);
    });

    it('should have ManyToOne to User for reporter (NOT NULL) and assignee (nullable)', () => {
      const metadata = dataSource.getMetadata(Incident);
      const reporterRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'reporter_id'),
      );
      const assigneeRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'assigned_to'),
      );

      expect(reporterRel).toBeDefined();
      expect(reporterRel!.relationType).toBe('many-to-one');
      expect(reporterRel!.inverseEntityMetadata.target).toBe(User);

      expect(assigneeRel).toBeDefined();
      expect(assigneeRel!.relationType).toBe('many-to-one');
      expect(assigneeRel!.inverseEntityMetadata.target).toBe(User);
      expect(assigneeRel!.isNullable).toBe(true);
    });

    it('should define reporter_id as NOT NULL and assigned_to as nullable', () => {
      const metadata = dataSource.getMetadata(Incident);
      const reporterId = metadata.columns.find(
        (c) => c.databaseName === 'reporter_id',
      );
      const assignedTo = metadata.columns.find(
        (c) => c.databaseName === 'assigned_to',
      );
      expect(reporterId).toBeDefined();
      expect(reporterId!.type).toBe('uuid');
      expect(reporterId!.isNullable).toBe(false);

      expect(assignedTo).toBeDefined();
      expect(assignedTo!.type).toBe('uuid');
      expect(assignedTo!.isNullable).toBe(true);
    });
  });
});
