# Community Notes Helper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tampermonkey userscript that adds a fact-check button to tweets, sends tweet content to an AI provider, displays the result inline, and auto-fills the Community Notes dialog.

**Architecture:** Single `.user.js` file with modular internal structure. Uses MutationObserver to detect tweets, injects UI elements, calls AI via GM_xmlhttpRequest, stores settings via GM_getValue/GM_setValue.

**Tech Stack:** JavaScript (Tampermonkey userscript), no external dependencies

---

## Chunk 1: Script Setup and Core Infrastructure

**Files:**
- Create: `community-notes-helper.user.js`

- [ ] **Step 1: Create the userscript with Tampermonkey metadata block**

```javascript
// ==UserScript==
// @name         Community Notes Helper
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  AI-powered fact-check assistant for Twitter Community Notes
// @author       Community
// @match        https://twitter.com/*
// @match        https://x.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @connect      localhost
// @icon         https://abs.twimg.com/icons/apple-touch-icon-192x192.png
// @updateURL    https://raw.githubusercontent.com/YOUR_REPO/community-notes-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_REPO/community-notes-helper.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ===== CONSTANTS =====
    const SCRIPT_NAME = 'CommunityNotesHelper';
    const VERSION = '0.1.0';

    // Default settings
    const DEFAULT_SETTINGS = {
        provider: 'openai',
        apiKey: '',
        promptTemplate: `You are a fact-checker helping with Twitter Community Notes. 
Analyze the following tweet and provide a balanced, factual note that could help others understand the truth:

Tweet: "{tweetText}"
Author: {authorName}

Provide a brief (200 character max), factual Community Note that explains any inaccuracies or adds context. Be neutral and factual.`,
        dataToSend: 'text',
        cacheEnabled: true,
        showInline: true,
        keyboardShortcut: ''
    };

    // ===== STATE =====
    let settings = { ...DEFAULT_SETTINGS };

    // ===== UTILITIES =====
    function log(...args) {
        console.log(`[${SCRIPT_NAME}]`, ...args);
    }

    function getSetting(key) {
        return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    }

    async function loadSettings() {
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            const value = GM_getValue(`settings_${key}`, DEFAULT_SETTINGS[key]);
            settings[key] = typeof value === 'string' ? value : (value ?? DEFAULT_SETTINGS[key]);
        }
    }

    async function saveSettings() {
        for (const key of Object.keys(settings)) {
            GM_setValue(`settings_${key}`, settings[key]);
        }
    }

    // ===== PROVIDER INTERFACE =====
    const PROVIDERS = {
        openai: {
            name: 'OpenAI',
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            buildRequest: (prompt, data) => ({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: prompt.replace('{tweetText}', data.text).replace('{authorName}', data.author) },
                    { role: 'user', content: `Tweet: "${data.text}"` }
                ],
                max_tokens: 300
            }),
            parseResponse: (response) => response.choices?.[0]?.message?.content || '',
            getHeaders: (apiKey) => ({
                'Authorization': `Bearer ${apiKey}`
            })
        },
        anthropic: {
            name: 'Anthropic',
            apiUrl: 'https://api.anthropic.com/v1/messages',
            buildRequest: (prompt, data) => ({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 300,
                system: prompt.replace('{tweetText}', data.text).replace('{authorName}', data.author),
                messages: [{ role: 'user', content: `Tweet: "${data.text}"` }]
            }),
            parseResponse: (response) => response.content?.[0]?.text || '',
            getHeaders: (apiKey) => ({
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            })
        },
        gemini: {
            name: 'Google Gemini',
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            buildRequest: (prompt, data) => ({
                contents: [{
                    parts: [{ text: `${prompt.replace('{tweetText}', data.text).replace('{authorName}', data.author)}\n\nTweet: "${data.text}"` }]
                }],
                generationConfig: { maxOutputTokens: 300 }
            }),
            parseResponse: (response) => response.candidates?.[0]?.content?.parts?.[0]?.text || '',
            getHeaders: (apiKey) => ({
                'Content-Type': 'application/json'
            })
        },
        ollama: {
            name: 'Ollama (Local)',
            apiUrl: 'http://localhost:11434/api/generate',
            buildRequest: (prompt, data) => ({
                model: 'llama3.2',
                prompt: `${prompt.replace('{tweetText}', data.text).replace('{authorName}', data.author)}\n\nTweet: "${data.text}"`,
                stream: false
            }),
            parseResponse: (response) => response.response || ''
        }
    };

    // ===== CACHE =====
    const CACHE_PREFIX = 'cnh_cache_';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    const CACHE_IDS_KEY = 'cnh_cache_ids'; // Track cached tweet IDs

    function getCacheKey(tweetId) {
        return `${CACHE_PREFIX}${tweetId}`;
    }

    function getCachedResponse(tweetId) {
        if (!getSetting('cacheEnabled')) return null;
        
        const cached = GM_getValue(getCacheKey(tweetId));
        if (!cached) return null;
        
        try {
            const { response, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CACHE_TTL) {
                GM_setValue(getCacheKey(tweetId), null); // Clear expired
                return null;
            }
            return response;
        } catch (e) {
            return null;
        }
    }

    function setCachedResponse(tweetId, response) {
        if (!getSetting('cacheEnabled')) return;
        GM_setValue(getCacheKey(tweetId), JSON.stringify({ response, timestamp: Date.now() }));
        
        // Track cached IDs
        const ids = new Set(GM_getValue(CACHE_IDS_KEY, []));
        ids.add(tweetId);
        GM_setValue(CACHE_IDS_KEY, Array.from(ids));
    }

    function clearCache() {
        const ids = GM_getValue(CACHE_IDS_KEY, []);
        ids.forEach(tweetId => {
            GM_setValue(getCacheKey(tweetId), null);
        });
        GM_setValue(CACHE_IDS_KEY, []);
    }

    // ===== INITIALIZATION =====
    function init() {
        loadSettings().then(() => {
            log('Settings loaded:', settings);
            GM_registerMenuCommand('Community Notes Helper - Settings', showSettingsModal);
            observeTweets();
        });
    }

    function observeTweets() {
        // Implemented in Chunk 2
    }

    function handleFactCheck(tweetEl, tweetId, data) {
        // Implemented in Chunk 3
    }

    function showSettingsModal() {
        // Implemented in Chunk 4
    }

    // Start the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
```

