import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

const models = Prisma.dmmf.datamodel.models;
const modelNames = models.map((m) => m.name);
const accessor = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
const db = prisma as any;

/** Topological order with dependencies (parent tables) first, derived from FK fields. */
function dependencyOrder(): string[] {
  const deps = new Map<string, Set<string>>();
  for (const m of models) {
    const set = new Set<string>();
    for (const f of m.fields) {
      // A relation field that owns the FK (relationFromFields) → this model depends on f.type.
      if (f.kind === 'object' && f.relationFromFields && f.relationFromFields.length > 0 && f.type !== m.name) {
        set.add(f.type);
      }
    }
    deps.set(m.name, set);
  }
  const order: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();
  const visit = (n: string) => {
    if (visited.has(n) || temp.has(n)) return;
    temp.add(n);
    for (const d of deps.get(n) ?? []) if (modelNames.includes(d)) visit(d);
    temp.delete(n);
    visited.add(n);
    order.push(n);
  };
  for (const n of modelNames) visit(n);
  return order; // dependencies first
}

/** Full database snapshot: every model's rows. */
export async function exportAll() {
  const data: Record<string, unknown[]> = {};
  for (const name of modelNames) {
    data[name] = await db[accessor(name)].findMany();
  }
  return { version: 1, exportedAt: new Date().toISOString(), models: modelNames, data };
}

/** Atomically replace ALL data with the snapshot, then fix autoincrement sequences. */
export async function restoreAll(payload: { data?: Record<string, unknown[]> }) {
  const data = payload?.data ?? {};
  // Only accept snapshots whose models are a subset of the current schema.
  for (const key of Object.keys(data)) {
    if (!modelNames.includes(key)) throw Object.assign(new Error(`ไฟล์สำรองมีตารางที่ไม่รู้จัก: ${key}`), { status: 400 });
  }
  const order = dependencyOrder();

  await prisma.$transaction(
    async (tx) => {
      // Delete children first (reverse of dependency order).
      for (const name of [...order].reverse()) await (tx as any)[accessor(name)].deleteMany({});
      // Insert parents first.
      for (const name of order) {
        const rows = data[name];
        if (Array.isArray(rows) && rows.length) await (tx as any)[accessor(name)].createMany({ data: rows, skipDuplicates: true });
      }
    },
    { timeout: 120000, maxWait: 20000 }
  );

  // Reset Postgres autoincrement sequences so future inserts don't collide with restored ids.
  for (const m of models) {
    const idField = m.fields.find((f) => f.isId && f.hasDefaultValue && typeof f.default === 'object' && (f.default as any)?.name === 'autoincrement');
    if (!idField) continue;
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${m.name}"', '${idField.name}'), GREATEST((SELECT COALESCE(MAX("${idField.name}"), 1) FROM "${m.name}"), 1))`);
  }

  const counts: Record<string, number> = {};
  for (const name of modelNames) counts[name] = Array.isArray(data[name]) ? data[name]!.length : 0;
  return { restored: counts };
}
