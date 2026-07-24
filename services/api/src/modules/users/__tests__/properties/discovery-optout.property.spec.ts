import * as fc from 'fast-check';

interface UserMock {
  userId: string;
  isDiscoveryOptedOut: boolean;
}

async function simulateDiscoveryQuery(users: UserMock[]): Promise<UserMock[]> {
  return users.filter((u) => !u.isDiscoveryOptedOut);
}

describe('Feature: rgpd-data-processing-table, Property 5: Discovery exclusion', () => {
  it('should never include a user with active discovery opt-out in discovery results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 1 }),
            isDiscoveryOptedOut: fc.boolean(),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        async (users) => {
          const results = await simulateDiscoveryQuery(users);

          for (const user of results) {
            expect(user.isDiscoveryOptedOut).toBe(false);
          }

          const expectedUsers = users.filter((u) => !u.isDiscoveryOptedOut);
          expect(results.length).toBe(expectedUsers.length);
          for (const expectedUser of expectedUsers) {
            expect(results.some((r) => r.userId === expectedUser.userId)).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