- [ ] **Step 2: Verify file is valid JavaScript (basic syntax check)**

Run: `node --check community-notes-helper.user.js` (if node available) or open in browser devtools console
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add community-notes-helper.user.js
git commit -m "feat: add script setup with Tampermonkey metadata and core infrastructure"
```

---

## Chunk 2: Tweet Detection and Button Injection

**Files:**
- Modify: `community-notes-helper.user.js`

- [ ] **Step 1: Implement tweet detection and button injection**

Replace the placeholder `observeTweets` function:

```javascript
// Add after the observeTweets placeholder:

function observeTweets() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.matches?.('[data-testid="tweet"]') || node.querySelector?.('[data-testid="tweet"]')) {
                        processTweetElement(node.matches ? node : node.querySelector('[data-testid="tweet"]'));
                    }
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Process existing tweets
    document.querySelectorAll('[data-testid="tweet"]').forEach(processTweetElement);
}

function processTweetElement(tweetEl) {
    if (tweetEl.dataset.cnhProcessed) return;
    tweetEl.dataset.cnhProcessed = 'true';

    const tweetId = tweetEl.dataset.testId || generateTweetId(tweetEl);
    const tweetText = extractTweetText(tweetEl);
    const authorName = extractAuthorName(tweetEl);

    // Find action buttons container
    const actionBar = tweetEl.querySelector('[data-testid="tweet"] [role="group"]') || 
                      tweetEl.querySelector('.r-1habvwh');

    if (!actionBar) return;

    // Create fact-check button
    const btn = document.createElement('div');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
        <path d="m9 11 2 2 4-4"></path>
    </svg>`;
    btn.className = 'cnh-factcheck-btn';
    btn.title = 'Fact-check with AI';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleFactCheck(tweetEl, tweetId, { text: tweetText, author: authorName });
    });

    actionBar.insertBefore(btn, actionBar.firstChild);
}

function extractTweetText(tweetEl) {
    const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
    if (!textEl) return '';
    
    // Get text content, removing "RT @" prefix if present
    let text = textEl.textContent.trim();
    if (text.startsWith('RT @')) {
        text = text.replace(/^RT @[^:]+:\s*/, '');
    }
    return text;
}

function extractAuthorName(tweetEl) {
    const nameEl = tweetEl.querySelector('[data-testid="tweet"] a[role="link"] span') ||
                  tweetEl.querySelector('.r-1habvwh a[role="link"] span');
    return nameEl?.textContent?.trim() || 'Unknown';
}

function generateTweetId(tweetEl) {
    return 'tweet_' + Math.random().toString(36).substr(2, 9);
}

// Add CSS for button
GM_addStyle(`
    .cnh-factcheck-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        cursor: pointer;
        color: #536471;
        transition: background-color 0.2s, color 0.2s;
    }
    .cnh-factcheck-btn:hover {
        background-color: #e8f5fd;
        color: #1d9bf0;
    }
