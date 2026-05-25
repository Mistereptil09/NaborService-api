import { DataSource } from 'typeorm';
import { Poll } from '../entities/poll.entity';
import { PollOption } from '../entities/poll-option.entity';
import { Vote } from '../entities/vote.entity';
import { User } from '../../users/entities/user.entity';

describe('Polls Domain — TypeORM Metadata', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [Poll, PollOption, Vote, User],
      synchronize: false,
    });
    dataSource.buildMetadatas();
  });

  describe('Poll entity', () => {
    it('should map to the "polls" table', () => {
      const metadata = dataSource.getMetadata(Poll);
      expect(metadata.tableName).toBe('polls');
    });

    it('should have a UUID primary key "id"', () => {
      const metadata = dataSource.getMetadata(Poll);
      expect(metadata.primaryColumns).toHaveLength(1);
      const pk = metadata.primaryColumns[0];
      expect(pk.databaseName).toBe('id');
      expect(pk.type).toBe('uuid');
    });

    it('should define all expected columns with correct types and nullability', () => {
      const metadata = dataSource.getMetadata(Poll);
      const cols = metadata.columns;

      const findCol = (name: string) =>
        cols.find((c) => c.databaseName === name);

      const title = findCol('title');
      expect(title).toBeDefined();
      expect(title!.type).toBe('varchar');
      expect(title!.isNullable).toBe(false);

      const description = findCol('description');
      expect(description).toBeDefined();
      expect(description!.type).toBe('text');
      expect(description!.isNullable).toBe(true);

      const creatorId = findCol('creator_id');
      expect(creatorId).toBeDefined();
      expect(creatorId!.type).toBe('uuid');
      expect(creatorId!.isNullable).toBe(false);

      const neighbourhoodId = findCol('neighbourhood_id');
      expect(neighbourhoodId).toBeDefined();
      expect(neighbourhoodId!.type).toBe('text');
      expect(neighbourhoodId!.isNullable).toBe(true);

      const pollType = findCol('poll_type');
      expect(pollType).toBeDefined();
      expect(pollType!.type).toBe('enum');
      expect(pollType!.enum).toContain('single');
      expect(pollType!.enum).toContain('multiple');
      expect(pollType!.enum).toContain('weighted');

      const startsAt = findCol('starts_at');
      expect(startsAt).toBeDefined();
      expect(startsAt!.type).toBe('timestamptz');
      expect(startsAt!.isNullable).toBe(true);

      const endsAt = findCol('ends_at');
      expect(endsAt).toBeDefined();
      expect(endsAt!.type).toBe('timestamptz');
      expect(endsAt!.isNullable).toBe(true);

      const isAnonymous = findCol('is_anonymous');
      expect(isAnonymous).toBeDefined();
      expect(isAnonymous!.type).toBe('boolean');
      expect(isAnonymous!.isNullable).toBe(false);
      expect(isAnonymous!.default).toBe(false);

      const closedAt = findCol('closed_at');
      expect(closedAt).toBeDefined();
      expect(closedAt!.type).toBe('timestamptz');
      expect(closedAt!.isNullable).toBe(true);

      const closedByCol = findCol('closed_by');
      expect(closedByCol).toBeDefined();
      expect(closedByCol!.type).toBe('uuid');
      expect(closedByCol!.isNullable).toBe(true);

      const createdAt = findCol('created_at');
      expect(createdAt).toBeDefined();
      expect(createdAt!.type).toBe('timestamptz');

      const updatedAt = findCol('updated_at');
      expect(updatedAt).toBeDefined();
      expect(updatedAt!.type).toBe('timestamptz');
      expect(updatedAt!.isNullable).toBe(true);

      const deletedAt = findCol('deleted_at');
      expect(deletedAt).toBeDefined();
      expect(deletedAt!.type).toBe('timestamptz');
    });

    it('should have a DeleteDateColumn for soft delete', () => {
      const metadata = dataSource.getMetadata(Poll);
      const deletedAt = metadata.columns.find(
        (c) => c.databaseName === 'deleted_at',
      );
      expect(deletedAt).toBeDefined();
      expect(deletedAt!.isDeleteDate).toBe(true);
    });

    it('should define poll_type enum with enumName "poll_type_enum"', () => {
      const metadata = dataSource.getMetadata(Poll);
      const pollType = metadata.columns.find(
        (c) => c.databaseName === 'poll_type',
      );
      expect(pollType).toBeDefined();
      expect(pollType!.enumName).toBe('poll_type_enum');
    });

    it('should define CHECK constraint chk_poll_dates', () => {
      const metadata = dataSource.getMetadata(Poll);
      const checks = metadata.checks;
      const chk = checks.find((c) => c.name === 'chk_poll_dates');
      expect(chk).toBeDefined();
      expect(chk!.expression).toContain('"ends_at" IS NULL OR "ends_at" > "starts_at"');
    });

    it('should define index idx_polls_active on (neighbourhood_id, ends_at)', () => {
      const metadata = dataSource.getMetadata(Poll);
      const idx = metadata.indices.find((i) => i.name === 'idx_polls_active');
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toContain('neighbourhood_id');
      expect(colNames).toContain('ends_at');
    });

    it('should define index idx_polls_creator on creator_id', () => {
      const metadata = dataSource.getMetadata(Poll);
      const idx = metadata.indices.find((i) => i.name === 'idx_polls_creator');
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toContain('creator_id');
    });

    it('should have two ManyToOne relations to User (creator and closedBy)', () => {
      const metadata = dataSource.getMetadata(Poll);
      const userRelations = metadata.relations.filter(
        (r) => r.type === Function && r.inverseEntityMetadata?.target === User,
      );
      // Use join columns to identify the two relations
      const creatorRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'creator_id'),
      );
      const closedByRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'closed_by'),
      );
      expect(creatorRel).toBeDefined();
      expect(creatorRel!.relationType).toBe('many-to-one');
      expect(closedByRel).toBeDefined();
      expect(closedByRel!.relationType).toBe('many-to-one');
    });
  });

  describe('PollOption entity', () => {
    it('should map to the "poll_options" table', () => {
      const metadata = dataSource.getMetadata(PollOption);
      expect(metadata.tableName).toBe('poll_options');
    });

    it('should have a UUID primary key "id"', () => {
      const metadata = dataSource.getMetadata(PollOption);
      expect(metadata.primaryColumns).toHaveLength(1);
      const pk = metadata.primaryColumns[0];
      expect(pk.databaseName).toBe('id');
      expect(pk.type).toBe('uuid');
    });

    it('should define all expected columns', () => {
      const metadata = dataSource.getMetadata(PollOption);
      const cols = metadata.columns;
      const findCol = (name: string) =>
        cols.find((c) => c.databaseName === name);

      const pollId = findCol('poll_id');
      expect(pollId).toBeDefined();
      expect(pollId!.type).toBe('uuid');
      expect(pollId!.isNullable).toBe(false);

      const label = findCol('label');
      expect(label).toBeDefined();
      expect(label!.type).toBe('varchar');
      expect(label!.isNullable).toBe(false);

      const createdAt = findCol('created_at');
      expect(createdAt).toBeDefined();
      expect(createdAt!.type).toBe('timestamptz');
    });

    it('should define index idx_poll_options_poll on poll_id', () => {
      const metadata = dataSource.getMetadata(PollOption);
      const idx = metadata.indices.find(
        (i) => i.name === 'idx_poll_options_poll',
      );
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toContain('poll_id');
    });

    it('should have a ManyToOne relation to Poll', () => {
      const metadata = dataSource.getMetadata(PollOption);
      const pollRel = metadata.relations.find((r) =>
        r.joinColumns.some((jc) => jc.databaseName === 'poll_id'),
      );
      expect(pollRel).toBeDefined();
      expect(pollRel!.relationType).toBe('many-to-one');
      expect(pollRel!.inverseEntityMetadata.target).toBe(Poll);
    });
  });

  describe('Vote entity', () => {
    it('should map to the "votes" table', () => {
      const metadata = dataSource.getMetadata(Vote);
      expect(metadata.tableName).toBe('votes');
    });

    it('should have a composite primary key (user_id, option_id)', () => {
      const metadata = dataSource.getMetadata(Vote);
      expect(metadata.primaryColumns).toHaveLength(2);
      const pkNames = metadata.primaryColumns.map((c) => c.databaseName).sort();
      expect(pkNames).toEqual(['option_id', 'user_id']);
    });

    it('should define all expected columns with correct types', () => {
      const metadata = dataSource.getMetadata(Vote);
      const cols = metadata.columns;
      const findCol = (name: string) =>
        cols.find((c) => c.databaseName === name);

      const weight = findCol('weight');
      expect(weight).toBeDefined();
      expect(weight!.type).toBe('integer');
      expect(weight!.isNullable).toBe(false);
      expect(weight!.default).toBe(1);

      const votedAt = findCol('voted_at');
      expect(votedAt).toBeDefined();
      expect(votedAt!.type).toBe('timestamptz');
      expect(votedAt!.isNullable).toBe(false);

      const updatedAt = findCol('updated_at');
      expect(updatedAt).toBeDefined();
      expect(updatedAt!.type).toBe('timestamptz');
      expect(updatedAt!.isNullable).toBe(true);
    });

    it('should define CHECK constraint chk_vote_weight', () => {
      const metadata = dataSource.getMetadata(Vote);
      const checks = metadata.checks;
      const chk = checks.find((c) => c.name === 'chk_vote_weight');
      expect(chk).toBeDefined();
      expect(chk!.expression).toContain('"weight" >= 1');
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
});
