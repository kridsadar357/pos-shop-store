import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth, isBackStore } from '../../store/auth';
import { useShift } from '../../store/shift';
// Camera scanner pulls in html5-qrcode (~330 kB) — load it only when opened.
const CameraScanner = lazy(() => import('../../components/CameraScanner').then((m) => ({ default: m.CameraScanner })));
import { ProductImage } from '../../components/ProductImage';
import { QRCanvas } from '../../components/QRCode';
import { ReceiptPrint } from '../../components/ReceiptPrint';
import { printReceipt } from '../../lib/printing';
import { useBranch } from '../../store/branch';
import { ShiftGate, CloseShiftModal } from './ShiftModals';
import { MemberPicker } from './MemberWidget';
import { PosSidebar } from './PosSidebar';
import { toast } from '../../components/Toast';
import { money, num } from '../../lib/format';
import { th } from '../../lib/th';
import { createPublisher, type DisplayState } from '../../lib/display';
import type { Category, HeldBill, Member, Product, Sale, Setting } from '../../types';

interface Line { product: Product; qty: number; }
type PayKey = 'CASH' | 'TRANSFER' | 'CARD' | 'QR' | 'CREDIT';

const PAGE_SIZE = 24;

const PAYMENTS: { key: PayKey; label: string; icon: string; cls: string }[] = [
  { key: 'CASH', label: th.pmCash, icon: 'fa-money-bill-wave', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { key: 'TRANSFER', label: th.pmTransfer, icon: 'fa-building-columns', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  { key: 'CARD', label: th.pmCard, icon: 'fa-credit-card', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  { key: 'QR', label: th.pmQR, icon: 'fa-qrcode', cls: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  { key: 'CREDIT', label: th.pmCredit, icon: 'fa-coins', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
];

interface Stats {
  today: { revenue: number; orders: number; grossProfit: number; marginPct: number; avgOrder: number; customers: number };
  month: { revenue: number; deltaPct: number | null };
}

export default function POS() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { current: shift, refresh: refreshShift } = useShift();

  const [setting, setSetting] = useState<Setting | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<Stats | null>(null);

  const [catId, setCatId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'best' | 'priceAsc' | 'priceDesc'>('best');
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');

  const [lines, setLines] = useState<Line[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [discount, setDiscount] = useState(0);
  const [showDiscount, setShowDiscount] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [promo, setPromo] = useState<{ promoDiscount: number; applied: { id: number; name: string; amount: number }[] }>({ promoDiscount: 0, applied: [] });
  const [showPromo, setShowPromo] = useState(false);
  const [payKey, setPayKey] = useState<PayKey>('CASH');
  const [cashReceived, setCashReceived] = useState(0);
  const [cartTab, setCartTab] = useState<'bill' | 'customer'>('bill');
  const [priceCheck, setPriceCheck] = useState(false);
  const [priceProduct, setPriceProduct] = useState<Product | null>(null);

  const [showCam, setShowCam] = useState(false);
  const [pickMember, setPickMember] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [closing, setClosing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const doPrint = (sale: Sale) => printReceipt(sale, setting, () => setPrintSale(sale));
  const [autoPrint, setAutoPrint] = useState(localStorage.getItem('pos_autoprint') === '1');
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const publisher = useRef<ReturnType<typeof createPublisher> | null>(null);

  function loadHeld() { api<HeldBill[]>('/held-bills').then(setHeld).catch(() => setHeld([])); }
  function reload() {
    api<Product[]>('/products').then(setProducts).catch(() => {});
    api<Stats>('/sales/stats').then(setStats).catch(() => {});
    api<Product[]>('/products/favorites', { query: { limit: 8 } })
      .then((f) => setFavIds(new Set(f.map((p) => p.id))))
      .catch(() => {});
    loadHeld();
  }

  useEffect(() => {
    refreshShift();
    api<Setting>('/settings').then(setSetting).catch(() => {});
    api<Category[]>('/categories').then(setCategories).catch(() => {});
    reload();
    publisher.current = createPublisher();
    return () => publisher.current?.close();
  }, []);

  const memberWholesale = !!member && !!setting?.memberGetsWholesale;
  const currency = setting?.currency || 'THB';

  function unitPriceOf(p: Product, qty: number): number {
    const wholesale = memberWholesale || (mode === 'WHOLESALE' && qty >= p.wholesaleMinQty);
    return num(wholesale ? p.wholesalePrice : p.retailPrice);
  }

  // ---- product filtering / pagination ----
  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = activeProducts.filter((p) => {
      if (q) return [p.name, p.sku, p.barcode || ''].some((s) => s.toLowerCase().includes(q));
      return catId == null || p.categoryId === catId;
    });
    list = [...list];
    if (sort === 'priceAsc') list.sort((a, b) => num(a.retailPrice) - num(b.retailPrice));
    else if (sort === 'priceDesc') list.sort((a, b) => num(b.retailPrice) - num(a.retailPrice));
    else list.sort((a, b) => (favIds.has(b.id) ? 1 : 0) - (favIds.has(a.id) ? 1 : 0));
    return list;
  }, [activeProducts, search, catId, sort, favIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, catId, sort]);

  // ---- cart ----
  function addProduct(p: Product) {
    if (p.stockQty <= 0) return toast.error(th.outOfStock);
    setLines((prev) => {
      const ex = prev.find((l) => l.product.id === p.id);
      if (ex) return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product: p, qty: 1 }];
    });
  }
  function setQty(id: number, qty: number) {
    if (qty <= 0) return setLines((prev) => prev.filter((l) => l.product.id !== id));
    setLines((prev) => prev.map((l) => (l.product.id === id ? { ...l, qty } : l)));
  }
  function clearCart() { setLines([]); setMember(null); setDiscount(0); setCashReceived(0); setCoupon(''); setPromo({ promoDiscount: 0, applied: [] }); }

  // Live promotion preview whenever the cart / coupon / pricing context changes.
  useEffect(() => {
    if (!lines.length) { setPromo({ promoDiscount: 0, applied: [] }); return; }
    const items = lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: unitPriceOf(l.product, l.qty) }));
    const t = setTimeout(() => {
      api<{ promoDiscount: number; applied: { id: number; name: string; amount: number }[] }>('/promotions/apply', { method: 'POST', body: { items, couponCode: coupon } })
        .then(setPromo)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [lines, mode, member, coupon, setting]);

  async function resolveProduct(code: string): Promise<Product | null> {
    const local = activeProducts.find((p) => p.barcode === code || p.sku === code);
    if (local) return local;
    return api<Product>('/products/lookup', { query: { code } }).catch(() => null);
  }
  // A scan / Enter adds to cart — unless price-check mode is on, then it shows the price.
  async function handleScan(code: string) {
    const p = await resolveProduct(code);
    if (!p) return toast.error(th.notFound(code));
    if (priceCheck) { setPriceProduct(p); return; }
    addProduct(p);
    toast.success(th.added(p.name));
  }

  const totals = useMemo(() => {
    const inc = setting?.taxInclusive ?? true;
    const rate = num(setting?.taxRatePct ?? 7);
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const lt = unitPriceOf(l.product, l.qty) * l.qty;
      subtotal += lt;
      const r = l.product.taxRatePct != null ? num(l.product.taxRatePct) : rate;
      tax += inc ? lt - lt / (1 + r / 100) : lt * (r / 100);
    }
    const manualDisc = Math.min(discount, subtotal);
    const promoDisc = Math.min(promo.promoDiscount, subtotal - manualDisc);
    const disc = manualDisc + promoDisc;
    const net = inc ? subtotal - disc : subtotal + tax - disc;
    const count = lines.reduce((s, l) => s + l.qty, 0);
    return { subtotal, tax, manualDisc, promoDisc, disc, net, count };
  }, [lines, mode, member, setting, discount, promo]);

  const change = payKey === 'CASH' ? Math.max(0, cashReceived - totals.net) : 0;
  const vatPct = num(setting?.taxRatePct ?? 7);

  // ---- customer display ----
  function baseDisplay(): DisplayState {
    return {
      status: 'CART', storeName: setting?.storeName || 'POS', currency,
      items: lines.map((l) => ({ name: l.product.name, qty: l.qty, unitPrice: unitPriceOf(l.product, l.qty), lineTotal: unitPriceOf(l.product, l.qty) * l.qty, imageUrl: l.product.imageUrl })),
      count: totals.count, subtotal: totals.subtotal, tax: totals.tax, total: totals.net,
      member: member ? { name: member.name } : null, isMemberPrice: memberWholesale, ts: Date.now(),
    };
  }
  useEffect(() => {
    if (transfer || lastSale) return;
    publisher.current?.publish({ ...baseDisplay(), status: totals.count ? 'CART' : 'IDLE' });
  }, [lines, member, setting, totals.count]);

  // ---- checkout ----
  async function completeSale(method: 'CASH' | 'TRANSFER' | 'CARD' | 'CREDIT', ref = '') {
    try {
      const sale = await api<Sale>('/sales', {
        method: 'POST',
        body: {
          type: mode, paymentMethod: method, discount: totals.manualDisc, couponCode: coupon,
          cashReceived: method === 'CASH' ? cashReceived : 0,
          paymentRef: ref, memberId: member?.id ?? null, branchId: useBranch.getState().activeId ?? undefined,
          items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        },
      });
      publisher.current?.publish({ ...baseDisplay(), status: 'PAID', orderNo: sale.orderNo, paymentMethod: method === 'CASH' ? 'CASH' : 'TRANSFER', change: num(sale.changeDue), cashReceived: num(sale.cashReceived) });
      setLastSale(sale);
      if (autoPrint) doPrint(sale);
      clearCart();
      setTransfer(false);
      setPayKey('CASH');
      reload();
      refreshShift();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function onPay() {
    if (!lines.length) return;
    if (payKey === 'CASH') {
      if (cashReceived < totals.net) return toast.error('จำนวนเงินที่รับน้อยกว่ายอดสุทธิ');
      return completeSale('CASH');
    }
    if (payKey === 'TRANSFER' || payKey === 'QR') return setTransfer(true);
    if (payKey === 'CARD') return completeSale('CARD', 'บัตรเครดิต');
    if (payKey === 'CREDIT') return completeSale('CREDIT', 'เงินเชื่อ');
  }

  async function holdBill() {
    if (!lines.length) return;
    if (!shift) return toast.error('ต้องเปิดกะก่อนพักบิล');
    try {
      await api('/held-bills', {
        method: 'POST',
        body: { type: mode, memberId: member?.id ?? null, discount: totals.manualDisc, couponCode: coupon, items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })) },
      });
      clearCart();
      loadHeld();
      toast.success(th.held);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  // Resume a held bill into the cart to finish the transaction.
  async function resumeHeld(bill: HeldBill) {
    const newLines: Line[] = [];
    for (const it of bill.items) {
      const p = products.find((x) => x.id === it.productId);
      if (p) newLines.push({ product: p, qty: it.qty });
    }
    setLines(newLines);
    setMode(bill.type);
    setDiscount(num(bill.discount));
    setCoupon(bill.couponCode || '');
    setMember(bill.memberId ? await api<Member>(`/members/${bill.memberId}`).catch(() => null) : null);
    setShowHeld(false);
    try { await api(`/held-bills/${bill.id}`, { method: 'DELETE' }); } catch { /* ignore */ }
    loadHeld();
    toast.success('เปิดบิลที่พักไว้แล้ว');
  }

  // F-key shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') { e.preventDefault(); setShowSearch(true); }
      else if (e.key === 'F3') { e.preventDefault(); setPickMember(true); }
      else if (e.key === 'F4') { e.preventDefault(); setShowPromo(true); }
      else if (e.key === 'F6') { e.preventDefault(); holdBill(); }
      else if (e.key === 'F9') { e.preventDefault(); onPay(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Intelligent auto-focus: keep the invisible barcode reader focused so a scan
  // is always captured — unless the cashier is typing in a field or a modal is open.
  useEffect(() => {
    const overlay = priceCheck || pickMember || transfer || closing || showHeld || showPromo || !!lastSale || showCam || showSearch || showNotif || moreOpen;
    const focusScan = () => {
      if (overlay) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== scanRef.current && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      scanRef.current?.focus();
    };
    focusScan();
    const id = window.setInterval(focusScan, 1200);
    document.addEventListener('click', focusScan);
    window.addEventListener('focus', focusScan);
    return () => { clearInterval(id); document.removeEventListener('click', focusScan); window.removeEventListener('focus', focusScan); };
  }, [priceCheck, pickMember, transfer, closing, showHeld, showPromo, lastSale, showCam, showSearch, showNotif, moreOpen]);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  // Open the most recent sale's receipt (works across refresh — fetched from server).
  async function openLastBill() {
    try {
      const sales = await api<Sale[]>('/sales');
      if (!sales.length) return toast.info('ยังไม่มีบิลล่าสุด');
      setLastSale(await api<Sale>(`/sales/${sales[0].id}`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Live notifications: low/out-of-stock + held bills.
  const lowStock = activeProductsForNotif();
  function activeProductsForNotif() {
    return products.filter((p) => p.isActive && p.stockQty <= p.reorderLevel);
  }
  const notifications = [
    ...(held.length ? [{ icon: 'fa-clipboard-list', tone: 'amber', text: `มีบิลพักไว้ ${held.length} บิล`, onClick: () => { setShowNotif(false); setShowHeld(true); } }] : []),
    ...lowStock.slice(0, 8).map((p) => ({ icon: p.stockQty <= 0 ? 'fa-circle-exclamation' : 'fa-box', tone: p.stockQty <= 0 ? 'rose' : 'amber', text: `${p.name} ${p.stockQty <= 0 ? 'หมดสต็อก' : `เหลือ ${p.stockQty} ${p.unit}`}`, onClick: () => {} })),
  ];

  if (!shift) return <ShiftGate />;

  // Shift / stock KPI values.
  const outOfStock = lowStock.filter((p) => p.stockQty <= 0).length;
  const nearOut = lowStock.length - outOfStock;
  const shiftOrders = shift.totals?.orders ?? 0;
  const shiftSales = shift.totals?.totalSales ?? 0;
  const drawerCash = num(shift.expectedCash ?? shift.openingFloat ?? 0);

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {isBackStore(user?.role) && <PosSidebar branch={setting?.storeName} />}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-5 py-2.5 text-white shadow-glow">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-bars text-lg text-white/70" />
            <h1 className="text-lg font-extrabold">{th.posTitle}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" /> {th.online}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight text-white/80">
              <NowClock />
            </div>
            <div className="flex items-center gap-1.5">
              <IconBtn title={th.customerDisplay} onClick={() => window.open('/display', 'pos-customer-display', 'width=1100,height=720')}><i className="fa-solid fa-desktop" /></IconBtn>
              <div className="relative">
                <button onClick={() => setShowNotif((v) => !v)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-base text-white ring-1 ring-white/20 hover:bg-white/20" title="แจ้งเตือน">
                  <span className="relative"><i className="fa-solid fa-bell" />{notifications.length > 0 && <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white">{notifications.length}</span>}</span>
                </button>
                {showNotif && (
                  <div className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-xl bg-white shadow-pop ring-1 ring-slate-200" onMouseLeave={() => setShowNotif(false)}>
                    <div className="border-b border-slate-100 px-4 py-2 text-sm font-bold">การแจ้งเตือน</div>
                    <div className="max-h-80 overflow-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-slate-400">ไม่มีการแจ้งเตือน</div>
                      ) : notifications.map((n, i) => (
                        <button key={i} onClick={n.onClick} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${n.tone === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}><i className={`fa-solid ${n.icon}`} /></span>
                          <span className="text-slate-700">{n.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <IconBtn title="พิมพ์ใบเสร็จล่าสุด" onClick={() => lastSale ? doPrint(lastSale) : openLastBill()}><i className="fa-solid fa-print" /></IconBtn>
              <IconBtn title="ออนไลน์"><i className="fa-solid fa-wifi text-emerald-500" /></IconBtn>
              <IconBtn title="เต็มจอ" onClick={toggleFullscreen}><i className="fa-solid fa-expand" /></IconBtn>
              <button onClick={() => { logout(); navigate('/login'); }} className="ml-1 inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/25 hover:bg-white/25" title="ออกจากระบบ"><i className="fa-solid fa-right-from-bracket" /> ออกจากระบบ</button>
            </div>
          </div>
        </header>

        {/* Hidden, always-focused barcode reader (no visible input) */}
        <input
          ref={scanRef}
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed left-[-9999px] top-0 h-0 w-0 opacity-0"
          onKeyDown={(e) => { if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); e.currentTarget.value = ''; if (v) handleScan(v); } }}
        />

        {/* Search + actions */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
          {showSearch ? (
            <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
              <i className="fa-solid fa-magnifying-glass text-slate-400" />
              <input
                ref={searchRef}
                autoFocus
                className="w-full bg-transparent py-2.5 text-sm outline-none"
                placeholder="ค้นหาสินค้าตามชื่อ / SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="text-slate-400 hover:text-slate-600" onClick={() => { setSearch(''); setShowSearch(false); }}><i className="fa-solid fa-xmark" /></button>
            </div>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
                <i className="fa-solid fa-barcode" /> พร้อมสแกน
              </span>
              <button className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink-700 ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setShowSearch(true)}><i className="fa-solid fa-magnifying-glass text-slate-400" /> ค้นหา</button>
              <button className="grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title={th.camera} onClick={() => setShowCam(true)}><i className="fa-solid fa-camera" /></button>
              <div className="flex-1" />
            </>
          )}
          <ActionBtn icon="fa-user" label={th.aCustomer} k="F3" tone="brand" onClick={() => setPickMember(true)} />
          <ActionBtn icon="fa-tag" label={th.aPromotion} k="F4" tone="rose" onClick={() => setShowPromo(true)} />
          <ActionBtn icon="fa-tags" label="เช็คราคา" tone="sky" onClick={() => { setPriceProduct(null); setPriceCheck(true); }} />
          <ActionBtn icon="fa-percent" label={th.aDiscount} k="F5" tone="amber" onClick={() => { setCartTab('bill'); setShowDiscount(true); }} />
          <ActionBtn icon="fa-inbox" label={th.aHold} k="F6" tone="sky" onClick={holdBill} />
          <ActionBtn icon="fa-clipboard-list" label={`พักไว้${held.length ? ` (${held.length})` : ''}`} tone="amber" onClick={() => held.length ? setShowHeld(true) : toast.info('ไม่มีบิลที่พักไว้')} />
          <ActionBtn icon="fa-receipt" label={th.aLastBill} k="F7" tone="violet" onClick={openLastBill} />
          <div className="relative">
            <ActionBtn icon="fa-ellipsis" label={th.aMore} tone="slate" onClick={() => setMoreOpen((v) => !v)} />
            {moreOpen && (
              <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-pop ring-1 ring-slate-200" onMouseLeave={() => setMoreOpen(false)}>
                <button className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMoreOpen(false); setClosing(true); }}><i className="fa-solid fa-clock mr-2 text-slate-400" />{th.closeShift}</button>
                <button className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMoreOpen(false); window.open('/display', 'pos-customer-display', 'width=1100,height=720'); }}><i className="fa-solid fa-desktop mr-2 text-slate-400" />{th.customerDisplay}</button>
              </div>
            )}
          </div>
        </div>

        {/* Body: left (KPIs + products) | right (cart) */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            {/* KPI cards */}
            <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi tone={outOfStock ? 'rose' : 'amber'} icon="fa-triangle-exclamation" label="ความเสี่ยงสต็อก" value={`${lowStock.length} รายการ`} sub={`หมด ${outOfStock} · ใกล้หมด ${nearOut}`} />
              <Kpi tone="blue" icon="fa-receipt" label="จำนวนบิล (กะนี้)" value={`${shiftOrders} บิล`} sub={`กะ #${shift.id}`} />
              <Kpi tone="emerald" icon="fa-sack-dollar" label="ยอดขาย (กะนี้)" value={money(shiftSales, currency)} sub={`เปิดกะ ${money(shift.openingFloat, currency)}`} />
              <Kpi tone="violet" icon="fa-cash-register" label="เงินในลิ้นชัก" value={money(drawerCash, currency)} sub="คาดว่าควรมี" />
            </div>

            {/* products region */}
            <div className="flex flex-1 gap-3 overflow-hidden">
              {/* category rail */}
              <div className="flex w-48 shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200/70">
                <div className="flex-1 overflow-auto p-2">
                  <CatRow active={catId == null} icon="fa-store" name={th.cAll} count={activeProducts.length} onClick={() => setCatId(null)} highlight />
                  {categories.map((c) => (
                    <CatRow key={c.id} active={catId === c.id} icon="fa-box" name={c.name} count={c._count?.products ?? 0} onClick={() => setCatId(c.id)} />
                  ))}
                </div>
                <button className="m-2 rounded-xl bg-slate-50 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100" onClick={() => toast.info(th.comingSoon)}><i className="fa-solid fa-gear mr-1" /> {th.manageCategories}</button>
              </div>

              {/* products */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* filter row */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <select className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-2 text-sm font-bold text-white shadow-glow" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                    <option value="best">{th.fBestSeller} ▾</option>
                    <option value="priceAsc">ราคา น้อย→มาก</option>
                    <option value="priceDesc">ราคา มาก→น้อย</option>
                  </select>
                  <div className="flex overflow-hidden rounded-xl bg-white p-0.5 text-sm ring-1 ring-slate-200">
                    {(['RETAIL', 'WHOLESALE'] as const).map((m) => (
                      <button key={m} disabled={memberWholesale} onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${mode === m ? 'bg-brand-600 text-white' : 'text-slate-500'}`}>
                        {m === 'RETAIL' ? th.retail : th.wholesale}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto text-xs text-slate-400">{filtered.length} {th.cProduct}</div>
                </div>

                {/* grid */}
                <div className="flex-1 overflow-auto pr-1">
                  {pageItems.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-slate-400">{th.noProducts}</div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                      {pageItems.map((p) => <ProductCard key={p.id} p={p} price={unitPriceOf(p, mode === 'WHOLESALE' ? p.wholesaleMinQty : 1)} currency={currency} best={favIds.has(p.id)} onClick={() => addProduct(p)} />)}
                    </div>
                  )}
                </div>

                {/* pagination */}
                <div className="mt-3 flex items-center justify-center gap-1 text-sm">
                  <PageBtn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</PageBtn>
                  {Array.from({ length: totalPages }).slice(0, 6).map((_, i) => (
                    <PageBtn key={i} active={page === i + 1} onClick={() => setPage(i + 1)}>{i + 1}</PageBtn>
                  ))}
                  <PageBtn disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</PageBtn>
                  <span className="ml-3 text-xs text-slate-400">{th.show} {PAGE_SIZE} {th.perPage}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cart panel */}
          <div className="flex w-[400px] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
            {/* tabs */}
            <div className="flex gap-2 px-4 pt-3">
              {(['bill', 'customer'] as const).map((t) => (
                <button key={t} onClick={() => setCartTab(t)} className={`flex-1 rounded-t-xl py-2 text-sm font-bold ${cartTab === t ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t === 'bill' ? `${th.currentBill} (${lines.length})` : th.customerInfo}
                </button>
              ))}
            </div>

            {/* customer card */}
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">{member ? member.name.charAt(0) : <i className="fa-solid fa-user" />}</div>
                  <div className="leading-tight">
                    <div className="text-sm font-bold text-ink-900">{member ? member.name : th.generalCustomer}</div>
                    <div className="text-[11px] text-slate-400">{member ? `${member.phone} · ${th.memberPrice}` : th.posTitle}</div>
                  </div>
                </div>
                <button className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50" onClick={() => setPickMember(true)}><i className="fa-solid fa-pen mr-1" /> {th.changeCustomer}</button>
              </div>
            </div>

            {/* items / customer info */}
            <div className="flex-1 overflow-auto px-2">
              {cartTab === 'customer' ? (
                <CustomerInfoPanel member={member} memberWholesale={memberWholesale} onPick={() => setPickMember(true)} onClear={() => setMember(null)} />
              ) : lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                  <i className="fa-solid fa-basket-shopping text-4xl text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-500">{th.emptyBill}</p>
                  <p className="text-xs">{th.scanToStart}</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-2 text-left">{th.cProduct}</th>
                      <th className="px-1 py-2 text-center">{th.cQty}</th>
                      <th className="px-1 py-2 text-right">{th.cPrice}</th>
                      <th className="px-2 py-2 text-right">{th.cSum}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const price = unitPriceOf(l.product, l.qty);
                      return (
                        <tr key={l.product.id} className="border-t border-slate-100">
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <ProductImage src={l.product.imageUrl} name={l.product.name} className="h-8 w-8 shrink-0 rounded-lg" />
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-semibold leading-tight">{l.product.name}</div>
                                <div className="text-[10px] text-slate-400">{l.product.barcode || l.product.sku}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-1 py-2">
                            <div className="mx-auto flex w-[74px] items-center justify-between rounded-lg ring-1 ring-slate-200">
                              <button className="px-1.5 text-base text-slate-500" onClick={() => setQty(l.product.id, l.qty - 1)}>−</button>
                              <input className="w-7 bg-transparent text-center text-[13px] font-semibold outline-none" value={l.qty} onChange={(e) => setQty(l.product.id, parseInt(e.target.value) || 0)} />
                              <button className="px-1.5 text-base text-slate-500" onClick={() => setQty(l.product.id, l.qty + 1)}>+</button>
                            </div>
                          </td>
                          <td className="px-1 py-2 text-right text-[13px]">{num(price).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-[13px] font-bold">{(price * l.qty).toFixed(2)}</td>
                          <td className="pr-1 text-right"><button className="text-slate-300 hover:text-rose-500" onClick={() => setQty(l.product.id, 0)}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* discount + totals + payment (bill tab only) */}
            {cartTab === 'bill' && (
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><i className="fa-solid fa-tag text-brand-500" /> {th.discountCoupon}</span>
                {showDiscount ? (
                  <input type="number" autoFocus className="w-28 rounded-lg bg-slate-50 px-2 py-1 text-right text-sm ring-1 ring-slate-200 outline-none focus:ring-brand-500" value={discount || ''} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} onBlur={() => setShowDiscount(false)} placeholder="0.00" />
                ) : (
                  <button className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50" onClick={() => setShowDiscount(true)}>+ {th.add}</button>
                )}
              </div>

              <div className="space-y-1 text-[13px]">
                <div className="flex justify-between text-slate-500"><span>{th.subtotalItems}</span><span className="font-semibold text-ink-800">{totals.subtotal.toFixed(2)}</span></div>
                {totals.manualDisc > 0 && <div className="flex justify-between text-rose-500"><span>{th.billDiscount}</span><span>-{totals.manualDisc.toFixed(2)}</span></div>}
                {totals.promoDisc > 0 && (
                  <div className="flex justify-between text-rose-500">
                    <span className="flex items-center gap-1"><i className="fa-solid fa-tag mr-1" /> {th.aPromotion}{promo.applied.length ? ` · ${promo.applied[0].name}${promo.applied.length > 1 ? ` +${promo.applied.length - 1}` : ''}` : ''}</span>
                    <span>-{totals.promoDisc.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400"><span>{th.vatLabel} {vatPct}%</span><span>{totals.tax.toFixed(2)}</span></div>
              </div>

              <div className="mt-2 flex items-end justify-between border-t border-dashed border-slate-200 pt-2">
                <span className="text-sm font-bold text-slate-600">{th.netTotal}</span>
                <span className="text-3xl font-extrabold text-brand-700">{money(totals.net, currency)}</span>
              </div>

              {/* received / change */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                  <span className="text-xs font-semibold text-slate-500">{th.received}</span>
                  <input type="number" disabled={payKey !== 'CASH'} className="w-20 bg-transparent text-right font-bold outline-none disabled:opacity-40" value={cashReceived || ''} onChange={(e) => setCashReceived(Number(e.target.value))} placeholder="0.00" />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                  <span className="text-xs font-semibold text-slate-500">{th.change}</span>
                  <span className="font-bold text-emerald-600">{change.toFixed(2)}</span>
                </div>
              </div>

              {/* payment methods */}
              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {PAYMENTS.map((pm) => (
                  <button key={pm.key} onClick={() => setPayKey(pm.key)} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ring-1 transition ${payKey === pm.key ? `${pm.cls} ring-2` : 'bg-slate-50 text-slate-500 ring-slate-200'}`}>
                    <i className={`fa-solid ${pm.icon} text-base`} />{pm.label}
                  </button>
                ))}
              </div>

              <button className="btn-primary mt-3 w-full py-3.5 text-base" disabled={lines.length === 0} onClick={onPay}>
                <i className="fa-solid fa-money-check-dollar mr-1.5" />{th.pay} (F9)
              </button>

              {held.length > 0 && (
                <button onClick={() => setShowHeld(true)} className="mt-2 w-full rounded-xl bg-amber-50 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100">
                  <i className="fa-solid fa-clipboard-list mr-1.5" />มีบิลพักไว้ {held.length} บิล — แตะเพื่อเปิด
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* modals */}
      {showHeld && <HeldBillsModal held={held} products={products} currency={currency} onResume={resumeHeld} onDelete={async (id) => { await api(`/held-bills/${id}`, { method: 'DELETE' }).catch(() => {}); loadHeld(); }} onClose={() => setShowHeld(false)} />}
      {priceCheck && (
        <PriceCheckModal
          product={priceProduct}
          currency={currency}
          memberGetsWholesale={!!setting?.memberGetsWholesale}
          onLookup={async (code) => { const p = await resolveProduct(code); if (p) setPriceProduct(p); else toast.error(th.notFound(code)); }}
          onClose={() => { setPriceCheck(false); setPriceProduct(null); }}
        />
      )}
      {showCam && <Suspense fallback={null}><CameraScanner onScan={(c) => { setShowCam(false); handleScan(c); }} onClose={() => setShowCam(false)} /></Suspense>}
      {pickMember && <MemberPicker onPick={(m) => { setMember(m); setPickMember(false); }} onClose={() => setPickMember(false)} />}
      {showPromo && (
        <PromoDialog
          applied={promo.applied}
          coupon={coupon}
          onCoupon={setCoupon}
          totalOff={totals.promoDisc}
          currency={currency}
          onClose={() => setShowPromo(false)}
        />
      )}
      {transfer && (
        <TransferModal
          amount={totals.net}
          currency={currency}
          onQR={(qr) => publisher.current?.publish({ ...baseDisplay(), status: 'PAYMENT', paymentMethod: 'TRANSFER', qrPayload: qr, promptPayId: setting?.promptPayId })}
          onConfirm={() => completeSale('TRANSFER', payKey === 'QR' ? 'QR PromptPay' : 'โอนเงิน')}
          onCancel={() => { setTransfer(false); publisher.current?.publish({ ...baseDisplay(), status: totals.count ? 'CART' : 'IDLE' }); }}
        />
      )}
      {closing && <CloseShiftModal onClose={() => { setClosing(false); refreshShift(); }} />}
      {lastSale && (
        <ReceiptModal
          sale={lastSale}
          setting={setting}
          currency={currency}
          autoPrint={autoPrint}
          onToggleAuto={(v) => { setAutoPrint(v); localStorage.setItem('pos_autoprint', v ? '1' : '0'); }}
          onPrint={() => doPrint(lastSale)}
          onClose={() => { setLastSale(null); publisher.current?.publish({ ...baseDisplay(), status: 'IDLE', items: [], count: 0, subtotal: 0, tax: 0, total: 0 }); }}
        />
      )}
      {printSale && <ReceiptPrint sale={printSale} setting={setting} onDone={() => setPrintSale(null)} />}
    </div>
  );
}

/* ---------------- sub-components ---------------- */

function CustomerInfoPanel({ member, memberWholesale, onPick, onClear }: { member: Member | null; memberWholesale: boolean; onPick: () => void; onClear: () => void }) {
  if (!member) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-slate-400">
        <i className="fa-solid fa-user text-4xl text-slate-300" />
        <p className="mt-2 text-sm font-semibold text-slate-500">{th.generalCustomer}</p>
        <p className="mb-3 text-xs">ยังไม่ได้เลือกสมาชิก</p>
        <button className="btn-primary" onClick={onPick}>+ {th.selectMember}</button>
      </div>
    );
  }
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between border-b border-slate-100 py-2 text-sm"><span className="text-slate-400">{label}</span><span className="font-semibold text-ink-900">{value || '—'}</span></div>
  );
  return (
    <div className="p-2">
      <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-200">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white">{member.name.charAt(0)}</div>
        <div><div className="text-base font-bold text-brand-900">{member.name}</div><div className="text-xs text-brand-600">{member.phone}</div></div>
      </div>
      <div className="mt-3 px-1">
        <Row label="รหัสสมาชิก" value={member.code || '—'} />
        <Row label="เบอร์โทร" value={member.phone} />
        <Row label="อีเมล" value={member.email} />
        <Row label="หมายเหตุ" value={member.note} />
        <Row label="สิทธิ์ราคา" value={memberWholesale ? th.memberPrice : th.retail} />
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn-ghost flex-1" onClick={onPick}><i className="fa-solid fa-pen mr-1" /> {th.changeCustomer}</button>
        <button className="btn-danger flex-1" onClick={onClear}>{th.remove}</button>
      </div>
    </div>
  );
}

function HeldBillsModal({ held, products, currency, onResume, onDelete, onClose }: { held: HeldBill[]; products: Product[]; currency: string; onResume: (b: HeldBill) => void; onDelete: (id: number) => void; onClose: () => void }) {
  const estimate = (b: HeldBill) => b.items.reduce((s, it) => { const p = products.find((x) => x.id === it.productId); return s + (p ? num(p.retailPrice) * it.qty : 0); }, 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold"><i className="fa-solid fa-clipboard-list mr-2" />บิลที่พักไว้ ({held.length})</h3><button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button></div>
        {held.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">ไม่มีบิลที่พักไว้</div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {held.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-lg text-amber-600"><i className="fa-solid fa-receipt" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{b.member?.name || th.generalCustomer} · {b.items.reduce((s, i) => s + i.qty, 0)} ชิ้น</div>
                  <div className="text-xs text-slate-400">{new Date(b.createdAt).toLocaleString('th-TH')} · ~{money(estimate(b), currency)}</div>
                </div>
                <button className="btn-primary" onClick={() => onResume(b)}>เปิดบิล</button>
                <button className="text-slate-300 hover:text-rose-500" onClick={() => onDelete(b.id)} title="ลบ">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PriceCheckModal({ product, currency, memberGetsWholesale, onLookup, onClose }: { product: Product | null; currency: string; memberGetsWholesale: boolean; onLookup: (code: string) => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold"><i className="fa-solid fa-tags mr-2 text-brand-600" />เช็คราคาสินค้า</h3>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
          <i className="fa-solid fa-barcode text-slate-400" />
          <input
            data-scan="true"
            autoFocus
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            placeholder="สแกนหรือพิมพ์บาร์โค้ด / SKU"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) { onLookup(code.trim()); setCode(''); } }}
          />
        </div>

        {product ? (
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <ProductImage src={product.imageUrl} name={product.name} className="h-16 w-16 rounded-xl ring-1 ring-slate-200" />
              <div>
                <div className="font-bold text-ink-900">{product.name}</div>
                <div className="text-xs text-slate-400">{product.barcode || product.sku} · {th.stock} {product.stockQty} {product.unit}</div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                <span className="text-sm text-slate-500">ราคาปกติ</span>
                <span className="text-xl font-extrabold text-ink-900">{money(product.retailPrice, currency)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
                <span className="text-sm font-semibold text-brand-700">{memberGetsWholesale ? 'ราคาสมาชิก / ส่ง' : 'ราคาส่ง'}</span>
                <span className="text-xl font-extrabold text-brand-700">{money(product.wholesalePrice, currency)} <span className="text-xs font-normal text-brand-500">≥{product.wholesaleMinQty}</span></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 mb-2 text-center text-sm text-slate-400"><i className="fa-solid fa-barcode mb-2 block text-3xl text-slate-300" />สแกนสินค้าเพื่อดูราคา</div>
        )}

        <button className="btn-ghost mt-5 w-full" onClick={onClose}>เสร็จสิ้น</button>
      </div>
    </div>
  );
}

function NowClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const date = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return (<><div className="font-semibold">{date}</div><div>{time} น.</div></>);
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  return <button title={title} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-base text-white ring-1 ring-white/20 transition hover:bg-white/20">{children}</button>;
}

const TONES: Record<string, string> = {
  brand: 'text-brand-700', rose: 'text-rose-600', amber: 'text-amber-600', sky: 'text-sky-600', violet: 'text-violet-600', slate: 'text-slate-500',
};
function ActionBtn({ icon, label, k, tone, onClick }: { icon: string; label: string; k?: string; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 transition hover:bg-slate-50">
      <i className={`fa-solid ${icon} w-4 text-center text-base ${TONES[tone]}`} />
      <span className="text-left leading-tight">
        <span className="block text-[13px] font-bold text-ink-800">{label}</span>
        {k && <span className="block text-[10px] font-semibold text-slate-400">{k}</span>}
      </span>
    </button>
  );
}

const KPI_TONE: Record<string, string> = {
  violet: 'bg-gradient-to-br from-violet-500 to-violet-600 text-white',
  emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white',
  orange: 'bg-gradient-to-br from-orange-400 to-orange-500 text-white',
  blue: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white',
  rose: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white',
  amber: 'bg-gradient-to-br from-amber-400 to-amber-500 text-white',
};
const KPI_BAR: Record<string, string> = {
  violet: 'bg-violet-500', emerald: 'bg-emerald-500', orange: 'bg-orange-400', blue: 'bg-blue-500', rose: 'bg-rose-500', amber: 'bg-amber-400',
};
function Kpi({ tone, icon, label, value, sub }: { tone: string; icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/90 p-4 shadow-card ring-1 ring-slate-200/70 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-pop">
      <span className={`absolute inset-y-3 left-0 w-1 rounded-full ${KPI_BAR[tone]}`} />
      <div className="flex items-start justify-between pl-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
          <div className="mt-1 truncate text-2xl font-extrabold tracking-tight text-ink-900">{value}</div>
          {sub && <div className="mt-0.5 truncate text-[11px] text-slate-400">{sub}</div>}
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base ${KPI_TONE[tone]}`}><i className={`fa-solid ${icon}`} /></span>
      </div>
    </div>
  );
}

function CatRow({ active, icon, name, count, onClick, highlight }: { active: boolean; icon: string; name: string; count: number; onClick: () => void; highlight?: boolean }) {
  return (
    <button onClick={onClick} className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${active ? (highlight ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-glow' : 'bg-brand-50 font-semibold text-brand-700') : 'text-slate-600 hover:bg-slate-50'}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs ${active ? 'bg-white/20' : 'bg-slate-100'}`}><i className={`fa-solid ${icon}`} /></span>
      <span className="flex-1 truncate font-medium">{name}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
    </button>
  );
}

function ProductCard({ p, price, currency, best, onClick }: { p: Product; price: number; currency: string; best: boolean; onClick: () => void }) {
  const out = p.stockQty <= 0;
  const low = !out && p.stockQty <= p.reorderLevel;
  const badge = out ? { t: th.bOut, c: 'bg-rose-500 text-white' } : low ? { t: th.bLow, c: 'bg-orange-400 text-white' } : best ? { t: th.bBestSeller, c: 'bg-emerald-500 text-white' } : null;
  return (
    <button disabled={out} onClick={onClick} className="group flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-card ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-pop hover:ring-brand-300 disabled:opacity-50">
      <div className="relative aspect-square w-full overflow-hidden bg-slate-50 p-2">
        <ProductImage src={p.imageUrl} name={p.name} className="h-full w-full rounded-md transition group-hover:scale-105" />
        {badge && <span className={`absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.c}`}>{badge.t}</span>}
      </div>
      <div className="flex flex-1 flex-col px-2 pb-2">
        <div className="truncate text-[9px] text-slate-400">{p.barcode || p.sku}</div>
        <div className="line-clamp-1 text-[12px] font-semibold leading-tight text-ink-900">{p.name}</div>
        <div className="mt-0.5 flex items-end justify-between">
          <span className="text-[15px] font-extrabold text-ink-900">{num(price).toFixed(2)}</span>
          <span className="text-[10px] text-slate-400">{th.stock} {p.stockQty}</span>
        </div>
      </div>
    </button>
  );
}

function PageBtn({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button disabled={disabled} onClick={onClick} className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm font-semibold transition disabled:opacity-30 ${active ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{children}</button>;
}

function TransferModal({ amount, currency, onQR, onConfirm, onCancel }: { amount: number; currency: string; onQR: (qr: string) => void; onConfirm: () => void; onCancel: () => void }) {
  const [qr, setQr] = useState('');
  const onQRRef = useRef(onQR);
  onQRRef.current = onQR;
  useEffect(() => {
    api<{ payload: string }>('/settings/promptpay', { query: { amount: amount.toFixed(2) } })
      .then((r) => { setQr(r.payload); onQRRef.current(r.payload); })
      .catch(() => setQr(''));
  }, [amount]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-center gap-2 text-sm font-bold text-[#0a3c8c]"><span className="rounded bg-[#0a3c8c] px-1.5 py-0.5 text-xs text-white">PromptPay</span> {th.thaiQR}</div>
        {qr ? <div className="mx-auto mt-3 w-fit rounded-2xl bg-white p-3 ring-1 ring-slate-200"><QRCanvas value={qr} size={220} /></div> : <div className="py-16 text-slate-400">{th.generatingQR}</div>}
        <div className="mt-3 text-slate-500">{th.amount}</div>
        <div className="text-2xl font-extrabold">{money(amount, currency)}</div>
        <p className="mt-2 animate-pulse text-xs text-slate-400">{th.pleaseScan}</p>
        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel}>{th.cancel}</button>
          <button className="btn-primary flex-1" onClick={onConfirm}>{th.confirmPayment}</button>
        </div>
      </div>
    </div>
  );
}

function PromoDialog({ applied, coupon, onCoupon, totalOff, currency, onClose }: { applied: { id: number; name: string; amount: number }[]; coupon: string; onCoupon: (c: string) => void; totalOff: number; currency: string; onClose: () => void }) {
  const [code, setCode] = useState(coupon);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold"><i className="fa-solid fa-tag mr-1" /> {th.aPromotion}</h3>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        <label className="label">คูปองส่วนลด</label>
        <div className="flex gap-2">
          <input className="input font-mono uppercase" placeholder="เช่น SAVE50" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onCoupon(code.trim())} />
          <button className="btn-primary" onClick={() => onCoupon(code.trim())}>{th.add}</button>
          {coupon && <button className="btn-ghost" onClick={() => { setCode(''); onCoupon(''); }}>{th.remove}</button>}
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">โปรโมชั่นที่ใช้กับบิลนี้</div>
          {applied.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">ยังไม่มีโปรโมชั่นที่เข้าเงื่อนไข</div>
          ) : (
            <div className="space-y-2">
              {applied.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
                  <span className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><i className="fa-solid fa-check" /> {a.name}</span>
                  <span className="text-sm font-bold text-emerald-700">-{money(a.amount, currency)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-sm font-bold">
                <span>รวมส่วนลดโปรโมชั่น</span><span className="text-rose-600">-{money(totalOff, currency)}</span>
              </div>
            </div>
          )}
        </div>

        <button className="btn-primary mt-5 w-full" onClick={onClose}>เสร็จสิ้น</button>
      </div>
    </div>
  );
}

function ReceiptModal({ sale, setting, currency, autoPrint, onToggleAuto, onPrint, onClose }: { sale: Sale; setting: Setting | null; currency: string; autoPrint: boolean; onToggleAuto: (v: boolean) => void; onPrint: () => void; onClose: () => void }) {
  const labels: Record<string, string> = { CASH: th.pmCash, TRANSFER: th.pmTransfer, CARD: th.pmCard, CREDIT: th.pmCredit };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-600"><i className="fa-solid fa-check" /></div>
          <h3 className="mt-3 text-lg font-bold">{th.paymentComplete}</h3>
          <p className="text-sm text-slate-500">{sale.orderNo} • {labels[sale.paymentMethod] ?? sale.paymentMethod}</p>
          {sale.member && <p className="text-xs text-brand-600"><i className="fa-solid fa-user mr-1" /> {sale.member.name}</p>}
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
          {sale.items.map((i) => (<div key={i.id} className="flex justify-between py-0.5"><span>{i.qty}× {i.nameSnapshot}</span><span>{money(i.lineTotal, currency)}</span></div>))}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold"><span>{th.netTotal}</span><span>{money(sale.total, currency)}</span></div>
          {sale.paymentMethod === 'CASH' && (
            <>
              <div className="flex justify-between text-slate-500"><span>{th.received}</span><span>{money(sale.cashReceived, currency)}</span></div>
              <div className="flex justify-between font-semibold text-emerald-700"><span>{th.change}</span><span>{money(sale.changeDue, currency)}</span></div>
            </>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">{setting?.receiptFooter}</p>
        <label className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={autoPrint} onChange={(e) => onToggleAuto(e.target.checked)} />
          พิมพ์ใบเสร็จอัตโนมัติ
        </label>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onPrint}><i className="fa-solid fa-print mr-1.5" />พิมพ์ใบเสร็จ</button>
          <button className="btn-primary flex-1" onClick={onClose}>{th.newOrder}</button>
        </div>
      </div>
    </div>
  );
}
