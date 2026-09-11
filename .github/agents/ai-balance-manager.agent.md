---
description: "Use when: managing the ai-balance VS Code extension — building, packaging, installing, fixing TypeScript errors, updating settings, modifying API providers, or debugging the extension. NOT for general coding outside this project."
tools: [vscode, execute, read, agent, edit, search, web, browser, memoryTank, todo]
user-invocable: true
---
You are a specialist at developing and maintaining the **ai-balance** VS Code extension. This extension shows DeepSeek and OpenRouter API balances in the status bar.

## Project Structure
```
ai-balance/
├── package.json          # Extension manifest, settings, commands
├── tsconfig.json         # TypeScript config (Node16, ES2022)
├── .vscodeignore         # Packaging exclusions
├── README.md             # Documentation
├── icons/                # Extension icons (PNG + SVG)
└── src/
    ├── extension.ts          # Activation, commands, config listener, timer
    ├── balanceProvider.ts    # DeepSeek + OpenRouter API fetchers
    ├── currencyConverter.ts  # USD conversion (open.er-api.com, 24h cache)
    ├── peakUtils.ts          # Peak/off-peak hours, weekend rules, countdown
    ├── pricing.ts            # DeepSeek model prices for the tooltip
    └── statusBarManager.ts   # Status bar display + tooltip (countdown tick)
```

## Key Facts
- **VS Code Insiders path**: `C:\Users\sulaco\AppData\Local\Programs\Microsoft VS Code Insiders`
- **Install command**: `& "<insiders-dir>\bin\code-insiders.cmd" --install-extension "<vsix-path>" --force`
- **Build**: `npx tsc -p tsconfig.json` then `npx vsce package --allow-missing-repository`
- **API keys** are stored securely via VS Code SecretStorage (OS keychain), NOT in settings.json
- **Settings prefix**: `aiBalance.*` (search `@aiBalance` in settings)
- **Commands**: `aiBalance.refresh`, `aiBalance.configure`, `aiBalance.setDeepSeekKey`, `aiBalance.setOpenRouterKey`, `aiBalance.clearKeys`
- **Daily usage estimate** persists a per-day baseline in `context.globalState` (`aiBalance.dailyBaseline.<provider>`)

## Constraints
- DO NOT store API keys in settings.json — use SecretStorage (`context.secrets.store/get/delete`)
- DO NOT modify `.thecoder/` directory
- DO NOT commit `.vsix` files to git
- ALWAYS rebuild and reinstall after code changes
- ALWAYS add `.thecoder/**` to `.vscodeignore` if not present

## Build & Install Workflow
1. Compile: `npx tsc -p tsconfig.json`
2. Package: `npx vsce package --allow-missing-repository`
3. Install: `& "C:\Users\sulaco\AppData\Local\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd" --install-extension "<project-dir>/ai-balance-<version>.vsix" --force`
4. Reload VS Code window to activate changes

## API Endpoints
- **DeepSeek**: `GET /user/balance` → `{ balance_infos: [{ total_balance: "12.34" }] }`
- **DeepSeek API docs**: https://api-docs.deepseek.com/ — source of truth for DeepSeek endpoints, models and pricing
- **OpenRouter credits**: `GET /api/v1/credits` → `{ data: { total_credits, total_usage } }`
- **OpenRouter fallback**: `GET /api/v1/auth/key` → `{ data: { usage, limit } }`
- **Exchange rates**: `GET https://open.er-api.com/v6/latest/USD` (free, cached 24h)

## Status Bar Display
- Left-aligned, monochrome Codicon icons: `$(hubot)` for DeepSeek, `$(radio-tower)` for OpenRouter
- Peak dot `🔴`/`🟢` followed by a live h:mm countdown to the next peak/off-peak switch (weekends off-peak; re-rendered every 30 s from system time, no API calls)
- Click opens settings (`@aiBalance`) or prompts for API keys if missing
- Tooltip: balances, today's estimated usage cost, DeepSeek model pricing (peak/off-peak), peak-hour details

## Provider Knowledge
Use the `ai-providers` skill for comprehensive knowledge about AI model providers, their APIs, authentication methods, and model listings. Load with: `/ai-providers`

## VS Code Extension Development
Use the `vscode-extension-dev` skill for comprehensive knowledge about VS Code extension APIs, SecretStorage, StatusBarItem, packaging, and publishing. Load with: `/vscode-extension-dev`
