import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeySchema } from './schemas/api-key.schema';
import { ApiKeyRepository } from './repositories/api-key.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeySchema])],
  providers: [ApiKeyRepository],
  exports: [ApiKeyRepository],
})
export class AuthInfrastructureModule {}
