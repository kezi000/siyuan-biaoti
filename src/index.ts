import {
    Dialog,
    Plugin,
    Setting,
    fetchPost,
    getAllEditor,
    getFrontend,
    showMessage
} from "siyuan";
import "./index.scss";

const STORAGE_KEY = "ai-title-assistant";

type ContextStrategy = "auto" | "selection" | "document";
type TonePreset = "balanced" | "catchy" | "technical" | "narrative";

interface TitleConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    language: string;
    tone: TonePreset;
    contextStrategy: ContextStrategy;
    contextMaxChars: number;
    promptTemplate: string;
}

const DEFAULT_PROMPT = [
    "Read the following content and craft the most compelling title.",
    "Keep the language as {{language}} with a {{tone}} tone.",
    "Return the title only without extra explanation.",
    "",
    "{{content}}"
].join("\n");

const DEFAULT_CONFIG: TitleConfig = {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.5,
    topP: 0.9,
    maxTokens: 64,
    language: "Chinese (Simplified)",
    tone: "balanced",
    contextStrategy: "auto",
    contextMaxChars: 1200,
    promptTemplate: DEFAULT_PROMPT
};

const TONE_INSTRUCTIONS: Record<TonePreset, string> = {
    balanced: "balanced and professional",
    catchy: "attention-grabbing and energetic",
    technical: "technical and precise",
    narrative: "story-driven and warm"
};

export default class AITitleAssistant extends Plugin {
    private config: TitleConfig = {...DEFAULT_CONFIG};
    private topBarElement?: HTMLElement;
    private isMobile = false;
    private isGenerating = false;
    private saveTimer?: number;
    private abortController?: AbortController;

    async onload() {
        this.data[STORAGE_KEY] = {...DEFAULT_CONFIG};
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        await this.loadConfig();
        this.injectIcons();
        this.registerCommands();
        this.mountSettingPanel();
        if (this.i18n.pluginReady) {
            console.log(this.i18n.pluginReady);
        }
    }

    onLayoutReady() {
        this.topBarElement = this.addTopBar({
            icon: "iconAiTitle",
            title: this.i18n.generateTitle,
            position: "right",
            callback: () => {
                void this.handleGenerateTitle();
            }
        });
    }

    onunload() {
        this.abortController?.abort();
    }

    private async loadConfig() {
        try {
            const saved = await this.loadData<TitleConfig>(STORAGE_KEY);
            this.config = {...DEFAULT_CONFIG, ...(saved ?? {})};
            this.data[STORAGE_KEY] = this.config;
        } catch (error) {
            console.warn("Failed to load configuration, fallback to defaults", error);
            this.config = {...DEFAULT_CONFIG};
        }
    }

    private registerCommands() {
        this.addCommand({
            langKey: "generateTitle",
            hotkey: "⇧⌘T",
            callback: () => {
                void this.handleGenerateTitle();
            }
        });
    }

    private mountSettingPanel() {
        const setting = new Setting({
            confirmCallback: () => {
                void this.persistConfig(true);
            }
        });
        this.setting = setting;

        setting.addItem({
            title: this.i18n.settingApiBaseUrl,
            direction: "row",
            description: this.i18n.settingApiBaseUrlDesc,
            createActionElement: () => {
                const input = document.createElement("input");
                input.type = "url";
                input.className = "b3-text-field fn__block";
                input.placeholder = DEFAULT_CONFIG.baseUrl;
                input.value = this.config.baseUrl;
                input.addEventListener("change", () => {
                    this.config.baseUrl = input.value.trim() || DEFAULT_CONFIG.baseUrl;
                    this.scheduleSave();
                });
                return input;
            }
        });

        const testButton = document.createElement("button");
        testButton.className = "b3-button b3-button--outline fn__flex-center fn__size150";
        testButton.textContent = this.i18n.testConnection;
        testButton.addEventListener("click", () => {
            void this.testConnection(testButton);
        });
        setting.addItem({
            title: this.i18n.settingApiKey,
            description: this.i18n.settingApiKeyDesc,
            actionElement: testButton,
            createActionElement: () => {
                const input = document.createElement("input");
                input.type = "password";
                input.autocomplete = "off";
                input.className = "b3-text-field fn__block";
                input.placeholder = this.i18n.settingApiKeyPlaceholder;
                input.value = this.config.apiKey;
                input.addEventListener("input", () => {
                    this.config.apiKey = input.value.trim();
                    this.scheduleSave();
                });
                return input;
            }
        });

        setting.addItem({
            title: this.i18n.settingModel,
            direction: "row",
            description: this.i18n.settingModelDesc,
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__block";
                input.placeholder = DEFAULT_CONFIG.model;
                input.value = this.config.model;
                input.addEventListener("change", () => {
                    this.config.model = input.value.trim() || DEFAULT_CONFIG.model;
                    this.scheduleSave();
                });
                return input;
            }
        });

