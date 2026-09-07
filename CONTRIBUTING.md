# Contributing to Stonks Dashboard

Thank you for your interest in contributing to this project!

## How to Contribute

1. Fork the repository
2. Create a new branch for your feature (`git switch -c feature/my-feature`)
3. Make your changes
4. Run the tests (`npm test`) and try the dashboard (`npm start`)
5. Commit your changes (`git commit -am 'Add new feature'`)
6. Push to the branch (`git push origin feature/my-feature`)
7. Create a Pull Request

Continuous integration runs `npm test` on Linux and Windows with Node.js 18, 20 and 22.

## Project Layout

- `src/index.js`: the terminal UI (blessed / blessed-contrib), key handling and refresh loop
- `src/dataService.js`: CoinGecko and Yahoo Finance clients, rate limiting and the file cache
- `src/utils.js`: pure helpers (formatting, asset categories, scrolling), covered by `test/`
- `src/paths.js`: config lookup, `~/.stonks-dashboard` data directory, debug logging
- `config.json`: the default watchlist bundled with the package

Anything without side effects belongs in `src/utils.js` with a test in `test/utils.test.js`.
The UI owns the terminal, so never write to `console` while the dashboard runs: use `log()`
from `src/paths.js` (enabled with `STONKS_DEBUG=1`).

## Reporting Issues

If you find a bug or have a suggestion, please open an issue on GitHub. Include your
`config.json`, your terminal size, and the output of `STONKS_DEBUG=1 stonks-dashboard`
(`~/.stonks-dashboard/debug.log`) when relevant.

## Questions

For any questions or discussions, feel free to reach out:

**Email:** praffalli1@gmail.com

## Code Style

Please follow the existing code style and conventions used in the project
(ES modules, 2-space indentation, single quotes).

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
