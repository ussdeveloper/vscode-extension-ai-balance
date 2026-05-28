# Activation Events Reference

When your extension loads in VS Code.

## Event Types

| Event | Description | When to Use |
|---|---|---|
| `onStartupFinished` | After VS Code fully starts | **Recommended** for most extensions |
| `onLanguage:javascript` | When a file of that language opens | Language features |
| `onCommand:extension.xxx` | When specific command is invoked | Command-based extensions |
| `onView:viewId` | When a specific view is shown | Custom views/tree views |
| `onCustomEditor:editorId` | When custom editor opens | Custom editors |
| `onFileSystem:scheme` | When file system is accessed | File system providers |
| `workspaceContains:.git` | When workspace contains file | Project-specific tools |
| `onUri` | When extension URI is opened | Deep links |
| `onWebviewPanel:viewType` | When webview is created | Webview panels |
| `onEncrypted` | When encrypted data is accessed | Encryption-related |
| `onRenderer` | When webview renderer is created | Webview renderers |
| `*` | On VS Code start | **Avoid** — slows startup |

## Best Practice

```json
"activationEvents": [
  "onStartupFinished"
]
```

This is the recommended activation event for most extensions. It fires after VS Code has fully started, so your extension doesn't slow down the initial startup.

## onStartupFinished vs *

| Aspect | `onStartupFinished` | `*` |
|---|---|---|
| When activated | After VS Code fully starts | Immediately on VS Code start |
| Startup impact | None | Slows startup |
| Use case | Most extensions | Only if absolutely necessary |
| Recommendation | ✅ Use this | ❌ Avoid |

## Multiple Events

```json
"activationEvents": [
  "onStartupFinished",
  "onCommand:extension.myCommand"
]
```

The extension activates when ANY of the events fire.
