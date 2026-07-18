import { IncidentsService } from '../incidents.service';
import {
  IncidentStatusEnum,
  IncidentSeverityEnum,
} from '../../../common/enums';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let incidentRepo: any;
  let userRepo: any;
  let notificationsService: any;

  beforeEach(() => {
    incidentRepo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    userRepo = {
      findOne: jest.fn(),
    };
    notificationsService = {
      create: jest.fn(),
    };

    service = new IncidentsService(
      incidentRepo,
      userRepo,
      notificationsService,
    );
  });

  describe('findAll', () => {
    it('returns a { data, meta: { total, offset, limit } } envelope — not a flat shape', async () => {
      const rows = [{ id: 'inc-1' }, { id: 'inc-2' }];
      incidentRepo.findAndCount.mockResolvedValue([rows, 2]);
      userRepo.findOne.mockResolvedValue({ neighbourhoodId: 'nb-downtown' });

      const result = await service.findAll('user-1', {
        offset: 0,
        limit: 20,
      });

      expect(result).toEqual({
        data: rows,
        meta: { total: 2, offset: 0, limit: 20 },
      });
      // Regression guard: this shape must match the pagination envelope used
      // elsewhere in the API ({ data, meta: {...} }), not a flat
      // { data, total, offset, limit } object — the frontend's generic
      // Paginated<T> type assumes the nested `meta` and crashes without it.
      expect((result as any).total).toBeUndefined();
    });

    it('defaults offset/limit in meta when the caller omits them', async () => {
      incidentRepo.findAndCount.mockResolvedValue([[], 0]);
      userRepo.findOne.mockResolvedValue({ neighbourhoodId: 'nb-downtown' });

      const result = await service.findAll('user-1', {});

      expect(result.meta).toEqual({ total: 0, offset: 0, limit: 20 });
    });

    it('scopes to the caller neighbourhood when no filter is given', async () => {
      incidentRepo.findAndCount.mockResolvedValue([[], 0]);
      userRepo.findOne.mockResolvedValue({ neighbourhoodId: 'nb-marais' });

      await service.findAll('user-1', {});

      expect(incidentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { neighbourhoodId: 'nb-marais' } }),
      );
    });

    it('applies status/severity filters when provided', async () => {
      incidentRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('user-1', {
        neighbourhood_id: 'nb-downtown',
        status: IncidentStatusEnum.OPEN,
        severity: IncidentSeverityEnum.HIGH,
      });

      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(incidentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            neighbourhoodId: 'nb-downtown',
            status: IncidentStatusEnum.OPEN,
            severity: IncidentSeverityEnum.HIGH,
          },
        }),
      );
    });
  });
});
