import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Generate an attractive SVG "photo" placeholder per product so every product
// ships with an image out of the box (offline-friendly). Returns the URL.
function makeProductImage(sku: string, name: string, emoji: string, grad: [string, string]): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${grad[0]}"/>
      <stop offset="100%" stop-color="${grad[1]}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <circle cx="320" cy="280" r="170" fill="rgba(255,255,255,0.18)"/>
  <text x="320" y="340" font-size="220" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  <rect x="0" y="540" width="640" height="100" fill="rgba(0,0,0,0.28)"/>
  <text x="320" y="600" font-size="40" font-family="Inter, Arial, sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${name.replace(/&/g, '&amp;')}</text>
</svg>`;
  const file = `seed-${sku}.svg`;
  fs.writeFileSync(path.join(uploadsDir, file), svg, 'utf8');
  return `/uploads/${file}`;
}

const GRADIENTS: Record<string, [string, string]> = {
  Beverages: ['#3b82f6', '#1d4ed8'],
  Snacks: ['#f59e0b', '#d97706'],
  Household: ['#14b8a6', '#0d9488'],
  'Personal Care': ['#ec4899', '#a855f7'],
  'Dry Goods': ['#22c55e', '#16a34a'],
};

async function main() {
  console.log('Seeding…');

  // --- Settings (singleton) ---
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: 'Sunrise Mart (Retail & Wholesale)',
      address: '123 Market Rd, Bangkok 10100',
      phone: '02-123-4567',
      taxId: '0105500000001',
      promptPayId: '0812345678', // demo mobile number — change in Settings
      promptPayType: 'MSISDN',
      currency: 'THB',
      taxRatePct: 7,
      taxInclusive: true,
      receiptFooter: 'Thank you & see you again!',
    },
  });

  // --- Users ---
  const users = [
    { username: 'admin', password: 'admin123', name: 'System Admin', role: 'ADMIN' as const },
    { username: 'manager', password: 'manager123', name: 'Store Manager', role: 'MANAGER' as const },
    { username: 'cashier', password: 'cashier123', name: 'Front Cashier', role: 'CASHIER' as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { username: u.username, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
    });
  }

  // --- Categories ---
  const catNames = ['Beverages', 'Snacks', 'Household', 'Personal Care', 'Dry Goods'];
  const cats: Record<string, number> = {};
  for (const name of catNames) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    cats[name] = c.id;
  }

  // --- Supplier ---
  await prisma.supplier.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Bangkok Wholesale Co.', phone: '02-555-0000', email: 'sales@bkkwholesale.test' },
  });

  // --- Members ---
  const members = [
    { code: 'M0001', name: 'สมชาย ใจดี', phone: '0891112222', email: 'somchai@example.com' },
    { code: 'M0002', name: 'Nadia Wholesale', phone: '0822223333', email: 'nadia@shop.test' },
    { code: 'M0003', name: 'ร้านป้าแดง', phone: '0833334444', email: '' },
  ];
  for (const m of members) {
    await prisma.member.upsert({ where: { phone: m.phone }, update: {}, create: m });
  }

  // --- Products with opening stock (via RECEIVE movements) ---
  const products = [
    { sku: 'BVG-001', barcode: '8850001000017', name: 'Cola 325ml', emoji: '🥤', cat: 'Beverages', cost: 8, retail: 15, wholesale: 12, minQty: 24, reorder: 48, open: 240, unit: 'can' },
    { sku: 'BVG-002', barcode: '8850001000024', name: 'Drinking Water 600ml', emoji: '💧', cat: 'Beverages', cost: 3, retail: 7, wholesale: 5, minQty: 12, reorder: 60, open: 360, unit: 'bottle' },
    { sku: 'SNK-001', barcode: '8850002000016', name: 'Potato Chips 50g', emoji: '🍟', cat: 'Snacks', cost: 12, retail: 20, wholesale: 16, minQty: 12, reorder: 24, open: 120, unit: 'bag' },
    { sku: 'SNK-002', barcode: '8850002000023', name: 'Chocolate Bar', emoji: '🍫', cat: 'Snacks', cost: 10, retail: 18, wholesale: 14, minQty: 12, reorder: 24, open: 90, unit: 'bar' },
    { sku: 'HSE-001', barcode: '8850003000015', name: 'Dish Soap 500ml', emoji: '🧴', cat: 'Household', cost: 22, retail: 39, wholesale: 32, minQty: 6, reorder: 12, open: 60, unit: 'bottle' },
    { sku: 'HSE-002', barcode: '8850003000022', name: 'Trash Bags (30pc)', emoji: '🗑️', cat: 'Household', cost: 28, retail: 49, wholesale: 40, minQty: 6, reorder: 10, open: 40, unit: 'pack' },
    { sku: 'PCR-001', barcode: '8850004000014', name: 'Shampoo 200ml', emoji: '🧼', cat: 'Personal Care', cost: 45, retail: 79, wholesale: 65, minQty: 6, reorder: 8, open: 36, unit: 'bottle' },
    { sku: 'PCR-002', barcode: '8850004000021', name: 'Toothpaste 100g', emoji: '🪥', cat: 'Personal Care', cost: 25, retail: 45, wholesale: 36, minQty: 6, reorder: 12, open: 50, unit: 'tube' },
    { sku: 'DRY-001', barcode: '8850005000013', name: 'Jasmine Rice 5kg', emoji: '🍚', cat: 'Dry Goods', cost: 130, retail: 189, wholesale: 165, minQty: 4, reorder: 8, open: 30, unit: 'bag' },
    { sku: 'DRY-002', barcode: '8850005000020', name: 'Instant Noodles', emoji: '🍜', cat: 'Dry Goods', cost: 5, retail: 9, wholesale: 7, minQty: 30, reorder: 100, open: 500, unit: 'pack' },
  ];

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (existing) continue;
    const imageUrl = makeProductImage(p.sku, p.name, p.emoji, GRADIENTS[p.cat] ?? ['#64748b', '#334155']);
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          imageUrl,
          categoryId: cats[p.cat],
          unit: p.unit,
          cost: p.cost,
          retailPrice: p.retail,
          wholesalePrice: p.wholesale,
          wholesaleMinQty: p.minQty,
          reorderLevel: p.reorder,
          stockQty: 0,
        },
      });
      // Opening stock as a RECEIVE movement so the ledger reflects it.
      await tx.product.update({ where: { id: product.id }, data: { stockQty: p.open } });
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: 'RECEIVE',
          qtyDelta: p.open,
          balanceAfter: p.open,
          unitCost: p.cost,
          refType: 'OPENING',
          note: 'Opening stock',
        },
      });
    });
  }

  // --- Promotions ---
  const beverages = cats['Beverages'];
  const promos = [
    { name: 'ลดทั้งบิล 5% เมื่อซื้อครบ ฿500', type: 'PERCENT' as const, scope: 'BILL' as const, value: 5, minSpend: 500, autoApply: true },
    { name: 'เครื่องดื่มลด 10%', type: 'PERCENT' as const, scope: 'CATEGORY' as const, value: 10, categoryId: beverages, autoApply: true },
    { name: 'น้ำดื่ม ซื้อ 5 แถม 1', type: 'BXGY' as const, scope: 'PRODUCT' as const, buyQty: 5, getQty: 1, autoApply: true },
    { name: 'คูปอง SAVE50 ลด ฿50', type: 'FIXED' as const, scope: 'BILL' as const, value: 50, minSpend: 300, autoApply: false, code: 'SAVE50' },
  ];
  const waterId = (await prisma.product.findUnique({ where: { sku: 'BVG-002' } }))?.id ?? null;
  for (const p of promos) {
    const exists = await prisma.promotion.findFirst({ where: { name: p.name } });
    if (exists) continue;
    await prisma.promotion.create({
      data: { ...p, productId: p.type === 'BXGY' ? waterId : null },
    });
  }

  console.log('✓ Seed complete.');
  console.log('  Logins: admin/admin123 · manager/manager123 · cashier/cashier123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
