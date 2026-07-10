/**
 * Checks whether a user has an elevated role (admin or moderator).
 * Used by ownership guards to allow moderators/admins to bypass
 * owner-only checks on events, listings, polls, etc.
 */
export function isModeratorOrAdmin(userRole?: string): boolean {
  return userRole === 'admin' || userRole === 'moderator';
}

/**
 * Returns true if the requesting user is either the resource owner
 * or holds a moderator/admin role.
 */
export function isOwnerOrModOrAdmin(
  ownerId: string,
  userId: string,
  userRole?: string,
): boolean {
  return ownerId === userId || isModeratorOrAdmin(userRole);
}
