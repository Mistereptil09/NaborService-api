import { GroupRoleEnum, UserRoleEnum } from './enums';
import { isModeratorOrAdmin } from './ownership';

export function neighbourhoodGroupRoleFor(role: UserRoleEnum): GroupRoleEnum {
  if (isModeratorOrAdmin(role)) return GroupRoleEnum.ADMIN;
  if (role === UserRoleEnum.NEIGHBOURHOOD_REP) return GroupRoleEnum.ADMIN;
  return GroupRoleEnum.WATCH;
}
