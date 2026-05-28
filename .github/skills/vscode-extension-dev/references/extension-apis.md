# VS Code Extension APIs

Key API references for VS Code extension development.

## SecretStorage

Secure storage for sensitive data (API keys, tokens). Uses OS keychain.

### Interface
```typescript
interface SecretStorage {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
  onDidChange: Event<SecretStorageChangeEvent>;
}
```

### Access
```typescript
// From extension context
const secrets: vscode.SecretStorage = context.secrets;

// Store
await secrets.store('myKey', 'myValue');

// Get
const value = await secrets.get('myKey');

// Delete
await secrets.delete('myKey');

// Listen for changes
secrets.onDidChange((e: vscode.SecretStorageChangeEvent) => {
  console.log(`Key changed: ${e.key}`);
});
```

### Platform Backends
| OS | Storage |
|---|---|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret (GNOME Keyring / KDE Wallet) |

### Best Practices
- Use descriptive key names with prefixes: `extensionName.keyName`
- Never store secrets in `settings.json` or workspace state
- Handle `undefined` return from `get()` (key not set)
- Keys survive extension updates and VS Code reinstalls

## StatusBarItem

Display information and actions in the VS Code status bar.

### Creating
```typescript
const item = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Left, // or Right
  100 // priority
);
```

### Properties
| Property | Type | Description |
|---|---|---|
| `text` | `string` | Display text (supports `$(icon)` syntax) |
| `tooltip` | `string` | Hover tooltip |
| `command` | `string` | Command to execute on click |
| `color` | `string` | Text color (CSS color) |
| `backgroundColor` | `ThemeColor` | Background color |
| `alignment` | `StatusBarAlignment` | Left or Right (read-only) |
| `priority` | `number` | Higher = more left (read-only) |

### Methods
| Method | Description |
|---|---|
| `show()` | Make visible |
| `hide()` | Make hidden |
| `dispose()` | Remove from status bar |

### Icon Syntax
```
$(iconName) — uses Codicon icons
```
Common icons: `$(hubot)`, `$(radio-tower)`, `$(globe)`, `$(sync~spin)`, `$(warning)`, `$(check)`, `$(error)`, `$(symbol-misc)`, `$(chip)`, `$(cloud)`

### Example
```typescript
const item = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Left, 100
);
item.text = '$(hubot) Hello';
item.tooltip = 'Click for details';
item.command = 'extension.myCommand';
item.show();
context.subscriptions.push(item);
```

## Window & Commands

### showInputBox
```typescript
const value = await vscode.window.showInputBox({
  title: 'Enter API Key',
  password: true,           // Mask input
  placeHolder: 'sk-...',
  prompt: 'Enter your key',
  ignoreFocusOut: true,     // Don't close on focus loss
  validateInput: (text) => text.length < 5 ? 'Too short' : null
});
```

### showInformationMessage
```typescript
const result = await vscode.window.showInformationMessage(
  'Message text',
  { modal: true },          // Optional: require dismissal
  'Button 1',
  'Button 2'
);
// result = 'Button 1' | 'Button 2' | undefined
```

### showQuickPick
```typescript
const selection = await vscode.window.showQuickPick(
  ['Option 1', 'Option 2'],
  { placeHolder: 'Select an option' }
);
```

### QuickPick with items
```typescript
const items = [
  { label: 'Option 1', description: 'Description 1' },
  { label: 'Option 2', description: 'Description 2' }
];
const selection = await vscode.window.showQuickPick(items);
```

## Workspace Configuration

```typescript
// Read config
const config = vscode.workspace.getConfiguration('myExtension');
const value = config.get<string>('settingName', 'default');

// Write config (user settings)
await config.update('settingName', 'newValue', vscode.ConfigurationTarget.Global);

// Listen for changes
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('myExtension')) {
    // React to change
  }
});
```

## Disposables

```typescript
// Always add to subscriptions for cleanup
context.subscriptions.push(
  command,
  statusBarItem,
  configListener
);

// Or create a disposable
const disposable = new vscode.Disposable(() => {
  // cleanup
});
context.subscriptions.push(disposable);
```

## Output Channel

```typescript
const channel = vscode.window.createOutputChannel('My Extension');
channel.appendLine('Log message');
channel.show(); // Reveal in output panel
```

## Diagnostics

```typescript
const collection = vscode.languages.createDiagnosticCollection('myExtension');
collection.set(uri, [
  new vscode.Diagnostic(range, 'Error message', vscode.DiagnosticSeverity.Error)
]);
```
