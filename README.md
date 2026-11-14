# AI Balance

> **Status: In Progress · Experimental**  
> This extension is a work in progress. APIs and features may change.

Shows DeepSeek and OpenRouter API balance in the VS Code status bar.

## Features

- **Status bar display** — shows balances for DeepSeek and OpenRouter providers
- **Peak-hours countdown** — 🔴/🟢 indicator with a live h:mm countdown to the next peak/off-peak switch (weekends are always off-peak)
- **Daily cost tracking** — estimates daily spend from balance snapshots taken during the day; today's cost is shown in the status bar and in the tooltip (today + current month). **Day boundaries are always UTC (00:00 UTC)**, not local midnight
- **webitcache sync (default)** — the computer that reads first in the UTC day publishes its balance as the **day-start**; every other computer reads that value and only adds its own observations, so all machines show the same daily cost
- **Multi-computer sync (optional)** — point `aiBalance.dailyCosts.sharedFilePath` at a file in OneDrive/Dropbox to share the day-start balance across machines using the same API key
- **Model pricing in tooltip** — current DeepSeek price list per 1M tokens (peak & off-peak)
- **Rich tooltip** — Markdown/HTML tables with balances, daily & monthly costs, token prices converted to the selected currency, peak hours and quick action links
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
| `aiBalance.dailyCosts.remoteUrl` | string | `https://webitcache.analogbrain.com` | webitcache base URL (empty = disable remote sync). The token is **not** a setting — see commands below |
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
| `AI Balance: Set webitcache Token (masked)` | Store a webitcache token in the OS keychain — the value is masked and never displayed; empty input restores the built-in token |
| `AI Balance: Restore Default webitcache Token` | Drop the stored token and fall back to the built-in one (also removes a legacy plain-text `dailyCosts.remoteToken` from `settings.json`) |

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
records the **first and the lowest balance reading of each day** and derives the
daily spend from the difference. The day always starts at **00:00 UTC** — never
at the machine's local midnight — so every computer agrees on which day a
reading belongs to. The tooltip shows today's and this month's estimated cost;
the dashboard adds a 30-day chart and a 14-day table.

**Remote sync via webitcache (default):** the computer that performs the first
read in the UTC day pushes its balance as the **day-start** to
[webitcache](https://webitcache.analogbrain.com). A computer that wakes up later
already finds that entry: it does **not** publish its own balance, it adopts the
stored day-start and only adds its own observations (latest/lowest). Example:
machine A reads at 01:00 UTC → saves the day-start; machine B reads at 02:00 UTC
→ sees the existing entry, keeps it and computes its daily cost from that
baseline. The cache is re-published only when the merged state actually changes
(a lower balance later in the day). The endpoint comes from
`aiBalance.dailyCosts.remoteUrl` (empty = disable); the **token is never a
setting** — it lives in the OS keychain (masked input via
`AI Balance: Set webitcache Token`, or the built-in default restored with
`AI Balance: Restore Default webitcache Token`). ⚠️ The token is shared
storage: anyone who has it can read/write that cache, so keep the default
token out of public forks.

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
- The day starts at the first reading after 00:00 UTC, which may be later than midnight UTC if no computer was running — a computer that starts later adopts the shared day-start instead of its own balance.
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
