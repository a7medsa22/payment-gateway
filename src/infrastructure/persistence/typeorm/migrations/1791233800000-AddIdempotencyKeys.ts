import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeys1791233800000 implements MigrationInterface {
  name = 'AddIdempotencyKeys1791233800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "idempotency_key" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_merchant_idempotency" ON "payments" ("merchant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "idempotency_key" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_transactions_payment_idempotency" ON "transactions" ("payment_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."uq_transactions_payment_idempotency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "idempotency_key"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."uq_payments_merchant_idempotency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "idempotency_key"`,
    );
  }
}
