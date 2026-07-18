import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriesController } from '../categories.controller';
import { CategoriesService } from '../categories.service';
import { ListingCategory } from '../../listings/entities/listing-category.entity';
import { EvenementsCategory } from '../../events/entities/evenements-category.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: CategoriesService;
  let listingRepo: jest.Mocked<Repository<ListingCategory>>;
  let eventRepo: jest.Mocked<Repository<EvenementsCategory>>;

  const mockRepo = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(ListingCategory),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(EvenementsCategory),
          useValue: mockRepo(),
        },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CategoriesController);
    service = module.get(CategoriesService);
    listingRepo = module.get(getRepositoryToken(ListingCategory));
    eventRepo = module.get(getRepositoryToken(EvenementsCategory));
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── GET tree ──────────────────────────────────────────

  describe('GET /categories/listings', () => {
    it('should return tree for listings', async () => {
      const root = {
        id: 1,
        categoryName: 'Root',
        parentCategoryId: null,
        createdAt: new Date(),
        updatedAt: null,
        children: [],
      };
      const child = {
        id: 2,
        categoryName: 'Child',
        parentCategoryId: 1,
        createdAt: new Date(),
        updatedAt: null,
      };

      listingRepo.find.mockResolvedValue([root as any, child as any]);

      const result = await controller.getListingCategories();
      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('Root');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].categoryName).toBe('Child');
    });

    it('should return empty array when no categories', async () => {
      listingRepo.find.mockResolvedValue([]);
      const result = await controller.getListingCategories();
      expect(result).toEqual([]);
    });
  });

  describe('GET /categories/events', () => {
    it('should return tree for events', async () => {
      eventRepo.find.mockResolvedValue([
        {
          id: 1,
          categoryName: 'Sports',
          parentCategoryId: null,
          createdAt: new Date(),
          updatedAt: null,
        } as any,
      ]);
      const result = await controller.getEventCategories();
      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('Sports');
    });
  });

  // ── POST (admin) ─────────────────────────────────────

  describe('POST /categories/listings', () => {
    it('should create a root category', async () => {
      const dto = { category_name: 'Jardinage' };
      listingRepo.create.mockReturnValue({
        categoryName: 'Jardinage',
        parentCategoryId: null,
      } as any);
      listingRepo.save.mockResolvedValue({
        id: 1,
        categoryName: 'Jardinage',
        parentCategoryId: null,
      } as any);

      const result = await controller.createListingCategory(dto);
      expect(result.categoryName).toBe('Jardinage');
      expect(listingRepo.save).toHaveBeenCalled();
    });

    it('should create a child category', async () => {
      const parent = { id: 1 } as ListingCategory;
      listingRepo.findOne.mockResolvedValue(parent);
      listingRepo.create.mockReturnValue({
        categoryName: 'Sous-cat',
        parentCategoryId: 1,
      } as any);
      listingRepo.save.mockResolvedValue({
        id: 2,
        categoryName: 'Sous-cat',
        parentCategoryId: 1,
      } as any);

      const result = await controller.createListingCategory({
        category_name: 'Sous-cat',
        parent_category: 1,
      });
      expect(result.parentCategoryId).toBe(1);
    });

    it('should throw 400 if parent not found', async () => {
      listingRepo.findOne.mockResolvedValue(null);
      await expect(
        controller.createListingCategory({
          category_name: 'Orphan',
          parent_category: 999,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /categories/events', () => {
    it('should create an event category', async () => {
      const dto = { category_name: 'Conférence' };
      eventRepo.create.mockReturnValue({ categoryName: 'Conférence' } as any);
      eventRepo.save.mockResolvedValue({
        id: 1,
        categoryName: 'Conférence',
      } as any);

      const result = await controller.createEventCategory(dto);
      expect(result.categoryName).toBe('Conférence');
    });
  });

  // ── PATCH (admin) ────────────────────────────────────

  describe('PATCH /categories/listings/:id', () => {
    it('should update category name', async () => {
      const existing = {
        id: 1,
        categoryName: 'Old',
        parentCategoryId: null,
        updatedAt: null,
      } as ListingCategory;
      listingRepo.findOne.mockResolvedValue(existing);
      listingRepo.save.mockResolvedValue({
        ...existing,
        categoryName: 'New',
      });

      const result = await controller.updateListingCategory(1, {
        category_name: 'New',
      });
      expect(result.categoryName).toBe('New');
    });

    it('should throw 404 if category not found', async () => {
      listingRepo.findOne.mockResolvedValue(null);
      await expect(
        controller.updateListingCategory(999, { category_name: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 on self-reference', async () => {
      listingRepo.findOne.mockResolvedValue({ id: 1 } as any);
      await expect(
        controller.updateListingCategory(1, { parent_category: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── DELETE (admin, cascade) ──────────────────────────

  describe('DELETE /categories/listings/:id', () => {
    it('should delete category and children', async () => {
      const parent = { id: 1, categoryName: 'Parent' } as ListingCategory;
      const child = {
        id: 2,
        categoryName: 'Child',
        parentCategoryId: 1,
      } as unknown as ListingCategory;
      listingRepo.findOne
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(child)
        .mockResolvedValueOnce(null) // no children of child
        .mockResolvedValueOnce(null); // no more children of parent

      listingRepo.find.mockResolvedValueOnce([child]).mockResolvedValueOnce([]);

      await controller.deleteListingCategory(1);
      expect(listingRepo.delete).toHaveBeenCalledTimes(2); // child then parent
    });

    it('should throw 404 if category not found', async () => {
      listingRepo.findOne.mockResolvedValue(null);
      await expect(controller.deleteListingCategory(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('DELETE /categories/events/:id', () => {
    it('should delete event category', async () => {
      eventRepo.findOne.mockResolvedValue({ id: 1 } as any);
      eventRepo.find.mockResolvedValue([]);
      await controller.deleteEventCategory(1);
      expect(eventRepo.delete).toHaveBeenCalled();
    });
  });
});
