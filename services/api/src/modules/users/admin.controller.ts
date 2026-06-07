import {
  Controller,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { UserRoleEnum } from '../../common/enums';
import { PaginationDto } from './dto/user-routes.dtos';

export class UpdateRoleDto {
  @ApiProperty({ enum: UserRoleEnum, example: UserRoleEnum.MODERATOR })
  @IsEnum(UserRoleEnum)
  role!: UserRoleEnum;
}

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les utilisateurs (Admin)' })
  @ApiOkResponse({ description: 'Liste des utilisateurs retournée avec succès' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getUsers(
    @Query() pagination: PaginationDto,
    @Query('role') role?: UserRoleEnum,
    @Query('neighbourhood_id') neighbourhoodId?: string,
    @Query('q') q?: string,
  ) {
    return this.usersService.findAllAdmin({
      offset: pagination.offset,
      limit: pagination.limit,
      role,
      neighbourhoodId,
      q,
    });
  }

  @Get('users/:user_id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consulter le profil complet de tout utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Profil utilisateur complet retourné' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async getUser(@Param('user_id') userId: string) {
    return this.usersService.findOneAdmin(userId);
  }

  @Patch('users/:user_id/role')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier le rôle d\'un utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Rôle mis à jour' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async updateRole(
    @Param('user_id') userId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.usersService.updateRole(userId, dto.role);
  }

  @Post('users/:user_id/suspend')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspendre un utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Utilisateur suspendu' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async suspendUser(@Param('user_id') userId: string) {
    return this.usersService.suspendUser(userId);
  }

  @Post('users/:user_id/restore')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurer un utilisateur suspendu (Admin)' })
  @ApiOkResponse({ description: 'Utilisateur restauré' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async restoreUser(@Param('user_id') userId: string) {
    return this.usersService.restoreUser(userId);
  }

  @Delete('users/:user_id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer définitivement un utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Utilisateur soft-deleté et anonymisation déclenchée' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async deleteUser(@Param('user_id') userId: string) {
    await this.usersService.adminSoftDelete(userId);
    return { success: true };
  }

  @Delete('users/:user_id/totp')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver la MFA TOTP pour un utilisateur' })
  @ApiOkResponse({ description: 'MFA désactivée avec succès' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async disableTotp(@Param('user_id') userId: string) {
    await this.usersService.disableTotp(userId);
    return { success: true };
  }
}
