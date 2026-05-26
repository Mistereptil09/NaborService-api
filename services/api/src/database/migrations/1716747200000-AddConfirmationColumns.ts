import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfirmationColumns1716747200000 implements MigrationInterface {
  name = 'AddConfirmationColumns1716747200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "listing_transactions" ADD "provider_confirmed_at" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_transactions" ADD "requester_confirmed_at" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "listing_transactions" DROP COLUMN "requester_confirmed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_transactions" DROP COLUMN "provider_confirmed_at"`,
    );
  }
}
