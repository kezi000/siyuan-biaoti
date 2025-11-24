import {ProviderCredential} from "../../types";
import {PROVIDER_METADATA, resolveProviderCredential} from "../base/ProviderConfig";
import {LLMProvider, LLMProviderError, ProviderGenerateOptions, ensureApiKey} from "../base/LLMProvider";

export class ZhipuProvider implements LLMProvider {
    readonly id = "zhipu" as const;
    readonly label = PROVIDER_METADATA.zhipu.label;

    async generateTitle(options: ProviderGenerateOptions): Promise<string> {
        const config = this.getConfig(options.config);
        ensureApiKey(config, this.id);
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: this.buildHeaders(config),
            body: JSON.stringify({
                model: config.model,
                messages: [
                    {role: "system", content: options.systemPrompt},
                    {role: "user", content: options.prompt}
                ],
                temperature: options.temperature,
                top_p: options.topP,
                max_tokens: options.maxTokens,
                stream: false
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
        const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text;
        if (!content) {
            throw new LLMProviderError("Empty response payload", {providerId: this.id, retryable: false});
        }
        return (Array.isArray(content) ? content.map((chunk: any) => chunk?.text || "").join(" ") : String(content)).trim();
    }

    async testConnection(config: ProviderCredential): Promise<void> {
        const resolved = this.getConfig(config);
        ensureApiKey(resolved, this.id);
        const response = await fetch(`${resolved.baseUrl}/models`, {
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
            baseUrl: (resolved.baseUrl || PROVIDER_METADATA.zhipu.defaultBaseUrl).replace(/\/+$/, "")
        };
    }

    private buildHeaders(config: ProviderCredential) {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
        };
        if (config.extraHeaders) {
            Object.assign(headers, config.extraHeaders);
        }
        return headers;
    }
}
