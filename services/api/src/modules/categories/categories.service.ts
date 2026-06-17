import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListingCategory } from '../listings/entities/listing-category.entity';
import { EvenementsCategory } from '../events/entities/evenements-category.entity';

export type CategoryDomain = 'listings' | 'events';

type CategoryEntity = ListingCategory | EvenementsCategory;

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(ListingCategory)
    private readonly listingRepo: Repository<ListingCategory>,
    @InjectRepository(EvenementsCategory)
    private readonly eventRepo: Repository<EvenementsCategory>,
  ) {}

  private repoFor(domain: CategoryDomain): Repository<CategoryEntity> {
    return domain === 'listings' ? this.listingRepo : this.eventRepo;
  }

  // ── GET tree ────────────────────────────────────────────

  async getTree(domain: CategoryDomain): Promise<any[]> {
    const repo = this.repoFor(domain);
    const all = await repo.find({ order: { id: 'ASC' } });
    return this.buildTree(all);
  }

  private buildTree(categories: any[]): any[] {
    const map = new Map<number, any>();
    const roots: any[] = [];

    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!;
      const parentId = cat.parentCategoryId ?? null;
      if (parentId != null) {
        const parent = map.get(parentId);
        if (parent) {
          parent.children.push(node);
          continue;
        }
      }
      roots.push(node);
    }

    return roots;
  }

  // ── GET flat list ───────────────────────────────────────

  async getFlat(domain: CategoryDomain): Promise<CategoryEntity[]> {
    const repo = this.repoFor(domain);
    return repo.find({ order: { id: 'ASC' } });
  }

  // ── POST create ─────────────────────────────────────────

  async create(
    domain: CategoryDomain,
    dto: { category_name: string; parent_category?: number | null },
  ): Promise<CategoryEntity> {
    const repo = this.repoFor(domain);

    if (dto.parent_category) {
      const parent = await repo.findOne({ where: { id: dto.parent_category } as any });
      if (!parent) {
        throw new BadRequestException(
          `Catégorie parente introuvable : ${dto.parent_category}`,
        );
      }
    }

    const entity = repo.create({
      categoryName: dto.category_name,
      parentCategoryId: dto.parent_category ?? null,
    } as any);

    return repo.save(entity) as unknown as Promise<CategoryEntity>;
  }

  // ── PATCH update ────────────────────────────────────────

  async update(
    domain: CategoryDomain,
    id: number,
    dto: { category_name?: string; parent_category?: number | null },
  ): Promise<CategoryEntity> {
    const repo = this.repoFor(domain);
    const entity = await repo.findOne({ where: { id } as any });

    if (!entity) {
      throw new NotFoundException(`Catégorie ${id} introuvable`);
    }

    if (dto.category_name !== undefined) {
      (entity as any).categoryName = dto.category_name;
    }
    if (dto.parent_category !== undefined) {
      if (dto.parent_category === id) {
        throw new BadRequestException(
          'Une catégorie ne peut pas être son propre parent',
        );
      }
      if (dto.parent_category !== null) {
        const parent = await repo.findOne({
          where: { id: dto.parent_category } as any,
        });
        if (!parent) {
          throw new BadRequestException(
            `Catégorie parente introuvable : ${dto.parent_category}`,
          );
        }
      }
      (entity as any).parentCategoryId = dto.parent_category;
    }

    (entity as any).updatedAt = new Date();
    return repo.save(entity) as unknown as Promise<CategoryEntity>;
  }

  // ── DELETE (cascade manuelle, pas de relation TypeORM) ──

  async delete(domain: CategoryDomain, id: number): Promise<void> {
    const repo = this.repoFor(domain);
    const entity = await repo.findOne({ where: { id } as any });

    if (!entity) {
      throw new NotFoundException(`Catégorie ${id} introuvable`);
    }

    // Cascade : trouver et supprimer les enfants récursivement
    const children = await repo.find({
      where: { parentCategoryId: id } as any,
    });

    for (const child of children) {
      await this.delete(domain, child.id);
    }

    // Utiliser delete() au lieu de remove() pour éviter le cascade TypeORM
    await repo.delete(id);
  }
}
