# Community Notes Helper

A Tampermonkey userscript that adds a fact-check button to tweets on Twitter/X. Click the button to open your favorite AI chat with a pre-filled fact-check prompt.

## Features

- One-click fact-check button on tweets
- Opens AI chat with pre-filled prompt asking for a balanced, factual Community Note
- Supports multiple AI providers:
  - Google AI Mode
  - ChatGPT
  - Claude
  - Copy to Clipboard
- Customizable prompt template
- Works on twitter.com and x.com

## Installation

### 1. Install Tampermonkey

If you don't already have Tampermonkey, install it from [tampermonkey.net](https://www.tampermonkey.net/).

### 2. Install the Script

Click the link below to install the script:

[**Install Community Notes Helper**](https://raw.githubusercontent.com/ogerardin/CommunityNoteHelper/main/community-notes-helper.user.js)

Or manually:
1. Click the Tampermonkey icon in your browser
2. Select "Create a new script"
3. Open the raw script file and copy-paste the code
4. Save (Ctrl+S)

### Tampermonkey Extension Settings

Before using the script, ensure these settings are enabled:

1. **Allow user scripts**: In Tampermonkey settings, check "Allow user scripts" (usually enabled by default)
2. **Clipboard access**: For clipboard feature, enable:
   - Click the Tampermonkey icon → Settings → Security tab
   - Check **Allow clipboard access**

## Configuration

After installation, access settings by:
1. Click the Tampermonkey icon
2. Select "Community Notes Helper - Settings"

### Settings

- **Prompt Template**: Customize the prompt sent to the AI. Use `{tweetText}` and `{authorName}` as placeholders.
- **AI Output**: Choose how to deliver the prompt:
  - **Google AI Mode**: Opens Google Search with AI Mode enabled
  - **ChatGPT**: Opens ChatGPT with the query
  - **Claude**: Opens Claude with the query
  - **Copy to Clipboard**: Copies the prompt to clipboard for manual pasting

## Usage

1. Go to [twitter.com](https://twitter.com) or [x.com](https://x.com)
2. Find a tweet you want to fact-check
3. Click the magnifying glass icon that appears in the tweet's action bar
4. Your selected AI chat opens with a fact-check prompt ready

## License

This project is dedicated to the public domain under the [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) license.
