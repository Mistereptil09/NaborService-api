import { NotFoundException } from '@nestjs/common';
import { Neo4jGeoService } from '../neo4j-geo.service';
import { Neo4jService } from '../../../database/neo4j/neo4j.service';
import { NeighbourhoodService } from '../../../database/neo4j/neighbourhood.service';
import { ChatService } from '../../messaging/chat.service';
import { GroupRoleEnum, UserRoleEnum } from '../../../common/enums';

describe('Neo4jGeoService — neighbourhood chat group sync', () => {
  let service: Neo4jGeoService;
  let neo4jService: any;
  let neighbourhoodService: any;
  let chatService: any;
  let userRepository: any;

  const validPolygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [2.34, 48.85],
        [2.35, 48.85],
        [2.35, 48.86],
        [2.34, 48.86],
        [2.34, 48.85],
      ],
    ],
  };

  beforeEach(() => {
    neo4jService = { run: jest.fn().mockResolvedValue({ records: [] }) };
    neighbourhoodService = { findByPgId: jest.fn() };
    chatService = {
      ensureNeighbourhoodGroup: jest.fn().mockResolvedValue({ id: 'g1' }),
    };
    userRepository = { find: jest.fn().mockResolvedValue([]) };

    service = new Neo4jGeoService(
      neo4jService as Neo4jService,
      neighbourhoodService as NeighbourhoodService,
      chatService,
      userRepository,
    );
  });

  describe('createNeighbourhood', () => {
    it('should create the auto-managed group empty (no residents yet, staff not force-joined)', async () => {
      await service.createNeighbourhood(validPolygon, {
        pg_id: 'nb-test',
        name: 'Test District',
        city: 'Paris',
        zip_code: '75001',
        country: 'France',
      });

      expect(userRepository.find).not.toHaveBeenCalled();
      expect(chatService.ensureNeighbourhoodGroup).toHaveBeenCalledWith(
        'nb-test',
        'Test District',
        [],
      );
    });
  });

  describe('syncNeighbourhoodChatGroup', () => {
    it('should throw NotFoundException for an unknown pgId', async () => {
      neighbourhoodService.findByPgId.mockResolvedValue(null);
      await expect(
        service.syncNeighbourhoodChatGroup('nb-missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should map only residents by role (reps as ADMIN, others per neighbourhoodGroupRoleFor); staff not force-joined', async () => {
      neighbourhoodService.findByPgId.mockResolvedValue({
        name: 'Downtown',
      } as any);
      userRepository.find.mockResolvedValueOnce([
        { id: 'res1', role: UserRoleEnum.RESIDENT },
        { id: 'rep1', role: UserRoleEnum.NEIGHBOURHOOD_REP },
        { id: 'mod-resident', role: UserRoleEnum.MODERATOR }, // staff who also resides here
      ]);

      await service.syncNeighbourhoodChatGroup('nb1');

      expect(userRepository.find).toHaveBeenCalledTimes(1);
      expect(chatService.ensureNeighbourhoodGroup).toHaveBeenCalledWith(
        'nb1',
        'Downtown',
        [
          { userId: 'res1', role: GroupRoleEnum.WATCH },
          { userId: 'rep1', role: GroupRoleEnum.ADMIN },
          { userId: 'mod-resident', role: GroupRoleEnum.ADMIN },
        ],
      );
    });
  });
});
