import bcrypt from 'bcryptjs';

// Shared PIN matcher: returns the first user in `users` whose bcrypt pinHash matches `pin`,
// else null. Callers pass an already-scoped list (e.g. all active users for quick login, or
// only ADMIN/MANAGER for a manager-approval override). Keeps the bcrypt loop in one place.
export async function matchPin<T extends { pinHash: string | null }>(users: T[], pin: string): Promise<T | null> {
  if (!pin) return null;
  for (const u of users) {
    if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) return u;
  }
  return null;
}
