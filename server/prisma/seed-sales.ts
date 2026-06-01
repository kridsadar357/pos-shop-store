/**
 * Historical sales seeder — generates ~30 days of realistic transactional data:
 * opening stock, periodic supplier receipts, daily shifts, and POS sales (cash /
 * transfer / card / credit, retail & wholesale, members, the odd void).
 *
 * It mirrors the live checkout pricing (tax-inclusive line tax) and writes a
 * fully chronological StockMovement ledger so balances, reports, finance/shifts
 * and the backtrack audit trail are all internally consistent.
 *
 * Run:  npm --prefix server run db:seed-sales
 * Safe to re-run — it resets sales/movements/receipts/shifts first.
 */
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DAYS = 30;
const round2 = (n: number) => Math.round(n * 100) / 100;
const rint = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number) => Math.random() < p;

function weighted<T>(items: { v: T; w: number }[]): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = Math.random() * total;
  for (const i of items) { if ((r -= i.w) <= 0) return i.v; }
  return items[items.length - 1].v;
}

async function main() {
  console.log(`Seeding ~${DAYS} days of sales…`);

  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
  const defaultTax = Number(setting.taxRatePct);
  const taxInclusive = setting.taxInclusive;

  const products = await prisma.product.findMany({ where: { isActive: true } });
  if (!products.length) throw new Error('No products — run the base seed first.');
  const members = await prisma.member.findMany({ where: { isActive: true } });
  const users = await prisma.user.findMany({ where: { isActive: true } });
  const cashiers = users.filter((u) => u.role === 'CASHIER');
  const managers = users.filter((u) => u.role === 'MANAGER');
  const admins = users.filter((u) => u.role === 'ADMIN');
  const sellerPool = weightedSellers(cashiers, managers, admins);
  const supplier = await prisma.supplier.findFirst();

  // --- Reset transactional data (keep products/categories/members/users) ---
  await prisma.stockMovement.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.goodsReceiptItem.deleteMany({});
  await prisma.goodsReceipt.deleteMany({});
  await prisma.heldBill.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.counter.deleteMany({ where: { key: { in: ['sale', 'goods_receipt'] } } });

  // --- Running state ---
  const stock = new Map<number, number>();        // productId -> qty
  const movements: Prisma.StockMovementCreateManyInput[] = [];
  let saleSeq = 0;
  let grSeq = 0;

  const now = new Date();
  const dayStart = (offset: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    d.setHours(h, m, rint(0, 59), 0);
    return d;
  };

  // --- Opening stock (31 days ago) ---
  const openingDate = dayStart(DAYS + 1, 7, 30);
  for (const p of products) {
    const open = Math.max(p.reorderLevel * 6, 250);
    stock.set(p.id, open);
    movements.push({
      productId: p.id, type: 'RECEIVE', qtyDelta: open, balanceAfter: open,
      unitCost: Number(p.cost), refType: 'OPENING', note: 'สต็อกยกมา', createdAt: openingDate,
    });
  }

  let totalSales = 0;
  let totalRevenue = 0;

  // --- Walk each day oldest → newest ---
  for (let off = DAYS; off >= 0; off--) {
    const date = new Date(now);
    date.setDate(date.getDate() - off);
    const dow = date.getDay(); // 0 Sun .. 6 Sat
    const weekend = dow === 0 || dow === 6;
    const trend = 1 + ((DAYS - off) / DAYS) * 0.3; // gentle growth over the month

    // Morning replenishment: restock anything that fell low (creates GR + RECEIVE).
    const lowItems = products.filter((p) => (stock.get(p.id) ?? 0) <= Math.max(p.reorderLevel * 2, 40));
    if (lowItems.length && chance(0.7)) {
      grSeq++;
      const refNo = `GR-${String(grSeq).padStart(5, '0')}`;
      const grDate = dayStart(off, 8, rint(0, 30));
      const items = lowItems.map((p) => {
        const target = Math.max(p.reorderLevel * 6, 250);
        const qty = Math.max(target - (stock.get(p.id) ?? 0), p.reorderLevel * 2 || 50);
        return { productId: p.id, qty, unitCost: Number(p.cost) };
      });
      const total = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
      const receipt = await prisma.goodsReceipt.create({
        data: {
          refNo, supplierId: supplier?.id ?? null, note: 'รับเข้าประจำรอบ', total,
          userId: pick(managers.length ? managers : users).id, createdAt: grDate,
          items: { create: items.map((i) => ({ productId: i.productId, qty: i.qty, unitCost: i.unitCost })) },
        },
      });
      for (const i of items) {
        const bal = (stock.get(i.productId) ?? 0) + i.qty;
        stock.set(i.productId, bal);
        movements.push({
          productId: i.productId, type: 'RECEIVE', qtyDelta: i.qty, balanceAfter: bal,
          unitCost: i.unitCost, refType: 'GOODS_RECEIPT', refId: receipt.id, note: refNo,
          userId: receipt.userId ?? undefined, createdAt: grDate,
        });
      }
    }

    // How busy is today?
    let orders = Math.round((weekend ? rint(16, 27) : rint(9, 17)) * trend);

    // Open a shift per seller who works today.
    const todaysSellers = uniqueById(Array.from({ length: weekend ? 3 : 2 }, () => pick(sellerPool)));
    const shifts = new Map<number, { id: number; cash: number; float: number }>();
    for (const seller of todaysSellers) {
      const float = pick([1000, 1500, 2000]);
      const sh = await prisma.shift.create({
        data: { userId: seller.id, openingFloat: float, status: 'CLOSED', openedAt: dayStart(off, 8, 45), note: '' },
      });
      shifts.set(seller.id, { id: sh.id, cash: 0, float });
    }

    for (let o = 0; o < orders; o++) {
      const seller = pick(todaysSellers);
      const shift = shifts.get(seller.id)!;
      const createdAt = dayStart(off, rint(8, 20), rint(0, 59));

      const member = chance(0.25) && members.length ? pick(members) : null;
      const memberWholesale = !!member && setting.memberGetsWholesale;
      const wholesaleOrder = !member && chance(0.12);
      const type: 'RETAIL' | 'WHOLESALE' = wholesaleOrder ? 'WHOLESALE' : 'RETAIL';

      // Build a basket of distinct products that still have stock.
      const lineCount = wholesaleOrder ? rint(2, 5) : rint(1, 6);
      const chosen = new Set<number>();
      const lineData: Prisma.SaleItemCreateManySaleInput[] = [];
      let subtotal = 0;
      let taxAmount = 0;

      for (let l = 0; l < lineCount; l++) {
        const p = pick(products);
        if (chosen.has(p.id)) continue;
        const avail = stock.get(p.id) ?? 0;
        if (avail <= 0) continue;
        let qty = wholesaleOrder ? rint(p.wholesaleMinQty, p.wholesaleMinQty + 12) : rint(1, 4);
        qty = Math.min(qty, avail);
        if (qty <= 0) continue;
        chosen.add(p.id);

        const useWholesale = memberWholesale || (type === 'WHOLESALE' && qty >= p.wholesaleMinQty);
        const unitPrice = Number(useWholesale ? p.wholesalePrice : p.retailPrice);
        const lineTotal = round2(unitPrice * qty);
        subtotal += lineTotal;
        const rate = p.taxRatePct != null ? Number(p.taxRatePct) : defaultTax;
        taxAmount += taxInclusive ? lineTotal - lineTotal / (1 + rate / 100) : lineTotal * (rate / 100);

        lineData.push({ productId: p.id, nameSnapshot: p.name, qty, unitPrice, unitCost: Number(p.cost), lineTotal });
      }
      if (!lineData.length) continue;

      subtotal = round2(subtotal);
      taxAmount = round2(taxAmount);
      const discount = chance(0.08) ? round2(subtotal * pick([0.05, 0.1])) : 0;
      const total = round2(taxInclusive ? subtotal - discount : subtotal + taxAmount - discount);

      const paymentMethod = weighted([
        { v: 'CASH' as const, w: 58 }, { v: 'TRANSFER' as const, w: 30 },
        { v: 'CARD' as const, w: 9 }, { v: 'CREDIT' as const, w: 3 },
      ]);
      const cashReceived = paymentMethod === 'CASH' ? niceCash(total) : 0;
      const changeDue = paymentMethod === 'CASH' ? round2(cashReceived - total) : 0;

      const voided = chance(0.012);
      saleSeq++;
      const orderNo = `S-${String(saleSeq).padStart(6, '0')}`;

      const sale = await prisma.sale.create({
        data: {
          orderNo, type, status: voided ? 'VOID' : 'PAID',
          subtotal, discount, taxAmount, total, promoDiscount: 0, promoNames: '',
          paymentMethod, cashReceived, changeDue,
          cashierId: seller.id, memberId: member?.id ?? null, shiftId: shift.id,
          voidedById: voided ? pick(managers.length ? managers : users).id : null,
          voidedAt: voided ? new Date(createdAt.getTime() + 5 * 60000) : null,
          createdAt,
          items: { create: lineData },
          // One tender per sale (the seed doesn't generate split bills).
          payments: { create: [{ method: paymentMethod, amount: total, createdAt }] },
        },
      });

      // Stock SALE movements (decrement). For a void, immediately return the stock.
      for (const li of lineData) {
        const bal = (stock.get(li.productId) ?? 0) - li.qty;
        stock.set(li.productId, bal);
        movements.push({
          productId: li.productId, type: 'SALE', qtyDelta: -li.qty, balanceAfter: bal,
          unitCost: li.unitCost, refType: 'SALE', refId: sale.id, note: orderNo,
          userId: seller.id, createdAt,
        });
        if (voided) {
          const rb = (stock.get(li.productId) ?? 0) + li.qty;
          stock.set(li.productId, rb);
          movements.push({
            productId: li.productId, type: 'VOID', qtyDelta: li.qty, balanceAfter: rb,
            unitCost: li.unitCost, refType: 'SALE', refId: sale.id, note: `ยกเลิก ${orderNo}`,
            userId: sale.voidedById ?? undefined, createdAt: new Date(createdAt.getTime() + 5 * 60000),
          });
        }
      }

      if (!voided) {
        totalSales++;
        totalRevenue += total;
        if (paymentMethod === 'CASH') shift.cash += total;
      }
    }

    // Close out each shift with an expected/counted reconciliation.
    for (const [, sh] of shifts) {
      const expected = round2(sh.float + sh.cash);
      const diff = chance(0.5) ? 0 : round2(pick([-1, 1]) * pick([0, 0, 5, 10, 20]));
      await prisma.shift.update({
        where: { id: sh.id },
        data: { status: 'CLOSED', closedAt: dayStart(off, 20, rint(15, 59)), expectedCash: expected, countedCash: round2(expected + diff), cashDiff: diff },
      });
    }
  }

  // Flush the ledger in chunks.
  for (let i = 0; i < movements.length; i += 1000) {
    await prisma.stockMovement.createMany({ data: movements.slice(i, i + 1000) });
  }

  // Sync cached stock + counters so the live app continues seamlessly.
  await Promise.all(products.map((p) => prisma.product.update({ where: { id: p.id }, data: { stockQty: stock.get(p.id) ?? 0 } })));
  await prisma.counter.upsert({ where: { key: 'sale' }, create: { key: 'sale', value: saleSeq }, update: { value: saleSeq } });
  await prisma.counter.upsert({ where: { key: 'goods_receipt' }, create: { key: 'goods_receipt', value: grSeq }, update: { value: grSeq } });

  console.log(`✓ Done. ${totalSales} paid sales · revenue ฿${totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} · ${grSeq} goods receipts · ${movements.length} ledger rows.`);
}

function weightedSellers(cashiers: any[], managers: any[], admins: any[]) {
  const pool: any[] = [];
  for (const c of cashiers) for (let i = 0; i < 5; i++) pool.push(c);
  for (const m of managers) for (let i = 0; i < 2; i++) pool.push(m);
  for (const a of admins) pool.push(a);
  return pool.length ? pool : [...cashiers, ...managers, ...admins];
}
function uniqueById<T extends { id: number }>(arr: T[]): T[] {
  const seen = new Map<number, T>();
  for (const x of arr) seen.set(x.id, x);
  return Array.from(seen.values());
}
function niceCash(total: number): number {
  for (const note of [20, 50, 100, 500, 1000]) {
    if (total <= note) return note;
  }
  return Math.ceil(total / 100) * 100;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
