import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PointsLedgerEntry } from './entities/points-ledger-entry.entity';
import { PointsLedgerEntryTypeEnum } from '../../common/enums';
import { User } from '../users/entities/user.entity';

interface MutationParams {
  userId: string;
  amountPoints: number;
  type: PointsLedgerEntryTypeEnum;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
}

interface CommissionParams {
  amountPoints: number;
  type: PointsLedgerEntryTypeEnum;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
}

interface LedgerFilters {
  userId?: string;
  type?: PointsLedgerEntryTypeEnum;
  from?: Date;
  to?: Date;
  offset: number;
  limit: number;
}

@Injectable()
export class PointsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PointsLedgerEntry)
    private readonly ledgerRepository: Repository<PointsLedgerEntry>,
  ) {}

  async credit(
    params: MutationParams,
    manager?: EntityManager,
  ): Promise<PointsLedgerEntry> {
    if (params.amountPoints <= 0) {
      throw new ConflictException('Le montant crédité doit être positif');
    }
    return this.runInTx(manager, async (m) => {
      const user = await this.lockUser(m, params.userId);
      user.pointsBalance += params.amountPoints;
      await m.save(user);
      return this.insertEntry(m, {
        ...params,
        amountPoints: params.amountPoints,
        balanceAfterPoints: user.pointsBalance,
      });
    });
  }

  async debit(
    params: MutationParams,
    manager?: EntityManager,
  ): Promise<PointsLedgerEntry> {
    if (params.amountPoints <= 0) {
      throw new ConflictException('Le montant débité doit être positif');
    }
    return this.runInTx(manager, async (m) => {
      const user = await this.lockUser(m, params.userId);
      if (user.pointsBalance < params.amountPoints) {
        throw new ConflictException('Solde de points insuffisant');
      }
      user.pointsBalance -= params.amountPoints;
      await m.save(user);
      return this.insertEntry(m, {
        ...params,
        amountPoints: -params.amountPoints,
        balanceAfterPoints: user.pointsBalance,
      });
    });
  }

  // Platform-side bookkeeping entry (e.g. commission) that isn't credited to
  // any user's wallet — kept purely for ledger/audit completeness.
  async recordCommission(
    params: CommissionParams,
    manager?: EntityManager,
  ): Promise<PointsLedgerEntry> {
    if (params.amountPoints <= 0) {
      throw new ConflictException(
        'Le montant de la commission doit être positif',
      );
    }
    return this.runInTx(manager, async (m) => {
      return this.insertEntry(m, {
        userId: null,
        amountPoints: params.amountPoints,
        balanceAfterPoints: null,
        type: params.type,
        referenceType: params.referenceType ?? null,
        referenceId: params.referenceId ?? null,
        description: params.description ?? null,
      });
    });
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user.pointsBalance;
  }

  async findLedger(filters: LedgerFilters): Promise<{
    data: PointsLedgerEntry[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const qb = this.ledgerRepository
      .createQueryBuilder('ple')
      .orderBy('ple.createdAt', 'DESC')
      .skip(filters.offset)
      .take(filters.limit);

    if (filters.userId !== undefined) {
      qb.andWhere('ple.userId = :userId', { userId: filters.userId });
    }
    if (filters.type !== undefined) {
      qb.andWhere('ple.type = :type', { type: filters.type });
    }
    if (filters.from !== undefined) {
      qb.andWhere('ple.createdAt >= :from', { from: filters.from });
    }
    if (filters.to !== undefined) {
      qb.andWhere('ple.createdAt <= :to', { to: filters.to });
    }

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, offset: filters.offset, limit: filters.limit },
    };
  }

  private async lockUser(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager
      .createQueryBuilder(User, 'u')
      .setLock('pessimistic_write')
      .where('u.id = :userId', { userId })
      .getOne();
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  private async insertEntry(
    manager: EntityManager,
    entry: {
      userId: string | null;
      amountPoints: number;
      balanceAfterPoints: number | null;
      type: PointsLedgerEntryTypeEnum;
      referenceType?: string | null;
      referenceId?: string | null;
      description?: string | null;
    },
  ): Promise<PointsLedgerEntry> {
    const ledgerEntry = manager.create(PointsLedgerEntry, {
      userId: entry.userId,
      amountPoints: entry.amountPoints,
      balanceAfterPoints: entry.balanceAfterPoints,
      type: entry.type,
      referenceType: entry.referenceType ?? null,
      referenceId: entry.referenceId ?? null,
      description: entry.description ?? null,
    });
    return manager.save(ledgerEntry);
  }

  private async runInTx<T>(
    manager: EntityManager | undefined,
    work: (m: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (manager) {
      return work(manager);
    }
    return this.dataSource.transaction(work);
  }
}
