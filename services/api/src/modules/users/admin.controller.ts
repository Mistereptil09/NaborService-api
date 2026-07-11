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
import {
  AdminListUsersDto,
  AdminUserDto,
  AdminUsersListDto,
  toAdminUserDto,
} from './dto/admin-user-response.dto';
import { SuccessResponseDto } from '../../common/dto/success-response.dto';

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
  @ApiOkResponse({
    description: 'Liste des utilisateurs retournée avec succès',
    type: AdminUsersListDto,
  })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getUsers(@Query() query: AdminListUsersDto): Promise<AdminUsersListDto> {
    const { data, meta } = await this.usersService.findAllAdmin({
      offset: query.offset,
      limit: query.limit,
      role: query.role,
      neighbourhoodId: query.neighbourhood_id,
      q: query.q,
    });
    return { data: data.map(toAdminUserDto), meta };
  }

  @Get('users/:user_id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consulter le profil complet de tout utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Profil utilisateur complet retourné', type: AdminUserDto })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async getUser(@Param('user_id') userId: string): Promise<AdminUserDto> {
    const user = await this.usersService.findOneAdmin(userId);
    return toAdminUserDto(user);
  }

  @Patch('users/:user_id/role')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier le rôle d\'un utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Rôle mis à jour', type: AdminUserDto })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async updateRole(
    @Param('user_id') userId: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<AdminUserDto> {
    const user = await this.usersService.updateRole(userId, dto.role);
    return toAdminUserDto(user);
  }

  @Post('users/:user_id/suspend')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspendre un utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Utilisateur suspendu', type: AdminUserDto })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async suspendUser(@Param('user_id') userId: string): Promise<AdminUserDto> {
    const user = await this.usersService.suspendUser(userId);
    return toAdminUserDto(user);
  }

  @Post('users/:user_id/restore')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurer un utilisateur suspendu (Admin)' })
  @ApiOkResponse({ description: 'Utilisateur restauré', type: AdminUserDto })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async restoreUser(@Param('user_id') userId: string): Promise<AdminUserDto> {
    const user = await this.usersService.restoreUser(userId);
    return toAdminUserDto(user);
  }

  @Delete('users/:user_id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer définitivement un utilisateur (Admin)' })
  @ApiOkResponse({
    description: 'Utilisateur soft-deleté et anonymisation déclenchée',
    type: SuccessResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async deleteUser(@Param('user_id') userId: string): Promise<SuccessResponseDto> {
    await this.usersService.adminSoftDelete(userId);
    return { success: true };
  }

  @Delete('users/:user_id/totp')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver la MFA TOTP pour un utilisateur' })
  @ApiOkResponse({ description: 'MFA désactivée avec succès', type: SuccessResponseDto })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async disableTotp(@Param('user_id') userId: string): Promise<SuccessResponseDto> {
    await this.usersService.disableTotp(userId);
    return { success: true };
  }
}
