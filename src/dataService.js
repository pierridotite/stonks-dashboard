import axios from 'axios';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { CACHE_FILE, ensureDataDir, log } from './paths.js';

const USER_AGENT = 'Mozilla/5.0 (stonks-dashboard)';

// CoinGecko's free tier is strict: keep calls sequential and spaced out.
const COINGECKO_DELAY = 5000;
let lastCoinGeckoCall = 0;

const CACHE_TTL = 60 * 1000; // price series
const DETAIL_TTL = 30 * 60 * 1000; // crypto details (market cap, ATH...)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForCoinGecko() {
  const elapsed = Date.now() - lastCoinGeckoCall;
  if (elapsed < COINGECKO_DELAY) await sleep(COINGECKO_DELAY - elapsed);
  lastCoinGeckoCall = Date.now();
}

async function coinGeckoGet(url, options, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; ; attempt++) {
    try {
      await waitForCoinGecko();
      return await axios.get(url, options);
    } catch (error) {
      const status = error.response?.status;
      const retryable = status === 429 || status >= 500 || !status;
      if (attempt >= retries || !retryable) throw error;
      const jitter = Math.floor(Math.random() * 300);
      await sleep(baseDelay * 2 ** attempt + jitter);
    }
  }
}

/** Map a period in days to Yahoo Finance chart parameters. */
export function yahooRange(days) {
  if (days <= 1) return { range: '1d', interval: '1h' };
  if (days <= 7) return { range: '7d', interval: '1d' };
  if (days <= 30) return { range: '1mo', interval: '1d' };
  return { range: '3mo', interval: '1d' };
}

function emptyAsset(symbol, type) {
  return {
    symbol,
    type,
    currency: 'USD',
    price: 0,
    change: 0,
    change24h: 0,
    history: [0],
    timestamps: [],
    open: 0,
    previousClose: 0,
    high: 0,
    low: 0,
    high52w: 0,
    low52w: 0,
    marketCap: 0,
    volume: 0,
    circulatingSupply: 0,
    totalSupply: 0,
    rank: 0,
    error: true
  };
}

export class DataService {
  constructor() {
    this.cache = new Map();
    this.dirty = false;
    this.loadFileCache();
  }

  loadFileCache() {
    try {
      if (!existsSync(CACHE_FILE)) return;
      const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      for (const [key, value] of Object.entries(data)) this.cache.set(key, value);
      log(`[Cache] loaded ${this.cache.size} entries from ${CACHE_FILE}`);
    } catch (error) {
      log(`[Cache] could not read ${CACHE_FILE}: ${error.message}`);
    }
  }

