# Community Notes Helper - Design Specification

**Date:** 2026-03-15  
**Project:** Community Notes Helper for Twitter/X

## Overview

A Tampermonkey userscript that helps users submit fact-checking notes to Twitter's Community Notes system. When viewing a tweet, users can click a button to send the tweet to an AI agent for fact-checking, then paste the result into the Community Notes dialog or view it inline.

## Goals

1. Simplify the Community Notes submission process with AI-assisted fact-checking
2. Provide inline AI responses for quick reference
3. Support multiple AI providers with a pluggable architecture
4. Keep data local - no external server required

## Architecture

### Technology Stack

- **Userscript:** Tampermonkey script (`.user.js`)
- **Browser Support:** Chrome, Firefox, Edge, Safari (via Tampermonkey)
- **API Calls:** `GM_xmlhttpRequest` for AI provider communication
- **Storage:** `GM_getValue`/`GM_setValue` for settings

### Components

#### 1. Main Script (`community-notes-helper.user.js`)

- Runs on `twitter.com` and `x.com`
- Uses MutationObserver to detect tweets appearing in the DOM
- Injects UI elements directly into Twitter's page
- Handles all user interactions

#### 2. Settings System

- Stored via Tampermonkey's GM_* APIs
- Accessible via:
  - `GM_registerMenuCommand` - opens the settings modal
  - Keyboard shortcut (optional, configurable)
- Settings include:
  - API key per provider
  - Selected AI provider
  - Prompt template
  - Data to send (text only, text+author, etc.)
  - Caching enabled/disabled

#### 3. AI Provider Abstraction

- Pluggable provider interface
- Initial providers: OpenAI, Anthropic, Gemini, Ollama
- Each provider implements the `Provider` interface:
  ```javascript
  interface Provider {
    name: string;
    apiUrl: string;
    call(apiKey: string, prompt: string, data: TweetData): Promise<string>;
    getHeaders(apiKey: string): Record<string, string>;
  }
  ```
- **Adding new providers:** Add provider object to `PROVIDERS` registry in the script (see Provider interface above). Each provider is a JavaScript object, not a separate file.

## UI Design

### Tweet Button

- Position: Injected near tweet action buttons (reply, retweet, like)
- Icon: Inline SVG (magnifying glass with checkmark) injected via `innerHTML`
- Behavior: Single click triggers AI fact-check

### Inline Indicator

- Appearance: Subtle pill/badge below tweet
- States:
  - Loading: Spinner + "Checking..."
  - Ready: "AI Note" - clickable to expand
  - Error: "Error" - shows error message on hover
- Expansion: Click to show full AI response in popover (custom HTML div positioned relative to indicator)

### Settings Modal

- Triggered via Tampermonkey menu command
- Sections:
  - Provider selection dropdown
  - API key input (password field)
  - Prompt template textarea
  - Data selection checkboxes
  - Cache toggle
  - Save/Cancel buttons

## Data Flow

```
User clicks button on tweet
         ↓
Extract tweet data (text, author, media - per config)
         ↓
Check cache (if enabled) - return cached if found
         ↓
Call AI provider with prompt + tweet data
         ↓
Cache response (if enabled)
         ↓
Display inline indicator with response
         ↓
On Community Notes dialog open:
         ↓
Auto-fill dialog textarea with AI response
```

### Auto-Fill Mechanism

- **Dialog Detection:** MutationObserver on `document.body` watching for `[data-testid="alert-dialog"]` or `.r-1habvwh` (Twitter's dialog classes - verify at implementation time)
- **Target Element:** Find textarea with `role="textbox"` or `[aria-label*="note"]` inside dialog
- **Timing:** Wait 100ms after dialog appears, then inject
- **Fallback:** If selectors change, search by role="textbox" within dialog subtree
- **Maintenance:** If selectors break entirely (Twitter class names hashed/changed), users must update script. Include version number and check for updates.
- **User Action:** Pre-fill but do NOT auto-submit; user reviews and clicks Twitter's submit

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | "openai" | Selected AI provider |
| `apiKey` | string | "" | API key for selected provider |
| `promptTemplate` | string | (see below) | Prompt sent to AI |
| `dataToSend` | string | "text" | What to send: "text", "text+author", "text+author+media" |
| `cacheEnabled` | boolean | true | Cache responses by tweet ID |
| `showInline` | boolean | true | Show inline indicator |
| `keyboardShortcut` | string | "" | Optional keyboard shortcut to open settings (e.g., "Alt+N") |

### Cache Implementation

- **Storage:** `GM_getValue`/`GM_setValue` with JSON-serialized object
- **Cache Key:** `cnh_cache_{tweetId}` storing `{ response, timestamp }`
- **TTL:** 24 hours (configurable)
- **Eviction:** On read, check timestamp; expire if > TTL
- **Clear:** Manual clear via settings modal

### Default Prompt Template

```
You are a fact-checker helping with Twitter Community Notes. 
Analyze the following tweet and provide a balanced, factual note that could help others understand the truth:

Tweet: "{tweetText}"
Author: {authorName}

Provide a brief (200 character max), factual Community Note that explains any inaccuracies or adds context. Be neutral and factual.
```

## Error Handling

- **Quota Exceeded (429):** Detect 429 status, show "Quota exceeded" in indicator, notify user
- **Invalid API Key (401):** Detect 401 status, prompt to check settings
- **Forbidden (403):** Detect 403 status, show "Access denied" - likely wrong API endpoint
- **Timeout:** Request timeout at 30 seconds, retry once after 2 seconds, then show "Connection error"
- **Malformed Response:** If response is not valid text, show "Invalid response" and log for debugging
- **Rate Limiting:** Queue requests, process sequentially

## Edge Cases

- **Image-only tweet:** If no text found, show "No text to fact-check" error
- **Deleted tweet:** If tweet element removed during processing, abort and clean up
- **Retweets:** Use original tweet text (not "RT @user:" prefix) for fact-checking
- **Quote tweets:** Include quoted tweet text in context if config set to "text+author"
- **Thread tweets:** Handle as single tweet - user can note it's part of a thread
- **Rate limiting by Twitter:** If Community Notes button/dialog unavailable, show "Community Notes not available for this account"

## Implementation Phases

### Phase 1: Core Functionality
- Basic script setup with Tampermonkey metadata
- Tweet detection via MutationObserver
- Button injection
- OpenAI provider implementation
- Basic settings modal

### Phase 2: Enhanced Features
- Additional AI providers (Anthropic, Gemini, Ollama)
- Caching system
- Inline indicator display
- Auto-fill Community Notes dialog

### Phase 3: Polish
- Error handling improvements
- UX refinements
- Documentation
- Testing

## Acceptance Criteria

1. Script loads on twitter.com/x.com without errors
2. Fact-check button appears on each tweet
3. Clicking button sends tweet to configured AI provider
4. AI response displays inline when configured
5. Community Notes dialog auto-fills with response when opened
6. Settings can be configured via menu
7. Errors are handled gracefully and displayed to user
8. Works in Chrome, Firefox, Edge via Tampermonkey
