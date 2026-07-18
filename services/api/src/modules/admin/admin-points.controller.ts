import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PointsLedgerEntry } from '../points/entities/points-ledger-entry.entity';
import { AdminListLedgerDto } from './dto/admin-ledger-query.dto';

@ApiTags('Admin')
@Controller('admin/points')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminPointsController {
  constructor(
    @InjectRepository(PointsLedgerEntry)
    private readonly ledgerRepository: Repository<PointsLedgerEntry>,
  ) {}

  @Get('ledger')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Consulter l'intégralité du grand livre de points, tous utilisateurs confondus (Admin)",
  })
  @ApiOkResponse({ description: 'Historique de points retourné' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getLedger(@Query() query: AdminListLedgerDto) {
    const qb = this.ledgerRepository
      .createQueryBuilder('ple')
      .orderBy('ple.createdAt', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    if (query.userId !== undefined) {
      qb.andWhere('ple.userId = :userId', { userId: query.userId });
    }
    if (query.type !== undefined) {
      qb.andWhere('ple.type = :type', { type: query.type });
    }
    if (query.from !== undefined) {
      qb.andWhere('ple.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to !== undefined) {
      qb.andWhere('ple.createdAt <= :to', { to: new Date(query.to) });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, offset: query.offset, limit: query.limit } };
  }
}
