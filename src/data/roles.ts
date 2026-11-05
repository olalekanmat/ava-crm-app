import { isAdmin } from './access';
import { COMPANY_WIDE_FUNCTIONS, FUNCTION_LABEL, FUNCTION_ROLES, type FunctionRole, type User } from './types';

/**
 * 2.13 function roles: back-office jobs on top of the line role. Administrators hold all of them,
 * so a company without a Finance person still works: its administrator does the finance steps.
 */
export function can(u: User | undefined | null, f: FunctionRole): boolean {
  if (!u) return false;
  return isAdmin(u) || !!u.functions?.includes(f);
}

/** Function roles held in their own right (not through administrator rights). */
export const functionsOf = (u: User): FunctionRole[] => FUNCTION_ROLES.filter((f) => u.functions?.includes(f));

/** People who see the whole company's data: administrators and the back-office roles. */
export const seesCompany = (u: User): boolean => isAdmin(u) || COMPANY_WIDE_FUNCTIONS.some((f) => u.functions?.includes(f));

/** "Finance · Invoicing officer", or '' when the person holds none. */
export const functionsLabel = (u: User): string => functionsOf(u).map((f) => FUNCTION_LABEL[f]).join(' · ');

/** Active people who hold a function in their own right, or, when nobody does, the administrators. */
export function holdersOf(users: User[], f: FunctionRole): User[] {
  const live = users.filter((u) => u.active && !u.deletedAt);
  const own = live.filter((u) => u.functions?.includes(f));
  return own.length ? own : live.filter(isAdmin);
}

/** Cleans a list of function roles: known ones, each once, in the standard order. */
export const cleanFunctions = (list: readonly string[] | undefined): FunctionRole[] => FUNCTION_ROLES.filter((f) => list?.includes(f));
