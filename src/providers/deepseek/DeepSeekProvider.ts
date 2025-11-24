import {ProviderCredential} from "../../types";
import {PROVIDER_METADATA, resolveProviderCredential} from "../base/ProviderConfig";
import {LLMProvider, LLMProviderError, ProviderGenerateOptions, ensureApiKey} from "../base/LLMProvider";

export class DeepSeekProvider implements LLMProvider {
    readonly id = "deepseek" as const;
    readonly label = PROVIDER_METADATA.deepseek.label;

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
        
        // 增强的响应解析逻辑，支持多种可能的响应格式
        let content: string | undefined;
        
        if (data?.choices && Array.isArray(data.choices) && data.choices.length > 0) {
            const choice = data.choices[0];
            
            if (choice?.message?.content) {
                content = choice.message.content;
            } else if (choice?.text) {
                content = choice.text;
            } else if (choice?.delta?.content) {
                content = choice.delta.content;
            }
        }
        
        const trimmedContent = content?.trim();
        if (!trimmedContent) {
            console.error("[DeepSeekProvider] Empty or invalid response:", JSON.stringify(data, null, 2));
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
        
        // 优先尝试 models 端点
        let response = await fetch(`${resolved.baseUrl}/models`, {
            headers: this.buildHeaders(resolved)
        });
        
        // 如果 models 端点不可用（自定义网关可能不支持），尝试轻量级的 chat 请求
        if (!response.ok && response.status === 404) {
            response = await fetch(`${resolved.baseUrl}/chat/completions`, {
                method: "POST",
                headers: this.buildHeaders(resolved),
                body: JSON.stringify({
                    model: resolved.model,
                    messages: [{role: "user", content: "test"}],
                    max_tokens: 1
                })
            });
        }
        
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
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
            baseUrl: (resolved.baseUrl || PROVIDER_METADATA.deepseek.defaultBaseUrl).replace(/\/+$/, "")
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
