// ==UserScript==
// @name         Community Notes Helper
// @namespace    http://tampermonkey.net/
// @version      0.5.2
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
// ==/UserScript==

(function() {
    'use strict';

    // ===== CONSTANTS =====
    const SCRIPT_NAME = 'CommunityNotesHelper';
    const VERSION = '0.5.2';

    // Default settings
    const DEFAULT_SETTINGS = {
        promptTemplate: `You are a fact-checker helping with Twitter Community Notes. 
Analyze the following tweet and provide a balanced, factual note that could help others understand the truth:

Tweet: "{tweetText}"
Author: {authorName}

Provide a brief (200 character max), factual Community Note that explains any inaccuracies or adds context. Be neutral and factual.`,
        aiOutputMode: 'googleAI'
    };

    // ===== STATE =====
    let settings = { ...DEFAULT_SETTINGS };

    // ===== UTILITIES =====
    function log(...args) {
        console.log(`[${SCRIPT_NAME}]`, ...args);
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getSetting(key) {
        if (key in settings) return settings[key];
        return DEFAULT_SETTINGS[key];
    }

    async function loadSettings() {
        try {
            for (const key of Object.keys(DEFAULT_SETTINGS)) {
                const value = GM_getValue(`settings_${key}`, DEFAULT_SETTINGS[key]);
                settings[key] = typeof value === 'string' ? value : (value ?? DEFAULT_SETTINGS[key]);
            }
        } catch (e) {
            log('Failed to load settings:', e);
            settings = { ...DEFAULT_SETTINGS };
        }
    }

    async function saveSettings() {
        for (const key of Object.keys(settings)) {
            GM_setValue(`settings_${key}`, settings[key]);
        }
    }

    // ===== INITIALIZATION =====
    function init() {
        loadSettings().then(() => {
            log('Settings loaded:', settings);
            observeTweets();
        });
    }

    // Register menu commands synchronously (required by Tampermonkey)
    GM_registerMenuCommand('Community Notes Helper - Settings', showSettingsModal);
    GM_registerMenuCommand('Community Notes Helper - Check for Updates', checkForUpdates);

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

        document.querySelectorAll('[data-testid="tweet"]').forEach(processTweetElement);
    }

    function showUserNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'cnh-user-notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    function processTweetElement(tweetEl) {
        if (tweetEl.dataset.cnhProcessed) return;
        
        const actionBar = tweetEl.querySelector('[data-testid="tweet"] [role="group"]') || 
                          tweetEl.querySelector('.r-1habvwh');

        if (!actionBar) return;
        
        // Guard against duplicate buttons
        if (actionBar.querySelector('.cnh-factcheck-btn')) return;
        
        tweetEl.dataset.cnhProcessed = 'true';

        const tweetId = tweetEl.dataset.testid || generateTweetId(tweetEl);
        const tweetText = extractTweetText(tweetEl);
        const authorName = extractAuthorName(tweetEl);

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
            try {
                handleFactCheck(tweetEl, tweetId, { text: tweetText, author: authorName });
            } catch (err) {
                console.error('[CNH] Fact-check error:', err);
                btn.title = 'Error - check console';
            }
        });

        actionBar.insertBefore(btn, actionBar.firstChild);
    }

    function extractTweetText(tweetEl) {
        const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
        if (!textEl) return '';
        
        let text = textEl.textContent.trim();
        if (text.startsWith('RT @')) {
            text = text.replace(/^RT @[^:]+:\s*/, '');
        }
        return text;
    }

    function extractAuthorName(tweetEl) {
        const nameEl = tweetEl.querySelector('[data-testid="tweet"] a[role="link"] span') ||
                      tweetEl.querySelector('.r-1habvwh a[role="link"] span') ||
                      tweetEl.querySelector('a[role="link"] span') ||
                      tweetEl.querySelector('[data-testid="User-Name"] span');
        return nameEl?.textContent?.trim() || 'Unknown';
    }

    function generateTweetId(tweetEl) {
        const author = extractAuthorName(tweetEl);
        const text = extractTweetText(tweetEl);
        const hash = Array.from(author + text).reduce((acc, char) => {
            return ((acc << 5) - acc) + char.charCodeAt(0);
        }, 0);
        return 'tweet_' + Math.abs(hash).toString(36);
    }

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
        .cnh-user-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #0f1419;
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: cnh-notify-fadein 0.3s ease;
        }
        @keyframes cnh-notify-fadein {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `);

    async function handleFactCheck(tweetEl, tweetId, data) {
        const prompt = getSetting('promptTemplate');
        handleAIOutput(prompt, data);
        
        return 'Prompt ready';
    }

    function handleAIOutput(prompt, data) {
        const outputMode = getSetting('aiOutputMode');
        
        const fullPrompt = prompt
            .replace('{tweetText}', data.text)
            .replace('{authorName}', data.author || 'Unknown');
        
        const encodedPrompt = encodeURIComponent(fullPrompt);
        
        if (outputMode === 'googleAI') {
            window.open(`https://www.google.com/search?q=${encodedPrompt}&udm=50`, '_blank');
            log('Opened Google AI Mode');
        } else if (outputMode === 'chatgpt') {
            window.open(`https://chatgpt.com/?q=${encodedPrompt}`, '_blank');
            log('Opened ChatGPT');
        } else if (outputMode === 'claude') {
            window.open(`https://claude.ai/new?q=${encodedPrompt}`, '_blank');
            log('Opened Claude');
        } else {
            navigator.clipboard.writeText(fullPrompt).then(() => {
                showUserNotification('Prompt copied to clipboard! Paste it in your AI chat.');
            }).catch(err => {
                log('Clipboard error:', err);
                showUserNotification('Failed to copy. Check console for prompt.');
                console.log('Prompt:', fullPrompt);
            });
        }
    }

    async function showSettingsModal() {
        // Ensure settings are loaded before showing modal
        if (!settings.promptTemplate) {
            await loadSettings();
        }
        
        // Remove existing modal
        const existing = document.getElementById('cnh-settings-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'cnh-settings-modal';
        modal.className = 'cnh-modal-overlay';
        
        modal.innerHTML = `
            <div class="cnh-modal">
                <h2>Community Notes Helper Settings</h2>
                
                <div class="cnh-form-group">
                    <label>Prompt Template</label>
                    <textarea id="cnh-prompt" rows="6">${escapeHtml(getSetting('promptTemplate'))}</textarea>
                    <small>Use {tweetText} and {authorName} as placeholders</small>
                </div>
                
                <div class="cnh-form-group">
                    <label>AI Output</label>
                    <select id="cnh-ai-output-mode">
                        <option value="clipboard" ${getSetting('aiOutputMode') === 'clipboard' ? 'selected' : ''}>Copy to Clipboard</option>
                        <option value="googleAI" ${getSetting('aiOutputMode') === 'googleAI' ? 'selected' : ''}>Google AI Mode</option>
                        <option value="chatgpt" ${getSetting('aiOutputMode') === 'chatgpt' ? 'selected' : ''}>ChatGPT</option>
                        <option value="claude" ${getSetting('aiOutputMode') === 'claude' ? 'selected' : ''}>Claude</option>
                    </select>
                    <small>Choose how to deliver the AI query</small>
                </div>
                
                <div class="cnh-form-actions">
                    <button id="cnh-cancel" class="cnh-btn cnh-btn--secondary">Cancel</button>
                    <button id="cnh-save" class="cnh-btn cnh-btn--primary">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        document.getElementById('cnh-cancel').onclick = () => modal.remove();
        document.getElementById('cnh-save').onclick = () => {
            const promptTemplate = document.getElementById('cnh-prompt').value.trim();
            if (!promptTemplate) {
                alert('Prompt template cannot be empty');
                return;
            }
            settings.promptTemplate = promptTemplate;
            settings.aiOutputMode = document.getElementById('cnh-ai-output-mode').value;
            saveSettings();
            modal.remove();
            document.body.style.overflow = '';
            log('Settings saved:', settings.aiOutputMode);
        };
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                document.body.style.overflow = '';
            }
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
            color: #0f1419;
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
            color: #0f1419;
            background: white;
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

    function checkForUpdates() {
        const currentVersion = VERSION;
        const updateURL = 'https://raw.githubusercontent.com/YOUR_REPO/community-notes-helper.user.js';
        
        log('Checking for updates...');
        
        GM_xmlhttpRequest({
            method: 'GET',
            url: updateURL,
            onload: (response) => {
                try {
                    const match = response.responseText.match(/@version\s+(\d+\.\d+\.\d+)/);
                    if (match) {
                        const latestVersion = match[1];
                        if (latestVersion !== currentVersion) {
                            alert(`Update available: ${latestVersion}\nCurrent version: ${currentVersion}\n\nVisit the download URL to update.`);
                        } else {
                            alert('You are running the latest version.');
                        }
                    }
                } catch (e) {
                    log('Update check failed:', e);
                    alert('Failed to check for updates.');
                }
            },
            onerror: () => {
                log('Update check failed: network error');
                alert('Failed to check for updates.');
            }
        });
    }

    // Start the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