  saveFileCache() {
    if (!this.dirty) return;
    try {
      ensureDataDir();
      writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(this.cache), null, 2));
      this.dirty = false;
    } catch (error) {
      log(`[Cache] could not write ${CACHE_FILE}: ${error.message}`);
    }
  }

  remember(key, value) {
    this.cache.set(key, value);
    this.dirty = true;
  }

  isCacheValid(cacheKey, ttl = CACHE_TTL) {
    const cached = this.cache.get(cacheKey);
    if (!cached?.timestamp) return false;
    return Date.now() - cached.timestamp < ttl;
  }

  async fetchCryptoData(symbol, coinId, days = 7) {
    const chartKey = `crypto-${symbol}-${days}`;
    const detailKey = `detail-${coinId}`;

    if (this.isCacheValid(chartKey)) {
      return { ...this.cache.get(chartKey), fromCache: true };
    }

    try {
      const chartResponse = await coinGeckoGet(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`, {
        params: { vs_currency: 'usd', days },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000
      });

      const timestamps = [];
      const prices = [];
      for (const point of chartResponse.data.prices || []) {
        const [ts, value] = point ?? [];
        if (Number.isFinite(value)) {
          timestamps.push(Number.isFinite(ts) ? ts : Date.now());
          prices.push(value);
        }
      }
      if (prices.length === 0) prices.push(0);
      const validPrices = prices.filter((p) => p > 0);

      let detail = this.isCacheValid(detailKey, DETAIL_TTL) ? this.cache.get(detailKey) : null;
      if (!detail) {
        try {
          const detailResponse = await coinGeckoGet(`https://api.coingecko.com/api/v3/coins/${coinId}`, {
            params: { localization: false, tickers: false, community_data: false, developer_data: false },
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
          });
          const md = detailResponse.data.market_data || {};
          detail = {
            currentPrice: md.current_price?.usd ?? null,
            change24h: md.price_change_percentage_24h ?? 0,
            high24h: md.high_24h?.usd ?? null,
            low24h: md.low_24h?.usd ?? null,
            ath: md.ath?.usd ?? null,
            atl: md.atl?.usd ?? null,
            marketCap: md.market_cap?.usd ?? 0,
            volume24h: md.total_volume?.usd ?? 0,
            circulatingSupply: md.circulating_supply ?? 0,
            totalSupply: md.total_supply ?? 0,
            rank: detailResponse.data.market_cap_rank ?? 0,
            timestamp: Date.now()
          };
          this.remember(detailKey, detail);
        } catch (error) {
          // Details are optional: the chart alone is enough to draw the row.
          log(`[Crypto] ${symbol} details unavailable: ${error.message}`);
          detail = null;
        }
      }

      const currentPrice = (detail?.currentPrice ?? prices[prices.length - 1]) || 0;
      const firstPrice = prices[0] || currentPrice;
      const change = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;

      const result = {
        symbol,
        type: 'crypto',
        name: coinId,
        currency: 'USD',
        price: currentPrice,
        change,
        change24h: detail?.change24h ?? 0,
        history: prices,
        timestamps,
        open: prices[0] || 0,
        high: detail?.high24h ?? (validPrices.length ? Math.max(...validPrices) : 0),
        low: detail?.low24h ?? (validPrices.length ? Math.min(...validPrices) : 0),
        high52w: detail?.ath ?? 0,
        low52w: detail?.atl ?? 0,
        marketCap: detail?.marketCap ?? 0,
        volume: detail?.volume24h ?? 0,
        circulatingSupply: detail?.circulatingSupply ?? 0,
        totalSupply: detail?.totalSupply ?? 0,
        rank: detail?.rank ?? 0,
        timestamp: Date.now(),
        error: false
      };

      this.remember(chartKey, result);
      return result;
    } catch (error) {
      log(`[Crypto] ${symbol}: ${error.message}`);
      if (this.cache.has(chartKey)) {
        return { ...this.cache.get(chartKey), error: true, fromCache: true };
      }
      return emptyAsset(symbol, 'crypto');
    }
  }

  async fetchStockData(symbol, days = 7) {
    const cacheKey = `stock-${symbol}-${days}`;

    if (this.isCacheValid(cacheKey)) {
      return { ...this.cache.get(cacheKey), fromCache: true };
    }

    const { range, interval } = yahooRange(days);

    try {
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
        params: { interval, range },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) {
        throw new Error(response.data?.chart?.error?.description || 'empty response');
      }
      const quote = result.indicators?.quote?.[0] ?? {};
      const meta = result.meta ?? {};

      const closePrices = [];
      const timestamps = [];
      const rawCloses = quote.close || [];
      const rawTimestamps = result.timestamp || [];
      for (let i = 0; i < rawCloses.length; i++) {
        const value = rawCloses[i];
        if (Number.isFinite(value)) {
          closePrices.push(value);
          const ts = rawTimestamps[i];
          timestamps.push(Number.isFinite(ts) ? ts * 1000 : Date.now());
        }
      }
      if (closePrices.length === 0) closePrices.push(0);
      const validPrices = closePrices.filter((p) => p > 0);

      const currentPrice = meta.regularMarketPrice || closePrices[closePrices.length - 1] || 0;
      const previousClose = meta.chartPreviousClose || closePrices[0] || currentPrice;
      const change = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;

      const openPrices = (quote.open || []).filter((p) => Number.isFinite(p));
      const openPrice = openPrices[openPrices.length - 1] || previousClose;

      // Yahoo tags LSE quotes with the pseudo-currency "GBp" (pence).
      const currency = meta.currency || (symbol.endsWith('.L') ? 'GBp' : 'USD');

      const data = {
        symbol,
        type: meta.instrumentType || 'EQUITY',
        name: meta.longName || meta.shortName || '',
        exchange: meta.fullExchangeName || meta.exchangeName || '',
        currency,
        price: currentPrice,
        change,
        change24h: Number.isFinite(meta.regularMarketChangePercent) ? meta.regularMarketChangePercent : change,
        history: closePrices,
        timestamps,
        open: openPrice,
        previousClose,
        high: meta.regularMarketDayHigh || (validPrices.length ? Math.max(...validPrices) : 0),
        low: meta.regularMarketDayLow || (validPrices.length ? Math.min(...validPrices) : 0),
        high52w: meta.fiftyTwoWeekHigh || 0,
        low52w: meta.fiftyTwoWeekLow || 0,
        volume: meta.regularMarketVolume || 0,
        timestamp: Date.now(),
        error: false
      };

      this.remember(cacheKey, data);
      return data;
    } catch (error) {
      log(`[Stock] ${symbol}: ${error.message}`);
      if (this.cache.has(cacheKey)) {
        return { ...this.cache.get(cacheKey), error: true, fromCache: true };
      }
      return emptyAsset(symbol, 'EQUITY');
    }
  }

  /**
   * Fetch every ticker for the given period. Crypto calls are sequential to
   * respect CoinGecko's rate limit; Yahoo calls run in parallel. The result
   * keeps the order of `tickers`.
   */
  async fetchAllAssets(tickers, cryptoIds = {}, days = 7) {
    const stocks = tickers.filter((t) => !cryptoIds[t]);
    const stockResults = Promise.all(stocks.map((t) => this.fetchStockData(t, days)));

    const bySymbol = new Map();
    for (const ticker of tickers) {
      if (cryptoIds[ticker]) {
        bySymbol.set(ticker, await this.fetchCryptoData(ticker, cryptoIds[ticker], days));
      }
    }
    for (const asset of await stockResults) bySymbol.set(asset.symbol, asset);

    this.saveFileCache();
    return tickers.map((t) => bySymbol.get(t));
  }
}