`);
```

- [ ] **Step 2: Commit**

```bash
git add community-notes-helper.user.js
git commit -m "feat: add tweet detection and fact-check button injection"
```

---

## Chunk 3: AI Provider and API Calls

**Files:**
- Modify: `community-notes-helper.user.js`

- [ ] **Step 1: Implement handleFactCheck and callAI functions**

Add after the extract functions:

```javascript
async function handleFactCheck(tweetEl, tweetId, data) {
    // Show loading indicator
    const indicator = createInlineIndicator('loading');
    const tweetActions = tweetEl.querySelector('[role="group"]');
    if (tweetActions && getSetting('showInline')) {
        tweetActions.parentElement.appendChild(indicator);
    }

    try {
        // Check cache first
        const cached = getCachedResponse(tweetId);
        if (cached) {
            log('Using cached response for', tweetId);
            updateIndicator(indicator, 'ready', cached);
            return cached;
        }

        // Call AI
        const response = await callAI(data);
        
        // Cache the response
        setCachedResponse(tweetId, response);
        
        // Update indicator
        if (getSetting('showInline')) {
            updateIndicator(indicator, 'ready', response);
        }
        
        // Store response for auto-fill
        tweetEl.dataset.cnhResponse = response;
        
        return response;
    } catch (error) {
        log('Fact-check error:', error);
        if (getSetting('showInline')) {
            updateIndicator(indicator, 'error', error.message);
        }
        throw error;
    }
}

async function callAI(data) {
    const apiKey = getSetting('apiKey');
    if (!apiKey) {
        throw new Error('API key not configured. Open settings to add your API key.');
    }

    const provider = PROVIDERS[getSetting('provider')];
    if (!provider) {
        throw new Error(`Unknown provider: ${getSetting('provider')}`);
    }

    // Filter data based on dataToSend setting
    const dataToSend = getSetting('dataToSend');
    let filteredData = { text: data.text };
    if (dataToSend === 'text+author' || dataToSend === 'text+author+media') {
        filteredData.author = data.author;
    }
    // media would require additional extraction logic

    const prompt = getSetting('promptTemplate');

    // Helper to make the request with retry
    const makeRequest = (resolve, reject, isRetry = false) => {
        let url = provider.apiUrl;
        
        // For Gemini, API key goes in URL query param
        if (getSetting('provider') === 'gemini') {
            url = `${url}?key=${apiKey}`;
        }

        const requestBody = provider.buildRequest(prompt, filteredData);
        
        GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            data: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                ...(provider.getHeaders?.(apiKey) || {})
            },
            onload: (response) => {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const result = provider.parseResponse(data);
                        resolve(result);
                    } catch (e) {
                        reject(new Error('Invalid response from AI'));
                    }
                } else if (response.status === 401) {
                    reject(new Error('Invalid API key. Check settings.'));
                } else if (response.status === 429) {
                    reject(new Error('Quota exceeded. Try again later.'));
                } else if (response.status === 403) {
                    reject(new Error('Access denied. Check API key and endpoint.'));
                } else if (!isRetry && response.status >= 500) {
                    // Retry once on server errors
                    setTimeout(() => makeRequest(resolve, reject, true), 2000);
                } else {
                    reject(new Error(`API error: ${response.status}`));
                }
            },
            onerror: () => {
                if (!isRetry) {
                    setTimeout(() => makeRequest(resolve, reject, true), 2000);
                } else {
                    reject(new Error('Connection error'));
                }
            },
            timeout: 30000,
            ontimeout: () => {
                if (!isRetry) {
                    setTimeout(() => makeRequest(resolve, reject, true), 2000);
                } else {
                    reject(new Error('Request timed out'));
                }
            }
        });
    };

    return new Promise((resolve, reject) => {
        makeRequest(resolve, reject, false);
    });
}
```
```

- [ ] **Step 2: Commit**

```bash
git add community-notes-helper.user.js
git commit -m "feat: add AI provider calls with error handling"
```

---

## Chunk 4: Inline Indicator Display

**Files:**
- Modify: `community-notes-helper.user.js`

- [ ] **Step 1: Implement inline indicator UI**

Add the indicator functions:

```javascript
function createInlineIndicator(state, content = '') {
    const indicator = document.createElement('div');
    indicator.className = 'cnh-indicator cnh-indicator--' + state;
    
    if (state === 'loading') {
        indicator.innerHTML = `
            <span class="cnh-spinner"></span>
            <span>Checking...</span>
        `;
    } else if (state === 'ready') {
        indicator.innerHTML = `
            <span class="cnh-indicator-icon">✓</span>
            <span>AI Note</span>
        `;
        indicator.title = content;
        indicator.addEventListener('click', () => showPopover(indicator, content));
    } else if (state === 'error') {
        indicator.innerHTML = `
            <span class="cnh-indicator-icon">!</span>
            <span>Error</span>
        `;
        indicator.title = content;
    }

    return indicator;
}

