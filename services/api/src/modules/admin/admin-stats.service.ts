import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { ListingTransaction } from '../listings/entities/listing-transaction.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { EventParticipant } from '../events/entities/event-participant.entity';
import { IncidentStatusEnum, TransactionStatusEnum } from '../../common/enums';

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement)
    private readonly eventRepository: Repository<Evenement>,
    @InjectRepository(ListingTransaction)
    private readonly transactionRepository: Repository<ListingTransaction>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(EventParticipant)
    private readonly participantRepository: Repository<EventParticipant>,
  ) {}

  async getOverview() {
    const totalUsers = await this.userRepository.count({ withDeleted: true });
    const totalListings = await this.listingRepository.count({ withDeleted: true });
    const totalEvents = await this.eventRepository.count({ withDeleted: true });

    const activeIncidents = await this.incidentRepository.count({
      where: [
        { status: IncidentStatusEnum.OPEN },
        { status: IncidentStatusEnum.IN_PROGRESS },
      ],
    });

    const paymentSum = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.amount_cents)', 'total')
      .where('tx.status = :status', { status: TransactionStatusEnum.COMPLETED })
      .getRawOne();

    return {
      totalUsers,
      totalListings,
      totalEvents,
      activeIncidents,
      totalPaymentsCents: parseInt(paymentSum?.total || '0', 10),
    };
  }

  async getListingsStats() {
    const typeBreakdown = await this.listingRepository
      .createQueryBuilder('l')
      .select('l.listing_type', 'type')
      .addSelect('COUNT(l.id)', 'count')
      .groupBy('l.listing_type')
      .getRawMany();

    const statusBreakdown = await this.listingRepository
      .createQueryBuilder('l')
      .select('l.status', 'status')
      .addSelect('COUNT(l.id)', 'count')
      .groupBy('l.status')
      .getRawMany();

    const categoryBreakdown = await this.listingRepository
      .createQueryBuilder('l')
      .innerJoin('l.category', 'cat')
      .select('cat.category_name', 'categoryName')
      .addSelect('COUNT(l.id)', 'count')
      .groupBy('cat.category_name')
      .getRawMany();

    return {
      typeBreakdown: typeBreakdown.map(withNumericCount),
      statusBreakdown: statusBreakdown.map(withNumericCount),
      categoryBreakdown: categoryBreakdown.map(withNumericCount),
    };
  }

  async getEventsStats() {
    const statusBreakdown = await this.eventRepository
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(e.id)', 'count')
      .groupBy('e.status')
      .getRawMany();

    const categoryBreakdown = await this.eventRepository
      .createQueryBuilder('e')
      .innerJoin('e.category', 'cat')
      .select('cat.category_name', 'categoryName')
      .addSelect('COUNT(e.id)', 'count')
      .groupBy('cat.category_name')
      .getRawMany();

    const participantBreakdown = await this.participantRepository
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .getRawMany();

    return {
      statusBreakdown: statusBreakdown.map(withNumericCount),
      categoryBreakdown: categoryBreakdown.map(withNumericCount),
      participantBreakdown: participantBreakdown.map(withNumericCount),
    };
  }

  async getPaymentsStats() {
    const sums = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.amount_cents)', 'totalAmount')
      .addSelect('SUM(tx.commission_cents)', 'totalCommission')
      .where('tx.status = :status', { status: TransactionStatusEnum.COMPLETED })
      .getRawOne();

    const statusBreakdown = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('tx.status', 'status')
      .addSelect('COUNT(tx.id)', 'count')
      .groupBy('tx.status')
      .getRawMany();

    return {
      totalAmountCents: parseInt(sums?.totalAmount || '0', 10),
      totalCommissionCents: parseInt(sums?.totalCommission || '0', 10),
      statusBreakdown: statusBreakdown.map(withNumericCount),
    };
  }

  async getUsersStats() {
    const roleBreakdown = await this.userRepository
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('COUNT(u.id)', 'count')
      .withDeleted()
      .groupBy('u.role')
      .getRawMany();

    const suspendedCount = await this.userRepository.count({
      where: { isSuspended: true },
    });

    const neighbourhoodBreakdown = await this.userRepository
      .createQueryBuilder('u')
      .select('u.neighbourhoodId', 'neighbourhoodId')
      .addSelect('COUNT(u.id)', 'count')
      .where('u.neighbourhoodId IS NOT NULL')
      .groupBy('u.neighbourhoodId')
      .getRawMany();

    return {
      roleBreakdown: roleBreakdown.map(withNumericCount),
      suspendedCount,
      neighbourhoodBreakdown: neighbourhoodBreakdown.map(withNumericCount),
    };
  }

  async getIncidentsStats() {
    const statusBreakdown = await this.incidentRepository
      .createQueryBuilder('i')
      .select('i.status', 'status')
      .addSelect('COUNT(i.id)', 'count')
      .groupBy('i.status')
      .getRawMany();

    const severityBreakdown = await this.incidentRepository
      .createQueryBuilder('i')
      .select('i.severity', 'severity')
      .addSelect('COUNT(i.id)', 'count')
      .groupBy('i.severity')
      .getRawMany();

    return {
      statusBreakdown: statusBreakdown.map(withNumericCount),
      severityBreakdown: severityBreakdown.map(withNumericCount),
    };
  }
}

function withNumericCount<T extends { count: string | number }>(
  row: T,
): T & { count: number } {
  return { ...row, count: typeof row.count === 'string' ? parseInt(row.count, 10) : row.count };
}
