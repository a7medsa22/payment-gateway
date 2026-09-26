import { DataSource } from 'typeorm';
import { ApiKeySchema } from '../schemas/api-key.schema';
import { createHash, randomBytes } from 'crypto';

async function seedMerchant() {
  const merchantId = process.argv[2] || 'merchant_store_a';
  const merchantName = process.argv[3] || 'Store A';

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'payment_gateway',
    entities: [ApiKeySchema],
    synchronize: false,
  });

  await dataSource.initialize();

  const rawKey = `sk_live_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 12);

  const repo = dataSource.getRepository(ApiKeySchema);
  await repo.save({
    merchantId,
    merchantName,
    keyHash,
    keyPrefix,
    status: 'active',
    scopes: ['payments:create', 'payments:read', 'payments:refund'],
  });

  console.log('='.repeat(60));
  console.log('Merchant created successfully!');
  console.log(`  Merchant ID:   ${merchantId}`);
  console.log(`  Merchant Name: ${merchantName}`);
  console.log(`  Secret Key:    ${rawKey}`);
  console.log('');
  console.log('⚠️  Save this key — it cannot be retrieved again.');
  console.log('='.repeat(60));

  await dataSource.destroy();
}

seedMerchant().catch(console.error);
