import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformConfig } from './entities/platform-config.entity';
import { UpdateConfigDto } from './dto/update-config.dto';

@Injectable()
export class AdminConfigService {
  constructor(
    @InjectRepository(PlatformConfig)
    private readonly configRepository: Repository<PlatformConfig>,
  ) {}

  async getConfig(): Promise<PlatformConfig> {
    let config = await this.configRepository.findOne({ where: { id: 1 } });
    if (!config) {
      config = this.configRepository.create({
        id: 1,
        commissionPercent: 5,
        refundDeadlineHours: 48,
        contractExpirationHours: 24,
        waitlistConfirmHours: 24,
      });
      await this.configRepository.save(config);
    }
    return config;
  }

  async updateConfig(dto: UpdateConfigDto): Promise<PlatformConfig> {
    const config = await this.getConfig();
    if (dto.commissionPercent !== undefined) {
      config.commissionPercent = dto.commissionPercent;
    }
    if (dto.refundDeadlineHours !== undefined) {
      config.refundDeadlineHours = dto.refundDeadlineHours;
    }
    if (dto.contractExpirationHours !== undefined) {
      config.contractExpirationHours = dto.contractExpirationHours;
    }
    if (dto.waitlistConfirmHours !== undefined) {
      config.waitlistConfirmHours = dto.waitlistConfirmHours;
    }
    return this.configRepository.save(config);
  }
}
