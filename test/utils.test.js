import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatChange,
  formatNumber,
  formatPrice,
  getAssetCategory,
  scrollOffset,
  sortByCategory
} from '../src/utils.js';
import { yahooRange } from '../src/dataService.js';
import { resolveConfigPath, DEFAULT_CONFIG_FILE } from '../src/paths.js';

test('formatPrice picks decimals from magnitude', () => {
  assert.equal(formatPrice(87418), '$87,418.00');
  assert.equal(formatPrice(319.97), '$319.97');
  assert.equal(formatPrice(0.1234567), '$0.1235');
  assert.equal(formatPrice(0), '$0.00');
  assert.equal(formatPrice(NaN), '$0.00');
  assert.equal(formatPrice(undefined), '$0.00');
});

test('formatPrice handles currencies', () => {
  assert.equal(formatPrice(12.5, 'EUR'), '€12.50');
  assert.equal(formatPrice(12.5, 'GBP'), '£12.50');
  assert.equal(formatPrice(12.5, 'XYZ'), 'XYZ 12.50');
});

test('formatPrice shows LSE pence quotes as pounds or pence', () => {
  assert.equal(formatPrice(205.5, 'GBp'), '£2.06');
  assert.equal(formatPrice(99.9, 'GBp'), '99.90p');
  assert.equal(formatPrice(0, 'GBp'), '£0.00');
});

test('formatChange keeps the sign', () => {
  assert.equal(formatChange(1.234), '+1.23%');
  assert.equal(formatChange(-0.5), '-0.50%');
  assert.equal(formatChange(0), '+0.00%');
  assert.equal(formatChange(null), '+0.00%');
});

test('formatNumber abbreviates large values', () => {
  assert.equal(formatNumber(1.5e12), '1.50T');
  assert.equal(formatNumber(2.25e9), '2.25B');
  assert.equal(formatNumber(3e6), '3.00M');
  assert.equal(formatNumber(4500), '4.50K');
  assert.equal(formatNumber(42), '42');
  assert.equal(formatNumber(0), 'N/A');
});

test('getAssetCategory maps Yahoo and CoinGecko types', () => {
  assert.equal(getAssetCategory({ type: 'crypto' }), 'crypto');
  assert.equal(getAssetCategory({ type: 'EQUITY' }), 'stock');
  assert.equal(getAssetCategory({ type: 'ETF' }), 'etf');
  assert.equal(getAssetCategory({ type: 'etf' }), 'etf');
  assert.equal(getAssetCategory({ type: 'MUTUALFUND' }), 'fund');
  assert.equal(getAssetCategory({ type: 'INDEX' }), 'stock');
  assert.equal(getAssetCategory({}), 'stock');
});

test('sortByCategory groups assets in draw order and keeps config order inside a group', () => {
  const sorted = sortByCategory([
    { symbol: 'AAPL', type: 'EQUITY' },
    { symbol: 'SPY', type: 'ETF' },
    { symbol: 'BTC', type: 'crypto' },
    { symbol: 'FXAIX', type: 'MUTUALFUND' },
    { symbol: 'QSR', type: 'EQUITY' },
    { symbol: 'ETH', type: 'crypto' }
  ]);
  assert.deepEqual(
    sorted.map((a) => a.symbol),
    ['BTC', 'ETH', 'AAPL', 'QSR', 'SPY', 'FXAIX']
  );
});

test('scrollOffset keeps the selected row inside the viewport, clear of the markers', () => {
  assert.equal(scrollOffset(2, 0, 5, 4), 0, 'no scrolling when everything fits');
  assert.equal(scrollOffset(7, 0, 5, 20), 4, 'scrolls down: row 7 lands above the bottom marker');
  assert.equal(scrollOffset(1, 3, 5, 20), 0, 'scrolls back to the top so the header is shown too');
  assert.equal(scrollOffset(2, 4, 5, 20), 1, 'scrolls up: row 2 lands below the top marker');
  assert.equal(scrollOffset(4, 3, 5, 20), 3, 'unchanged when already visible');
  assert.equal(scrollOffset(19, 0, 5, 20), 15, 'never scrolls past the end');
  assert.equal(scrollOffset(19, 15, 5, 20), 15, 'last row is usable when nothing is hidden below');
});

test('yahooRange maps periods to Yahoo parameters', () => {
  assert.deepEqual(yahooRange(1), { range: '1d', interval: '1h' });
  assert.deepEqual(yahooRange(7), { range: '7d', interval: '1d' });
  assert.deepEqual(yahooRange(30), { range: '1mo', interval: '1d' });
  assert.deepEqual(yahooRange(90), { range: '3mo', interval: '1d' });
});

test('resolveConfigPath honours --config and falls back to the bundled file', () => {
  const cwd = '/nowhere';
  assert.deepEqual(resolveConfigPath(['--config', 'my.json'], cwd).source, 'cli');
  assert.ok(resolveConfigPath(['--config', 'my.json'], cwd).path.endsWith('my.json'));
  assert.deepEqual(resolveConfigPath(['--config=other.json'], cwd).source, 'cli');
  assert.deepEqual(resolveConfigPath(['-c', 'short.json'], cwd).source, 'cli');
  assert.throws(() => resolveConfigPath(['--config'], cwd), /requires a file path/);

  const fallback = resolveConfigPath([], cwd);
  assert.ok(['home', 'default'].includes(fallback.source));
  if (fallback.source === 'default') assert.equal(fallback.path, DEFAULT_CONFIG_FILE);
});
