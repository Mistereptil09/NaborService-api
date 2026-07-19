import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PointsService } from '../points/points.service';
import { PointsLedgerEntry } from '../points/entities/points-ledger-entry.entity';
import { PointsLedgerEntryTypeEnum } from '../../common/enums';
import { AdminListLedgerDto } from './dto/admin-ledger-query.dto';
import { AdminAdjustPointsDto } from './dto/admin-adjust-points.dto';

@ApiTags('Admin')
@Controller('admin/points')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminPointsController {
  constructor(
    @InjectRepository(PointsLedgerEntry)
    private readonly ledgerRepository: Repository<PointsLedgerEntry>,
    private readonly pointsService: PointsService,
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

  @Post('adjust')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Ajuster manuellement le solde de points d'un utilisateur (Admin)",
  })
  @ApiOkResponse({ description: 'Solde ajusté et entrée de grand livre créée' })
  @ApiConflictResponse({
    description: "Montant nul ou solde utilisateur deviendrait négatif",
  })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async adjustPoints(@Body() dto: AdminAdjustPointsDto) {
    if (dto.amountPoints === 0) {
      return { success: false, reason: 'amount_cannot_be_zero' };
    }

    const result = await this.pointsService.adminAdjust({
      userId: dto.userId,
      amountPoints: dto.amountPoints,
      type: PointsLedgerEntryTypeEnum.ADMIN_ADJUSTMENT,
      description: dto.description ?? null,
    });

    return {
      success: true,
      userId: dto.userId,
      amountPoints: dto.amountPoints,
      balanceAfterPoints: result.balanceAfterPoints,
      entryId: result.entry.id,
    };
  }
}
