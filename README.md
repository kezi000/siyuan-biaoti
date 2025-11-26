[中文说明](https://github.com/kezi000/siyuan-biaoti/blob/main/docs/DEVELOPMENT_PLAN.md)

# AI Title Assistant

AI Title Assistant lets you trigger large language models directly inside SiYuan to craft polished document titles. The plugin is fully compatible with OpenAI-style APIs and keeps every request under your control.

## Feature Highlights

- **Complete AI configuration panel**: Tweak Base URL, API key, model, temperature, top P, max tokens, language, tone, and more from one place.
- **Manual triggers**: Start generation from the top-bar wand or the command palette entry (desktop shortcut ⇧⌘T) so you always know when requests are sent.
- **Custom prompt templates**: Supply {{content}}, {{language}}, and {{tone}} placeholders to adapt the workflow to any writing style.
- **Smart context strategies**: Auto, selection-only, block, or entire document modes with configurable character caps to limit exposure.
- **Confirmation dialog**: Copy the generated title or call /api/filetree/renameDocByID to safely rename the current document.

## Usage

1. Clone or copy this repo into {workspace}/data/plugins/siyuan-biaoti.
2. Install dependencies and start the watcher:

   `ash
   pnpm install
   pnpm run dev   # watch mode
   `

3. Enable **AI Title Assistant** from the SiYuan marketplace (or the downloaded package) and toggle it on.
4. Open **Settings → Plugins → AI Title Assistant** and configure:
   - API Base URL (default https://api.openai.com/v1 )
   - API Key (stored locally with one-click connectivity tests)
   - Model parameters (temperature, top P, max tokens)
   - Title language, tone preset, context strategy, and prompt template
5. Open any document, click the wand icon or press ⇧⌘T, review the generated title, then copy or apply it.

> Tip: If API requests fail, verify the key/network combination, rerun pnpm run dev, and press Ctrl + R in SiYuan to reload the plugin after saving changes.

### API Key Setup

1. On first launch choose an AI provider (OpenAI, Anthropic, Gemini, DeepSeek, Zhipu, etc.).
2. Provider configuration auto-fills the base URL; you only need to paste your sk-xxx style key.
3. Press **Test Connection** to call ${baseUrl}/models and fetch available models.
4. Credentials are encrypted by SiYuan and stored under {workspace}/data/storage.

## Configuration Reference

- **API Base URL**: Any OpenAI-compatible gateway such as OpenAI, Azure OpenAI, OneAPI, or vendor-specific proxies.
- **API Key**: Only saved inside the plugin data directory; **Test connection** calls /models for validation.
- **Model**: Free-form Chat Completion model ID that matches your provider.
- **Temperature / Top P**: Controls randomness (defaults 0.5 / 0.9); leave Top P at 1 if unsure.
- **Max Tokens**: Caps title length and avoids verbose responses.
- **Language & Tone**: Injected into the prompt template to steer wording.
- **Context Strategy & Limit**: Choose auto/selection/block/document with a default 1200-character limit to manage token spend.
- **Prompt Template**: You can fully replace it; clearing the field restores the default instructions with placeholders.

## Trigger Flow

1. You click the wand or run the command palette entry.
2. The plugin extracts context (selection preferred), trims whitespace, and enforces the character limit.
3. A request is sent to ${baseUrl}/chat/completions (with retries/fallbacks when configured).
4. A dialog previews the best title with options to copy or apply.
5. Applying the title calls the official API to rename the document to keep sync/version states safe.

## Development & Iteration

- pnpm run dev: development mode with incremental builds. pnpm run build: produces package.zip for release.
- pnpm run lint: run ESLint prior to submitting changes.
- See [docs/DEVELOPMENT_PLAN.md](https://github.com/kezi000/siyuan-biaoti/blob/main/docs/DEVELOPMENT_PLAN.md) for process, architecture, and testing tips.

## Privacy

- API keys never leave the local machine and can be overwritten at any time.
- Only the selected text (or truncated document) is sent; the entire workspace is never scanned.
- Requests rely on SiYuan's built-in etch and contain zero telemetry beyond what the provider requires.
