export function isModeratorOrAdmin(userRole?: string): boolean {
  return userRole === 'admin' || userRole === 'moderator';
}

export function isOwnerOrModOrAdmin(
  ownerId: string,
  userId: string,
  userRole?: string,
): boolean {
  return ownerId === userId || isModeratorOrAdmin(userRole);
}
