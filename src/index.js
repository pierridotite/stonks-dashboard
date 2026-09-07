#!/usr/bin/env node
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { DataService } from './dataService.js';
import { DATA_DIR, initUserConfig, resolveConfigPath, USER_CONFIG_FILE } from './paths.js';
import {
  CATEGORY_META,
  formatChange,
  formatNumber,
  formatPrice,
  getAssetCategory,
  scrollOffset,
  sortByCategory
} from './utils.js';

const pkg = createRequire(import.meta.url)('../package.json');

const PERIODS = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 }
];

const USAGE = `stonks-dashboard ${pkg.version} - real-time market dashboard for the terminal

Usage: stonks-dashboard [options]

Options:
  -c, --config <path>  Use this config file
      --init           Create ${USER_CONFIG_FILE} from the bundled defaults
  -h, --help           Show this help
  -v, --version        Show the version

Config lookup order: --config, ./config.json, ~/.stonks-dashboard/config.json,
then the config bundled with the package. Cache and logs live in ${DATA_DIR}.

Keys: up/down or k/j navigate, home/end jump, 1-4 change period,
      r refresh, q or Esc quit.
`;

export function loadConfig(argv) {
  const { path: configPath, source } = resolveConfigPath(argv);
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Cannot read config ${configPath}: ${error.message}`);
  }
  if (!Array.isArray(config.tickers) || config.tickers.length === 0) {
    throw new Error(`Config ${configPath} must contain a non-empty "tickers" array`);
  }
  return {
    tickers: config.tickers.map((t) => String(t).toUpperCase()),
    cryptoIds: config.cryptoIds ?? {},
    updateInterval: Math.max(10000, Number(config.updateInterval) || 120000),
    configPath,
    source
  };
}

export class StonksDashboard {
  /**
   * @param config result of loadConfig()
   * @param screenOptions extra blessed.screen options (tests pass fake streams)
   */
  constructor(config, screenOptions = {}) {
    this.config = config;
    this.screenOptions = screenOptions;
    this.dataService = new DataService();
    this.assetsData = [];
    this.selectedIndex = 0;
    this.selectedSymbol = null;
    this.listOffset = 0;
    this.currentPeriodIndex = 1; // 7D
    this.isFetching = false;
    this.refreshRequested = false;
    this.refreshTimer = null;
    this.connectionError = false;

    this.initScreen();
    this.initWidgets();
    this.setupKeyHandlers();
  }

  initScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'STONKS DASHBOARD',
      fullUnicode: true,
      ...this.screenOptions
    });
    this.screen.key(['escape', 'q', 'C-c'], () => this.quit());
    this.screen.on('resize', () => this.refreshDisplay());
  }

  initWidgets() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    this.watchlistTable = grid.set(0, 0, 12, 4, contrib.table, {
      keys: false,
      vi: false,
      mouse: false,
      interactive: false,
      label: ' WATCHLIST ',
      border: { type: 'line', fg: 'cyan' },
      fg: 'white',
      columnSpacing: 1,
      columnWidth: [9, 12, 10]
    });

    this.trendChart = grid.set(0, 4, 7, 8, contrib.line, {
      label: ' PRICE TREND (7D) ',
      border: { type: 'line', fg: 'cyan' },
      style: { line: 'green', text: 'white', baseline: 'white', border: { fg: 'cyan' } },
      showLegend: false,
      xPadding: 3,
      yPadding: 1,
      wholeNumbersOnly: false,
      minY: null
    });

    this.detailsBox = grid.set(7, 4, 5, 8, blessed.box, {
      label: ' DETAILS ',
      border: { type: 'line', fg: 'cyan' },
      style: { border: { fg: 'cyan' } },
      tags: true,
      content: ' '
    });

    this.statusBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 'cyan', bg: 'black' },
      tags: true,
      content: ' Loading...'
    });
    this.screen.append(this.statusBar);

    this.loadingSpinner = blessed.loading({
      top: 'center',
      left: 'center',
      height: 5,
      width: 40,
      border: { type: 'line', fg: 'cyan' },
      style: { border: { fg: 'cyan' } }
    });
    this.screen.append(this.loadingSpinner);
  }

  setupKeyHandlers() {
    this.screen.key(['up', 'k'], () => this.select(this.selectedIndex - 1));
    this.screen.key(['down', 'j'], () => this.select(this.selectedIndex + 1));
    this.screen.key(['home', 'g'], () => this.select(0));
    this.screen.key(['end', 'S-g'], () => this.select(this.assetsData.length - 1));
    this.screen.key(['r'], () => this.requestRefresh());
    PERIODS.forEach((_, i) => this.screen.key([String(i + 1)], () => this.switchPeriod(i)));
  }

  select(index) {
    if (this.assetsData.length === 0) return;
    const clamped = Math.max(0, Math.min(index, this.assetsData.length - 1));
    if (clamped === this.selectedIndex) return;
    this.selectedIndex = clamped;
    this.selectedSymbol = this.assetsData[clamped].symbol;
    this.refreshDisplay();
  }

  quit() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.screen.destroy();
    process.exit(0);
  }

  refreshDisplay() {
    this.updateWatchlistTable();
    this.updateChartPanel();
    this.updateDetailsPanel();
    this.updateStatusBar();
    this.screen.render();
  }

  async switchPeriod(periodIndex) {
    if (periodIndex === this.currentPeriodIndex) return;
    this.currentPeriodIndex = periodIndex;
    await this.requestRefresh('Fetching data...');
  }

  /** Fetch now, or queue a fetch if one is already running. */
  async requestRefresh(message = 'Refreshing...') {
    if (this.isFetching) {
      this.refreshRequested = true;
      return;
    }
    this.loadingSpinner.load(message);
    this.screen.render();
    await this.fetchData();
    this.loadingSpinner.stop();
    this.refreshDisplay();
  }

  // Rows of the watchlist: section headers plus one row per asset. Each entry
  // remembers which asset index it maps to (null for headers).
  buildWatchlistRows() {
    const rows = [];
    let currentCategory = null;
    this.assetsData.forEach((asset, index) => {
      const category = getAssetCategory(asset);
      if (category !== currentCategory) {
        currentCategory = category;
        rows.push({ cells: [chalk.cyan(CATEGORY_META[category].section), '', ''], assetIndex: null });
      }
      const isSelected = index === this.selectedIndex;
      const symbol = `${isSelected ? '>' : ' '}${asset.symbol}`;
      const price = formatPrice(asset.price, asset.currency);
      const change = formatChange(asset.change);
      const up = asset.change >= 0;
      const cells = isSelected
        ? [
            chalk.bgBlue.white(symbol.padEnd(8)),
            chalk.bgBlue.white(price.padEnd(11)),
            up ? chalk.bgBlue.green(change) : chalk.bgBlue.red(change)
          ]
        : [chalk.white(symbol), chalk.white(price), up ? chalk.green(change) : chalk.red(change)];
      rows.push({ cells, assetIndex: index });
    });
    return rows;
  }

  updateWatchlistTable() {
    if (this.assetsData.length === 0) return;

    const rows = this.buildWatchlistRows();
    const selectedRow = rows.findIndex((r) => r.assetIndex === this.selectedIndex);

    // Borders take 2 lines, the column header 2 more. Keep the selection visible
    // by scrolling the rows ourselves: contrib.table cannot scroll when it is
    // not interactive, and the list is longer than the screen with many tickers.
    const visible = Math.max(3, (this.watchlistTable.height || this.screen.height) - 4);
    this.listOffset = scrollOffset(selectedRow, this.listOffset, visible, rows.length);

    // Markers replace the first/last visible slot, so they hide one more row
    // each. Cells are truncated to columnWidth by the table: keep them short.
    const slice = rows.slice(this.listOffset, this.listOffset + visible).map((r) => r.cells);
    if (this.listOffset > 0) {
      slice[0] = [chalk.gray(`^ ${this.listOffset + 1} more`), '', ''];
    }
    const hiddenBelow = rows.length - (this.listOffset + visible);
    if (hiddenBelow > 0) {
      slice[slice.length - 1] = [chalk.gray(`v ${hiddenBelow + 1} more`), '', ''];
    }

    this.watchlistTable.setData({ headers: ['SYMBOL', 'PRICE', 'CHANGE'], data: slice });
  }

  updateChartPanel() {
    const asset = this.assetsData[this.selectedIndex];
    if (!asset) return;

    const rawHistory = asset.history || [];
    const history = rawHistory.filter((v) => Number.isFinite(v));
    if (history.length === 0) history.push(0);

    const rawTs = asset.timestamps || [];
    const hasTimestamps = Array.isArray(rawTs) && rawTs.length === rawHistory.length;

    const period = PERIODS[this.currentPeriodIndex];
    const len = history.length;
    const numLabels = Math.min(10, len);
    const step = Math.max(1, Math.floor(len / numLabels));

    const x = [];
    for (let i = 0; i < len; i++) {
      const isTick = i === 0 || i === len - 1 || i % step === 0;
      if (!isTick) {
        x.push(' ');
        continue;
      }
      if (hasTimestamps) {
        const d = new Date(rawTs[i]);
        const pad = (n) => String(n).padStart(2, '0');
        if (period.days === 1) x.push(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        else if (period.days <= 7) x.push(`${pad(d.getMonth() + 1)}/${pad(d.getDate())}`);
        else x.push(pad(d.getMonth() + 1));
      } else {
        x.push(period.days === 1 ? `${i}h` : `${i + 1}`);
      }
    }

    const category = getAssetCategory(asset);
    this.trendChart.setLabel(` ${asset.symbol} | ${CATEGORY_META[category].label} | ${period.label} `);

    // Auto-scale the Y axis with 5% padding so small moves stay readable.
    const minVal = Math.min(...history);
    const maxVal = Math.max(...history);
    const padding = (maxVal - minVal) * 0.05 || 1;
    this.trendChart.options.minY = minVal - padding;
    this.trendChart.options.maxY = maxVal + padding;

    this.trendChart.setData([
      { title: asset.symbol, x, y: history, style: { line: asset.change >= 0 ? 'green' : 'red' } }
    ]);
  }

  updateDetailsPanel() {
    const asset = this.assetsData[this.selectedIndex];
    if (!asset) return;

    const category = getAssetCategory(asset);
    const { icon, label } = CATEGORY_META[category];
    const period = PERIODS[this.currentPeriodIndex].label;
    const color = (value) => (value >= 0 ? 'green' : 'red');
    const price = (value) => formatPrice(value, asset.currency);
    const pct = (value) => `{${color(value)}-fg}${formatChange(value)}{/${color(value)}-fg}`;
    const rule = ` ${'─'.repeat(38)}`;
    const source = asset.fromCache ? '{yellow-fg}[CACHE]{/yellow-fg}' : '{green-fg}[LIVE]{/green-fg}';
    const errorTag = asset.error ? ' {red-fg}[ERROR]{/red-fg}' : '';
    const title = ` {bold}{cyan-fg}${icon} ${asset.symbol}{/cyan-fg}{/bold} {gray-fg}${label}{/gray-fg}`;
    const periodRow = ` {bold}${period.padEnd(12)}{/bold} ${pct(asset.change)}`;

    let content;
    if (category === 'crypto') {
      content = `
${title} ${asset.rank ? `#${asset.rank}` : ''} {gray-fg}${asset.name || ''}{/gray-fg}
${rule}
 {bold}Price{/bold}        ${price(asset.price)}
${periodRow}
 {bold}24h{/bold}          ${pct(asset.change24h)}
 {bold}Open{/bold}         ${price(asset.open)}
${rule}
 {bold}High 24h{/bold}     ${price(asset.high)}
 {bold}Low 24h{/bold}      ${price(asset.low)}
 {bold}ATH{/bold}          ${price(asset.high52w)}
 {bold}ATL{/bold}          ${price(asset.low52w)}
${rule}
 {bold}Mkt Cap{/bold}      ${formatNumber(asset.marketCap)}
 {bold}Volume 24h{/bold}   ${formatNumber(asset.volume)}
 {bold}Circ Supply{/bold}  ${formatNumber(asset.circulatingSupply)}
${rule}
 ${source}${errorTag}
`;
    } else {
      content = `
${title} {gray-fg}${asset.name || ''}{/gray-fg}
${rule}
 {bold}Price{/bold}        ${price(asset.price)}
${periodRow}
 {bold}Day{/bold}          ${pct(asset.change24h)}
 {bold}Open{/bold}         ${price(asset.open)}
 {bold}Prev Close{/bold}   ${price(asset.previousClose)}
${rule}
 {bold}High{/bold}         ${price(asset.high)}
 {bold}Low{/bold}          ${price(asset.low)}
 {bold}52wk High{/bold}    ${price(asset.high52w)}
 {bold}52wk Low{/bold}     ${price(asset.low52w)}
${rule}
 {bold}Volume{/bold}       ${formatNumber(asset.volume)}
 {bold}Exchange{/bold}     ${asset.exchange || 'N/A'}
 {bold}Currency{/bold}     ${asset.currency || 'USD'}
${rule}
 ${source}${errorTag}
`;
    }

    this.detailsBox.setContent(content);
  }

  updateStatusBar() {
    const now = new Date().toLocaleTimeString();
    const period = PERIODS[this.currentPeriodIndex].label;
    const status = this.connectionError ? '{yellow-fg}CACHED{/yellow-fg}' : '{green-fg}LIVE{/green-fg}';
    const position = `${this.selectedIndex + 1}/${this.assetsData.length}`;
    this.statusBar.setContent(
      ` ${status} | ${position} | ${period} | ${now} | {cyan-fg}[1-4]{/cyan-fg} Period | {cyan-fg}[UP/DOWN]{/cyan-fg} Navigate | {cyan-fg}[r]{/cyan-fg} Refresh | {cyan-fg}[q]{/cyan-fg} Quit`
    );
  }

  async fetchData() {
    this.isFetching = true;
    try {
      const period = PERIODS[this.currentPeriodIndex];
      const fresh = await this.dataService.fetchAllAssets(this.config.tickers, this.config.cryptoIds, period.days);

      // Draw order = navigation order (see issue #4): group by category once,
      // then keep the selection on the same symbol across refreshes.
      this.assetsData = sortByCategory(fresh.filter(Boolean));
      const keep = this.assetsData.findIndex((a) => a.symbol === this.selectedSymbol);
      this.selectedIndex = keep >= 0 ? keep : Math.max(0, Math.min(this.selectedIndex, this.assetsData.length - 1));
      this.selectedSymbol = this.assetsData[this.selectedIndex]?.symbol ?? null;

      this.connectionError = this.assetsData.some((asset) => asset.error);
    } catch {
      this.connectionError = true;
    } finally {
      this.isFetching = false;
    }

    if (this.refreshRequested) {
      this.refreshRequested = false;
      await this.fetchData();
    }
  }

  scheduleNextRefresh() {
    this.refreshTimer = setTimeout(async () => {
      if (!this.isFetching) {
        await this.fetchData();
        this.refreshDisplay();
      }
      this.scheduleNextRefresh();
    }, this.config.updateInterval);
  }

  async start() {
    this.loadingSpinner.load('Loading market data...');
    this.screen.render();
    await this.fetchData();
    this.loadingSpinner.stop();
    this.refreshDisplay();
    this.scheduleNextRefresh();
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE);
    return;
  }
  if (argv.includes('-v') || argv.includes('--version')) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (argv.includes('--init')) {
    const { path, created } = initUserConfig();
    process.stdout.write(created ? `Created ${path}\n` : `${path} already exists, left untouched\n`);
    return;
  }

  const config = loadConfig(argv);
  const dashboard = new StonksDashboard(config);
  dashboard.start().catch((error) => {
    dashboard.screen.destroy();
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Only start the UI when run as a script, so the class can be imported by tests.
const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
