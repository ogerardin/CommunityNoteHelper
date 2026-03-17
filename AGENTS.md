# AGENTS.md - Community Notes Helper

## Project Overview

A **Tampermonkey userscript** that adds a fact-check button to tweets on Twitter/X. When clicked, it opens your selected AI chat (Google AI Mode, ChatGPT, or Claude) with a pre-filled fact-check prompt.

## Project Structure

```
CommunityNoteHelper/
├── community-notes-helper.user.js   # Main script (Tampermonkey userscript)
├── README.md                         # Installation & usage instructions
├── LICENSE                           # CC0 public domain
├── AGENTS.md                        # Guidelines for AI coding agents
└── docs/superpowers/
    ├── specs/                       # Design specifications
    └── plans/                       # Implementation plans
```

## Build/Lint/Test Commands

### No Build System

This is a plain JavaScript userscript - no build step required. The script runs directly in the browser via Tampermonkey.

### Testing

**No formal test suite exists.** Manual testing:
1. Load the script in Tampermonkey
2. Open twitter.com or x.com
3. Verify the fact-check button appears on tweets
4. Click the button and verify AI response

### Linting

No linter configured. To add ESLint later:
```bash
npm init -y
npm install eslint --save-dev
npx eslint community-notes-helper.user.js
```

## Code Style Guidelines

### General Principles

- **Keep it simple** - Browser userscript, avoid dependencies
- **Use vanilla JavaScript** - No frameworks, no transpilation
- **ES6+ features allowed** - const/let, arrow functions, template literals, optional chaining

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `handleFactCheck()`, `loadSettings()` |
| Constants | UPPER_SNAKE_CASE | `VERSION`, `CACHE_PREFIX` |
| Settings keys | camelCase | `promptTemplate`, `aiOutputMode` |
| CSS classes | kebab-case | `.cnh-factcheck-btn` |
| Dataset attributes | camelCase | `cnhProcessed` |

### JavaScript Style

```javascript
// Use const/let, not var
const VERSION = '0.1.0';
let settings = { ...DEFAULT_SETTINGS };

// Arrow functions for callbacks
btn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleFactCheck(tweetEl, tweetId, data);
});

// Template literals and optional chaining
log(`[${SCRIPT_NAME}] Settings loaded:`);
const response = tweetEl?.dataset?.cnhResponse;

// Destructuring
const { text, author } = data;
```

### Imports/Dependencies

- No external imports - this runs in Tampermonkey
- Use Tampermonkey GM_* APIs: `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, `GM_addStyle`, `GM_registerMenuCommand`

### Types

- JSDoc comments for complex functions
- Primitive types: string, number, boolean
- Objects: plain JSON-serializable structures

### Tampermonkey Metadata Block

Always include at file top (keep @version updated):

```javascript
// ==UserScript==
// @name         Community Notes Helper
// @namespace    http://tampermonkey.net/
// @version      0.0.1
// @description  AI fact-check assistant for Community Notes
// @author       Your Name
// @match        https://twitter.com/*
// @match        https://x.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==
```

### Version Bumping

**ALWAYS bump the version on EVERY update.** This is critical for Tampermonkey to detect changes.

When making changes:
1. Update `@version` in metadata (line 4)
2. Update `VERSION` constant (around line 26)
3. Commit: `git commit -m "feat: description"` (do NOT push - wait for review)

### Git Workflow

**Do NOT push automatically after each commit.** Wait for explicit approval or review before pushing.

```bash
# Create feature branch with worktree
git worktree add .worktrees/feature-name -b feature/feature-name

# Work on feature...
git commit -m "feat: add new feature"

# When done:
git worktree remove .worktrees/feature-name

# Push only when explicitly approved
git push
```

### DOM Manipulation

- Use `document.createElement()` and `appendChild()`
- Use `dataset` for custom data storage
- Add guards to prevent duplicate elements

```javascript
function processTweetElement(tweetEl) {
    if (tweetEl.dataset.cnhProcessed) return;
    if (actionBar.querySelector('.cnh-factcheck-btn')) return;
    tweetEl.dataset.cnhProcessed = 'true';
    // ... rest of logic
}
```

### CSS

- Prefix all classes with `cnh-` to avoid conflicts
- Use inline SVG for icons
- Keep styles minimal

```javascript
GM_addStyle(`
    .cnh-factcheck-btn {
        display: flex;
        width: 34px;
        height: 34px;
    }
`);
```

### Security

- Never expose API keys in code
- Use `GM_getValue`/`GM_setValue` for secure storage
- Use `textContent` instead of `innerHTML` for untrusted content

```javascript
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
```

### Git Workflow

```bash
# Create feature branch with worktree
git worktree add .worktrees/feature-name -b feature/feature-name

# Work on feature...
git commit -m "feat: add new feature"

# When done:
git worktree remove .worktrees/feature-name
```

## Common Tasks

### Adding a New AI Output Option

To add a new AI output option (one that opens via URL):

1. Add the case in `handleAIOutput()` function:
```javascript
} else if (outputMode === 'newprovider') {
    window.open(`https://ai.example.com/?q=${encodedPrompt}`, '_blank');
    log('Opened New Provider');
}
```

2. Add the option in `showSettingsModal()` dropdown:
```html
<option value="newprovider" ${getSetting('aiOutputMode') === 'newprovider' ? 'selected' : ''}>New Provider</option>
```

### Adding a New Setting

1. Add to `DEFAULT_SETTINGS` constant
2. Add UI element in `showSettingsModal()`
3. Add save handler in modal's save button
4. Use `getSetting('key')` to read value

## Resources

- [Tampermonkey Documentation](https://www.tampermonkey.net/documentation.php)
- [Tampermonkey GM_* APIs](https://www.tampermonkey.net/documentation.php#api)
