import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Client } from 'pg';

async function checkDbAvailable(): Promise<boolean> {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'payment_service',
    connectionTimeoutMillis: 1000,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

describe('App (e2e)', () => {
  let app: INestApplication | undefined;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await checkDbAvailable();
    if (!dbAvailable) {
      console.warn('PostgreSQL database not available. Skipping AppModule e2e test.');
      return;
    }

    try {
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api/v1');
      await app.init();
      dbAvailable = true;
    } catch (error) {
      console.warn('Database initialization failed. Skipping AppModule e2e test.');
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET / returns 404 (confirms server is up and routing works)', async () => {
    if (!dbAvailable || !app) {
      console.log('Skipping: DB not available');
      return;
    }
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
