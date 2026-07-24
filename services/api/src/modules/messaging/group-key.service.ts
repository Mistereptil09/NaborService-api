import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../../database/redis.module';
import { ChatGroup } from './entities/chat-group.entity';

const AES_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits
const GROUP_KEY_CACHE_TTL = 3600; // Redis cache TTL: 1 hour — PG is the source of truth

@Injectable()
export class GroupKeyService {
  constructor(
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  encrypt(
    plaintext: string,
    key: Buffer,
  ): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(
    ciphertext: string,
    iv: string,
    authTag: string,
    key: Buffer,
  ): string | null {
    try {
      const decipher = crypto.createDecipheriv(
        AES_ALGO,
        key,
        Buffer.from(iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf-8');
    } catch {
      return null; // decryption failed
    }
  }

  private encryptGroupKeyForStorage(rawKey: Buffer): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    const masterKey = Buffer.from(
      this.configService.get<string>('AES_MASTER_KEY')!,
      'hex',
    );
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(rawKey), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  private decryptStoredGroupKey(
    encryptedB64: string,
    ivB64: string,
    authTagB64: string,
  ): Buffer {
    const masterKey = Buffer.from(
      this.configService.get<string>('AES_MASTER_KEY')!,
      'hex',
    );
    const decipher = crypto.createDecipheriv(
      AES_ALGO,
      masterKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ]);
  }

  async getOrCreateGroupKey(groupId: string): Promise<Buffer> {
    const redisKey = `group_key:${groupId}`;

    const fromRedis = await this.redis.get(redisKey);
    if (fromRedis) return Buffer.from(fromRedis, 'base64');

    const fromDb = await this.getGroupKeyFromDb(groupId);
    if (fromDb) {
      await this.redis.set(
        redisKey,
        fromDb.toString('base64'),
        'EX',
        GROUP_KEY_CACHE_TTL,
      );
      return fromDb;
    }

    const newKey = crypto.randomBytes(32);
    const packed = this.encryptGroupKeyForStorage(newKey);
    await this.groupRepo.update(
      { id: groupId },
      {
        encryptedGroupKey: `${packed.iv}:${packed.authTag}:${packed.encrypted}`,
      },
    );
    await this.redis.set(
      redisKey,
      newKey.toString('base64'),
      'EX',
      GROUP_KEY_CACHE_TTL,
    );
    return newKey;
  }

  private async getGroupKeyFromDb(groupId: string): Promise<Buffer | null> {
    try {
      const group = await this.groupRepo.findOne({
        where: { id: groupId },
        select: ['encryptedGroupKey'],
      });
      if (!group?.encryptedGroupKey) return null;

      const [iv, authTag, encrypted] = group.encryptedGroupKey.split(':');
      if (!iv || !authTag || !encrypted) return null;

      return this.decryptStoredGroupKey(encrypted, iv, authTag);
    } catch {
      return null;
    }
  }

  async getGroupKey(groupId: string): Promise<Buffer | null> {
    const redisKey = `group_key:${groupId}`;

    const fromRedis = await this.redis.get(redisKey);
    if (fromRedis) return Buffer.from(fromRedis, 'base64');

    const fromDb = await this.getGroupKeyFromDb(groupId);
    if (fromDb) {
      await this.redis.set(
        redisKey,
        fromDb.toString('base64'),
        'EX',
        GROUP_KEY_CACHE_TTL,
      );
      return fromDb;
    }

    return null;
  }
}