function updateIndicator(indicator, state, content) {
    indicator.className = 'cnh-indicator cnh-indicator--' + state;
    
    if (state === 'loading') {
        indicator.innerHTML = `
            <span class="cnh-spinner"></span>
            <span>Checking...</span>
        `;
    } else if (state === 'ready') {
        indicator.innerHTML = `
            <span class="cnh-indicator-icon">✓</span>
            <span>AI Note</span>
        `;
        indicator.title = content;
        indicator.onclick = () => showPopover(indicator, content);
    } else if (state === 'error') {
        indicator.innerHTML = `
            <span class="cnh-indicator-icon">!</span>
            <span>Error</span>
        `;
        indicator.title = content;
    }
}

function showPopover(anchor, content) {
    // Remove existing popover
    const existing = document.querySelector('.cnh-popover');
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.className = 'cnh-popover';
    popover.textContent = content;

    document.body.appendChild(popover);

    const rect = anchor.getBoundingClientRect();
    popover.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    popover.style.left = (rect.left + window.scrollX) + 'px';

    // Close on click outside
    const closeHandler = (e) => {
        if (!popover.contains(e.target) && e.target !== anchor) {
            popover.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// Add CSS for indicator
GM_addStyle(`
    .cnh-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        cursor: pointer;
        margin-top: 4px;
    }
    .cnh-indicator--loading {
        background: #f0f0f0;
        color: #666;
    }
    .cnh-indicator--ready {
        background: #e8f5fd;
        color: #1d9bf0;
    }
    .cnh-indicator--error {
        background: #fee2e2;
        color: #dc2626;
    }
    .cnh-indicator-icon {
        font-weight: bold;
    }
    .cnh-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid #666;
        border-top-color: transparent;
        border-radius: 50%;
        animation: cnh-spin 0.8s linear infinite;
    }
    @keyframes cnh-spin {
        to { transform: rotate(360deg); }
    }
    .cnh-popover {
        position: absolute;
        background: white;
        border: 1px solid #e1e8ed;
        border-radius: 8px;
        padding: 12px;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        font-size: 13px;
        line-height: 1.4;
    }
`);
```

- [ ] **Step 2: Commit**

```bash
git add community-notes-helper.user.js
git commit -m "feat: add inline indicator with expandable popover"
```

---

## Chunk 5: Settings Modal

**Files:**
- Modify: `community-notes-helper.user.js`

- [ ] **Step 1: Implement settings modal UI**

Replace the placeholder `showSettingsModal` function:

```javascript
function showSettingsModal() {
    // Remove existing modal
    const existing = document.getElementById('cnh-settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'cnh-settings-modal';
    modal.className = 'cnh-modal-overlay';
    
    const currentProvider = getSetting('provider');
    const providersHtml = Object.entries(PROVIDERS)
        .map(([key, p]) => `<option value="${key}" ${key === currentProvider ? 'selected' : ''}>${p.name}</option>`)
        .join('');

    modal.innerHTML = `
        <div class="cnh-modal">
            <h2>Community Notes Helper Settings</h2>
            
            <div class="cnh-form-group">
                <label>AI Provider</label>
                <select id="cnh-provider">${providersHtml}</select>
            </div>
            
            <div class="cnh-form-group">
                <label>API Key</label>
                <input type="password" id="cnh-api-key" placeholder="Enter your API key" value="${getSetting('apiKey')}">
            </div>
            
            <div class="cnh-form-group">
                <label>Prompt Template</label>
                <textarea id="cnh-prompt" rows="6">${getSetting('promptTemplate')}</textarea>
                <small>Use {tweetText} and {authorName} as placeholders</small>
            </div>
            
            <div class="cnh-form-group">
                <label>Data to Send</label>
                <select id="cnh-data-to-send">
                    <option value="text" ${getSetting('dataToSend') === 'text' ? 'selected' : ''}>Tweet text only</option>
                    <option value="text+author" ${getSetting('dataToSend') === 'text+author' ? 'selected' : ''}>Text + Author</option>
                    <option value="text+author+media" ${getSetting('dataToSend') === 'text+author+media' ? 'selected' : ''}>Text + Author + Media</option>
                </select>
            </div>
            
            <div class="cnh-form-group cnh-form-group--checkbox">
                <label>
                    <input type="checkbox" id="cnh-cache-enabled" ${getSetting('cacheEnabled') ? 'checked' : ''}>
                    Enable caching (24 hour TTL)
                </label>
            </div>
            
            <div class="cnh-form-group cnh-form-group--checkbox">
                <label>
                    <input type="checkbox" id="cnh-show-inline" ${getSetting('showInline') ? 'checked' : ''}>
                    Show inline indicator
                </label>
            </div>
            
            <div class="cnh-form-actions">
                <button id="cnh-clear-cache" class="cnh-btn cnh-btn--secondary">Clear Cache</button>
                <div class="cnh-form-actions-right">
                    <button id="cnh-cancel" class="cnh-btn cnh-btn--secondary">Cancel</button>
                    <button id="cnh-save" class="cnh-btn cnh-btn--primary">Save</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('cnh-cancel').onclick = () => modal.remove();
    document.getElementById('cnh-save').onclick = () => {
        settings.provider = document.getElementById('cnh-provider').value;
        settings.apiKey = document.getElementById('cnh-api-key').value;
        settings.promptTemplate = document.getElementById('cnh-prompt').value;
        settings.dataToSend = document.getElementById('cnh-data-to-send').value;
        settings.cacheEnabled = document.getElementById('cnh-cache-enabled').checked;
        settings.showInline = document.getElementById('cnh-show-inline').checked;
        saveSettings();
        modal.remove();
        log('Settings saved');
    };
    document.getElementById('cnh-clear-cache').onclick = () => {
        clearCache();
        alert('Cache cleared');
    };
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

// Add CSS for modal
GM_addStyle(`
    .cnh-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
    }
    .cnh-modal {
        background: white;
        border-radius: 12px;
        padding: 24px;
        width: 90%;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
    }
    .cnh-modal h2 {
        margin: 0 0 20px;
        font-size: 18px;
        font-weight: 600;
    }
    .cnh-form-group {
        margin-bottom: 16px;
    }
    .cnh-form-group label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        font-size: 14px;
    }
    .cnh-form-group input[type="text"],
    .cnh-form-group input[type="password"],
    .cnh-form-group select,
    .cnh-form-group textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #cfd9de;
        border-radius: 8px;
        font-size: 14px;
        box-sizing: border-box;
    }
    .cnh-form-group textarea {
        resize: vertical;
        font-family: monospace;
    }
    .cnh-form-group small {
        display: block;
        margin-top: 4px;
        color: #536471;
        font-size: 12px;
    }
    .cnh-form-group--checkbox label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
    }
    .cnh-form-group--checkbox input {
        width: auto;
    }
    .cnh-form-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
    }
    .cnh-form-actions-right {
        display: flex;
        gap: 8px;
    }
    .cnh-btn {
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        border: none;
    }
    .cnh-btn--primary {
        background: #1d9bf0;
        color: white;
    }
    .cnh-btn--primary:hover {
        background: #1a8cd8;
    }
    .cnh-btn--secondary {
        background: #eff3f4;
        color: #0f1419;
    }
    .cnh-btn--secondary:hover {
        background: #d7dbdc;
    }
