// Pure helpers shared by the UI and the data layer. No I/O here, so they are
// easy to unit test (see test/utils.test.js).

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  KRW: '₩',
  BRL: 'R$',
  CAD: 'C$',
  AUD: 'A$',
  HKD: 'HK$',
  CHF: 'CHF ',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr '
};

export const CATEGORY_ORDER = ['crypto', 'stock', 'etf', 'fund'];

export const CATEGORY_META = {
  crypto: { label: 'CRYPTO', icon: '[C]', section: '-- CRYPTO --' },
  stock: { label: 'STOCK', icon: '[S]', section: '-- STOCKS --' },
  etf: { label: 'ETF', icon: '[E]', section: '-- ETFs --' },
  fund: { label: 'FUND', icon: '[F]', section: '-- FUNDS --' }
};

export function getCurrencySymbol(currency) {
  if (!currency) return '$';
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

/**
 * Format a price with the right currency symbol.
 * Yahoo Finance reports London Stock Exchange quotes in pence with the
 * pseudo-currency code "GBp": under £1 we show pence, otherwise pounds.
 */
export function formatPrice(price, currency = 'USD') {
  const value = Number(price);
  const valid = Number.isFinite(value) && value > 0;

  if (currency === 'GBp') {
    if (!valid) return '£0.00';
    return value >= 100 ? `£${(value / 100).toFixed(2)}` : `${value.toFixed(2)}p`;
  }

  const symbol = getCurrencySymbol(currency);
  if (!valid) return `${symbol}0.00`;
  if (value >= 1000) {
    return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (value >= 1) return `${symbol}${value.toFixed(2)}`;
  return `${symbol}${value.toFixed(4)}`;
}

export function formatChange(change) {
  const value = Number(change);
  if (!Number.isFinite(value)) return '+0.00%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(num) {
  const value = Number(num);
  if (!Number.isFinite(value) || value === 0) return 'N/A';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toLocaleString('en-US');
}

/**
 * Map the raw instrument type (CoinGecko or Yahoo's instrumentType) to one of
 * the dashboard categories. Unknown types fall back to "stock".
 */
export function getAssetCategory(asset) {
  const type = String(asset?.type ?? '').toUpperCase();
  if (type === 'CRYPTO') return 'crypto';
  if (type === 'ETF') return 'etf';
  if (type === 'MUTUALFUND' || type === 'FUND') return 'fund';
  return 'stock';
}

/**
 * Stable sort by category so that the navigation order matches the order the
 * watchlist is drawn in (crypto, then stocks, ETFs and funds). Within a
 * category the config order is preserved.
 */
export function sortByCategory(assets) {
  return assets
    .map((asset, index) => ({ asset, index, rank: CATEGORY_ORDER.indexOf(getAssetCategory(asset)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ asset }) => asset);
}

/**
 * Compute the first row to draw so that `selectedRow` stays visible in a list
 * that only has room for `visible` rows. When rows are hidden above or below,
 * the first or last visible slot is used for a "more" marker, so the selected
 * row must land strictly inside the remaining slots. Returns the new offset.
 */
export function scrollOffset(selectedRow, offset, visible, total) {
  if (total <= visible) return 0;
  const clamp = (n) => Math.max(0, Math.min(n, total - visible));
  let next = clamp(offset);
  const firstUsable = (o) => (o > 0 ? o + 1 : o);
  const lastUsable = (o) => (o + visible < total ? o + visible - 2 : o + visible - 1);

  // Reveal one extra row above (usually the section header) when moving up.
  if (selectedRow < firstUsable(next)) next = clamp(selectedRow - 1);
  if (selectedRow > lastUsable(next)) next = clamp(selectedRow - visible + 2);
  return next;
}
