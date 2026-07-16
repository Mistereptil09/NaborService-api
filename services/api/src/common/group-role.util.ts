import { GroupRoleEnum, UserRoleEnum } from './enums';
import { isModeratorOrAdmin } from './ownership';

/**
 * Maps a global user role to the chat-group role they get in their own
 * neighbourhood's auto-managed group: residents are read-only, reps can
 * post, moderators/admins manage the group (see neighbourhoodGroupRoleFor
 * callers for the platform-wide staff case, handled separately).
 */
export function neighbourhoodGroupRoleFor(role: UserRoleEnum): GroupRoleEnum {
  if (isModeratorOrAdmin(role)) return GroupRoleEnum.ADMIN;
  if (role === UserRoleEnum.NEIGHBOURHOOD_REP) return GroupRoleEnum.MESSAGE;
  return GroupRoleEnum.WATCH;
}
