[中文](README_zh_CN.md)

# AI Title Assistant for SiYuan

Generate concise and attractive document titles inside SiYuan with one click.  
The plugin reads the current note, builds an OpenAI-compatible prompt, and lets you confirm the result before applying it.

## Highlights

- **OpenAI-compatible configuration** – base URL, API key, model, temperature, Top P, token limit, and language presets.
- **Manual control** – toolbar button plus command-palette entry (`⇧⌘T` on desktop) with progress and error feedback.
- **Custom prompt templates** – edit the template with `{{content}}`, `{{language}}`, and `{{tone}}` placeholders, save multiple tones.
- **Safe context strategy** – auto/selection/document modes with character limits and whitespace cleanup.
- **Title review dialog** – copy the suggestion or replace the document title via official `/api/filetree/renameDocByID`.

## Getting Started

1. Clone or copy the repo into `{workspace}/data/plugins/plugin-sample`.
2. Install dependencies and build assets:

   ```bash
   pnpm install
   pnpm run dev   # rebuild on change
   ```

3. Enable **AI Title Assistant** inside SiYuan Marketplace ▸ Downloaded tab.
4. Open **Settings ▸ Plugins ▸ AI Title Assistant** and configure:
   - API base URL (default `https://api.openai.com/v1`)
   - API key (kept locally)
   - Default model and sampling parameters
   - Prompt template and context strategy
5. Open a document, press the top-bar wand icon or `⇧⌘T`, review the generated title, and click **Replace document title**.

## Configuration Reference

- **API base URL** – any OpenAI-compatible endpoint (OpenAI, Azure, OneAPI, etc.).
- **API key** – stored only in plugin data; click *Test connection* to validate `/models`.
- **Model** – chat completion model name; can include custom provider identifiers.
- **Temperature & Top P** – control randomness. Keep Top P = 1 when unsure.
- **Max tokens** – ensures the model returns only a short title.
- **Language & tone preset** – injected into the template so you can request Chinese, English, catchy, technical, etc.
- **Context strategy & limit** – choose auto (selection first), only selection, or entire document with a max character limit.
- **Prompt template** – supports `{{content}}`, `{{language}}`, `{{tone}}`. Restore defaults anytime by clearing the field.

## Manual Trigger Flow

1. User clicks the toolbar icon or command.
2. Plugin extracts context (selection or document), trims whitespace, and enforces the configured limit.
3. A chat completion request is sent to `${baseUrl}/chat/completions`.
4. The suggested title appears in a dialog with **Copy** and **Replace** buttons.
5. Selecting **Replace** calls `/api/filetree/renameDocByID` to update the document title safely.

## Development Notes

- Run `pnpm run dev` for watch mode or `pnpm run build` to produce `package.zip`.
- Lint via `pnpm run lint`.
- Refer to [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for the recommended workflow, architecture, and QA checklist.

## Privacy & Limits

- API keys never leave the local plugin storage and are masked in the UI.
- Only the selected text or truncated document content is sent to your configured LLM endpoint.
- Network calls follow SiYuan’s fetch environment; no additional telemetry is recorded.
