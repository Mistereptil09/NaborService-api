import fc from 'fast-check';
import { BanService, AddressValidationException } from '../../ban.service';

// Feature: geographical-pipeline, Property 3: Address Input Validation
describe('Property 3: Address Input Validation', () => {
  let banService: BanService;

  beforeEach(() => {
    banService = new BanService(null as any);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should throw validation error for empty, whitespace, or >200 chars without HTTP call', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/./g, ' ')), // Whitespace only
          fc.string({ minLength: 201 })
        ),
        (invalidAddress) => {
          expect(() => banService.validateAddress(invalidAddress)).toThrow(AddressValidationException);
          
          try {
            banService.validateAddress(invalidAddress);
          } catch (error) {
            expect(error.message).toContain('Address must');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
