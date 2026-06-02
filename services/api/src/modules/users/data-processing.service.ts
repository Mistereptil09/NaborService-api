import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { UserDataProcessing } from './entities/user-data-processing.entity';
import { PROCESSING_TYPES, ProcessingType } from './data-processing.constants';

@Injectable()
export class DataProcessingService {
  private readonly logger = new Logger(DataProcessingService.name);

  constructor(
    @InjectRepository(UserDataProcessing)
    private readonly repo: Repository<UserDataProcessing>,
  ) {}

  async isOptedOut(userId: string, processingType: string): Promise<boolean> {
    if (!PROCESSING_TYPES.includes(processingType as ProcessingType)) {
      this.logger.warn(
        `Invalid processing type checked: ${processingType} for user ${userId}`,
      );
      return false;
    }

    try {
      const record = await this.repo.findOne({ where: { userId } });
      if (!record) {
        this.logger.warn(`user_data_processing row missing for user ${userId}`);
        return false;
      }

      return record.isRestricted || record.optOuts.includes(processingType);
    } catch (error) {
      this.logger.error(
        `Error checking opt-out status for user ${userId}:`,
        error,
      );
      return false;
    }
  }

  async getEffectiveOptOuts(userId: string): Promise<string[]> {
    try {
      const record = await this.repo.findOne({ where: { userId } });
      if (!record) {
        this.logger.warn(`user_data_processing row missing for user ${userId}`);
        return [];
      }

      if (record.isRestricted) {
        return [...PROCESSING_TYPES];
      }

      return record.optOuts;
    } catch (error) {
      this.logger.error(
        `Error getting effective opt-outs for user ${userId}:`,
        error,
      );
      return [];
    }
  }

  async setOptOuts(userId: string, optOuts: string[]): Promise<void> {
    const validOptOuts = optOuts.filter((o) =>
      PROCESSING_TYPES.includes(o as ProcessingType),
    );
    await this.repo.update(
      { userId },
      {
        optOuts: validOptOuts,
        updatedAt: new Date(),
      },
    );
  }

  async setRestricted(userId: string, restricted: boolean): Promise<void> {
    const now = new Date();
    await this.repo.update(
      { userId },
      {
        isRestricted: restricted,
        restrictedAt: restricted ? now : null,
        updatedAt: now,
      },
    );
  }

  async createDefault(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserDataProcessing> {
    const repo = manager
      ? manager.getRepository(UserDataProcessing)
      : this.repo;
    const record = repo.create({
      userId,
      optOuts: [],
      isRestricted: false,
    });
    return repo.save(record);
  }
}
