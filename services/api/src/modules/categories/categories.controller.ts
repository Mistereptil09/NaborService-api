import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CategoriesService, CategoryDomain } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ── GET /categories/listings (public) ──────────────────

  @Get('listings')
  @ApiOperation({ summary: "Arbre des catégories d'annonces" })
  @ApiOkResponse({ description: 'Catégories listings retournées' })
  async getListingCategories() {
    return this.categoriesService.getTree('listings');
  }

  // ── GET /categories/events (public) ────────────────────

  @Get('events')
  @ApiOperation({ summary: "Arbre des catégories d'événements" })
  @ApiOkResponse({ description: 'Catégories événements retournées' })
  async getEventCategories() {
    return this.categoriesService.getTree('events');
  }

  // ── POST /categories/listings (admin) ──────────────────

  @Post('listings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Créer une catégorie d'annonce" })
  @ApiCreatedResponse({ description: 'Catégorie créée' })
  @ApiBadRequestResponse({
    description: 'Données invalides ou parent introuvable',
  })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  async createListingCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create('listings', dto);
  }

  // ── POST /categories/events (admin) ────────────────────

  @Post('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Créer une catégorie d'événement" })
  @ApiCreatedResponse({ description: 'Catégorie créée' })
  @ApiBadRequestResponse({
    description: 'Données invalides ou parent introuvable',
  })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  async createEventCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create('events', dto);
  }

  // ── PATCH /categories/listings/:id (admin) ─────────────

  @Patch('listings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Modifier une catégorie d'annonce" })
  @ApiOkResponse({ description: 'Catégorie mise à jour' })
  @ApiNotFoundResponse({ description: 'Catégorie introuvable' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  async updateListingCategory(
    @Param('id') id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update('listings', id, dto);
  }

  // ── PATCH /categories/events/:id (admin) ───────────────

  @Patch('events/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Modifier une catégorie d'événement" })
  @ApiOkResponse({ description: 'Catégorie mise à jour' })
  @ApiNotFoundResponse({ description: 'Catégorie introuvable' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  async updateEventCategory(
    @Param('id') id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update('events', id, dto);
  }

  // ── DELETE /categories/listings/:id (admin) ────────────

  @Delete('listings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Supprimer une catégorie d'annonce (cascade)" })
  @ApiOkResponse({ description: 'Catégorie et sous-catégories supprimées' })
  @ApiNotFoundResponse({ description: 'Catégorie introuvable' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  async deleteListingCategory(@Param('id') id: number) {
    await this.categoriesService.delete('listings', id);
    return { success: true };
  }

  // ── DELETE /categories/events/:id (admin) ──────────────

  @Delete('events/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Supprimer une catégorie d'événement (cascade)" })
  @ApiOkResponse({ description: 'Catégorie et sous-catégories supprimées' })
  @ApiNotFoundResponse({ description: 'Catégorie introuvable' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  async deleteEventCategory(@Param('id') id: number) {
    await this.categoriesService.delete('events', id);
    return { success: true };
  }
}
