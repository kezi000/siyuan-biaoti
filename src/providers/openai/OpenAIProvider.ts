import {ProviderCredential, ProviderId} from "../../types";
import {PROVIDER_METADATA, resolveProviderCredential} from "../base/ProviderConfig";
import {LLMProvider, LLMProviderError, ProviderGenerateOptions, ensureApiKey} from "../base/LLMProvider";

type CompatibleProviderId = Extract<ProviderId, "openai" | "custom">;

export class OpenAIProvider implements LLMProvider {
    readonly id: CompatibleProviderId;
    readonly label: string;

    constructor(providerId: CompatibleProviderId = "openai") {
        this.id = providerId;
        this.label = PROVIDER_METADATA[providerId].label;
    }

    async generateTitle(options: ProviderGenerateOptions): Promise<string> {
        const config = this.getConfig(options.config);
        ensureApiKey(config, this.id);
        const requestBody: Record<string, any> = {
            model: config.model,
            messages: [
                {role: "system", content: options.systemPrompt},
                {role: "user", content: options.prompt}
            ],
            temperature: options.temperature,
            top_p: options.topP,
            max_tokens: options.maxTokens,
            stream: false
        };
        // OpenAI o1 等推理模型: reasoning_effort 设为 low 降低推理强度
        if (options.disableThinking) {
            requestBody.reasoning_effort = "low";
        }
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: this.buildHeaders(config),
            body: JSON.stringify(requestBody),
            signal: options.abortSignal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new LLMProviderError(data?.error?.message || response.statusText, {
                providerId: this.id,
                status: response.status,
                retryable: response.status >= 500 || response.status === 429
            });
        }
        const content = this.extractMessageContent(data);
        const trimmedContent = content?.trim();
        if (!trimmedContent) {
            console.error("[OpenAIProvider] Empty or invalid response:", JSON.stringify(data, null, 2));
            throw new LLMProviderError(`Empty response payload. Raw response: ${JSON.stringify(data)}`, {
                providerId: this.id, 
                retryable: true
            });
        }
        return trimmedContent;
    }

    async testConnection(config: ProviderCredential): Promise<void> {
        const resolved = this.getConfig(config);
        ensureApiKey(resolved, this.id);
        const response = await fetch(`${resolved.baseUrl}/models`, {
            method: "GET",
            headers: this.buildHeaders(resolved)
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new LLMProviderError(body?.error?.message || response.statusText, {
                providerId: this.id,
                status: response.status,
                retryable: false
            });
        }
    }

    private getConfig(config: ProviderCredential) {
        const resolved = resolveProviderCredential(this.id, config);
        return {
            ...resolved,
            baseUrl: (resolved.baseUrl || PROVIDER_METADATA[this.id].defaultBaseUrl).replace(/\/+$/, "")
        };
    }

    private buildHeaders(config: ProviderCredential) {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
        };
        if (config.organization) {
            headers["OpenAI-Organization"] = config.organization;
        }
        if (config.extraHeaders) {
            Object.assign(headers, config.extraHeaders);
        }
        return headers;
    }

    private extractMessageContent(body: any) {
        const choice = body?.choices?.[0];
        const message = choice?.message ?? choice?.delta;
        if (typeof message?.content === "string") {
            return message.content;
        }
        if (Array.isArray(message?.content)) {
            return message.content.map((chunk: any) => chunk?.text || chunk?.value || "").join(" ");
        }
        if (typeof choice?.text === "string") {
            return choice.text;
        }
        return undefined;
    }
}
