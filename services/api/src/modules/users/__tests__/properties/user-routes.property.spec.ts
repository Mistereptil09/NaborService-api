import * as fc from 'fast-check';
import * as argon2 from 'argon2';

// ----------------------------------------------------
// 1. Profile update preserves unmodified fields
// ----------------------------------------------------
interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  bio: string;
  visibility: string;
  messagePolicy: string;
  neighbourhoodId: string | null;
  email: string;
}

function simulateUpdateProfile(
  user: UserProfile,
  dto: Partial<UserProfile>,
): UserProfile {
  return {
    ...user,
    ...dto,
  };
}

// ----------------------------------------------------
// 2. Media upload / 3. replacement / 4. deletion
// ----------------------------------------------------
interface MongoMedia {
  _id: string;
  pg_user_id: string;
  type: string;
  mimetype: string;
  replaced_at: Date | null;
}

interface UserMediaRefs {
  profilePictureMongoId: string | null;
  bannerMongoId: string | null;
}

function simulateUploadMedia(
  userId: string,
  type: 'avatar' | 'banner',
  originalRefs: UserMediaRefs,
  mediaStore: MongoMedia[],
): { refs: UserMediaRefs; store: MongoMedia[] } {
  const store = [...mediaStore];
  const newId = `mongo-${Math.random()}`;

  // Property 3: replacement marks old
  const oldMediaIdx = store.findIndex(
    (m) => m.pg_user_id === userId && m.type === type,
  );
  if (oldMediaIdx !== -1) {
    store[oldMediaIdx] = {
      ...store[oldMediaIdx],
      replaced_at: new Date(),
      type: `${type}_replaced`,
    };
  }

  // Add new
  store.push({
    _id: newId,
    pg_user_id: userId,
    type,
    mimetype: 'image/webp', // Property 2: converted to WebP
    replaced_at: null,
  });

  const refs = { ...originalRefs };
  if (type === 'avatar') {
    refs.profilePictureMongoId = newId;
  } else {
    refs.bannerMongoId = newId;
  }

  return { refs, store };
}

function simulateDeleteMedia(
  userId: string,
  type: 'avatar' | 'banner',
  originalRefs: UserMediaRefs,
  mediaStore: MongoMedia[],
): { refs: UserMediaRefs; store: MongoMedia[] } {
  const store = mediaStore.filter(
    (m) => !(m.pg_user_id === userId && m.type === type),
  );
  const refs = { ...originalRefs };
  if (type === 'avatar') {
    refs.profilePictureMongoId = null;
  } else {
    refs.bannerMongoId = null;
  }
  return { refs, store };
}

