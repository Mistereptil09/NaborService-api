import { DataSource } from 'typeorm';
import { User } from './user.entity';
import { UserSession } from './user-session.entity';
import { UserNotificationPreferences } from './user-notification-preferences.entity';

describe('User & Authentication entities metadata', () => {
  let dataSource: DataSource;

  beforeAll(() => {
    dataSource = new DataSource({
      type: 'postgres',
      host: 'fake',
      database: 'fake',
      entities: [User, UserSession, UserNotificationPreferences],
      synchronize: false,
    });
    (dataSource as unknown as { buildMetadatas(): void }).buildMetadatas();
  });

  describe('User entity', () => {
    it('should have table name "users"', () => {
      const metadata = dataSource.getMetadata(User);
      expect(metadata.tableName).toBe('users');
    });

    it('should have all expected columns', () => {
      const metadata = dataSource.getMetadata(User);
      const columnNames = metadata.columns.map((c) => c.databaseName);
      const expectedColumns = [
        'id',
        'first_name',
        'last_name',
        'email',
        'password_hash',
        'totp_secret',
        'stripe_account_id',
        'neighbourhood_id',
        'visibility',
        'bio',
        'message_policy',
        'locale',
        'profile_picture_mongo_id',
        'banner_mongo_id',
        'role',
        'last_login_at',
        'password_changed_at',
        'created_at',
        'updated_at',
        'deleted_at',
      ];
      for (const col of expectedColumns) {
        expect(columnNames).toContain(col);
      }
    });

    it('should have uuid primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(User);
      const idColumn = metadata.columns.find(
        (c) => c.databaseName === 'id',
      )!;
      expect(idColumn.type).toBe('uuid');
      expect(idColumn.isPrimary).toBe(true);
      expect(typeof idColumn.default).toBe('function');
      expect((idColumn.default as () => string)()).toBe('uuid_generate_v7()');
    });

    it('should have correct column types and nullability', () => {
      const metadata = dataSource.getMetadata(User);
      const findCol = (name: string) =>
        metadata.columns.find((c) => c.databaseName === name)!;

      // Non-nullable columns
      expect(findCol('first_name').isNullable).toBe(false);
      expect(findCol('last_name').isNullable).toBe(false);
      expect(findCol('email').isNullable).toBe(false);
      expect(findCol('password_hash').isNullable).toBe(false);
      expect(findCol('locale').isNullable).toBe(false);

      // Nullable columns
      expect(findCol('totp_secret').isNullable).toBe(true);
      expect(findCol('stripe_account_id').isNullable).toBe(true);
      expect(findCol('neighbourhood_id').isNullable).toBe(true);
      expect(findCol('bio').isNullable).toBe(true);
      expect(findCol('profile_picture_mongo_id').isNullable).toBe(true);
      expect(findCol('banner_mongo_id').isNullable).toBe(true);
      expect(findCol('last_login_at').isNullable).toBe(true);
      expect(findCol('password_changed_at').isNullable).toBe(true);
      expect(findCol('updated_at').isNullable).toBe(true);
      expect(findCol('deleted_at').isNullable).toBe(true);

      // Types
      expect(findCol('first_name').type).toBe('varchar');
      expect(findCol('last_name').type).toBe('varchar');
      expect(findCol('email').type).toBe('varchar');
      expect(findCol('password_hash').type).toBe('varchar');
      expect(findCol('neighbourhood_id').type).toBe('text');
      expect(findCol('bio').type).toBe('text');
      expect(findCol('locale').type).toBe('varchar');
      expect(findCol('last_login_at').type).toBe('timestamptz');
      expect(findCol('password_changed_at').type).toBe('timestamptz');
      expect(findCol('created_at').type).toBe('timestamptz');
      expect(findCol('deleted_at').type).toBe('timestamptz');
    });

    it('should have locale column with length 5 and default "fr"', () => {
      const metadata = dataSource.getMetadata(User);
      const locale = metadata.columns.find(
        (c) => c.databaseName === 'locale',
      )!;
      expect(locale.length).toBe('5');
      expect(locale.default).toBe("fr");
    });

    it('should have enum columns with correct enumName', () => {
      const metadata = dataSource.getMetadata(User);
      const findCol = (name: string) =>
        metadata.columns.find((c) => c.databaseName === name)!;

      const visibility = findCol('visibility');
      expect(visibility.type).toBe('enum');
      expect(visibility.enumName).toBe('visibility_enum');

      const messagePolicy = findCol('message_policy');
      expect(messagePolicy.type).toBe('enum');
      expect(messagePolicy.enumName).toBe('message_policy_enum');

      const role = findCol('role');
      expect(role.type).toBe('enum');
      expect(role.enumName).toBe('user_role_enum');
    });

    it('should have enum defaults matching CDC', () => {
      const metadata = dataSource.getMetadata(User);
      const findCol = (name: string) =>
        metadata.columns.find((c) => c.databaseName === name)!;

      expect(findCol('visibility').default).toBe("public");
      expect(findCol('message_policy').default).toBe("open");
      expect(findCol('role').default).toBe("resident");
    });

    it('should have unique constraints on email and stripe_account_id', () => {
      const metadata = dataSource.getMetadata(User);
      const findCol = (name: string) =>
        metadata.columns.find((c) => c.databaseName === name)!;

      const emailCol = findCol('email');
      const hasEmailUnique = (emailCol as { isUnique?: boolean }).isUnique === true ||
        metadata.uniques.some(u => u.columns.some(c => c.databaseName === 'email'));
      expect(hasEmailUnique).toBe(true);

      const stripeCol = findCol('stripe_account_id');
      const hasStripeUnique = (stripeCol as { isUnique?: boolean }).isUnique === true ||
        metadata.uniques.some(u => u.columns.some(c => c.databaseName === 'stripe_account_id'));
      expect(hasStripeUnique).toBe(true);
    });

    it('should have idx_users_neighbourhood index', () => {
      const metadata = dataSource.getMetadata(User);
      const index = metadata.indices.find(
        (i) => i.name === 'idx_users_neighbourhood',
      );
      expect(index).toBeDefined();
      const indexColumns = index!.columns.map((c) => c.databaseName);
      expect(indexColumns).toContain('neighbourhood_id');
    });

    it('should have idx_users_role index', () => {
      const metadata = dataSource.getMetadata(User);
      const index = metadata.indices.find(
        (i) => i.name === 'idx_users_role',
      );
      expect(index).toBeDefined();
      const indexColumns = index!.columns.map((c) => c.databaseName);
      expect(indexColumns).toContain('role');
    });

    it('should have idx_users_deleted_at index', () => {
      const metadata = dataSource.getMetadata(User);
      const index = metadata.indices.find(
        (i) => i.name === 'idx_users_deleted_at',
      );
      expect(index).toBeDefined();
      const indexColumns = index!.columns.map((c) => c.databaseName);
      expect(indexColumns).toContain('deleted_at');
    });

    it('should use @DeleteDateColumn for deleted_at', () => {
      const metadata = dataSource.getMetadata(User);
      const deletedAt = metadata.columns.find(
        (c) => c.databaseName === 'deleted_at',
      )!;
      expect(deletedAt.isDeleteDate).toBe(true);
    });

    it('should use @CreateDateColumn for created_at', () => {
      const metadata = dataSource.getMetadata(User);
      const createdAt = metadata.columns.find(
        (c) => c.databaseName === 'created_at',
      )!;
      expect(createdAt.isCreateDate).toBe(true);
    });

    it('should NOT have obsolete columns (isActive, isTotpEnabled)', () => {
      const metadata = dataSource.getMetadata(User);
      const columnNames = metadata.columns.map((c) => c.databaseName);
      expect(columnNames).not.toContain('is_active');
      expect(columnNames).not.toContain('isActive');
      expect(columnNames).not.toContain('is_totp_enabled');
      expect(columnNames).not.toContain('isTotpEnabled');
    });
  });

  describe('UserSession entity', () => {
    it('should have table name "user_sessions"', () => {
      const metadata = dataSource.getMetadata(UserSession);
      expect(metadata.tableName).toBe('user_sessions');
    });

    it('should have all expected columns', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const columnNames = metadata.columns.map((c) => c.databaseName);
      const expectedColumns = [
        'id',
        'user_id',
        'refresh_token_hash',
        'device_name',
        'ip_address',
        'user_agent',
        'created_at',
        'last_used_at',
        'expires_at',
        'revoked_at',
      ];
      for (const col of expectedColumns) {
        expect(columnNames).toContain(col);
      }
    });

    it('should have uuid primary key with uuid_generate_v7() default', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const idColumn = metadata.columns.find(
        (c) => c.databaseName === 'id',
      )!;
      expect(idColumn.type).toBe('uuid');
      expect(idColumn.isPrimary).toBe(true);
      expect(typeof idColumn.default).toBe('function');
      expect((idColumn.default as () => string)()).toBe('uuid_generate_v7()');
    });

    it('should have correct column types and nullability', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const findCol = (name: string) =>
        metadata.columns.find((c) => c.databaseName === name)!;

      // Non-nullable
      expect(findCol('user_id').isNullable).toBe(false);
      expect(findCol('refresh_token_hash').isNullable).toBe(false);
      expect(findCol('created_at').isNullable).toBe(false);
      expect(findCol('last_used_at').isNullable).toBe(false);
      expect(findCol('expires_at').isNullable).toBe(false);

      // Nullable
      expect(findCol('device_name').isNullable).toBe(true);
      expect(findCol('ip_address').isNullable).toBe(true);
      expect(findCol('user_agent').isNullable).toBe(true);
      expect(findCol('revoked_at').isNullable).toBe(true);

      // Types
      expect(findCol('user_id').type).toBe('uuid');
      expect(findCol('refresh_token_hash').type).toBe('varchar');
      expect(findCol('device_name').type).toBe('varchar');
      expect(findCol('ip_address').type).toBe('varchar');
      expect(findCol('user_agent').type).toBe('text');
      expect(findCol('created_at').type).toBe('timestamptz');
      expect(findCol('last_used_at').type).toBe('timestamptz');
      expect(findCol('expires_at').type).toBe('timestamptz');
      expect(findCol('revoked_at').type).toBe('timestamptz');
    });

    it('should have created_at and last_used_at with now() default', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const findCol = (name: string) =>
        metadata.columns.find((c) => c.databaseName === name)!;

      expect(typeof findCol('created_at').default).toBe('function');
      expect((findCol('created_at').default as () => string)()).toBe('now()');
      expect(typeof findCol('last_used_at').default).toBe('function');
      expect((findCol('last_used_at').default as () => string)()).toBe('now()');
    });

    it('should have CHECK constraint chk_session_expiry', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const check = metadata.checks.find(
        (c) => c.name === 'chk_session_expiry',
      );
      expect(check).toBeDefined();
      expect(check!.expression).toContain('"expires_at" > "created_at"');
    });

    it('should have unique index on refresh_token_hash', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const index = metadata.indices.find(
        (i) =>
          i.columns.some((c) => c.databaseName === 'refresh_token_hash'),
      );
      expect(index).toBeDefined();
      expect(index!.isUnique).toBe(true);
    });

    it('should have index on user_id', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const index = metadata.indices.find(
        (i) => i.columns.some((c) => c.databaseName === 'user_id'),
      );
      expect(index).toBeDefined();
    });

    it('should have index on expires_at', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const index = metadata.indices.find(
        (i) => i.columns.some((c) => c.databaseName === 'expires_at'),
      );
      expect(index).toBeDefined();
    });

    it('should have index on revoked_at', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const index = metadata.indices.find(
        (i) => i.columns.some((c) => c.databaseName === 'revoked_at'),
      );
      expect(index).toBeDefined();
    });

    it('should have ManyToOne relation to User', () => {
      const metadata = dataSource.getMetadata(UserSession);
      const relation = metadata.relations.find(
        (r) => r.propertyName === 'user',
      );
      expect(relation).toBeDefined();
      expect(relation!.relationType).toBe('many-to-one');
      expect(relation!.type).toBe(User);
    });
  });

  describe('UserNotificationPreferences entity', () => {
    it('should have table name "user_notification_preferences"', () => {
      const metadata = dataSource.getMetadata(UserNotificationPreferences);
      expect(metadata.tableName).toBe('user_notification_preferences');
    });

    it('should have user_id as primary key', () => {
      const metadata = dataSource.getMetadata(UserNotificationPreferences);
      const userIdCol = metadata.columns.find(
        (c) => c.databaseName === 'user_id',
      )!;
      expect(userIdCol.isPrimary).toBe(true);
      expect(userIdCol.type).toBe('uuid');
    });

    it('should have all expected columns', () => {
      const metadata = dataSource.getMetadata(UserNotificationPreferences);
      const columnNames = metadata.columns.map((c) => c.databaseName);
      const expectedColumns = [
        'user_id',
        'notif_new_follower',
        'notif_new_listing',
        'notif_new_event',
        'notif_new_poll',
        'notif_waitlist',
        'notif_message',
        'updated_at',
      ];
      for (const col of expectedColumns) {
        expect(columnNames).toContain(col);
      }
    });

    it('should have all boolean preference columns as NOT NULL with default true', () => {
      const metadata = dataSource.getMetadata(UserNotificationPreferences);
      const findCol = (name: string) =>
        metadata.columns.find((c) => c.databaseName === name)!;

      const booleanColumns = [
        'notif_new_follower',
        'notif_new_listing',
        'notif_new_event',
        'notif_new_poll',
        'notif_waitlist',
        'notif_message',
      ];

      for (const colName of booleanColumns) {
        const col = findCol(colName);
        expect(col.type).toBe('boolean');
        expect(col.isNullable).toBe(false);
        expect(col.default).toBe(true);
      }
    });

    it('should have updated_at as nullable timestamptz', () => {
      const metadata = dataSource.getMetadata(UserNotificationPreferences);
      const updatedAt = metadata.columns.find(
        (c) => c.databaseName === 'updated_at',
      )!;
      expect(updatedAt.type).toBe('timestamptz');
      expect(updatedAt.isNullable).toBe(true);
    });

    it('should have OneToOne relation to User', () => {
      const metadata = dataSource.getMetadata(UserNotificationPreferences);
      const relation = metadata.relations.find(
        (r) => r.propertyName === 'user',
      );
      expect(relation).toBeDefined();
      expect(relation!.relationType).toBe('one-to-one');
      expect(relation!.type).toBe(User);
    });
  });
});
