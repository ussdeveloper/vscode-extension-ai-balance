# Extension Manifest (package.json)

The `package.json` is the most important file in a VS Code extension. It defines everything about your extension.

## Required Fields

```json
{
  "name": "my-extension",           // Extension ID (lowercase, hyphens)
  "displayName": "My Extension",    // Display name in marketplace
  "version": "0.1.0",               // SemVer
  "engines": { "vscode": "^1.85.0" }, // Minimum VS Code version
  "categories": ["Other"],          // Marketplace category
  "activationEvents": [],           // When extension activates
  "main": "./out/extension.js"      // Entry point (compiled JS)
}
```

## Categories
- `Programming Languages`, `Snippets`, `Linters`, `Themes`, `Debuggers`, `Formatters`, `Keymaps`, `SCM Providers`, `Testing`, `Machine Learning`, `Visualization`, `Language Packs`, `Notebooks`, `Education`, `Extension Packs`, `Data Science`, `AI`, `Azure`, `Chat`, `Other`

## Activation Events

```json
"activationEvents": [
  "onStartupFinished",              // After VS Code fully starts
  "onCommand:extension.myCommand",  // When command is invoked
  "onLanguage:javascript",          // When JS file is opened
  "onView:myViewId",                // When view is shown
  "onCustomEditor:myEditor",        // When custom editor opens
  "onFileSystem:myFs",              // When file system is accessed
  "workspaceContains:**/.git",      // When workspace contains file
  "*"                               // On VS Code start (avoid)
]
```

## Contributes (Extension Points)

### Commands
```json
"contributes": {
  "commands": [{
    "command": "extension.myCommand",
    "title": "My Extension: Do Something",
    "category": "My Extension",
    "icon": "$(hubot)"
  }]
}
```

### Configuration (Settings)
```json
"contributes": {
  "configuration": {
    "title": "My Extension",
    "properties": {
      "myExtension.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable feature"
      },
      "myExtension.apiKey": {
        "type": "string",
        "default": "",
        "description": "API key (use SecretStorage instead!)"
      },
      "myExtension.interval": {
        "type": "number",
        "default": 300,
        "description": "Interval in seconds"
      },
      "myExtension.currency": {
        "type": "string",
        "default": "USD",
        "enum": ["USD", "EUR", "PLN"],
        "enumDescriptions": ["$", "€", "zł"]
      }
    }
  }
}
```

### Keybindings
```json
"contributes": {
  "keybindings": [{
    "command": "extension.myCommand",
    "key": "ctrl+shift+a",
    "when": "editorTextFocus"
  }]
}
```

### Menus
```json
"contributes": {
  "menus": {
    "editor/context": [{
      "command": "extension.myCommand",
      "group": "navigation"
    }],
    "statusBar/tooltip": [{
      "command": "extension.myCommand"
    }]
  }
}
```

### Icons
```json
"contributes": {
  "iconThemes": [{
    "id": "myIcons",
    "label": "My Icons",
    "path": "./icons/my-icon-theme.json"
  }]
}
```

## Engine Compatibility

- `engines.vscode` must match the VS Code version you target
- `@types/vscode` version should match `engines.vscode`
- Example: `"engines": { "vscode": "^1.85.0" }` + `@types/vscode@1.85.0`

## Scripts

```json
"scripts": {
  "compile": "tsc -p tsconfig.json",
  "package": "vsce package --allow-missing-repository",
  "watch": "tsc -watch -p tsconfig.json",
  "lint": "eslint src/**/*.ts"
}
```

## Repository & Bugs

```json
"repository": {
  "type": "git",
  "url": "https://github.com/user/repo.git"
},
"bugs": {
  "url": "https://github.com/user/repo/issues"
}
```
