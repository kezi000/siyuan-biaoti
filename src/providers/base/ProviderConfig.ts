import {ProviderCredential, ProviderId, ProviderMeta} from "../../types";

export const PROVIDER_METADATA: Record<ProviderId, ProviderMeta> = {
    openai: {
        id: "openai",
        label: "OpenAI / Compatible",
        description: "Official OpenAI endpoint or any fully compatible gateway",
        defaultBaseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        requiresApiKey: true,
        supportsCustomBaseUrl: true
    },
    anthropic: {
        id: "anthropic",
        label: "Anthropic Claude",
        description: "Claude 3.5 Sonnet and related models",
        defaultBaseUrl: "https://api.anthropic.com",
        defaultModel: "claude-3-5-sonnet-20241022",
        requiresApiKey: true,
        supportsCustomBaseUrl: true
    },
    gemini: {
        id: "gemini",
        label: "Google Gemini",
        description: "Gemini 1.5 Pro and Flash models",
        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        defaultModel: "gemini-1.5-pro-latest",
        requiresApiKey: true,
        supportsCustomBaseUrl: true
    },
    deepseek: {
        id: "deepseek",
        label: "DeepSeek",
        description: "DeepSeek Chat and Coder models",
        defaultBaseUrl: "https://api.deepseek.com",
        defaultModel: "deepseek-chat",
        requiresApiKey: true,
        supportsCustomBaseUrl: true
    },
    zhipu: {
        id: "zhipu",
        label: "Zhipu GLM",
        description: "GLM-4 and related Chinese models. 推荐使用 glm-4 或 glm-4-flash（非推理模型）以获得更快速的标题生成。",
        defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
        defaultModel: "glm-4-flash",
        requiresApiKey: true,
        supportsCustomBaseUrl: true
    },
    custom: {
        id: "custom",
        label: "Custom OpenAI-compatible",
        description: "Any OpenAI-compatible endpoint using the Chat Completions API",
        defaultBaseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        requiresApiKey: true,
        supportsCustomBaseUrl: true
    }
};

export const DEFAULT_PROVIDER_CREDENTIALS: Record<ProviderId, ProviderCredential> = Object.fromEntries(
    (Object.keys(PROVIDER_METADATA) as ProviderId[]).map((id) => [
        id,
        {
            apiKey: "",
            baseUrl: PROVIDER_METADATA[id].defaultBaseUrl,
            model: PROVIDER_METADATA[id].defaultModel
        }
    ])
) as Record<ProviderId, ProviderCredential>;

export function resolveProviderCredential(providerId: ProviderId, overrides?: ProviderCredential): ProviderCredential {
    return {
        ...DEFAULT_PROVIDER_CREDENTIALS[providerId],
        ...(overrides ?? {})
    };
}
