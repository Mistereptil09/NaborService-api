import { Test, TestingModule } from '@nestjs/testing';
import { 
  BanService, 
  AddressValidationException, 
  BanUnavailableException,
  BanTimeoutException,
  BanServerException,
  NoResultsError
} from '../ban.service';
import { HttpRetryService, HttpRequestFailedException, HttpRequestTimeoutException } from '../../../common/http-retry/http-retry.service';

describe('BanService', () => {
  let service: BanService;
  let httpRetryService: HttpRetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BanService,
        {
          provide: HttpRetryService,
          useValue: {
            fetchWithRetry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BanService>(BanService);
    httpRetryService = module.get<HttpRetryService>(HttpRetryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('geocode', () => {
    it('should correctly encode URL and extract best result', async () => {
      const mockResponse = {
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [2.35, 48.85] },
              properties: { score: 0.9, label: 'Paris' }
            }
          ]
        })
      };

      (httpRetryService.fetchWithRetry as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.geocode('Paris France');

      expect(httpRetryService.fetchWithRetry).toHaveBeenCalledWith(
        'http://ban:7878/search/?q=Paris%20France',
        {},
        expect.any(Object)
      );
      expect(result).toEqual({
        latitude: 48.85,
        longitude: 2.35,
        confidence: 0.9
      });
    });

    it('should append limit parameter if valid', async () => {
      (httpRetryService.fetchWithRetry as jest.Mock).mockResolvedValue({
        json: async () => ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { score: 1 } }] })
      });

      await service.geocode('Test', 5);

      expect(httpRetryService.fetchWithRetry).toHaveBeenCalledWith(
        'http://ban:7878/search/?q=Test&limit=5',
        {},
        expect.any(Object)
      );
    });

    it('should map HttpRequestTimeoutException to BanTimeoutException', async () => {
      (httpRetryService.fetchWithRetry as jest.Mock).mockRejectedValue(new HttpRequestTimeoutException());

      await expect(service.geocode('Test')).rejects.toThrow(BanTimeoutException);
    });
    
    it('should map HttpRequestFailedException to BanServerException', async () => {
      (httpRetryService.fetchWithRetry as jest.Mock).mockRejectedValue(new HttpRequestFailedException('Failed', 500));

      await expect(service.geocode('Test')).rejects.toThrow(BanServerException);
    });
  });
});
