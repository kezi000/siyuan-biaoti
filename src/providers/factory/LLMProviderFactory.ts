import {ProviderId} from "../../types";
import {AnthropicProvider} from "../anthropic/AnthropicProvider";
import {DeepSeekProvider} from "../deepseek/DeepSeekProvider";
import {GeminiProvider} from "../gemini/GeminiProvider";
import {OpenAIProvider} from "../openai/OpenAIProvider";
import {LLMProvider} from "../base/LLMProvider";
import {ZhipuProvider} from "../zhipu/ZhipuProvider";

export class LLMProviderFactory {
    private static readonly registry = new Map<ProviderId, LLMProvider>();

    static get(providerId: ProviderId): LLMProvider {
        if (!this.registry.has(providerId)) {
            this.registry.set(providerId, this.create(providerId));
        }
        return this.registry.get(providerId)!;
    }

    private static create(providerId: ProviderId): LLMProvider {
        switch (providerId) {
            case "openai":
                return new OpenAIProvider("openai");
            case "custom":
                return new OpenAIProvider("custom");
            case "anthropic":
                return new AnthropicProvider();
            case "gemini":
                return new GeminiProvider();
            case "deepseek":
                return new DeepSeekProvider();
            case "zhipu":
                return new ZhipuProvider();
            default:
                throw new Error(`Unsupported provider: ${providerId}`);
        }
    }
}
