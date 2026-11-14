# AI Balance

> **Status: In Progress · Experimental**  
> This extension is a work in progress. APIs and features may change.

Shows DeepSeek and OpenRouter API balance in the VS Code status bar.

## Features

- **Status bar display** — shows balances for DeepSeek and OpenRouter providers
- **Peak-hours countdown** — 🔴/🟢 indicator with a live h:mm countdown to the next peak/off-peak switch (weekends are always off-peak)
- **Daily cost tracking** — estimates daily spend from the earliest and latest balance reading of each day; today's cost is shown in the status bar and in the tooltip (today + current month)
- **Multi-computer sync (optional)** — point `aiBalance.dailyCosts.sharedFilePath` at a file in OneDrive/Dropbox to share the day-start balance across machines using the same API key
- **Model pricing in tooltip** — current DeepSeek price list per 1M tokens (peak & off-peak)
- **Usage dashboard tab** — click the status bar item to open a dashboard: balance cards, 30-day cost chart, 14-day table, live peak-hours state
- **Monochrome Codicon icons** — `$(hubot)` for DeepSeek, `$(radio-tower)` for OpenRouter
- **Secure API key storage** — keys stored in OS keychain via VS Code SecretStorage API
- **Currency conversion** — convert USD to EUR, PLN, GBP, JPY and more (via free open.er-api.com, cached 24h)
- **Per-provider enable/disable** — toggle each provider independently
- **Show/hide status bar** — hide the balance from status bar without disabling
- **Auto-refresh** — configurable interval (default 5 min)
- **Click to configure** — click the status bar item to open AI Balance settings

## Security

API keys are **not** stored in `settings.json`. They are saved securely using the VS Code SecretStorage API, which uses the operating system's credential manager:

- **Windows**: Windows Credential Manager
- **macOS**: Keychain
- **Linux**: libsecret (GNOME Keyring / KDE Wallet)

Use the commands below to set or clear your keys.

## Configuration

Open VS Code settings (`Ctrl+,`) and search for `@aiBalance`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `aiBalance.providers.deepseek.enabled` | boolean | `true` | Show DeepSeek balance |
| `aiBalance.providers.deepseek.apiUrl` | string | `https://api.deepseek.com` | DeepSeek API URL |
| `aiBalance.providers.openrouter.enabled` | boolean | `true` | Show OpenRouter balance |
| `aiBalance.providers.openrouter.apiUrl` | string | `https://openrouter.ai/api` | OpenRouter API URL |
| `aiBalance.display.currency` | enum | `USD` | Target currency (USD/EUR/PLN/...) |
| `aiBalance.display.showInStatusBar` | boolean | `true` | Show in status bar |
| `aiBalance.display.showDailyCost` | boolean | `true` | Show today's estimated cost in the status bar |
| `aiBalance.dailyCosts.sharedFilePath` | string | `""` | Shared JSON file to sync daily cost baselines across computers |
| `aiBalance.refreshInterval` | number | `300` | Auto-refresh in seconds (0=off) |

## Commands

| Command | Description |
|---|---|
| `AI Balance: Refresh Now` | Manually refresh balances |
| `AI Balance: Open Settings` | Open AI Balance settings |
| `AI Balance: Set DeepSeek API Key` | Securely store DeepSeek API key |
| `AI Balance: Set OpenRouter API Key` | Securely store OpenRouter API key |
| `AI Balance: Clear All API Keys` | Remove all stored API keys |
| `AI Balance: Open Usage Dashboard` | Open the usage dashboard tab (or click the status bar item) |
| `AI Balance: Set Shared Costs File (sync)` | Choose the shared JSON file used to sync daily cost baselines across computers |
| `AI Balance: Set Today's Starting Balance` | Manually enter today's opening balance (USD) per provider; empty input clears the override |

## API Endpoints

### DeepSeek
- `GET /user/balance` → `{ balance_infos: [{ total_balance: "12.34" }] }`

### OpenRouter
- `GET /api/v1/credits` → `{ data: { total_credits: 65, total_usage: 9.57 } }`
- Fallback: `GET /api/v1/auth/key` → `{ data: { usage, limit } }`

### Exchange Rates
- `GET https://open.er-api.com/v6/latest/USD` (free, no key required, cached 24h)

## Daily cost tracking (balance snapshots)

The DeepSeek/OpenRouter APIs expose only the current balance, so the extension
records the **earliest and latest balance reading of each day** and derives the
daily spend from the difference. The tooltip shows today's and this month's
estimated cost; the dashboard adds a 30-day chart and a 14-day table.

**Sharing across computers (same API key):** set
`aiBalance.dailyCosts.sharedFilePath` to a JSON file in a synced folder
(OneDrive, Dropbox, Google Drive, or a network share such as
`\\\\NAS\\share\\ai-balance\\daily-costs.json`). The path is local on each
machine but must point to the same synced file (e.g. each computer's own
OneDrive folder). Every machine merges its observations — the earliest
day-start and the latest day-end win — so all machines agree on the daily
spend even if only one of them ran at midnight. Cloud conflict copies
(`daily-costs (1).json`, `daily-costs-<PC>.json`) are detected and merged too.

Caveats:
- The day starts at the first reading, which may be later than 00:00 if VS Code was not running.
- Top-ups increase the balance and can make a day's spend look lower (clamped at 0).
- Data is stored locally in `globalState`; the shared file is optional.

**Manual override:** if no machine was running at the start of the day, run
**AI Balance: Set Today's Starting Balance**, pick a provider and enter the
balance you had at the beginning of the day (leave empty to clear the
override). The override is stored in the daily record and synced via the
shared file, and is marked with ✍️ in the tooltip and dashboard.

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Package
npm run package
```

## Requirements

- VS Code ^1.85.0
- Node.js 18+ (for development)

## Known Limitations

- Status bar only supports monochrome Codicon icons (no custom SVG/images)
- Exchange rates cached for 24 hours to minimize API calls
- DeepSeek balance endpoint may change — uses `/user/balance`
- Daily cost is an estimate from the first/last balance reading of the day; if VS Code was not running at midnight the day starts later
- Top-ups increase the balance and can skew (underestimate) a day's cost
- Model prices are informational and may change — see https://api-docs.deepseek.com/quick_start/pricing
