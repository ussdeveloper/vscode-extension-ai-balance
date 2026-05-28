# AI Balance

Shows DeepSeek and OpenRouter API balance in the VS Code status bar.

## Features

- **Status bar display** — shows balances for DeepSeek and OpenRouter providers
- **Monochrome Codicon icons** — `$(hubot)` for DeepSeek, `$(radio-tower)` for OpenRouter
- **Currency conversion** — convert USD to EUR, PLN, GBP, JPY and more (via free open.er-api.com, cached 24h)
- **Per-provider enable/disable** — toggle each provider independently
- **Show/hide status bar** — hide the balance from status bar without disabling
- **Auto-refresh** — configurable interval (default 5 min)
- **Click to configure** — click the status bar item to open AI Balance settings

## Configuration

Open VS Code settings (`Ctrl+,`) and search for `@aiBalance`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `aiBalance.providers.deepseek.enabled` | boolean | `true` | Show DeepSeek balance |
| `aiBalance.providers.deepseek.apiKey` | string | `""` | DeepSeek API key |
| `aiBalance.providers.deepseek.apiUrl` | string | `https://api.deepseek.com` | DeepSeek API URL |
| `aiBalance.providers.openrouter.enabled` | boolean | `true` | Show OpenRouter balance |
| `aiBalance.providers.openrouter.apiKey` | string | `""` | OpenRouter API key |
| `aiBalance.providers.openrouter.apiUrl` | string | `https://openrouter.ai/api` | OpenRouter API URL |
| `aiBalance.display.currency` | enum | `USD` | Target currency (USD/EUR/PLN/...) |
| `aiBalance.display.showInStatusBar` | boolean | `true` | Show in status bar |
| `aiBalance.refreshInterval` | number | `300` | Auto-refresh in seconds (0=off) |

## Commands

- `AI Balance: Refresh Now` — manually refresh balances
- `AI Balance: Open Settings` — open AI Balance settings

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
