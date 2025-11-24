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
import {
    ContextStrategy,
    ProviderCredential,
    ProviderCredentialMap,
    ProviderId,
    TitleConfig,
    TonePreset
} from "./types";
import {
    DEFAULT_PROVIDER_CREDENTIALS,
    PROVIDER_METADATA,
    resolveProviderCredential
} from "./providers/base/ProviderConfig";
import {LLMProviderFactory} from "./providers/factory/LLMProviderFactory";
import {LLMProviderError} from "./providers/base/LLMProvider";
import {RetryHandler} from "./providers/base/RetryHandler";

const STORAGE_KEY = "ai-title-assistant";

const DEFAULT_PROMPT = [
    "Read the following content and craft the most compelling title.",
    "Keep the language as {{language}} with a {{tone}} tone.",
    "Return the title only without extra explanation.",
    "",
    "{{content}}"
].join("\n");

const TONE_INSTRUCTIONS: Record<TonePreset, string> = {
    balanced: "balanced and professional",
    catchy: "attention-grabbing and energetic",
    technical: "technical and precise",
    narrative: "story-driven and warm"
};

const PROVIDER_IDS = Object.keys(PROVIDER_METADATA) as ProviderId[];

const DEFAULT_LANGUAGE = "Chinese (Simplified)";

function cloneProviders(): ProviderCredentialMap {
    const snapshot: ProviderCredentialMap = {};
    PROVIDER_IDS.forEach((id) => {
        snapshot[id] = {...DEFAULT_PROVIDER_CREDENTIALS[id]};
    });
    return snapshot;
}

function createDefaultConfig(): TitleConfig {
    return {
        providerPreferences: {
            primary: "openai",
            fallbacks: PROVIDER_IDS.filter((id) => id !== "openai"),
            autoSwitchOnSuccess: true
        },
        providers: cloneProviders(),
        retryPolicy: {
            maxAttempts: 2,
            baseDelayMs: 800,
            exponential: true,
            timeoutMs: 5000
        },
        usage: {
            totalRequests: 0,
            providerFailureCounts: {}
        },
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 64,
        language: DEFAULT_LANGUAGE,
        tone: "balanced",
        contextStrategy: "auto",
        contextMaxChars: 1200,
        promptTemplate: DEFAULT_PROMPT
    };
}

export default class AITitleAssistant extends Plugin {
    private config: TitleConfig = createDefaultConfig();
    private topBarElement?: HTMLElement;
    private isMobile = false;
    private isGenerating = false;
    private saveTimer?: number;
    private abortController?: AbortController;
    private providerCredentialContainer?: HTMLElement;
    private fallbackListContainer?: HTMLElement;
    private lastActiveRootId?: string;
    private interactionTrackingRegistered = false;
    private readonly selectionTrackingHandler = () => {
        this.updateActiveEditorFromNode(window.getSelection()?.anchorNode ?? null);
    };
    private readonly focusTrackingHandler = (event: FocusEvent) => {
        this.updateActiveEditorFromNode(event.target as Node | null);
    };

    async onload() {
        this.data[STORAGE_KEY] = createDefaultConfig();
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        await this.loadConfig();
        this.injectIcons();
        this.registerCommands();
        this.mountSettingPanel();
        this.registerInteractionTracking();
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
        this.unregisterInteractionTracking();
    }

