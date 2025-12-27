<div align="center">

<h1> Stonks Dashboard </h1>

[![GitHub stars](https://img.shields.io/github/stars/pierridotite/stonks-dashboard?style=social)](https://github.com/praffall/stonks-dashboard/stargazers)
[![npm version](https://img.shields.io/npm/v/stonks-dashboard.svg)](https://www.npmjs.com/package/stonks-dashboard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Minimal real-time market dashboard for your terminal**

![Dashboard](assets/dashboard.png)

</div>

---

## Features

- **Watchlist:** Crypto, stocks, ETFs in one view
- **Trend chart:** Periods 1D, 7D, 30D, 90D
- **Details panel:** Key metrics (price, change, highs/lows)
- **Caching & rate limits:** Smooth updates with fewer API errors

## Quick Start

```bash
npx stonks-dashboard
```

Or install globally:

```bash
npm install -g stonks-dashboard
stonks-dashboard
```

## Local Development

```bash
git clone https://github.com/pierridotite/stonks-dashboard.git
cd stonks-dashboard
npm install
npm start
```

## Controls

- `↑`/`↓`: Navigate watchlist
- `1`–`4`: Switch period (1D/7D/30D/90D)
- `q` or `Ctrl+C`: Quit

## Configuration

Edit `config.json` to customize:

```json
{
  "tickers": ["BTC", "ETH", "AAPL", "TSLA"],
  "cryptoIds": { "BTC": "bitcoin", "ETH": "ethereum" },
  "updateInterval": 120000
}
```

## Data Sources

- **Crypto:** CoinGecko API
- **Stocks/ETFs:** Yahoo Finance API

Requests are rate-limited and cached (`cache.json`). Crypto details cache ~30 min; price series cache ~1 min.

## Requirements

- Node.js (LTS recommended)

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
