import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ListingReport } from './entities/listing-report.entity';
import { Listing } from './entities/listing.entity';
import { ListListingsDto } from './dto/listing-routes.dtos';

@Injectable()
export class ListingReportService {
  constructor(
    @InjectRepository(ListingReport)
    private readonly reportRepository: Repository<ListingReport>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
  ) {}

  async createReport(
    reporterId: string,
    listingId: string,
    reason: string,
  ): Promise<ListingReport> {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Le motif du signalement est obligatoire');
    }

    const listing = await this.listingRepository.findOne({
      where: { id: listingId, deletedAt: IsNull() },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }

    const report = this.reportRepository.create({
      reporterId,
      listingId,
      reason,
      createdAt: new Date(),
    });

    return this.reportRepository.save(report);
  }

  async getReportedListings(
    dto: ListListingsDto,
  ): Promise<{ data: any[]; total: number }> {
    // We want to fetch listings having at least one unresolved report (resolved_at IS NULL).
    // Sorted by unresolved report count descending.
    const rawData = await this.listingRepository.manager.query(
      `SELECT 
        l.id as "id",
        l.title as "title",
        l.listing_type as "listing_type",
        l.price_cents as "price_cents",
        l.status as "status",
        l.neighbourhood_id as "neighbourhood_id",
        l.category_id as "category_id",
        l.creator_id as "creator_id",
        l.created_at as "created_at",
        COUNT(r.id)::int as "reports_count",
        (SELECT reason FROM listing_reports WHERE listing_id = l.id AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1) as "last_reason",
        MAX(r.created_at) as "last_report_at"
       FROM listings l
       INNER JOIN listing_reports r ON r.listing_id = l.id
       WHERE r.resolved_at IS NULL AND l.deleted_at IS NULL
       GROUP BY l.id
       ORDER BY "reports_count" DESC, "last_report_at" DESC
       LIMIT $1 OFFSET $2`,
      [dto.limit, dto.offset],
    );

    const totalRes = await this.listingRepository.manager.query(
      `SELECT COUNT(DISTINCT l.id)::int as count
       FROM listings l
       INNER JOIN listing_reports r ON r.listing_id = l.id
       WHERE r.resolved_at IS NULL AND l.deleted_at IS NULL`,
    );

    const total = totalRes[0]?.count || 0;

    return {
      data: rawData.map((row: any) => ({
        id: row.id,
        title: row.title,
        listing_type: row.listing_type,
        price_cents: row.price_cents,
        status: row.status,
        neighbourhood_id: row.neighbourhood_id,
        category_id: row.category_id,
        creator_id: row.creator_id,
        created_at: new Date(row.created_at),
        reports_count: row.reports_count,
        last_reason: row.last_reason,
        last_report_at: row.last_report_at
          ? new Date(row.last_report_at)
          : null,
      })),
      total,
    };
  }
}
