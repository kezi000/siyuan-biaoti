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
        
        // 增强的响应解析逻辑，支持多种可能的响应格式
        let content: string | undefined;
        
        // 尝试多种可能的响应格式
        if (data?.choices && Array.isArray(data.choices) && data.choices.length > 0) {
            const choice = data.choices[0];
            
            // 标准格式: choices[0].message.content
            if (choice?.message?.content) {
                content = choice.message.content;
            }
            // Zhipu GLM 特殊格式: choices[0].message.reasoning_content (推理内容)
            // 当 content 为空但 reasoning_content 有内容时，提取 reasoning_content 中的最终标题
            else if (choice?.message?.reasoning_content) {
                const reasoningContent = choice.message.reasoning_content;
                console.log("[ZhipuProvider] Using reasoning_content:", reasoningContent);
                
                // 尝试从推理内容中提取标题
                // 通常推理内容的最后部分会包含最终答案
                const lines = reasoningContent.split("\n").filter((line: string) => line.trim());
                if (lines.length > 0) {
                    // 取最后一行作为标题，或者寻找看起来像标题的内容
                    const lastLine = lines[lines.length - 1].trim();
                    // 移除markdown格式和编号
                    content = lastLine.replace(/^[#*\-\d.]+\s*/, "").trim();
                }
            }
            // 备选格式: choices[0].text
            else if (choice?.text) {
                content = choice.text;
            }
            // 备选格式: choices[0].delta.content (流式响应的非流式版本)
            else if (choice?.delta?.content) {
                content = choice.delta.content;
            }
        }
        
        // 如果内容为空字符串或只有空白字符，也视为无效
        const trimmedContent = content?.trim();
        if (!trimmedContent) {
            console.error("[ZhipuProvider] Empty or invalid response:", JSON.stringify(data, null, 2));
            
            // 特殊处理：如果是因为 max_tokens 限制导致推理内容被截断
            const choice = data?.choices?.[0];
            if (choice?.finish_reason === "length" && choice?.message?.reasoning_content) {
                throw new LLMProviderError(
                    "模型推理内容被截断，请在设置中增加 max_tokens 值（建议 128 或更高）", 
                    {
                        providerId: this.id, 
                        retryable: false  // 不重试，因为重试也会失败
                    }
                );
            }
            
            throw new LLMProviderError(`Empty response payload. Raw response: ${JSON.stringify(data)}`, {
                providerId: this.id, 
                retryable: true  // 设置为可重试，因为可能是临时性问题
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
