import {ProviderCredential} from "../../types";
import {PROVIDER_METADATA, resolveProviderCredential} from "../base/ProviderConfig";
import {LLMProvider, LLMProviderError, ProviderGenerateOptions, ensureApiKey} from "../base/LLMProvider";

export class GeminiProvider implements LLMProvider {
    readonly id = "gemini" as const;
    readonly label = PROVIDER_METADATA.gemini.label;

    async generateTitle(options: ProviderGenerateOptions): Promise<string> {
        const config = this.getConfig(options.config);
        ensureApiKey(config, this.id);
        const endpoint = `${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                systemInstruction: {parts: [{text: options.systemPrompt}]},
                contents: [
                    {
                        role: "user",
                        parts: [{text: options.prompt}]
                    }
                ],
                generationConfig: {
                    temperature: options.temperature,
                    topP: options.topP,
                    maxOutputTokens: options.maxTokens
                }
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
        const content = this.extractText(data);
        if (!content) {
            throw new LLMProviderError("Empty response payload", {providerId: this.id, retryable: false});
        }
        return content.trim();
    }

    async testConnection(config: ProviderCredential): Promise<void> {
        const resolved = this.getConfig(config);
        ensureApiKey(resolved, this.id);
        const endpoint = `${resolved.baseUrl}/models?key=${encodeURIComponent(resolved.apiKey)}`;
        const response = await fetch(endpoint);
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
            baseUrl: (resolved.baseUrl || PROVIDER_METADATA.gemini.defaultBaseUrl).replace(/\/+$/, "")
        };
    }

    private extractText(body: any) {
        const candidates = body?.candidates;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return undefined;
        }
        const content = candidates[0]?.content?.parts?.[0]?.text;
        return typeof content === "string" ? content : undefined;
    }
}
