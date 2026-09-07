<div align="center">

<h1> Stonks Dashboard </h1>

[![GitHub stars](https://img.shields.io/github/stars/pierridotite/stonks-dashboard?style=social)](https://github.com/pierridotite/stonks-dashboard/stargazers)
[![npm version](https://img.shields.io/npm/v/stonks-dashboard.svg)](https://www.npmjs.com/package/stonks-dashboard)
[![CI](https://github.com/pierridotite/stonks-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/pierridotite/stonks-dashboard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Minimal real-time market dashboard for your terminal**

![Dashboard](assets/dashboard.png)

</div>

---

## Features

- **Watchlist:** crypto, stocks, ETFs and mutual funds, grouped by type
- **Trend chart:** 1D, 7D, 30D and 90D periods with an auto-scaled axis
- **Details panel:** price, period and daily change, highs/lows, 52-week range, volume, exchange
- **Currencies:** prices shown in the instrument's own currency (USD, EUR, GBP, pence for LSE quotes, ...)
- **Caching and rate limiting:** smooth refreshes with fewer API errors, works offline from cache
- **Long lists:** the watchlist scrolls to keep the selection visible, however many tickers you add

## Quick Start

```bash
npx stonks-dashboard
```

Or install globally:

```bash
npm install -g stonks-dashboard
stonks-dashboard
```

## Controls

| Key | Action |
| --- | --- |
| `↑` / `↓` or `k` / `j` | Navigate the watchlist |
| `Home` / `End` or `g` / `G` | Jump to the first / last asset |
| `1` `2` `3` `4` | Switch period (1D / 7D / 30D / 90D) |
| `r` | Refresh now |
| `q`, `Esc` or `Ctrl+C` | Quit |

## Configuration

Create your own config once, then edit it:

```bash
stonks-dashboard --init      # writes ~/.stonks-dashboard/config.json
```

```json
{
  "tickers": ["BTC", "ETH", "AAPL", "TSLA", "SPY", "FXAIX", "BARC.L"],
  "cryptoIds": { "BTC": "bitcoin", "ETH": "ethereum" },
  "updateInterval": 120000
}
```

- `tickers`: any symbol Yahoo Finance knows (stocks, ETFs, mutual funds, `.L` suffix for the London Stock Exchange, `.PA` for Paris, ...). Assets are grouped automatically by the type Yahoo reports.
- `cryptoIds`: maps a ticker to its [CoinGecko id](https://www.coingecko.com/). A ticker listed here is fetched from CoinGecko instead of Yahoo.
- `updateInterval`: refresh period in milliseconds (minimum 10000).

The config file is looked up in this order:

1. `--config <path>` (or `-c <path>`) on the command line
2. `./config.json` in the current directory
3. `~/.stonks-dashboard/config.json`
4. the `config.json` bundled with the package

```bash
stonks-dashboard --config ~/portfolios/tech.json
stonks-dashboard --help
```

## Data Sources

- **Crypto:** [CoinGecko API](https://www.coingecko.com/en/api) (free tier, requests are spaced 5 s apart)
- **Stocks, ETFs, funds:** Yahoo Finance chart API

Price series are cached for 1 minute and crypto details for 30 minutes in `~/.stonks-dashboard/cache.json`. When an API is unreachable the last cached values are shown, tagged `[CACHE]` and `CACHED` in the status bar.

Set `STONKS_DEBUG=1` to log API and cache errors to `~/.stonks-dashboard/debug.log` (the terminal is owned by the UI, so nothing is printed to it). Set `STONKS_HOME` to move that directory elsewhere.

## Local Development

```bash
git clone https://github.com/pierridotite/stonks-dashboard.git
cd stonks-dashboard
npm install
npm start
npm test
```

Requires Node.js 18 or newer. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT - See [LICENSE](LICENSE)

## Star History

<a href="https://www.star-history.com/#pierridotite/stonks-dashboard&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=pierridotite/stonks-dashboard&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=pierridotite/stonks-dashboard&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=pierridotite/stonks-dashboard&type=date&legend=top-left" />
 </picture>
</a>
