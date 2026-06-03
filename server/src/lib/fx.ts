// Foreign-currency cash tender (first slice of multi-currency). The shop configures a
// secondary currency + rate (`Setting.secondaryCurrency`/`secondaryRate`, "THB per 1 unit").
// A cashier can take cash in that currency; the server converts to the base currency (THB)
// here — authoritatively, using the stored rate, never a client-supplied one. Pure + tested.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Convert a foreign-currency amount to base (THB): foreign × rate. */
export function baseFromForeign(foreignAmount: number, rate: number): number {
  return round2(foreignAmount * rate);
}

/** Convert a base (THB) amount to the foreign currency: base ÷ rate (e.g. change display). */
export function foreignFromBase(baseAmount: number, rate: number): number {
  return rate > 0 ? round2(baseAmount / rate) : 0;
}

/** A short human note recorded on the cash payment / receipt, e.g. "20.00 USD @ 35.0000". */
export function fxNote(foreignAmount: number, currency: string, rate: number): string {
  return `${round2(foreignAmount).toFixed(2)} ${currency} @ ${rate}`;
}