    private async loadConfig() {
        try {
            const saved = await this.loadData<TitleConfig>(STORAGE_KEY);
            this.config = this.normalizeConfig(saved ?? undefined);
            this.data[STORAGE_KEY] = this.config;
        } catch (error) {
            console.warn("Failed to load configuration, fallback to defaults", error);
            this.config = createDefaultConfig();
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

    private registerInteractionTracking() {
        if (this.interactionTrackingRegistered) {
            return;
        }
        document.addEventListener("selectionchange", this.selectionTrackingHandler);
        window.addEventListener("focusin", this.focusTrackingHandler, true);
        this.interactionTrackingRegistered = true;
    }

    private unregisterInteractionTracking() {
        if (!this.interactionTrackingRegistered) {
            return;
        }
        document.removeEventListener("selectionchange", this.selectionTrackingHandler);
        window.removeEventListener("focusin", this.focusTrackingHandler, true);
        this.interactionTrackingRegistered = false;
    }

    private mountSettingPanel() {
        const setting = new Setting({
            confirmCallback: () => {
                void this.persistConfig(true);
            }
        });
        this.setting = setting;

        setting.addItem({
            title: this.i18n.settingProvider,
            description: this.i18n.settingProviderDesc,
            createActionElement: () => this.createSelect<ProviderId>({
                value: this.config.providerPreferences.primary,
                options: PROVIDER_IDS.map((id) => ({value: id, label: PROVIDER_METADATA[id].label})),
                onChange: (value) => {
                    this.config.providerPreferences.primary = value;
                    this.ensureProviderConfig(value);
                    this.refreshProviderForms();
                    this.scheduleSave();
                }
            })
        });

        setting.addItem({
            title: this.i18n.settingFallbackProviders,
            description: this.i18n.settingFallbackProvidersDesc,
            createActionElement: () => {
                const wrapper = document.createElement("div");
                wrapper.className = "ai-title-assistant__fallback-section";
                const list = document.createElement("div");
                list.className = "ai-title-assistant__fallback-list";
                this.fallbackListContainer = list;
                this.renderFallbackOptions();
                wrapper.append(list, this.createAutoSwitchToggle());
                return wrapper;
            }
        });

        setting.addItem({
            title: this.i18n.settingProviderCredentials,
            description: this.i18n.settingProviderCredentialsDesc,
            createActionElement: () => {
                const container = document.createElement("div");
                container.className = "ai-title-assistant__provider-config";
                this.providerCredentialContainer = container;
                this.refreshProviderForms();
                return container;
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
                input.placeholder = DEFAULT_LANGUAGE;
                input.value = this.config.language;
                input.addEventListener("change", () => {
                    this.config.language = input.value.trim() || DEFAULT_LANGUAGE;
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
                    {value: "block", label: this.i18n.contextBlock},
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

        setting.addItem({
            title: this.i18n.settingRetryPolicy,
            description: this.i18n.settingRetryPolicyDesc,
            createActionElement: () => {
                const container = document.createElement("div");
                container.className = "ai-title-assistant__retry-grid";
                const maxAttempts = this.createNumberInput({
                    value: this.config.retryPolicy.maxAttempts,
                    min: 1,
                    max: 5,
                    step: 1,
                    onCommit: (value) => {
                        this.config.retryPolicy.maxAttempts = value;
                        this.scheduleSave();
                    }
                });
                const baseDelay = this.createNumberInput({
                    value: this.config.retryPolicy.baseDelayMs,
                    min: 100,
                    max: 5000,
                    step: 50,
                    onCommit: (value) => {
                        this.config.retryPolicy.baseDelayMs = value;
                        this.scheduleSave();
                    }
                });
                const timeout = this.createNumberInput({
                    value: this.config.retryPolicy.timeoutMs,
                    min: 500,
                    max: 20000,
                    step: 500,
                    onCommit: (value) => {
                        this.config.retryPolicy.timeoutMs = value;
                        this.scheduleSave();
                    }
                });
                container.append(
                    this.wrapLabeledField(this.i18n.settingRetryMaxAttempts, maxAttempts),
                    this.wrapLabeledField(this.i18n.settingRetryBaseDelay, baseDelay),
                    this.wrapLabeledField(this.i18n.settingRetryTimeout, timeout)
                );
                return container;
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

    private async testConnection(button: HTMLButtonElement) {
        const providerId = this.config.providerPreferences.primary;
        const credential = this.getProviderCredential(providerId);
        if (PROVIDER_METADATA[providerId].requiresApiKey && !credential.apiKey) {
            showMessage(this.i18n.needApiKey);
            return;
        }
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = this.i18n.testingConnection;
        try {
            const provider = LLMProviderFactory.get(providerId);
            await provider.testConnection(credential);
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
        const selectionEditor = this.findEditorForNode(window.getSelection()?.anchorNode ?? null, editors);
        if (selectionEditor) {
            return this.setLastActiveEditor(selectionEditor);
        }
        const activeElementEditor = this.findEditorForNode(document.activeElement, editors);
        if (activeElementEditor) {
            return this.setLastActiveEditor(activeElementEditor);
        }
        if (this.lastActiveRootId) {
            const remembered = editors.find((editor) => editor?.protyle?.block?.rootID === this.lastActiveRootId);
            if (remembered) {
                return remembered;
            }
        }
        const focused = editors.find((editor) => {
            const element = editor?.protyle?.element as HTMLElement | undefined;
            return element ? element.classList.contains("protyle--active") : false;
        });
        if (focused) {
            return this.setLastActiveEditor(focused);
        }
        return this.setLastActiveEditor(editors[0]);
    }

    private updateActiveEditorFromNode(node: Node | null) {
        const editor = this.findEditorForNode(node);
        if (editor) {
            this.setLastActiveEditor(editor);
        }
    }

    private findEditorForNode(node: Node | Element | null, editors?: any[]) {
        const list = editors ?? getAllEditor();
        if (!node || !list || list.length === 0) {
            return undefined;
        }
        const element = this.resolveElementFromNode(node);
        if (!element) {
            return undefined;
        }
        return list.find((editor) => {
            const container = editor?.protyle?.element as HTMLElement | undefined;
            return container ? container.contains(element) : false;
        });
    }

    private resolveElementFromNode(node: Node | Element | null) {
        if (!node) {
            return null;
        }
        if (node instanceof Element) {
            return node;
        }
        return node.parentElement;
    }

    private setLastActiveEditor(editor: any) {
        const rootId = editor?.protyle?.block?.rootID;
        if (rootId) {
            this.lastActiveRootId = rootId;
        }
        return editor;
    }

    private extractContext(editor: any) {
        const selectionText = this.getCurrentSelectionText();
        const strategy = this.config.contextStrategy;
        if (strategy === "selection") {
            if (selectionText) {
                return this.normalizeContext(selectionText);
            }
            showMessage(this.i18n.contextSelectionRequired);
            return undefined;
        }
        if (strategy === "block") {
            const blockText = this.getActiveBlockText(editor);
            if (blockText) {
                return this.normalizeContext(blockText);
            }
            showMessage(this.i18n.contextBlockUnavailable);
            return undefined;
        }
        if (strategy === "auto") {
            if (selectionText) {
                return this.normalizeContext(selectionText);
            }
            const blockText = this.getActiveBlockText(editor);
            if (blockText) {
                return this.normalizeContext(blockText);
            }
        }
        return this.normalizeContext(this.getDocumentText(editor));
    }

    private getCurrentSelectionText() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            return "";
        }
        return selection.toString().trim();
    }

    private getActiveBlockText(editor: any) {
        const root = editor?.protyle?.wysiwyg?.element as HTMLElement | undefined;
        if (!root) {
            return "";
        }
        const seedNode = window.getSelection()?.anchorNode ?? document.activeElement;
        const block = this.findBlockElement(seedNode, root);
        if (!block) {
            return "";
        }
        const centerText = block.innerText?.trim();
        if (!centerText) {
            return "";
        }
        const limit = Math.max(200, this.config.contextMaxChars);
        let remaining = Math.max(0, limit - centerText.length);
        const after: string[] = [];
        const before: string[] = [];
        let next = block.nextElementSibling as HTMLElement | null;
        let prev = block.previousElementSibling as HTMLElement | null;
        while (remaining > 0 && (next || prev)) {
            if (next) {
                const text = next.innerText?.trim();
                if (text) {
                    after.push(text);
                    remaining = Math.max(0, remaining - text.length);
                }
                next = next.nextElementSibling as HTMLElement | null;
            }
            if (remaining <= 0) {
                break;
            }
            if (prev) {
                const text = prev.innerText?.trim();
                if (text) {
                    before.unshift(text);
                    remaining = Math.max(0, remaining - text.length);
                }
                prev = prev.previousElementSibling as HTMLElement | null;
            }
        }
        return [...before, centerText, ...after].join("\n").trim();
    }

    private findBlockElement(seedNode: Node | Element | null, root: HTMLElement) {
        const element = this.resolveElementFromNode(seedNode);
        if (element && root.contains(element)) {
            const block = element.closest("[data-node-id]") as HTMLElement | null;
            if (block && root.contains(block)) {
                return block;
            }
        }
        return root.querySelector("[data-node-id]") as HTMLElement | null;
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
            language: this.config.language || DEFAULT_LANGUAGE,
            tone: TONE_INSTRUCTIONS[this.config.tone] || TONE_INSTRUCTIONS.balanced
        };
        return this.config.promptTemplate.replace(/{{\s*(content|language|tone)\s*}}/g, (_match, key) => replacements[key] || "");
    }

    private async requestTitle(prompt: string) {
        this.abortController = new AbortController();
        const systemPrompt = `You are an experienced writing assistant that crafts ${TONE_INSTRUCTIONS[this.config.tone]} titles in ${this.config.language}. Output only the final title.`;
        const providerOrder = this.resolveProviderOrder();
        const errors: string[] = [];
        for (const providerId of providerOrder) {
            const provider = LLMProviderFactory.get(providerId);
            const credential = this.getProviderCredential(providerId);
            if (PROVIDER_METADATA[providerId].requiresApiKey && !credential.apiKey) {
                errors.push(`${PROVIDER_METADATA[providerId].label}: ${this.i18n.needApiKey}`);
                continue;
            }
            const retryHandler = new RetryHandler(this.config.retryPolicy);
            try {
                const title = await retryHandler.execute(() => provider.generateTitle({
                    config: credential,
                    prompt,
                    systemPrompt,
                    temperature: this.config.temperature,
                    topP: this.config.topP,
                    maxTokens: this.config.maxTokens,
                    abortSignal: this.abortController?.signal
                }), {signal: this.abortController?.signal});
                this.handleProviderSuccess(providerId);
                return title;
            } catch (error) {
                this.handleProviderFailure(providerId, error);
                const message = error instanceof Error ? error.message : String(error);
                errors.push(`${PROVIDER_METADATA[providerId]?.label || providerId}: ${message}`);
            }
        }
        throw new Error(errors.join(" | "));
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

    private normalizeConfig(saved?: Partial<TitleConfig> & Record<string, any>): TitleConfig {
        const base = createDefaultConfig();
        if (!saved) {
            return base;
        }
        const providers: Record<string, ProviderCredential> = {...base.providers};
        if (saved.providers) {
            Object.entries(saved.providers).forEach(([key, value]) => {
                providers[key] = {
                    ...(providers[key] ?? {}),
                    ...(value as ProviderCredential)
                };
            });
        }
        if (saved.apiKey || saved.baseUrl || saved.model) {
            providers.openai = {
                ...providers.openai,
                apiKey: saved.apiKey ?? providers.openai.apiKey,
                baseUrl: saved.baseUrl ?? providers.openai.baseUrl,
                model: saved.model ?? providers.openai.model
            };
        }
        const normalized: TitleConfig = {
            ...base,
            ...saved,
            providers,
            providerPreferences: {
                ...base.providerPreferences,
                ...(saved.providerPreferences ?? {}),
                primary: this.isValidProvider(saved.providerPreferences?.primary) ? saved.providerPreferences!.primary : base.providerPreferences.primary,
                fallbacks: this.dedupeProviders(saved.providerPreferences?.fallbacks ?? base.providerPreferences.fallbacks)
            },
            retryPolicy: {
                ...base.retryPolicy,
                ...(saved.retryPolicy ?? {})
            },
            usage: {
                ...base.usage,
                ...(saved.usage ?? {}),
                providerFailureCounts: {
                    ...base.usage.providerFailureCounts,
                    ...(saved.usage?.providerFailureCounts ?? {})
                }
            },
            temperature: saved.temperature ?? base.temperature,
            topP: saved.topP ?? base.topP,
            maxTokens: saved.maxTokens ?? base.maxTokens,
            language: saved.language ?? base.language,
            tone: saved.tone ?? base.tone,
            contextStrategy: saved.contextStrategy ?? base.contextStrategy,
            contextMaxChars: saved.contextMaxChars ?? base.contextMaxChars,
            promptTemplate: saved.promptTemplate ?? base.promptTemplate
        };
        return normalized;
    }

    private isValidProvider(provider?: ProviderId) {
        return provider ? PROVIDER_IDS.includes(provider) : false;
    }

    private dedupeProviders(list: ProviderId[]) {
        const unique: ProviderId[] = [];
        list.forEach((id) => {
            if (this.isValidProvider(id) && !unique.includes(id)) {
                unique.push(id);
            }
        });
        return unique;
    }

    private ensureProviderConfig(providerId: ProviderId) {
        if (!this.config.providers[providerId]) {
            this.config.providers[providerId] = {...DEFAULT_PROVIDER_CREDENTIALS[providerId]};
        }
    }

    private renderFallbackOptions() {
        if (!this.fallbackListContainer) {
            return;
        }
        this.fallbackListContainer.innerHTML = "";
        const primary = this.config.providerPreferences.primary;
        const selected = new Set(this.config.providerPreferences.fallbacks);
        PROVIDER_IDS.filter((id) => id !== primary).forEach((id) => {
            const label = document.createElement("label");
            label.className = "ai-title-assistant__fallback-option";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = selected.has(id);
            checkbox.addEventListener("change", () => {
                this.toggleFallback(id, checkbox.checked);
            });
            const span = document.createElement("span");
            span.textContent = PROVIDER_METADATA[id].label;
            label.append(checkbox, span);
            this.fallbackListContainer?.appendChild(label);
        });
    }

    private createAutoSwitchToggle() {
        const label = document.createElement("label");
        label.className = "ai-title-assistant__inline-toggle";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = this.config.providerPreferences.autoSwitchOnSuccess;
        checkbox.addEventListener("change", () => {
            this.config.providerPreferences.autoSwitchOnSuccess = checkbox.checked;
            this.scheduleSave();
        });
        const span = document.createElement("span");
        span.textContent = this.i18n.settingAutoSwitch;
        label.append(checkbox, span);
        return label;
    }

    private toggleFallback(providerId: ProviderId, enabled: boolean) {
        const fallbacks = new Set(this.config.providerPreferences.fallbacks);
        if (enabled) {
            fallbacks.add(providerId);
        } else {
            fallbacks.delete(providerId);
        }
        this.config.providerPreferences.fallbacks = this.dedupeProviders(Array.from(fallbacks));
        this.scheduleSave();
    }

    private refreshProviderForms() {
        if (this.providerCredentialContainer) {
            this.providerCredentialContainer.innerHTML = "";
            this.providerCredentialContainer.appendChild(this.buildProviderCredentialFields());
        }
        this.renderFallbackOptions();
    }

    private buildProviderCredentialFields() {
        const fragment = document.createDocumentFragment();
        const providerId = this.config.providerPreferences.primary;
        this.ensureProviderConfig(providerId);
        const meta = PROVIDER_METADATA[providerId];
        const credential = this.getProviderCredential(providerId);

        const hint = document.createElement("div");
        hint.className = "b3-label";
        hint.textContent = meta.description;
        fragment.appendChild(hint);

        const apiRow = document.createElement("div");
        apiRow.className = "ai-title-assistant__api-row";
        const apiInput = document.createElement("input");
        apiInput.type = "password";
        apiInput.autocomplete = "off";
        apiInput.className = "b3-text-field fn__block";
        apiInput.placeholder = this.i18n.settingApiKeyPlaceholder;
        apiInput.value = credential.apiKey;
        apiInput.addEventListener("input", () => {
            this.updateProviderCredential(providerId, {apiKey: apiInput.value.trim()});
        });
        apiRow.appendChild(apiInput);

        const testButton = document.createElement("button");
        testButton.className = "b3-button b3-button--outline fn__flex-center fn__size120";
        testButton.textContent = this.i18n.testConnection;
        testButton.addEventListener("click", () => {
            void this.testConnection(testButton);
        });
        apiRow.appendChild(testButton);
        fragment.appendChild(this.wrapLabeledField(this.i18n.settingApiKey, apiRow));

        const modelInput = document.createElement("input");
        modelInput.className = "b3-text-field fn__block";
        modelInput.placeholder = meta.defaultModel;
        modelInput.value = credential.model ?? meta.defaultModel;
        modelInput.addEventListener("change", () => {
            this.updateProviderCredential(providerId, {model: modelInput.value.trim() || meta.defaultModel});
        });
        fragment.appendChild(this.wrapLabeledField(this.i18n.settingModel, modelInput));

        const baseInput = document.createElement("input");
        baseInput.className = "b3-text-field fn__block";
        baseInput.type = "url";
        baseInput.placeholder = meta.defaultBaseUrl;
        baseInput.value = credential.baseUrl ?? meta.defaultBaseUrl;
        baseInput.readOnly = !meta.supportsCustomBaseUrl;
        baseInput.addEventListener("change", () => {
            if (!meta.supportsCustomBaseUrl) {
                baseInput.value = meta.defaultBaseUrl;
                return;
            }
            this.updateProviderCredential(providerId, {baseUrl: baseInput.value.trim() || meta.defaultBaseUrl});
        });
        fragment.appendChild(this.wrapLabeledField(this.i18n.settingApiBaseUrl, baseInput));

        return fragment;
    }

    private wrapLabeledField(labelText: string, element: HTMLElement) {
        const wrapper = document.createElement("label");
        wrapper.className = "ai-title-assistant__fieldset";
        const span = document.createElement("span");
        span.className = "ai-title-assistant__fieldset-label";
        span.textContent = labelText;
        wrapper.append(span, element);
        return wrapper;
    }

    private updateProviderCredential(providerId: ProviderId, patch: Partial<ProviderCredential>) {
        const current = this.config.providers[providerId] ?? {...DEFAULT_PROVIDER_CREDENTIALS[providerId]};
        this.config.providers[providerId] = {...current, ...patch};
        this.scheduleSave();
    }

    private getProviderCredential(providerId: ProviderId) {
        return resolveProviderCredential(providerId, this.config.providers[providerId]);
    }

    private resolveProviderOrder() {
        return this.dedupeProviders([this.config.providerPreferences.primary, ...this.config.providerPreferences.fallbacks]);
    }

    private handleProviderSuccess(providerId: ProviderId) {
        this.config.usage.totalRequests += 1;
        this.config.usage.lastUsedProvider = providerId;
        this.config.usage.providerFailureCounts[providerId] = 0;
        if (this.config.providerPreferences.autoSwitchOnSuccess && providerId !== this.config.providerPreferences.primary) {
            this.config.providerPreferences.primary = providerId;
        }
        this.scheduleSave();
    }

    private handleProviderFailure(providerId: ProviderId, error: unknown) {
        const current = this.config.usage.providerFailureCounts[providerId] ?? 0;
        this.config.usage.providerFailureCounts[providerId] = current + 1;
        if (!(error instanceof LLMProviderError) || !error.retryable) {
            this.scheduleSave();
        }
    }

    private injectIcons() {
        this.addIcons(`<symbol id="iconAiTitle" viewBox="0 0 24 24">
    <path d="M12 2l2.1 4.8 5.2.4-3.9 3.4 1.2 5.1-4.6-2.7-4.6 2.7 1.2-5.1-3.9-3.4 5.2-.4zM5 20.5l1.4-3.1 1.4 3.1 3.1.3-2.4 2 0.7 3.2-2.8-1.7-2.8 1.7 0.7-3.2-2.4-2z"></path>
</symbol>`);
    }
}
// Model: GPT-5 (Codex)
