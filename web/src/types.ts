export interface Category {
  id: number;
  name: string;
  isActive: boolean;
  _count?: { products: number };
}

export interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  imageUrl: string | null;
  categoryId: number | null;
  category?: Category | null;
  unit: string;
  cost: string;
  retailPrice: string;
  wholesalePrice: string;
  wholesaleMinQty: number;
  taxRatePct: string | null;
  reorderLevel: number;
  stockQty: number;
  isActive: boolean;
}

export interface Setting {
  id: number;
  storeName: string;
  address: string;
  phone: string;
  taxId: string;
  promptPayId: string;
  promptPayType: 'MSISDN' | 'NATID' | 'EWALLET';
  currency: string;
  taxRatePct: string;
  taxInclusive: boolean;
  receiptFooter: string;
  memberGetsWholesale: boolean;
  receiptLogoUrl: string | null;
  receiptHeader: string;
  receiptShowQR: boolean;
  printerType: 'BROWSER' | 'ESCPOS_NET' | 'ESCPOS_USB';
  printerAddress: string;
  printerPaper: '58mm' | '80mm';
  setupCompleted: boolean;
}

export interface LicenseState {
  status: 'INACTIVE' | 'DEMO' | 'ACTIVE' | 'EXPIRED';
  valid: boolean;
  daysLeft: number;
  expiresAt: string | null;
  plan: string;
  key: string;
  demoDays: number;
}

export interface Member {
  id: number;
  code: string | null;
  name: string;
  phone: string;
  email: string;
  note: string;
  isActive: boolean;
}

export interface ShiftTotals {
  orders: number;
  cashSales: number;
  transferSales: number;
  totalSales: number;
  voids: number;
}

export interface Shift {
  id: number;
  userId: number;
  openingFloat: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  countedCash: string | null;
  expectedCash: string | number | null;
  cashDiff: string | null;
  note: string;
  totals?: ShiftTotals;
  user?: { name: string };
}

export interface SaleItem {
  id: number;
  productId: number;
  nameSnapshot: string;
  qty: number;
  unitPrice: string;
  unitCost: string;
  lineTotal: string;
}

export interface Sale {
  id: number;
  orderNo: string;
  type: 'RETAIL' | 'WHOLESALE';
  status: 'PAID' | 'VOID';
  subtotal: string;
  discount: string;
  promoDiscount?: string;
  promoNames?: string;
  taxAmount: string;
  total: string;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD' | 'CREDIT';
  cashReceived: string;
  changeDue: string;
  qrPayload: string;
  createdAt: string;
  memberId?: number | null;
  cashier?: { name: string };
  member?: { name: string; phone: string } | null;
  items: SaleItem[];
}

export interface HeldBill {
  id: number;
  type: 'RETAIL' | 'WHOLESALE';
  memberId: number | null;
  discount: string;
  couponCode: string;
  note: string;
  items: { productId: number; qty: number }[];
  createdAt: string;
  member?: { name: string } | null;
}

export interface Movement {
  id: number;
  productId: number;
  type: string;
  qtyDelta: number;
  balanceAfter: number;
  unitCost: string;
  refType: string;
  note: string;
  createdAt: string;
  product?: { name: string; sku: string };
  user?: { name: string } | null;
}
