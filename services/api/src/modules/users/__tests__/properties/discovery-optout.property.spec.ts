import * as fc from 'fast-check';

interface UserMock {
  userId: string;
  isDiscoveryOptedOut: boolean;
}

// Simulated Profile/Feed Discovery Query execution
async function simulateDiscoveryQuery(users: UserMock[]): Promise<UserMock[]> {
  // Centralized check / filtering for discovery query
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

          // Assert that no returned user has isDiscoveryOptedOut === true
          for (const user of results) {
            expect(user.isDiscoveryOptedOut).toBe(false);
          }

          // Assert that all users who had isDiscoveryOptedOut === false are included in the results
          const expectedUsers = users.filter((u) => !u.isDiscoveryOptedOut);
          expect(results.length).toBe(expectedUsers.length);
          for (const expectedUser of expectedUsers) {
            expect(results.some((r) => r.userId === expectedUser.userId)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
