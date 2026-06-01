import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding…');

  // --- Settings (singleton) ---
  await prisma.setting.upsert({
    where: { id: 1 },
    update: { setupCompleted: true },
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
      loyaltyEnabled: true,
      pointsEarnBaht: 25, // 25 baht spent = 1 point
      pointsRedeemValue: 1, // 1 point = 1 baht
      setupCompleted: true,
    },
  });

  // --- Default branch (Phase 1 multi-branch) ---
  await prisma.branch.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { code: 'HQ', name: 'สำนักงานใหญ่', address: '123 Market Rd, Bangkok 10100', phone: '02-123-4567', isDefault: true },
  });

  // --- License (singleton) — seed a 14-day demo so the trial flow is visible ---
  const demoStart = new Date();
  await prisma.license.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      status: 'DEMO',
      plan: 'ทดลองใช้ 14 วัน',
      demoStartedAt: demoStart,
      expiresAt: new Date(demoStart.getTime() + 14 * 86_400_000),
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

  // --- Categories (Thai) ---
  const catNames = ['เครื่องดื่ม', 'ขนมขบเคี้ยว', 'ช็อกโกแลต', 'นมและโยเกิร์ต', 'บะหมี่กึ่งสำเร็จรูป', 'เครื่องปรุงและทำอาหาร'];
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

  // --- Real Thai retail products (data + photos from Open Food Facts) ---
  // imageUrl points at the downloaded photo in server/uploads/real-<barcode>.jpg.
  const B = 'เครื่องดื่ม', S = 'ขนมขบเคี้ยว', C = 'ช็อกโกแลต', D = 'นมและโยเกิร์ต', N = 'บะหมี่กึ่งสำเร็จรูป', K = 'เครื่องปรุงและทำอาหาร';
  const products = [
    { barcode: '8852018101017', name: 'ยำยำ บะหมี่กึ่งสำเร็จรูป รสเนื้อ', cat: N, cost: 4.5, retail: 6, wholesale: 5, minQty: 30, reorder: 100, open: 500, unit: 'ซอง' },
    { barcode: '8801073113893', name: 'ซัมยัง บูลดัก ฮอตชิคเก้น คาโบนาร่า', cat: N, cost: 38, retail: 49, wholesale: 44, minQty: 6, reorder: 24, open: 80, unit: 'ซอง' },
    { barcode: '8851613101378', name: 'อร่อยดี กะทิ 100% UHT', cat: K, cost: 18, retail: 25, wholesale: 21, minQty: 12, reorder: 24, open: 120, unit: 'กล่อง' },
    { barcode: '8851613101385', name: 'อร่อยดี กะทิกล่อง 500 มล.', cat: K, cost: 29, retail: 39, wholesale: 34, minQty: 12, reorder: 24, open: 96, unit: 'กล่อง' },
    { barcode: '8997240600041', name: 'โอ๊ตไซด์ น้ำนมข้าวโอ๊ต รสจืด 1 ลิตร', cat: B, cost: 65, retail: 89, wholesale: 78, minQty: 6, reorder: 12, open: 48, unit: 'กล่อง' },
    { barcode: '5060108450348', name: 'ฟีเวอร์ทรี จินเจอร์เบียร์ 200 มล.', cat: B, cost: 48, retail: 65, wholesale: 58, minQty: 6, reorder: 12, open: 48, unit: 'ขวด' },
    { barcode: '8410128121976', name: 'พาสควาล โยเกิร์ตพร้อมดื่ม กลิ่นวานิลลา', cat: D, cost: 21, retail: 29, wholesale: 25, minQty: 6, reorder: 24, open: 60, unit: 'ถ้วย' },
    { barcode: '5053990155354', name: 'พริงเกิลส์ รสซาวร์ครีมหัวหอม', cat: S, cost: 33, retail: 45, wholesale: 39, minQty: 6, reorder: 18, open: 90, unit: 'กระป๋อง' },
    { barcode: '4017100712203', name: 'ลอเรนซ์ ครันช์ชิปส์ รสเค็ม', cat: S, cost: 40, retail: 55, wholesale: 48, minQty: 6, reorder: 12, open: 60, unit: 'ถุง' },
    { barcode: '9555030107614', name: 'ฮิมาลายาซอลต์ ลูกอมมินต์ รสเลมอน', cat: S, cost: 14, retail: 20, wholesale: 17, minQty: 12, reorder: 30, open: 200, unit: 'ถุง' },
    { barcode: '80051671', name: 'นูเทลลา ช็อกโกแลตเฮเซลนัทสเปรด', cat: C, cost: 120, retail: 159, wholesale: 140, minQty: 6, reorder: 8, open: 24, unit: 'กระปุก' },
    { barcode: '8000500032237', name: 'เฟอเรโร รอชเชอร์', cat: C, cost: 75, retail: 99, wholesale: 88, minQty: 6, reorder: 12, open: 40, unit: 'กล่อง' },
    { barcode: '3046920028721', name: 'ลินด์ เอ็กเซลเลนซ์ ดาร์ก 99%', cat: C, cost: 95, retail: 129, wholesale: 115, minQty: 6, reorder: 10, open: 30, unit: 'แท่ง' },
    { barcode: '7614500010013', name: 'โทเบลอโรน มิลค์ช็อกโกแลต', cat: C, cost: 58, retail: 79, wholesale: 70, minQty: 6, reorder: 12, open: 40, unit: 'แท่ง' },
    { barcode: '80974482', name: 'คินเดอร์ จอย', cat: C, cost: 26, retail: 35, wholesale: 31, minQty: 12, reorder: 24, open: 120, unit: 'ชิ้น' },
    { barcode: '80761761', name: 'คินเดอร์ บูเอโน ไวท์', cat: C, cost: 29, retail: 39, wholesale: 35, minQty: 12, reorder: 24, open: 100, unit: 'ชิ้น' },
  ];

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { sku: p.barcode } });
    if (existing) continue;
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: p.barcode,
          barcode: p.barcode,
          name: p.name,
          imageUrl: `/uploads/real-${p.barcode}.jpg`,
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
  const beverages = cats['เครื่องดื่ม'];
  const promos = [
    { name: 'ลดทั้งบิล 5% เมื่อซื้อครบ ฿500', type: 'PERCENT' as const, scope: 'BILL' as const, value: 5, minSpend: 500, autoApply: true },
    { name: 'เครื่องดื่มลด 10%', type: 'PERCENT' as const, scope: 'CATEGORY' as const, value: 10, categoryId: beverages, autoApply: true },
    { name: 'ยำยำ ซื้อ 5 แถม 1', type: 'BXGY' as const, scope: 'PRODUCT' as const, buyQty: 5, getQty: 1, autoApply: true },
    { name: 'คูปอง SAVE50 ลด ฿50', type: 'FIXED' as const, scope: 'BILL' as const, value: 50, minSpend: 300, autoApply: false, code: 'SAVE50' },
  ];
  const bxgyId = (await prisma.product.findUnique({ where: { sku: '8852018101017' } }))?.id ?? null;
  for (const p of promos) {
    const exists = await prisma.promotion.findFirst({ where: { name: p.name } });
    if (exists) continue;
    await prisma.promotion.create({
      data: { ...p, productId: p.type === 'BXGY' ? bxgyId : null },
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