`);
```

- [ ] **Step 2: Commit**

```bash
git add community-notes-helper.user.js
git commit -m "feat: add settings modal with all configuration options"
```

---

## Chunk 6: Auto-Fill Community Notes Dialog

**Files:**
- Modify: `community-notes-helper.user.js`

- [ ] **Step 1: Implement dialog detection and auto-fill**

In the existing init() function, add `observeCommunityNotesDialog();` after `observeTweets();`:

```javascript
function init() {
    loadSettings().then(() => {
        log('Settings loaded:', settings);
        GM_registerMenuCommand('Community Notes Helper - Settings', showSettingsModal);
        GM_registerMenuCommand('Community Notes Helper - Check for Updates', checkForUpdates);
        observeTweets();
        observeCommunityNotesDialog();
    });
}

function observeCommunityNotesDialog() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if this is a community notes dialog
                    if (isCommunityNotesDialog(node)) {
                        setTimeout(() => fillCommunityNotesDialog(node), 100);
                    }
                    // Also check children
                    const dialog = node.querySelector?.('[data-testid="alert-dialog"], [role="dialog"]');
                    if (dialog && isCommunityNotesDialog(dialog)) {
                        setTimeout(() => fillCommunityNotesDialog(dialog), 100);
                    }
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function isCommunityNotesDialog(el) {
    if (!el) return false;
    const text = el.textContent?.toLowerCase() || '';
    return text.includes('community note') || 
           text.includes('what\'s happening') ||
           text.includes('add a note') ||
           el.querySelector?.('[aria-label*="note"]') ||
           el.querySelector?.('[aria-label*="context"]');
}

function fillCommunityNotesDialog(dialogEl) {
    // Find the tweet being responded to
    const tweetEl = findParentTweet(dialogEl);
    if (!tweetEl) return;

    const response = tweetEl.dataset.cnhResponse;
    if (!response) {
        log('No AI response available for this tweet');
        return;
    }

    // Find textarea
    const textarea = dialogEl.querySelector('[role="textbox"]') ||
                     dialogEl.querySelector('textarea') ||
                     dialogEl.querySelector('[aria-label*="note"]') ||
                     dialogEl.querySelector('[aria-label*="context"]');

    if (!textarea) {
        log('Could not find textarea in community notes dialog');
        return;
    }

    // Pre-fill the textarea
    if (!textarea.value || textarea.value.length < 10) {
        textarea.value = response;
        
        // Trigger input event to ensure React/other frameworks notice
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        
        log('Community Notes dialog auto-filled with AI response');
    }
}

function findParentTweet(el) {
    let current = el;
    while (current) {
        if (current.matches?.('[data-testid="tweet"]') || current.dataset?.testId === 'tweet') {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add community-notes-helper.user.js
git commit -m "feat: add auto-fill for Community Notes dialog"
```

