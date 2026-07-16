import { GroupRoleEnum, UserRoleEnum } from './enums';
import { isModeratorOrAdmin } from './ownership';

/**
 * Maps a global user role to the chat-group role they get in their own
 * neighbourhood's auto-managed group: residents are read-only, neighbourhood
 * reps administer the group, moderators/admins also manage it (platform
 * staff moderate via the separate ChatAdminController, independent of group
 * membership — they aren't force-joined into every neighbourhood group).
 */
export function neighbourhoodGroupRoleFor(role: UserRoleEnum): GroupRoleEnum {
  if (isModeratorOrAdmin(role)) return GroupRoleEnum.ADMIN;
  if (role === UserRoleEnum.NEIGHBOURHOOD_REP) return GroupRoleEnum.ADMIN;
  return GroupRoleEnum.WATCH;
}
