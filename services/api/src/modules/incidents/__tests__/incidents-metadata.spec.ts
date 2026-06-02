import { DataSource } from 'typeorm';
import { Incident } from '../entities/incident.entity';
import { User } from '../../users/entities/user.entity';

describe('Incidents Domain — TypeORM Metadata', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [Incident, User],
      synchronize: false,
    });
    (dataSource as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  describe('Incident entity', () => {
    it('should map to the "incidents" table', () => {
      const metadata = dataSource.getMetadata(Incident);
      expect(metadata.tableName).toBe('incidents');
    });

    it('should have a UUID primary key "id"', () => {
      const metadata = dataSource.getMetadata(Incident);
      expect(metadata.primaryColumns).toHaveLength(1);
      const pk = metadata.primaryColumns[0];
      expect(pk.databaseName).toBe('id');
      expect(pk.type).toBe('uuid');
    });

    it('should define all expected columns with correct types and nullability', () => {
      const metadata = dataSource.getMetadata(Incident);
      const cols = metadata.columns;
      const findCol = (name: string) =>
        cols.find((c) => c.databaseName === name);

      const reporterId = findCol('reporter_id');
      expect(reporterId).toBeDefined();
      expect(reporterId!.type).toBe('uuid');
      expect(reporterId!.isNullable).toBe(false);

      const assignedTo = findCol('assigned_to');
      expect(assignedTo).toBeDefined();
      expect(assignedTo!.type).toBe('uuid');
      expect(assignedTo!.isNullable).toBe(true);

      const neighbourhoodId = findCol('neighbourhood_id');
      expect(neighbourhoodId).toBeDefined();
      expect(neighbourhoodId!.type).toBe('text');
      expect(neighbourhoodId!.isNullable).toBe(true);

      const mongoDocumentId = findCol('mongo_document_id');
      expect(mongoDocumentId).toBeDefined();
      expect(mongoDocumentId!.type).toBe('text');
      expect(mongoDocumentId!.isNullable).toBe(true);

      const title = findCol('title');
      expect(title).toBeDefined();
      expect(title!.type).toBe('varchar');
      expect(title!.isNullable).toBe(false);

      const description = findCol('description');
      expect(description).toBeDefined();
      expect(description!.type).toBe('text');
      expect(description!.isNullable).toBe(true);

      const severity = findCol('severity');
      expect(severity).toBeDefined();
      expect(severity!.type).toBe('enum');
      expect(severity!.enum).toContain('low');
      expect(severity!.enum).toContain('medium');
      expect(severity!.enum).toContain('high');
      expect(severity!.enum).toContain('critical');

      const status = findCol('status');
      expect(status).toBeDefined();
      expect(status!.type).toBe('enum');
      expect(status!.enum).toContain('open');
      expect(status!.enum).toContain('in_progress');
      expect(status!.enum).toContain('resolved');

      const assignedAt = findCol('assigned_at');
      expect(assignedAt).toBeDefined();
      expect(assignedAt!.type).toBe('timestamptz');
      expect(assignedAt!.isNullable).toBe(true);

      const createdAt = findCol('created_at');
      expect(createdAt).toBeDefined();
      expect(createdAt!.type).toBe('timestamptz');

      const updatedAt = findCol('updated_at');
      expect(updatedAt).toBeDefined();
      expect(updatedAt!.type).toBe('timestamptz');
      expect(updatedAt!.isNullable).toBe(true);

      const resolvedAt = findCol('resolved_at');
      expect(resolvedAt).toBeDefined();
      expect(resolvedAt!.type).toBe('timestamptz');
      expect(resolvedAt!.isNullable).toBe(true);
    });

    it('should define severity enum with enumName "incident_severity_enum"', () => {
      const metadata = dataSource.getMetadata(Incident);
      const severity = metadata.columns.find(
        (c) => c.databaseName === 'severity',
      );
      expect(severity).toBeDefined();
      expect(severity!.enumName).toBe('incident_severity_enum');
    });

    it('should define status enum with enumName "incident_status_enum"', () => {
      const metadata = dataSource.getMetadata(Incident);
      const status = metadata.columns.find((c) => c.databaseName === 'status');
      expect(status).toBeDefined();
      expect(status!.enumName).toBe('incident_status_enum');
    });

    it('should have default "medium" for severity', () => {
      const metadata = dataSource.getMetadata(Incident);
      const severity = metadata.columns.find(
        (c) => c.databaseName === 'severity',
      );
      expect(severity).toBeDefined();
      expect(severity!.default).toBe('medium');
    });

    it('should have default "open" for status', () => {
      const metadata = dataSource.getMetadata(Incident);
      const status = metadata.columns.find((c) => c.databaseName === 'status');
      expect(status).toBeDefined();
      expect(status!.default).toBe('open');
    });

    it('should define index idx_incidents_feed on (neighbourhood_id, status)', () => {
      const metadata = dataSource.getMetadata(Incident);
      const idx = metadata.indices.find((i) => i.name === 'idx_incidents_feed');
      expect(idx).toBeDefined();
      const colNames = idx!.columns.map((c) => c.databaseName);
      expect(colNames).toContain('neighbourhood_id');
      expect(colNames).toContain('status');
    });

    it('should have two ManyToOne relations to User (reporter and assignee)', () => {
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
    });
  });
});
