import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { PaymentSchema } from './schemas/payment.schema';
import { TransactionSchema } from './schemas/transaction.schema';
import { WebhookEventSchema } from './schemas/webhook-event.schema';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'payment_service',
  entities: [PaymentSchema, TransactionSchema, WebhookEventSchema],
  migrations: ['src/infrastructure/persistence/typeorm/migrations/*.ts'],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
});
