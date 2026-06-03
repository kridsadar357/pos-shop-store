// Offline catalog cache: persists the POS's branch-scoped product list, categories, and
// resolved settings to IndexedDB. On a successful online fetch the POS refreshes the cache;
// when a fetch fails (offline) it falls back to the cache so the grid still works after a
// cold reload. All helpers swallow errors — caching must never break the online path.
import { idbGet, idbSet } from './idb';
import type { Product, Category, Setting } from '../types';

const branchKey = (branchId?: number | null) => branchId ?? 'all';

const pKey = (b?: number | null) => `products:${branchKey(b)}`;
const sKey = (b?: number | null) => `setting:${branchKey(b)}`;
const CATEGORIES_KEY = 'categories';

export async function cacheProducts(branchId: number | null | undefined, products: Product[]): Promise<void> {
  try { await idbSet(pKey(branchId), products); } catch { /* cache is best-effort */ }
}
export async function cachedProducts(branchId: number | null | undefined): Promise<Product[] | undefined> {
  try { return await idbGet<Product[]>(pKey(branchId)); } catch { return undefined; }
}

export async function cacheCategories(categories: Category[]): Promise<void> {
  try { await idbSet(CATEGORIES_KEY, categories); } catch { /* best-effort */ }
}
export async function cachedCategories(): Promise<Category[] | undefined> {
  try { return await idbGet<Category[]>(CATEGORIES_KEY); } catch { return undefined; }
}

export async function cacheSetting(branchId: number | null | undefined, setting: Setting): Promise<void> {
  try { await idbSet(sKey(branchId), setting); } catch { /* best-effort */ }
}
export async function cachedSetting(branchId: number | null | undefined): Promise<Setting | undefined> {
  try { return await idbGet<Setting>(sKey(branchId)); } catch { return undefined; }
}
