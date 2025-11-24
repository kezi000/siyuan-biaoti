import {ProviderCredential} from "../../types";
import {PROVIDER_METADATA, resolveProviderCredential} from "../base/ProviderConfig";
import {LLMProvider, LLMProviderError, ProviderGenerateOptions, ensureApiKey} from "../base/LLMProvider";

const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements LLMProvider {
    readonly id = "anthropic" as const;
    readonly label = PROVIDER_METADATA.anthropic.label;

    async generateTitle(options: ProviderGenerateOptions): Promise<string> {
        const config = this.getConfig(options.config);
        ensureApiKey(config, this.id);
        const response = await fetch(`${config.baseUrl}/v1/messages`, {
            method: "POST",
            headers: this.buildHeaders(config),
            body: JSON.stringify({
                model: config.model,
                system: options.systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: options.prompt
                    }
                ],
                temperature: options.temperature,
                top_p: options.topP,
                max_output_tokens: options.maxTokens
            }),
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
        const content = this.extractContent(data);
        const trimmedContent = content?.trim();
        if (!trimmedContent) {
            console.error("[AnthropicProvider] Empty or invalid response:", JSON.stringify(data, null, 2));
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
        // Anthropic 不提供 models 端点，使用轻量级的 messages 请求测试连接
        const response = await fetch(`${resolved.baseUrl}/v1/messages`, {
            method: "POST",
            headers: this.buildHeaders(resolved),
            body: JSON.stringify({
                model: resolved.model,
                messages: [{role: "user", content: "test"}],
                max_tokens: 1
            })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new LLMProviderError(body?.error?.message || response.statusText, {
                providerId: this.id,
                status: response.status,
                retryable: response.status >= 500 || response.status === 429
            });
        }
    }

    private getConfig(config: ProviderCredential) {
        const resolved = resolveProviderCredential(this.id, config);
        return {
            ...resolved,
            baseUrl: (resolved.baseUrl || PROVIDER_METADATA.anthropic.defaultBaseUrl).replace(/\/+$/, "")
        };
    }

    private buildHeaders(config: ProviderCredential) {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION
        };
        if (config.extraHeaders) {
            Object.assign(headers, config.extraHeaders);
        }
        return headers;
    }

    private extractContent(body: any) {
        const content = body?.content;
        if (Array.isArray(content)) {
            return content.map((item: any) => item?.text || "").join(" ");
        }
        if (typeof content === "string") {
            return content;
        }
        return undefined;
    }
}
