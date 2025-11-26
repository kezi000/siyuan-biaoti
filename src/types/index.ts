export type ContextStrategy = "auto" | "selection" | "block" | "document";

export type TonePreset = "balanced" | "catchy" | "technical" | "narrative";

export type ProviderId = "openai" | "anthropic" | "gemini" | "deepseek" | "zhipu" | "custom";

export interface ProviderCredential {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    organization?: string;
    extraHeaders?: Record<string, string>;
    customParams?: Record<string, string | number | boolean>;
    // Zhipu GLM specific: prefer non-reasoning models for title generation
    preferNonReasoningModel?: boolean;
}

export type ProviderCredentialMap = Record<ProviderId | string, ProviderCredential>;

export interface RetryPolicyConfig {
    maxAttempts: number;
    baseDelayMs: number;
    exponential: boolean;
    timeoutMs: number;
}

export interface ProviderPreferences {
    primary: ProviderId;
    fallbacks: ProviderId[];
    autoSwitchOnSuccess: boolean;
}

export interface UsageStats {
    totalRequests: number;
    lastUsedProvider?: ProviderId;
    providerFailureCounts: Partial<Record<ProviderId, number>>;
}

export interface TitleConfig {
    providerPreferences: ProviderPreferences;
    providers: ProviderCredentialMap;
    retryPolicy: RetryPolicyConfig;
    usage: UsageStats;
    temperature: number;
    topP: number;
    maxTokens: number;
    language: string;
    tone: TonePreset;
    contextStrategy: ContextStrategy;
    contextMaxChars: number;
    promptTemplate: string;
    disableThinking: boolean;
}

export interface ProviderOption {
    id: ProviderId;
    label: string;
    description: string;
}

export interface ProviderMeta extends ProviderOption {
    defaultBaseUrl: string;
    defaultModel: string;
    requiresApiKey: boolean;
    supportsCustomBaseUrl: boolean;
}

export interface GenerateTitleParams {
    prompt: string;
    systemPrompt: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    abortSignal?: AbortSignal;
    disableThinking?: boolean;
}
