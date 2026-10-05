import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1791233704452 implements MigrationInterface {
    name = 'InitialSchema1791233704452'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL, "payment_id" uuid NOT NULL, "type" character varying(30) NOT NULL, "status" character varying(30) NOT NULL, "amount" numeric(12,4) NOT NULL, "currency" character varying(3) NOT NULL, "provider" character varying(30) NOT NULL, "provider_transaction_id" character varying(255), "description" character varying(500), "metadata" jsonb, "processed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_transactions_provider_tx_id" ON "transactions" ("provider_transaction_id") `);
        await queryRunner.query(`CREATE INDEX "idx_transactions_payment_id" ON "transactions" ("payment_id") `);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL, "merchant_id" character varying(100) NOT NULL, "user_id" character varying(255) NOT NULL, "amount" numeric(12,4) NOT NULL, "currency" character varying(3) NOT NULL, "status" character varying(30) NOT NULL, "provider" character varying(30) NOT NULL, "provider_payment_id" character varying(255), "payment_method_type" character varying(50), "description" character varying(500), "error_code" character varying(100), "failure_reason" character varying(100), "succeeded_at" TIMESTAMP WITH TIME ZONE, "failed_at" TIMESTAMP WITH TIME ZONE, "refunded_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "expired_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_payments_merchant_id" ON "payments" ("merchant_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_payments_provider_payment_id" ON "payments" ("provider_payment_id") WHERE "provider_payment_id" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "idx_payments_status" ON "payments" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_payments_user_id" ON "payments" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "webhook_events" ("id" uuid NOT NULL, "event_id" character varying(255) NOT NULL, "provider" character varying(50) NOT NULL, "event_type" character varying(100) NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'RECEIVED', "attempts" integer NOT NULL DEFAULT '0', "last_error" character varying(1000), "payload" jsonb, "processed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_webhook_events_provider_event_id" ON "webhook_events" ("provider", "event_id") `);
        await queryRunner.query(`CREATE TABLE "api_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "merchant_id" character varying(100) NOT NULL, "merchant_name" character varying(255) NOT NULL, "key_hash" character varying(128) NOT NULL, "key_prefix" character varying(12) NOT NULL, "status" character varying(10) NOT NULL DEFAULT 'active', "scopes" jsonb NOT NULL DEFAULT '["payments:create","payments:read","payments:refund"]', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "revoked_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_57384430aa1959f4578046c9b81" UNIQUE ("key_hash"), CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_api_keys_merchant_id" ON "api_keys" ("merchant_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_api_keys_key_hash" ON "api_keys" ("key_hash") `);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_464da95dc8a05470b2b158d4df6" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_464da95dc8a05470b2b158d4df6"`);
        await queryRunner.query(`DROP INDEX "public"."idx_api_keys_key_hash"`);
        await queryRunner.query(`DROP INDEX "public"."idx_api_keys_merchant_id"`);
        await queryRunner.query(`DROP TABLE "api_keys"`);
        await queryRunner.query(`DROP INDEX "public"."idx_webhook_events_provider_event_id"`);
        await queryRunner.query(`DROP TABLE "webhook_events"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payments_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payments_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payments_provider_payment_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payments_merchant_id"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP INDEX "public"."idx_transactions_payment_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_transactions_provider_tx_id"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
    }

}
