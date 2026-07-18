import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NeighbourhoodController } from '../neighbourhood.controller';
import { NeighbourhoodService } from '../../../database/neo4j/neighbourhood.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';

describe('NeighbourhoodController', () => {
  let controller: NeighbourhoodController;
  let nbService: any;

  beforeEach(async () => {
    nbService = {
      findAll: jest.fn(),
      findNearby: jest.fn(),
      findByPgId: jest.fn(),
      findMembers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NeighbourhoodController],
      providers: [
        { provide: NeighbourhoodService, useValue: nbService },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(NeighbourhoodController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /neighbourhoods', () => {
    it('should return all neighbourhoods', async () => {
      nbService.findAll.mockResolvedValue([
        {
          pgId: 'nb-1',
          name: 'Marais',
          city: 'Paris',
          zipCode: '75003',
          country: 'FR',
        },
        {
          pgId: 'nb-2',
          name: 'Montmartre',
          city: 'Paris',
          zipCode: '75018',
          country: 'FR',
        },
      ]);

      const result = await controller.listAll();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Marais');
    });

    it('should return empty array', async () => {
      nbService.findAll.mockResolvedValue([]);
      expect(await controller.listAll()).toEqual([]);
    });
  });

  describe('GET /neighbourhoods/nearby', () => {
    it('should return nearby neighbourhoods', async () => {
      nbService.findNearby.mockResolvedValue([
        { pgId: 'nb-1', name: 'Marais', city: 'Paris', distanceMeters: 500 },
      ]);

      const result = await controller.nearby({
        lat: 48.86,
        lng: 2.35,
        radius: 2000,
      });
      expect(result).toHaveLength(1);
      expect(nbService.findNearby).toHaveBeenCalledWith(48.86, 2.35, 2000);
    });

    it('should default radius to 2000', async () => {
      nbService.findNearby.mockResolvedValue([]);
      await controller.nearby({ lat: 48.86, lng: 2.35 });
      expect(nbService.findNearby).toHaveBeenCalledWith(48.86, 2.35, 2000);
    });
  });

  describe('GET /neighbourhoods/:id', () => {
    it('should return neighbourhood detail', async () => {
      nbService.findByPgId.mockResolvedValue({
        pgId: 'nb-1',
        name: 'Marais',
        city: 'Paris',
        zipCode: '75003',
        country: 'FR',
        centroid: { latitude: 48.86, longitude: 2.36 },
        geometry:
          '{"type":"Polygon","coordinates":[[[2.35,48.85],[2.37,48.85],[2.37,48.87],[2.35,48.87],[2.35,48.85]]]}',
        areaM2: 500000,
        adjacentIds: ['nb-2'],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await controller.getDetail('nb-1');
      expect(result.name).toBe('Marais');
      expect(result.adjacentIds).toEqual(['nb-2']);
    });

    it('should throw 404 if not found', async () => {
      nbService.findByPgId.mockResolvedValue(null);
      await expect(controller.getDetail('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GET /neighbourhoods/:id/members', () => {
    it('should return members', async () => {
      nbService.findByPgId.mockResolvedValue({ adjacentIds: [] } as any);
      nbService.findMembers.mockResolvedValue([
        { pgId: 'user-1', visibility: 'public' },
        { pgId: 'user-2', visibility: 'friends' },
      ]);

      const result = await controller.getMembers('nb-1');
      expect(result).toHaveLength(2);
    });

    it('should throw 404 if neighbourhood not found', async () => {
      nbService.findByPgId.mockResolvedValue(null);
      await expect(controller.getMembers('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GET /neighbourhoods/:id/adjacent', () => {
    it('should return adjacent neighbourhood details', async () => {
      nbService.findByPgId
        .mockResolvedValueOnce({ adjacentIds: ['nb-2', 'nb-3'] } as any)
        .mockResolvedValueOnce({
          pgId: 'nb-2',
          name: 'Montmartre',
          city: 'Paris',
          zipCode: '75018',
          country: 'FR',
        } as any)
        .mockResolvedValueOnce({
          pgId: 'nb-3',
          name: 'Belleville',
          city: 'Paris',
          zipCode: '75020',
          country: 'FR',
        } as any);

      const result = await controller.getAdjacent('nb-1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Montmartre');
      expect(result[1].name).toBe('Belleville');
    });

    it('should return empty array if no adjacencies', async () => {
      nbService.findByPgId.mockResolvedValue({ adjacentIds: [] } as any);
      expect(await controller.getAdjacent('nb-1')).toEqual([]);
    });

    it('should throw 404 if neighbourhood not found', async () => {
      nbService.findByPgId.mockResolvedValue(null);
      await expect(controller.getAdjacent('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