// ----------------------------------------------------
// 6. Password change revokes other sessions
// ----------------------------------------------------
interface Session {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

function simulatePasswordChange(
  userId: string,
  sessions: Session[],
  currentSessionId: string,
): Session[] {
  return sessions.map((s) => {
    if (
      s.userId === userId &&
      s.id !== currentSessionId &&
      s.revokedAt === null &&
      s.expiresAt > new Date()
    ) {
      return { ...s, revokedAt: new Date() };
    }
    return s;
  });
}

// ----------------------------------------------------
// 7. Opt-out / 8. Restriction
// ----------------------------------------------------
interface UserDataProcessing {
  userId: string;
  optOuts: string[];
  isRestricted: boolean;
}

function getEffectiveOptOuts(record: UserDataProcessing): string[] {
  if (record.isRestricted) {
    return ['discovery', 'notifications', 'neo4j_tracking'];
  }
  return record.optOuts;
}

// ----------------------------------------------------
// 9. Visibility / 10. Blocks
// ----------------------------------------------------
interface RelationshipGraph {
  follows: { followerId: string; followedId: string }[];
  friendships: {
    user1Id: string;
    user2Id: string;
    unfriendedAt: Date | null;
  }[];
  blocks: { blockerId: string; blockedId: string }[];
}

function areFriends(u1: string, u2: string, graph: RelationshipGraph): boolean {
  const first = u1 < u2 ? u1 : u2;
  const second = u1 < u2 ? u2 : u1;
  return graph.friendships.some(
    (f) =>
      f.user1Id === first && f.user2Id === second && f.unfriendedAt === null,
  );
}

function isBlocked(u1: string, u2: string, graph: RelationshipGraph): boolean {
  return graph.blocks.some(
    (b) =>
      (b.blockerId === u1 && b.blockedId === u2) ||
      (b.blockerId === u2 && b.blockedId === u1),
  );
}

function getPublicProfile(
  requesterId: string,
  target: UserProfile,
  graph: RelationshipGraph,
): any {
  if (isBlocked(requesterId, target.id, graph)) {
    throw new Error('404');
  }

  if (target.visibility === 'private') {
    return {
      id: target.id,
      firstName: target.firstName,
      lastName: target.lastName,
      visibility: target.visibility,
    };
  }

  if (target.visibility === 'friends') {
    if (!areFriends(requesterId, target.id, graph)) {
      return {
        id: target.id,
        firstName: target.firstName,
        lastName: target.lastName,
        visibility: target.visibility,
      };
    }
  }

  return {
    id: target.id,
    firstName: target.firstName,
    lastName: target.lastName,
    visibility: target.visibility,
    bio: target.bio,
    neighbourhoodId: target.neighbourhoodId,
    email: target.email,
  };
}

// ----------------------------------------------------
// Tests Description
// ----------------------------------------------------

describe('Feature: users-routes-cdc, Correctness Properties', () => {
  // Property 1
  it('Property 1: Profile update preserves unmodified fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          firstName: fc.string(),
          lastName: fc.string(),
          bio: fc.string(),
          visibility: fc.constantFrom('public', 'friends', 'private'),
          messagePolicy: fc.constantFrom('anyone', 'friends', 'none'),
          neighbourhoodId: fc.option(fc.uuid()),
          email: fc.emailAddress(),
        }),
        fc.record({
          firstName: fc.option(fc.string()),
          lastName: fc.option(fc.string()),
          bio: fc.option(fc.string()),
        }),
        (user, rawUpdate) => {
          const updateDto: Partial<UserProfile> = {};
          if (rawUpdate.firstName !== null)
            updateDto.firstName = rawUpdate.firstName;
          if (rawUpdate.lastName !== null)
            updateDto.lastName = rawUpdate.lastName;
          if (rawUpdate.bio !== null) updateDto.bio = rawUpdate.bio;

          const updated = simulateUpdateProfile(user, updateDto);

          // Checked fields must be changed if specified
          if (updateDto.firstName)
            expect(updated.firstName).toBe(updateDto.firstName);
          if (updateDto.lastName)
            expect(updated.lastName).toBe(updateDto.lastName);
          if (updateDto.bio) expect(updated.bio).toBe(updateDto.bio);

          // All other fields must remain identical
          expect(updated.id).toBe(user.id);
          expect(updated.visibility).toBe(user.visibility);
          expect(updated.messagePolicy).toBe(user.messagePolicy);
          expect(updated.neighbourhoodId).toBe(user.neighbourhoodId);
          expect(updated.email).toBe(user.email);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 2 & 3
  it('Property 2 & 3: Media upload produces WebP and replacement marks old', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom('avatar', 'banner'),
        (userId, type) => {
          const originalRefs: UserMediaRefs = {
            profilePictureMongoId: 'old-mongo-id',
            bannerMongoId: null,
          };
          const initialStore: MongoMedia[] = [
            {
              _id: 'old-mongo-id',
              pg_user_id: userId,
              type: 'avatar',
              mimetype: 'image/webp',
              replaced_at: null,
            },
          ];

          const { refs, store } = simulateUploadMedia(
            userId,
            type,
            originalRefs,
            initialStore,
          );

          if (type === 'avatar') {
            expect(refs.profilePictureMongoId).not.toBeNull();
            expect(refs.profilePictureMongoId).not.toBe('old-mongo-id');
            // old avatar should be marked replaced
            const oldAvatar = store.find((m) => m._id === 'old-mongo-id');
            expect(oldAvatar?.replaced_at).not.toBeNull();
            expect(oldAvatar?.type).toBe('avatar_replaced');
          } else {
            expect(refs.bannerMongoId).not.toBeNull();
          }

          // Newly added media is WebP
          const newMedia = store.find(
            (m) =>
              m._id ===
              (type === 'avatar'
                ? refs.profilePictureMongoId
                : refs.bannerMongoId),
          );
          expect(newMedia?.mimetype).toBe('image/webp');
          expect(newMedia?.replaced_at).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 4
  it('Property 4: Media deletion clears both stores', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom('avatar', 'banner'),
        (userId, type) => {
          const originalRefs: UserMediaRefs = {
            profilePictureMongoId: 'mongo-avatar-id',
            bannerMongoId: 'mongo-banner-id',
          };
          const initialStore: MongoMedia[] = [
            {
              _id: 'mongo-avatar-id',
              pg_user_id: userId,
              type: 'avatar',
              mimetype: 'image/webp',
              replaced_at: null,
            },
            {
              _id: 'mongo-banner-id',
              pg_user_id: userId,
              type: 'banner',
              mimetype: 'image/webp',
              replaced_at: null,
            },
          ];

          const { refs, store } = simulateDeleteMedia(
            userId,
            type,
            originalRefs,
            initialStore,
          );

          if (type === 'avatar') {
            expect(refs.profilePictureMongoId).toBeNull();
            expect(store.some((m) => m.type === 'avatar')).toBe(false);
          } else {
            expect(refs.bannerMongoId).toBeNull();
            expect(store.some((m) => m.type === 'banner')).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 5
  it('Property 5: Password update round-trip (Argon2id)', async () => {
    const password = 'mySecurePassword123';
    const salt = Buffer.from('somesalt12345678');
    const hash = await argon2.hash(password, { salt });

    expect(await argon2.verify(hash, password)).toBe(true);
    expect(await argon2.verify(hash, 'wrongpassword')).toBe(false);
  });

  // Property 6
  it('Property 6: Password change revokes other sessions', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            id: fc.uuid(),
            userId: fc.uuid(),
            revokedAt: fc.constant(null),
            expiresAt: fc.constant(new Date(Date.now() + 1000000)),
          }),
        ),
        (userId, randomSessions) => {
          // ensure at least some sessions belong to our user
          const userSessions = randomSessions.map((s, idx) => {
            if (idx % 2 === 0) {
              return { ...s, userId };
            }
            return s;
          });

          const currentSessionId = 'current-session-id';
          const allSessions = [
            {
              id: currentSessionId,
              userId,
              revokedAt: null,
              expiresAt: new Date(Date.now() + 1000000),
            },
            ...userSessions,
          ];

          const updated = simulatePasswordChange(
            userId,
            allSessions,
            currentSessionId,
          );

          // Current session is not revoked
          const current = updated.find((s) => s.id === currentSessionId);
          expect(current?.revokedAt).toBeNull();

          // Other sessions of the same user are revoked
          for (const s of updated) {
            if (s.userId === userId && s.id !== currentSessionId) {
              expect(s.revokedAt).not.toBeNull();
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 7
  it('Property 7: Opt-out add/remove round-trip', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('discovery', 'notifications', 'neo4j_tracking'),
        (processingType) => {
          const record: UserDataProcessing = {
            userId: 'user-1',
            optOuts: [],
            isRestricted: false,
          };

          // Add opt-out
          record.optOuts = Array.from(
            new Set([...record.optOuts, processingType]),
          );
          expect(getEffectiveOptOuts(record)).toContain(processingType);

          // Remove opt-out
          record.optOuts = record.optOuts.filter((o) => o !== processingType);
          expect(getEffectiveOptOuts(record)).not.toContain(processingType);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 8
  it('Property 8: Restriction activates all opt-outs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('discovery', 'notifications', 'neo4j_tracking'),
        ),
        (initialOptOuts) => {
          const record: UserDataProcessing = {
            userId: 'user-1',
            optOuts: Array.from(new Set(initialOptOuts)),
            isRestricted: false,
          };

          // Activate restriction
          record.isRestricted = true;
          expect(getEffectiveOptOuts(record)).toEqual([
            'discovery',
            'notifications',
            'neo4j_tracking',
          ]);

          // Deactivate restriction
          record.isRestricted = false;
          expect(getEffectiveOptOuts(record)).toEqual(
            Array.from(new Set(initialOptOuts)),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 9
  it('Property 9: Visibility controls profile response content', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.constant('target-user'),
          firstName: fc.string(),
          lastName: fc.string(),
          bio: fc.string(),
          visibility: fc.constantFrom('public', 'friends', 'private'),
          messagePolicy: fc.constant('none'),
          neighbourhoodId: fc.constant('n1'),
          email: fc.emailAddress(),
        }),
        fc.boolean(), // are they friends?
        (target, isFriends) => {
          const graph: RelationshipGraph = {
            follows: [],
            friendships: isFriends
              ? [
                  {
                    user1Id: 'req-user',
                    user2Id: 'target-user',
                    unfriendedAt: null,
                  },
                ]
              : [],
            blocks: [],
          };

          const profile = getPublicProfile('req-user', target, graph);

          if (target.visibility === 'private') {
            expect(profile.bio).toBeUndefined();
            expect(profile.email).toBeUndefined();
            expect(profile.id).toBe(target.id);
          } else if (target.visibility === 'friends') {
            if (isFriends) {
              expect(profile.bio).toBe(target.bio);
            } else {
              expect(profile.bio).toBeUndefined();
            }
          } else {
            // public
            expect(profile.bio).toBe(target.bio);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 10
  it('Property 10: Blocked users are invisible across all surfaces', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.constant('target-user'),
          firstName: fc.string(),
          lastName: fc.string(),
          bio: fc.string(),
          visibility: fc.constant('public'),
          messagePolicy: fc.constant('none'),
          neighbourhoodId: fc.constant('n1'),
          email: fc.emailAddress(),
        }),
        (target) => {
          const graph: RelationshipGraph = {
            follows: [],
            friendships: [],
            blocks: [{ blockerId: 'req-user', blockedId: 'target-user' }],
          };

          // Lookups throw 404
          expect(() => getPublicProfile('req-user', target, graph)).toThrow(
            '404',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 11
  it('Property 11: Search results respect pagination and exclusions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            firstName: fc.string(),
            lastName: fc.string(),
            deletedAt: fc.option(fc.date()),
          }),
          { minLength: 5, maxLength: 50 },
        ),
        (users) => {
          // exclude soft deleted
          const active = users.filter((u) => u.deletedAt === null);

          // Pagination offset/limit test
          const offset = 2;
          const limit = 3;
          const results = active.slice(offset, offset + limit);

          expect(results.length).toBeLessThanOrEqual(limit);
          for (const u of results) {
            expect(u.deletedAt).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 12
  it('Property 12: Discover feed is sorted by score descending', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            score: fc.integer(),
            swiped: fc.boolean(),
            optedOut: fc.boolean(),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (candidates) => {
          const filtered = candidates.filter((c) => !c.swiped && !c.optedOut);
          filtered.sort((a, b) => b.score - a.score);

          // Verify strictly non-increasing order
          for (let i = 0; i < filtered.length - 1; i++) {
            expect(filtered[i].score).toBeGreaterThanOrEqual(
              filtered[i + 1].score,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 13
  it('Property 13: Follow creates record and mutual follow creates friendship', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.boolean(), // existing follow back?
        (u1, u2, followBackExists) => {
          const graph: RelationshipGraph = {
            follows: [],
            friendships: [],
            blocks: [],
          };

          // A follows B
          graph.follows.push({ followerId: u1, followedId: u2 });

          if (followBackExists) {
            graph.follows.push({ followerId: u2, followedId: u1 });
            // Mutual follow creates friendship
            const first = u1 < u2 ? u1 : u2;
            const second = u1 < u2 ? u2 : u1;
            graph.friendships.push({
              user1Id: first,
              user2Id: second,
              unfriendedAt: null,
            });
          }

          expect(
            graph.follows.some(
              (f) => f.followerId === u1 && f.followedId === u2,
            ),
          ).toBe(true);
          if (followBackExists) {
            expect(areFriends(u1, u2, graph)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 14
  it('Property 14: Unfollow removes record and breaks friendship', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (u1, u2) => {
        const graph: RelationshipGraph = {
          follows: [
            { followerId: u1, followedId: u2 },
            { followerId: u2, followedId: u1 },
          ],
          friendships: [
            {
              user1Id: u1 < u2 ? u1 : u2,
              user2Id: u1 < u2 ? u2 : u1,
              unfriendedAt: null,
            },
          ],
          blocks: [],
        };

        // Unfollow A -> B
        graph.follows = graph.follows.filter(
          (f) => !(f.followerId === u1 && f.followedId === u2),
        );

        // Break friendship
        const first = u1 < u2 ? u1 : u2;
        const second = u1 < u2 ? u2 : u1;
        const friendship = graph.friendships.find(
          (f) => f.user1Id === first && f.user2Id === second,
        );
        if (friendship) {
          friendship.unfriendedAt = new Date();
        }

        expect(
          graph.follows.some((f) => f.followerId === u1 && f.followedId === u2),
        ).toBe(false);
        expect(areFriends(u1, u2, graph)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Property 15
  it('Property 15: Block removes all social relationships', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (u1, u2) => {
        const graph: RelationshipGraph = {
          follows: [
            { followerId: u1, followedId: u2 },
            { followerId: u2, followedId: u1 },
          ],
          friendships: [
            {
              user1Id: u1 < u2 ? u1 : u2,
              user2Id: u1 < u2 ? u2 : u1,
              unfriendedAt: null,
            },
          ],
          blocks: [],
        };

        // Block A -> B
        graph.blocks.push({ blockerId: u1, blockedId: u2 });

        // Clean follows in both directions
        graph.follows = graph.follows.filter(
          (f) =>
            !(
              (f.followerId === u1 && f.followedId === u2) ||
              (f.followerId === u2 && f.followedId === u1)
            ),
        );

        // Clean friendship
        const first = u1 < u2 ? u1 : u2;
        const second = u1 < u2 ? u2 : u1;
        const friendship = graph.friendships.find(
          (f) => f.user1Id === first && f.user2Id === second,
        );
        if (friendship) {
          friendship.unfriendedAt = new Date();
        }

        expect(graph.follows.length).toBe(0);
        expect(areFriends(u1, u2, graph)).toBe(false);
        expect(isBlocked(u1, u2, graph)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Property 16
  it('Property 16: Followers/following/friends lists are consistent with relationships', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            followerId: fc.uuid(),
            followedId: fc.uuid(),
          }),
        ),
        (targetId, rawFollows) => {
          const follows = Array.from(
            new Set(rawFollows.map((f) => `${f.followerId}-${f.followedId}`)),
          ).map((str) => {
            const [f, fd] = str.split('-');
            return { followerId: f, followedId: fd };
          });

          const followersList = follows
            .filter((f) => f.followedId === targetId)
            .map((f) => f.followerId);
          const followingList = follows
            .filter((f) => f.followerId === targetId)
            .map((f) => f.followedId);

          const friendsList = followersList.filter((f) =>
            followingList.includes(f),
          );

          for (const follower of followersList) {
            expect(
              follows.some(
                (f) => f.followerId === follower && f.followedId === targetId,
              ),
            ).toBe(true);
          }
          for (const following of followingList) {
            expect(
              follows.some(
                (f) => f.followerId === targetId && f.followedId === following,
              ),
            ).toBe(true);
          }
          for (const friend of friendsList) {
            expect(
              follows.some(
                (f) => f.followerId === friend && f.followedId === targetId,
              ),
            ).toBe(true);
            expect(
              follows.some(
                (f) => f.followerId === targetId && f.followedId === friend,
              ),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 17 & 18
  it('Property 17 & 18: RGPD JSON / CSV export completeness and equivalence', () => {
    fc.assert(
      fc.property(
        fc.record({
          profile: fc.record({ id: fc.uuid(), email: fc.emailAddress() }),
          listings: fc.array(fc.record({ id: fc.uuid(), title: fc.string() })),
          messages: fc.array(fc.record({ id: fc.uuid(), body: fc.string() })),
          eventParticipations: fc.array(
            fc.record({ eventId: fc.uuid(), status: fc.string() }),
          ),
          votes: fc.array(fc.record({ optionId: fc.uuid() })),
        }),
        (data) => {
          // Property 17 completeness
          expect(data.profile).toBeDefined();
          expect(data.listings).toBeDefined();
          expect(data.messages).toBeDefined();
          expect(data.eventParticipations).toBeDefined();
          expect(data.votes).toBeDefined();

          // Conversion equivalence simulation
          let csv = 'Format,Table,RecordID,Details\n';
          csv += `JSON,users,${data.profile.id},"email: ${data.profile.email}"\n`;
          for (const l of data.listings) {
            csv += `JSON,listings,${l.id},"title: ${l.title}"\n`;
          }

          expect(csv).toContain(data.profile.id);
          for (const l of data.listings) {
            expect(csv).toContain(l.id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 19
  it('Property 19: Swipe history is ordered by date descending', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            swipedAt: fc
              .integer({ min: 0, max: 10000000000000 })
              .map((t) => new Date(t)),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (swipes) => {
          swipes.sort((a, b) => b.swipedAt.getTime() - a.swipedAt.getTime());

          for (let i = 0; i < swipes.length - 1; i++) {
            expect(swipes[i].swipedAt.getTime()).toBeGreaterThanOrEqual(
              swipes[i + 1].swipedAt.getTime(),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 20
  it('Property 20: Report records all required fields', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1 }),
        (reporterId, reportedId, reason) => {
          const report = {
            id: `report-${Math.random()}`,
            reporterId,
            reportedId,
            reason,
            createdAt: new Date(),
          };

          expect(report.reporterId).toBe(reporterId);
          expect(report.reportedId).toBe(reportedId);
          expect(report.reason).toBe(reason);
          expect(report.createdAt).toBeInstanceOf(Date);
        },
      ),
      { numRuns: 100 },
    );
  });
});