        setting.addItem({
            title: this.i18n.settingTemperature,
            direction: "row",
            description: this.i18n.settingTemperatureDesc,
            createActionElement: () => this.createNumberInput({
                value: this.config.temperature,
                min: 0,
                max: 2,
                step: 0.1,
                onCommit: (value) => {
                    this.config.temperature = value;
                    this.scheduleSave();
                }
            })
        });

        setting.addItem({
            title: this.i18n.settingTopP,
            direction: "row",
            description: this.i18n.settingTopPDesc,
            createActionElement: () => this.createNumberInput({
                value: this.config.topP,
                min: 0,
                max: 1,
                step: 0.05,
                onCommit: (value) => {
                    this.config.topP = value;
                    this.scheduleSave();
                }
            })
        });

        setting.addItem({
            title: this.i18n.settingMaxTokens,
            direction: "row",
            description: this.i18n.settingMaxTokensDesc,
            createActionElement: () => this.createNumberInput({
                value: this.config.maxTokens,
                min: 16,
                max: 256,
                step: 8,
                onCommit: (value) => {
                    this.config.maxTokens = value;
                    this.scheduleSave();
                }
            })
        });

        setting.addItem({
            title: this.i18n.settingLanguage,
            direction: "row",
            description: this.i18n.settingLanguageDesc,
            createActionElement: () => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__block";
                input.placeholder = DEFAULT_CONFIG.language;
                input.value = this.config.language;
                input.addEventListener("change", () => {
                    this.config.language = input.value.trim() || DEFAULT_CONFIG.language;
                    this.scheduleSave();
                });
                return input;
            }
        });

        setting.addItem({
            title: this.i18n.settingTone,
            direction: "row",
            description: this.i18n.settingToneDesc,
            createActionElement: () => this.createSelect<TonePreset>({
                value: this.config.tone,
                options: [
                    {value: "balanced", label: this.i18n.toneBalanced},
                    {value: "catchy", label: this.i18n.toneCatchy},
                    {value: "technical", label: this.i18n.toneTechnical},
                    {value: "narrative", label: this.i18n.toneNarrative}
                ],
                onChange: (value) => {
                    this.config.tone = value;
                    this.scheduleSave();
                }
            })
        });

        setting.addItem({
            title: this.i18n.settingContextStrategy,
            direction: "row",
            description: this.i18n.settingContextStrategyDesc,
            createActionElement: () => this.createSelect<ContextStrategy>({
                value: this.config.contextStrategy,
                options: [
                    {value: "auto", label: this.i18n.contextAuto},
                    {value: "selection", label: this.i18n.contextSelection},
                    {value: "document", label: this.i18n.contextDocument}
                ],
                onChange: (value) => {
                    this.config.contextStrategy = value;
                    this.scheduleSave();
                }
            })
        });

        setting.addItem({
            title: this.i18n.settingContextLimit,
            direction: "row",
            description: this.i18n.settingContextLimitDesc,
            createActionElement: () => this.createNumberInput({
                value: this.config.contextMaxChars,
                min: 200,
                max: 4000,
                step: 100,
                onCommit: (value) => {
                    this.config.contextMaxChars = value;
                    this.scheduleSave();
                }
            })
        });

        setting.addItem({
            title: this.i18n.settingPromptTemplate,
            description: this.i18n.settingPromptTemplateDesc,
            createActionElement: () => {
                const textarea = document.createElement("textarea");
                textarea.className = "b3-text-field fn__block";
                textarea.rows = 6;
                textarea.placeholder = DEFAULT_PROMPT;
                textarea.value = this.config.promptTemplate;
                textarea.addEventListener("change", () => {
                    this.config.promptTemplate = textarea.value.trim() || DEFAULT_PROMPT;
                    this.scheduleSave();
                });
                return textarea;
            }
        });
    }

    private createNumberInput(options: {value: number; min: number; max: number; step: number; onCommit: (value: number) => void;}): HTMLElement {
        const input = document.createElement("input");
        input.type = "number";
        input.className = "b3-text-field fn__block";
        input.value = String(options.value);
        input.min = String(options.min);
        input.max = String(options.max);
        input.step = String(options.step);
        input.addEventListener("change", () => {
            const parsed = Number(input.value);
            const clamped = Math.min(options.max, Math.max(options.min, Number.isNaN(parsed) ? options.value : parsed));
            input.value = String(clamped);
            options.onCommit(clamped);
        });
        return input;
    }

    private createSelect<T extends string>(options: {value: T; options: Array<{value: T; label: string}>; onChange: (value: T) => void;}): HTMLElement {
        const select = document.createElement("select");
        select.className = "b3-select fn__block";
        options.options.forEach((item) => {
            const optionEl = document.createElement("option");
            optionEl.value = item.value;
            optionEl.textContent = item.label;
            if (item.value === options.value) {
                optionEl.selected = true;
            }
            select.appendChild(optionEl);
        });
        select.addEventListener("change", () => {
            options.onChange(select.value as T);
        });
        return select;
    }

    private scheduleSave() {
        if (this.saveTimer) {
            window.clearTimeout(this.saveTimer);
        }
        this.saveTimer = window.setTimeout(() => {
            void this.persistConfig();
        }, 300);
    }

    private async persistConfig(showToast = false) {
        this.data[STORAGE_KEY] = this.config;
        try {
            await this.saveData(STORAGE_KEY, this.config);
            if (showToast) {
                showMessage(this.i18n.configSaved);
            }
        } catch (error) {
            console.error("Failed to save configuration", error);
            showMessage(`${this.i18n.configSaveFailed}: ${error instanceof Error ? error.message : error}`);
        }
    }

    private getSanitizedBaseUrl() {
        return this.config.baseUrl.replace(/\/+$/, "");
    }

    private buildHeaders() {
        const headers: Record<string, string> = {"Content-Type": "application/json"};
        if (this.config.apiKey) {
            headers.Authorization = `Bearer ${this.config.apiKey}`;
        }
        return headers;
    }

    private async testConnection(button: HTMLButtonElement) {
        if (!this.config.apiKey) {
            showMessage(this.i18n.needApiKey);
            return;
        }
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = this.i18n.testingConnection;
        try {
            const response = await fetch(`${this.getSanitizedBaseUrl()}/models`, {
                method: "GET",
                headers: this.buildHeaders()
            });
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody.error?.message || response.statusText);
            }
            showMessage(this.i18n.testSuccess);
        } catch (error) {
            showMessage(this.i18n.testFailed.replace("${message}", error instanceof Error ? error.message : String(error)));
        } finally {
            button.disabled = false;
            button.textContent = originalText || this.i18n.testConnection;
        }
    }

    private async handleGenerateTitle() {
        if (this.isGenerating) {
            return;
        }
        if (!this.config.apiKey) {
            showMessage(this.i18n.needApiKey);
            return;
        }
        const editor = this.getActiveEditor();
        if (!editor) {
            return;
        }
        const context = this.extractContext(editor);
        if (!context) {
            showMessage(this.i18n.contextUnavailable);
            return;
        }

        const prompt = this.renderPrompt(context);
        this.isGenerating = true;
        this.setLoadingState(true);
        try {
            const title = await this.requestTitle(prompt);
            this.showResultDialog(title, editor);
        } catch (error) {
            showMessage(this.i18n.requestFailed.replace("${message}", error instanceof Error ? error.message : String(error)));
        } finally {
            this.isGenerating = false;
            this.setLoadingState(false);
            this.abortController = undefined;
        }
    }

    private getActiveEditor() {
        const editors = getAllEditor();
        if (!editors || editors.length === 0) {
            showMessage(this.i18n.needDoc);
            return undefined;
        }
        return editors[0];
    }

    private extractContext(editor: any) {
        const selectionText = window.getSelection()?.toString().trim();
        if (this.config.contextStrategy === "selection") {
            if (selectionText) {
                return this.normalizeContext(selectionText);
            }
            showMessage(this.i18n.contextSelectionRequired);
            return undefined;
        }
        if (this.config.contextStrategy === "auto" && selectionText) {
            return this.normalizeContext(selectionText);
        }
        return this.normalizeContext(this.getDocumentText(editor));
    }

    private getDocumentText(editor: any) {
        return editor?.protyle?.wysiwyg?.element?.innerText ?? "";
    }

    private normalizeContext(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (!normalized) {
            return "";
        }
        const limit = Math.max(200, this.config.contextMaxChars);
        return normalized.slice(0, limit);
    }

    private renderPrompt(context: string) {
        const replacements: Record<string, string> = {
            content: context,
            language: this.config.language || DEFAULT_CONFIG.language,
            tone: TONE_INSTRUCTIONS[this.config.tone] || TONE_INSTRUCTIONS.balanced
        };
        return this.config.promptTemplate.replace(/{{\s*(content|language|tone)\s*}}/g, (_match, key) => replacements[key] || "");
    }

    private async requestTitle(prompt: string) {
        this.abortController = new AbortController();
        const payload = {
            model: this.config.model,
            messages: [
                {
                    role: "system",
                    content: `You are an experienced writing assistant that crafts ${TONE_INSTRUCTIONS[this.config.tone]} titles in ${this.config.language}. Output only the final title.`
                },
                {role: "user", content: prompt}
            ],
            temperature: this.config.temperature,
            top_p: this.config.topP,
            max_tokens: this.config.maxTokens,
            stream: false
        };

        const response = await fetch(`${this.getSanitizedBaseUrl()}/chat/completions`, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error?.message || response.statusText);
        }
        const title = body.choices?.[0]?.message?.content?.trim();
        if (!title) {
            throw new Error(this.i18n.emptyResponse);
        }
        return title.replace(/\s+/g, " ").trim();
    }

    private showResultDialog(title: string, editor: any) {
        const dialog = new Dialog({
            title: this.i18n.dialogTitle,
            content: `<div class="b3-dialog__content ai-title-assistant__dialog">
    <div class="ai-title-assistant__hint">${this.i18n.dialogHint}</div>
    <div class="ai-title-assistant__preview" id="ai-title-preview"></div>
</div>
<div class="b3-dialog__action ai-title-assistant__actions">
    <span class="fn__space"></span>
    <button class="b3-button b3-button--outline ai-title-assistant__button" data-action="copy">${this.i18n.copyTitle}</button>
    <button class="b3-button b3-button--text ai-title-assistant__button" data-action="apply">${this.i18n.applyTitle}</button>
    <button class="b3-button ai-title-assistant__button" data-action="close">${this.i18n.close}</button>
</div>`,
            width: this.isMobile ? "92vw" : "520px"
        });
        const preview = dialog.element.querySelector("#ai-title-preview") as HTMLElement;
        preview.textContent = title;

        dialog.element.querySelectorAll("button[data-action]").forEach((btn) => {
            btn.addEventListener("click", async (event) => {
                const action = (event.currentTarget as HTMLElement).getAttribute("data-action");
                if (action === "copy") {
                    await this.copyToClipboard(title);
                    showMessage(this.i18n.copied);
                } else if (action === "apply") {
                    await this.applyTitle(editor, title);
                    dialog.destroy();
                } else if (action === "close") {
                    dialog.destroy();
                }
            });
        });
    }

    private async copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.clip = "rect(0 0 0 0)";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }
    }

    private async applyTitle(editor: any, title: string) {
        const docId = editor?.protyle?.block?.rootID;
        if (!docId) {
            showMessage(this.i18n.needDoc);
            return;
        }
        await this.fetchPostAsync("/api/filetree/renameDocByID", {id: docId, title});
        showMessage(this.i18n.applySuccess);
    }

    private fetchPostAsync<T>(url: string, body: Record<string, unknown>): Promise<T> {
        return new Promise((resolve, reject) => {
            fetchPost(url, body, (response: {code: number; msg: string; data: T}) => {
                if (response && response.code === 0) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.msg || "unexpected response"));
                }
            });
        });
    }

    private setLoadingState(isLoading: boolean) {
        if (!this.topBarElement) {
            return;
        }
        this.topBarElement.classList.toggle("ai-title-assistant__loading", isLoading);
        this.topBarElement.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    private injectIcons() {
        this.addIcons(`<symbol id="iconAiTitle" viewBox="0 0 24 24">
    <path d="M12 2l2.1 4.8 5.2.4-3.9 3.4 1.2 5.1-4.6-2.7-4.6 2.7 1.2-5.1-3.9-3.4 5.2-.4zM5 20.5l1.4-3.1 1.4 3.1 3.1.3-2.4 2 0.7 3.2-2.8-1.7-2.8 1.7 0.7-3.2-2.4-2z"></path>
</symbol>`);
    }
}
