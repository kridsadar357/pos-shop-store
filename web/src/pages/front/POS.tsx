import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useShift } from '../../store/shift';
import { useScanner } from '../../hooks/useScanner';
import { CameraScanner } from '../../components/CameraScanner';
import { ProductImage } from '../../components/ProductImage';
import { QRCanvas } from '../../components/QRCode';
import { ReceiptPrint } from '../../components/ReceiptPrint';
import { ShiftGate, CloseShiftModal } from './ShiftModals';
import { MemberPicker } from './MemberWidget';
import { PosSidebar } from './PosSidebar';
import { toast } from '../../components/Toast';
import { money, num } from '../../lib/format';
import { th } from '../../lib/th';
import { createPublisher, type DisplayState } from '../../lib/display';
import type { Category, Member, Product, Sale, Setting } from '../../types';

interface Line { product: Product; qty: number; }
type PayKey = 'CASH' | 'TRANSFER' | 'CARD' | 'QR' | 'CREDIT';

const PAGE_SIZE = 18;

const PAYMENTS: { key: PayKey; label: string; icon: string; cls: string }[] = [
  { key: 'CASH', label: th.pmCash, icon: '💵', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { key: 'TRANSFER', label: th.pmTransfer, icon: '🏦', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  { key: 'CARD', label: th.pmCard, icon: '💳', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  { key: 'QR', label: th.pmQR, icon: '▦', cls: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  { key: 'CREDIT', label: th.pmCredit, icon: '🪙', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
];

interface Stats {
  today: { revenue: number; orders: number; grossProfit: number; marginPct: number; avgOrder: number; customers: number };
  month: { revenue: number; deltaPct: number | null };
}

export default function POS() {
  const { user } = useAuth();
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

  const [showCam, setShowCam] = useState(false);
  const [pickMember, setPickMember] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [closing, setClosing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [autoPrint, setAutoPrint] = useState(localStorage.getItem('pos_autoprint') === '1');
  const [holds, setHolds] = useState<{ lines: Line[]; member: Member | null; discount: number }[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const publisher = useRef<ReturnType<typeof createPublisher> | null>(null);

  function reload() {
    api<Product[]>('/products').then(setProducts).catch(() => {});
    api<Stats>('/sales/stats').then(setStats).catch(() => {});
    api<Product[]>('/products/favorites', { query: { limit: 8 } })
      .then((f) => setFavIds(new Set(f.map((p) => p.id))))
      .catch(() => {});
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

  async function handleScan(code: string) {
    const local = activeProducts.find((p) => p.barcode === code || p.sku === code);
    if (local) return addProduct(local);
    try {
      addProduct(await api<Product>('/products/lookup', { query: { code } }));
    } catch {
      toast.error(th.notFound(code));
    }
  }
  useScanner(handleScan);

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
          paymentRef: ref, memberId: member?.id ?? null,
          items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        },
      });
      publisher.current?.publish({ ...baseDisplay(), status: 'PAID', orderNo: sale.orderNo, paymentMethod: method === 'CASH' ? 'CASH' : 'TRANSFER', change: num(sale.changeDue), cashReceived: num(sale.cashReceived) });
      setLastSale(sale);
      if (autoPrint) setPrintSale(sale);
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

  function holdBill() {
    if (!lines.length) return;
    setHolds((h) => [...h, { lines, member, discount }]);
    clearCart();
    toast.success(`${th.held} (${holds.length + 1})`);
  }
  function resumeHold(i: number) {
    const h = holds[i];
    setLines(h.lines); setMember(h.member); setDiscount(h.discount);
    setHolds((arr) => arr.filter((_, idx) => idx !== i));
  }

  // F-key shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F3') { e.preventDefault(); setPickMember(true); }
      else if (e.key === 'F4') { e.preventDefault(); setShowPromo(true); }
      else if (e.key === 'F6') { e.preventDefault(); holdBill(); }
      else if (e.key === 'F9') { e.preventDefault(); onPay(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  if (!shift) return <ShiftGate />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <PosSidebar branch={setting?.storeName} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-lg text-slate-400">☰</span>
            <h1 className="text-lg font-extrabold text-ink-900">{th.posTitle}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {th.online}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight text-slate-500">
              <NowClock />
            </div>
            <div className="flex items-center gap-1.5">
              <IconBtn title={th.customerDisplay} onClick={() => window.open('/display', 'pos-customer-display', 'width=1100,height=720')}>🖥️</IconBtn>
              <IconBtn title="แจ้งเตือน"><span className="relative">🔔<span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-rose-500 text-[8px] font-bold leading-[14px] text-white">{holds.length || ''}</span></span></IconBtn>
              <IconBtn title="พิมพ์ใบเสร็จล่าสุด" onClick={() => lastSale ? setPrintSale(lastSale) : toast.info(th.noHeld)}>🖨️</IconBtn>
              <IconBtn title="ออนไลน์">📶</IconBtn>
              <IconBtn title="เต็มจอ" onClick={toggleFullscreen}>⛶</IconBtn>
            </div>
          </div>
        </header>

        {/* Search + actions */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
            <span className="text-slate-400">🔍</span>
            <input ref={searchRef} data-scan="true" className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder={th.searchFull} value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="kbd">F2</span>
            <button className="grid h-8 w-8 place-items-center rounded-lg bg-white ring-1 ring-slate-200" title={th.camera} onClick={() => setShowCam(true)}>▥</button>
          </div>
          <ActionBtn icon="👤" label={th.aCustomer} k="F3" tone="brand" onClick={() => setPickMember(true)} />
          <ActionBtn icon="🏷️" label={th.aPromotion} k="F4" tone="rose" onClick={() => setShowPromo(true)} />
          <ActionBtn icon="🧮" label={th.aDiscount} k="F5" tone="amber" onClick={() => { setCartTab('bill'); setShowDiscount(true); }} />
          <ActionBtn icon="📥" label={th.aHold} k="F6" tone="sky" onClick={holdBill} />
          <ActionBtn icon="🧾" label={th.aLastBill} k="F7" tone="violet" onClick={() => lastSale ? setLastSale({ ...lastSale }) : toast.info(th.noHeld)} />
          <div className="relative">
            <ActionBtn icon="•••" label={th.aMore} tone="slate" onClick={() => setMoreOpen((v) => !v)} />
            {moreOpen && (
              <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-pop ring-1 ring-slate-200" onMouseLeave={() => setMoreOpen(false)}>
                <button className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMoreOpen(false); setClosing(true); }}>🕒 {th.closeShift}</button>
                <button className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMoreOpen(false); window.open('/display', 'pos-customer-display', 'width=1100,height=720'); }}>🖥️ {th.customerDisplay}</button>
              </div>
            )}
          </div>
        </div>

        {/* Body: left (KPIs + products) | right (cart) */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            {/* KPI cards */}
            <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi tone="violet" icon="🛒" label={th.kSalesToday} value={money(stats?.today.revenue ?? 0, currency)} sub={`${stats?.today.orders ?? 0} ${th.kBills}`} />
              <Kpi tone="emerald" icon="📈" label={th.kSalesMonth} value={money(stats?.month.revenue ?? 0, currency)} sub={stats?.month.deltaPct != null ? `+${stats.month.deltaPct}% ${th.kFromLastMonth}` : ''} subGreen />
              <Kpi tone="orange" icon="💹" label={th.kProfitToday} value={money(stats?.today.grossProfit ?? 0, currency)} sub={`${stats?.today.marginPct ?? 0}%`} subGreen />
              <Kpi tone="blue" icon="👥" label={th.kCustomersToday} value={`${stats?.today.customers ?? 0} ราย`} sub={`${th.kAvgPurchase} ${money(stats?.today.avgOrder ?? 0, currency)}`} />
            </div>

            {/* products region */}
            <div className="flex flex-1 gap-3 overflow-hidden">
              {/* category rail */}
              <div className="flex w-48 shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200/70">
                <div className="flex-1 overflow-auto p-2">
                  <CatRow active={catId == null} icon="🛒" name={th.cAll} count={activeProducts.length} onClick={() => setCatId(null)} highlight />
                  {categories.map((c) => (
                    <CatRow key={c.id} active={catId === c.id} icon="📦" name={c.name} count={c._count?.products ?? 0} onClick={() => setCatId(c.id)} />
                  ))}
                </div>
                <button className="m-2 rounded-xl bg-slate-50 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100" onClick={() => toast.info(th.comingSoon)}>⚙ {th.manageCategories}</button>
              </div>

              {/* products */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* filter row */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <select className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white" value={sort} onChange={(e) => setSort(e.target.value as any)}>
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
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
                <button key={t} onClick={() => setCartTab(t)} className={`flex-1 rounded-t-xl py-2 text-sm font-bold ${cartTab === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t === 'bill' ? `${th.currentBill} (${lines.length})` : th.customerInfo}
                </button>
              ))}
            </div>

            {/* customer card */}
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">{member ? member.name.charAt(0) : '👤'}</div>
                  <div className="leading-tight">
                    <div className="text-sm font-bold text-ink-900">{member ? member.name : th.generalCustomer}</div>
                    <div className="text-[11px] text-slate-400">{member ? `${member.phone} · ${th.memberPrice}` : th.posTitle}</div>
                  </div>
                </div>
                <button className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50" onClick={() => setPickMember(true)}>✎ {th.changeCustomer}</button>
              </div>
            </div>

            {/* items */}
            <div className="flex-1 overflow-auto px-2">
              {lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                  <div className="text-4xl">🧺</div>
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

            {/* discount + totals + payment */}
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">🏷️ {th.discountCoupon}</span>
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
                    <span className="flex items-center gap-1">🏷️ {th.aPromotion}{promo.applied.length ? ` · ${promo.applied[0].name}${promo.applied.length > 1 ? ` +${promo.applied.length - 1}` : ''}` : ''}</span>
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
                    <span className="text-base">{pm.icon}</span>{pm.label}
                  </button>
                ))}
              </div>

              <button className="btn-primary mt-3 w-full py-3.5 text-base" disabled={lines.length === 0} onClick={onPay}>
                💳 {th.pay} (F9)
              </button>

              {holds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {holds.map((h, i) => (
                    <button key={i} onClick={() => resumeHold(i)} className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">📋 พัก #{i + 1} · {h.lines.reduce((s, l) => s + l.qty, 0)}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* modals */}
      {showCam && <CameraScanner onScan={(c) => { setShowCam(false); handleScan(c); }} onClose={() => setShowCam(false)} />}
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
          onPrint={() => setPrintSale(lastSale)}
          onClose={() => { setLastSale(null); publisher.current?.publish({ ...baseDisplay(), status: 'IDLE', items: [], count: 0, subtotal: 0, tax: 0, total: 0 }); }}
        />
      )}
      {printSale && <ReceiptPrint sale={printSale} setting={setting} onDone={() => setPrintSale(null)} />}
    </div>
  );
}

/* ---------------- sub-components ---------------- */

function NowClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const date = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return (<><div className="font-semibold text-ink-800">{date}</div><div>{time} น.</div></>);
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  return <button title={title} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-xl text-base text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">{children}</button>;
}

const TONES: Record<string, string> = {
  brand: 'text-brand-700', rose: 'text-rose-600', amber: 'text-amber-600', sky: 'text-sky-600', violet: 'text-violet-600', slate: 'text-slate-500',
};
function ActionBtn({ icon, label, k, tone, onClick }: { icon: string; label: string; k?: string; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 transition hover:bg-slate-50">
      <span className={`text-base ${TONES[tone]}`}>{icon}</span>
      <span className="text-left leading-tight">
        <span className="block text-[13px] font-bold text-ink-800">{label}</span>
        {k && <span className="block text-[10px] font-semibold text-slate-400">{k}</span>}
      </span>
    </button>
  );
}

const KPI_TONE: Record<string, string> = {
  violet: 'bg-violet-100 text-violet-600', emerald: 'bg-emerald-100 text-emerald-600', orange: 'bg-orange-100 text-orange-600', blue: 'bg-blue-100 text-blue-600',
};
function Kpi({ tone, icon, label, value, sub, subGreen }: { tone: string; icon: string; label: string; value: string; sub?: string; subGreen?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card ring-1 ring-slate-200/70">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg ${KPI_TONE[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold text-slate-400">{label}</div>
        <div className="text-lg font-extrabold tracking-tight text-ink-900">{value}</div>
        {sub && <div className={`truncate text-[11px] ${subGreen ? 'font-semibold text-emerald-600' : 'text-slate-400'}`}>{sub}</div>}
      </div>
    </div>
  );
}

function CatRow({ active, icon, name, count, onClick, highlight }: { active: boolean; icon: string; name: string; count: number; onClick: () => void; highlight?: boolean }) {
  return (
    <button onClick={onClick} className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${active ? (highlight ? 'bg-brand-600 text-white' : 'bg-brand-50 font-semibold text-brand-700') : 'text-slate-600 hover:bg-slate-50'}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm ${active ? 'bg-white/20' : 'bg-slate-100'}`}>{icon}</span>
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
    <button disabled={out} onClick={onClick} className="group flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-card ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-pop hover:ring-brand-300 disabled:opacity-50">
      <div className="relative aspect-square w-full overflow-hidden bg-slate-50 p-3">
        <ProductImage src={p.imageUrl} name={p.name} className="h-full w-full rounded-lg transition group-hover:scale-105" />
        {badge && <span className={`absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.c}`}>{badge.t}</span>}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3">
        <div className="text-[10px] text-slate-400">{p.barcode || p.sku}</div>
        <div className="line-clamp-1 text-[13px] font-semibold text-ink-900">{p.name}</div>
        <div className="mt-1 text-lg font-extrabold text-ink-900">{num(price).toFixed(2)}</div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>{th.stock} {p.stockQty}</span><span>⋯</span>
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
          <h3 className="text-lg font-bold">🏷️ {th.aPromotion}</h3>
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
                  <span className="flex items-center gap-2 text-sm font-semibold text-emerald-800">✓ {a.name}</span>
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
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-600">✓</div>
          <h3 className="mt-3 text-lg font-bold">{th.paymentComplete}</h3>
          <p className="text-sm text-slate-500">{sale.orderNo} • {labels[sale.paymentMethod] ?? sale.paymentMethod}</p>
          {sale.member && <p className="text-xs text-brand-600">👤 {sale.member.name}</p>}
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
          <button className="btn-ghost flex-1" onClick={onPrint}>🖨️ พิมพ์ใบเสร็จ</button>
          <button className="btn-primary flex-1" onClick={onClose}>{th.newOrder}</button>
        </div>
      </div>
    </div>
  );
}
