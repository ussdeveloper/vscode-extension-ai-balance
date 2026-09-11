# AI Balance

> **Status: In Progress · Experimental**  
> This extension is a work in progress. APIs and features may change.

Shows DeepSeek and OpenRouter API balance in the VS Code status bar.

## Features

- **Status bar display** — shows balances for DeepSeek and OpenRouter providers
- **Peak-hours countdown** — 🔴/🟢 indicator with a live h:mm countdown to the next peak/off-peak switch (weekends are always off-peak)
- **Daily usage estimate** — approximate cost of today's usage in the tooltip
- **Model pricing in tooltip** — current DeepSeek price list per 1M tokens (peak & off-peak)
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
| `aiBalance.refreshInterval` | number | `300` | Auto-refresh in seconds (0=off) |

## Commands

| Command | Description |
|---|---|
| `AI Balance: Refresh Now` | Manually refresh balances |
| `AI Balance: Open Settings` | Open AI Balance settings |
| `AI Balance: Set DeepSeek API Key` | Securely store DeepSeek API key |
| `AI Balance: Set OpenRouter API Key` | Securely store OpenRouter API key |
| `AI Balance: Clear All API Keys` | Remove all stored API keys |

## API Endpoints

### DeepSeek
- `GET /user/balance` → `{ balance_infos: [{ total_balance: "12.34" }] }`

### OpenRouter
- `GET /api/v1/credits` → `{ data: { total_credits: 65, total_usage: 9.57 } }`
- Fallback: `GET /api/v1/auth/key` → `{ data: { usage, limit } }`

### Exchange Rates
- `GET https://open.er-api.com/v6/latest/USD` (free, no key required, cached 24h)

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
- Daily usage cost is an estimate (balance difference since the first reading of the day; top-ups can skew it)
- Model prices are informational and may change — see https://api-docs.deepseek.com/quick_start/pricing
