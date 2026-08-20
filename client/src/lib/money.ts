// Currency formatting for the render boundary.
//
// Every money figure in the UI goes through here. The bug this replaces:
// `toLocaleString('en-NZ', { minimumFractionDigits: 2 })` sets only the MINIMUM,
// so Intl keeps up to 3 decimals and a raw float like 1756.5217 printed as
// "$1,756.522". Setting both bounds is the whole fix.

const NZD_2DP: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

/** "1,756.52" — always 2dp, thousands separated. No currency symbol. */
export function money(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (n == null || !Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-NZ', NZD_2DP);
}

/** "$1,756.52", with the minus sign outside the symbol: "-$12.00". */
export function currency(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (n == null || !Number.isFinite(n)) return '$0.00';
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-NZ', NZD_2DP)}`;
}

/** "$1,757" — whole dollars, for summary tiles where cents are noise. */
export function currencyWhole(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (n == null || !Number.isFinite(n)) return '$0';
  return `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-NZ')}`;
}
