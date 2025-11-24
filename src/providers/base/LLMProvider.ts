import {GenerateTitleParams, ProviderCredential, ProviderId} from "../../types";

export interface ProviderGenerateOptions extends GenerateTitleParams {
    config: ProviderCredential;
}

export interface LLMProvider {
    readonly id: ProviderId;
    readonly label: string;
    readonly supportsAnonymous?: boolean;
    generateTitle(options: ProviderGenerateOptions): Promise<string>;
    testConnection(config: ProviderCredential): Promise<void>;
}

export class LLMProviderError extends Error {
    readonly status?: number;
    readonly providerId?: ProviderId;
    readonly retryable: boolean;

    constructor(message: string, options: {status?: number; providerId?: ProviderId; retryable?: boolean} = {}) {
        super(message);
        this.name = "LLMProviderError";
        this.status = options.status;
        this.providerId = options.providerId;
        this.retryable = options.retryable ?? false;
    }
}

export function ensureApiKey(config: ProviderCredential, providerId: ProviderId) {
    if (!config.apiKey) {
        throw new LLMProviderError(`Missing API key for provider ${providerId}`, {providerId, retryable: false});
    }
}
