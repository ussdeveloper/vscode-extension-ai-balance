---
name: vscode-extension-dev
description: 'Knowledge about VS Code extension development — API references, SecretStorage, StatusBarItem, activation events, extension manifest, packaging, and publishing. Use when: building or debugging VS Code extensions, understanding extension APIs, configuring package.json, or troubleshooting extension issues. NOT for general coding outside VS Code extensions.'
user-invocable: true
---

# VS Code Extension Development

Comprehensive knowledge about developing VS Code extensions, based on the official `microsoft/vscode-docs` documentation.

## When to Use
- Building or modifying VS Code extensions
- Understanding extension APIs (SecretStorage, StatusBarItem, etc.)
- Configuring `package.json` extension manifest
- Debugging extension activation or lifecycle issues
- Packaging and publishing extensions

## Quick Reference

See [./references/extension-manifest.md](./references/extension-manifest.md) for package.json configuration.
See [./references/extension-apis.md](./references/extension-apis.md) for key API references.
See [./references/activation-events.md](./references/activation-events.md) for activation events.
See [./references/packaging.md](./references/packaging.md) for build, package, and publish.

## Extension Structure

```
my-extension/
├── .vscodeignore          # Files excluded from .vsix package
├── package.json           # Extension manifest (REQUIRED)
├── tsconfig.json          # TypeScript configuration
├── CHANGELOG.md           # Release notes
├── README.md              # Extension documentation
├── LICENSE                # License file
├── icons/                 # Extension icons (PNG only, 128x128)
└── src/
    ├── extension.ts       # Main entry point (activate/deactivate)
    └── ...
```

## Key Concepts

### Activation
- `activationEvents` in `package.json` defines when extension loads
- `onStartupFinished` — after VS Code fully starts (recommended for most)
- `onCommand:xxx` — when specific command is invoked
- `*` — on VS Code start (avoid unless necessary)
- `activate()` function is called when activation event fires
- `deactivate()` is called on shutdown (for cleanup)

### Extension Context
- `context.secrets` — `SecretStorage` for API keys, tokens
- `context.subscriptions` — disposable resources (cleaned up on deactivate)
- `context.globalState` — persistent key-value store
- `context.workspaceState` — workspace-scoped key-value store
- `context.extensionPath` — absolute path to extension directory
- `context.extensionUri` — URI of extension directory

### Commands
- Registered in `package.json` under `contributes.commands`
- Implemented with `vscode.commands.registerCommand()`
- Can be invoked from keybindings, menus, or programmatically
- Use `vscode.commands.executeCommand()` to call built-in commands

### Configuration (Settings)
- Defined in `package.json` under `contributes.configuration`
- Accessed via `vscode.workspace.getConfiguration('section')`
- Supports types: string, number, boolean, enum, array, object
- Can be workspace-scoped or global

## Common Patterns

### SecretStorage (Secure API Keys)
```typescript
// Store
await context.secrets.store('myKey', 'value');

// Retrieve
const value = await context.secrets.get('myKey');

// Delete
await context.secrets.delete('myKey');

// Listen for changes
context.secrets.onDidChange((e) => { /* e.key */ });
```

### StatusBarItem
```typescript
const item = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Left, // or .Right
  100 // priority (higher = more left)
);
item.text = '$(hubot) Hello';
item.tooltip = 'Click me';
item.command = 'extension.myCommand';
item.show();
```

### Configuration Change Listener
```typescript
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('myExtension')) {
    // Re-read config
  }
});
```

## Best Practices
- Use `onStartupFinished` activation for most extensions
- Store API keys in SecretStorage, NOT in settings.json
- Always dispose resources via `context.subscriptions`
- Use `.vscodeignore` to keep .vsix small
- Add `node_modules/` and `.thecoder/` to `.vscodeignore`
- Test with `Developer: Reload Window` after changes
