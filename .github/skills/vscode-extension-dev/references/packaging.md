# Packaging & Publishing

How to build, package, test, and publish VS Code extensions.

## Prerequisites

```bash
npm install --save-dev @vscode/vsce
```

## Build & Package

### Compile TypeScript
```bash
npx tsc -p tsconfig.json
# or
npm run compile
```

### Create .vsix Package
```bash
npx vsce package
# or with --allow-missing-repository (no GitHub repo)
npx vsce package --allow-missing-repository
```

### Output
Creates `my-extension-0.1.0.vsix` in the project root.

## .vscodeignore

Files to exclude from the .vsix package:

```
.vscode/**
.vscode-test/**
.thecoder/**
src/**
node_modules/**
.gitignore
tsconfig.json
**/*.ts
**/*.map
```

## Install Locally

### VS Code
```bash
code --install-extension my-extension-0.1.0.vsix --force
```

### Portable VS Code (TheCoder)
```bash
cd /path/to/portable
./bin/thecoder.cmd --install-extension /path/to/extension.vsix --force
```

## Reload After Install

After installing a .vsix, reload the VS Code window:
- Command Palette → `Developer: Reload Window`
- Or `Ctrl+Shift+P` → `Reload Window`

## Version Management

```bash
# Bump version
npm version patch  # 0.1.0 → 0.1.1
npm version minor  # 0.1.0 → 0.2.0
npm version major  # 0.1.0 → 1.0.0

# Then rebuild and repackage
npm run compile
npx vsce package
```

## Publishing to Marketplace

```bash
# Create publisher (one-time)
npx vsce create-publisher your-publisher-name

# Login
npx vsce login your-publisher-name

# Publish
npx vsce publish

# Or publish specific version
npx vsce publish patch
npx vsce publish minor
npx vsce publish major
```

## Required Files for Marketplace

| File | Required | Purpose |
|---|---|---|
| `README.md` | Yes | Extension description |
| `LICENSE` | No (but recommended) | License information |
| `CHANGELOG.md` | No | Version history |
| Icon (128x128 PNG) | No | Extension icon |

## Engine Compatibility

- `engines.vscode` in package.json must match target VS Code version
- `@types/vscode` must match `engines.vscode`
- Example: `"engines": { "vscode": "^1.85.0" }` + `@types/vscode@1.85.0`
- If `@types/vscode` is newer than `engines.vscode`, vsce will error

## Common Issues

### "SVGs can't be used as icons"
Use PNG format for extension icons, not SVG.

### "@types/vscode greater than engines.vscode"
Downgrade `@types/vscode` to match `engines.vscode`:
```bash
npm install --save-dev @types/vscode@1.85.0
```

### "Repository field is missing"
Add `--allow-missing-repository` flag or add `repository` field to package.json.

### Extension not showing after install
Run `Developer: Reload Window` to activate the extension.
