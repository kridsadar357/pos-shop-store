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
  purchaseUnit?: string;
  unitsPerPurchase?: number;
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
  branchId?: number | null;
  branch?: { name: string } | null;
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
  branchId?: number | null;
  cashier?: { name: string };
  member?: { name: string; phone: string } | null;
  branch?: { name: string } | null;
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

export type POStatus = 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface POListItem {
  id: number;
  refNo: string;
  status: POStatus;
  note: string;
  total: string;
  expectedDate: string | null;
  createdAt: string;
  supplier?: { name: string } | null;
  lineCount: number;
  orderedQty: number;
  receivedQty: number;
}

export interface POItem {
  id: number;
  productId: number;
  qty: number;
  unitCost: string;
  receivedQty: number;
  product?: { name: string; sku: string; unit: string; stockQty: number };
}

export interface PODetail {
  id: number;
  refNo: string;
  status: POStatus;
  note: string;
  total: string;
  expectedDate: string | null;
  createdAt: string;
  supplier?: { id: number; name: string } | null;
  items: POItem[];
}

export interface ReturnListItem {
  id: number;
  refNo: string;
  orderNo: string;
  total: string;
  refundMethod: 'CASH' | 'TRANSFER' | 'CARD' | 'CREDIT';
  reason: string;
  createdAt: string;
  itemCount: number;
  qty: number;
}

export interface ReturnableItem {
  saleItemId: number;
  productId: number;
  name: string;
  sold: number;
  returned: number;
  returnable: number;
  unitPrice: string;
}

export interface Returnable {
  sale: { id: number; orderNo: string; createdAt: string; total: string; subtotal: string; cashier?: { name: string } };
  items: ReturnableItem[];
}

export interface TransferListItem {
  id: number;
  refNo: string;
  note: string;
  createdAt: string;
  fromBranch: string;
  toBranch: string;
  lineCount: number;
  qty: number;
}

export interface BranchStockItem {
  id: number;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  totalQty: number;
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
  branchId?: number | null;
  product?: { name: string; sku: string };
  user?: { name: string } | null;
  branch?: { name: string } | null;
}