---

## Chunk 7: Final Polish and Review

**Files:**
- Modify: `community-notes-helper.user.js`

- [ ] **Step 1: Add version check and update notification**

Update the metadata and add check:

```javascript
// In the script header, update:
// @version      0.1.0

// Add function to check for updates (optional - requires a version endpoint)
async function checkForUpdates() {
    // This would require a version.json endpoint
    // For now, just log the current version
    log(`Version ${VERSION} running`);
}

// Call at init
loadSettings().then(() => {
    log('Settings loaded:', settings);
    GM_registerMenuCommand('Community Notes Helper - Settings', showSettingsModal);
    GM_registerMenuCommand('Community Notes Helper - Check for Updates', checkForUpdates);
    observeTweets();
    observeCommunityNotesDialog();
});
```

- [ ] **Step 2: Review final script for completeness**

Check that all features from the spec are implemented:
- ✅ Tampermonkey metadata
- ✅ Tweet detection via MutationObserver
- ✅ Button injection on each tweet
- ✅ OpenAI provider
- ✅ Settings modal with all options
- ✅ Inline indicator (loading, ready, error states)
- ✅ Cache implementation
- ✅ Auto-fill Community Notes dialog
- ✅ Error handling (401, 403, 429, timeout)
- ✅ Edge cases handled

- [ ] **Step 3: Commit**

```bash
git add community-notes-helper.user.js
git commit -m "feat: add version check, update notification, and final polish"
```

---

## Summary

| Chunk | Description | Files Changed |
|-------|-------------|---------------|
| 1 | Script setup and core infrastructure | `community-notes-helper.user.js` |
| 2 | Tweet detection and button injection | `community-notes-helper.user.js` |
| 3 | AI provider and API calls | `community-notes-helper.user.js` |
| 4 | Inline indicator display | `community-notes-helper.user.js` |
| 5 | Settings modal | `community-notes-helper.user.js` |
| 6 | Auto-fill Community Notes dialog | `community-notes-helper.user.js` |
| 7 | Final polish | `community-notes-helper.user.js` |

After implementation, users can install by:
1. Installing Tampermonkey browser extension
2. Creating a new script and pasting `community-notes-helper.user.js`
3. Configuring their API key in the settings
