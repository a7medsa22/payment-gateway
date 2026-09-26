import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_keys')
@Index('idx_api_keys_key_hash', ['keyHash'], { unique: true })
@Index('idx_api_keys_merchant_id', ['merchantId'])
export class ApiKeySchema {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 100 })
  merchantId!: string;

  @Column({ name: 'merchant_name', type: 'varchar', length: 255 })
  merchantName!: string;

  @Column({ name: 'key_hash', type: 'varchar', length: 128, unique: true })
  keyHash!: string;

  @Column({ name: 'key_prefix', type: 'varchar', length: 12 })
  keyPrefix!: string;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'active',
  })
  status!: 'active' | 'revoked';

  @Column({ type: 'jsonb', default: '["payments:create","payments:read","payments:refund"]' })
  scopes!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamp with time zone', nullable: true })
  revokedAt?: Date;

  @Column({ name: 'last_used_at', type: 'timestamp with time zone', nullable: true })
  lastUsedAt?: Date;
}
