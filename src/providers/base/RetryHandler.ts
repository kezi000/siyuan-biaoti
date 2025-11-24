import {RetryPolicyConfig} from "../../types";
import {LLMProviderError} from "./LLMProvider";

export interface RetryOptions {
    signal?: AbortSignal;
}

export class RetryHandler {
    constructor(private readonly policy: RetryPolicyConfig) {}

    async execute<T>(operation: (attempt: number) => Promise<T>, options?: RetryOptions): Promise<T> {
        let attempt = 0;
        let lastError: unknown;
        while (attempt < this.policy.maxAttempts) {
            attempt += 1;
            try {
                return await operation(attempt);
            } catch (error) {
                lastError = error;
                if (!this.shouldRetry(error, attempt, options?.signal)) {
                    throw error;
                }
                await this.delay(attempt, options?.signal);
            }
        }
        throw lastError instanceof Error ? lastError : new Error("Exceeded retry attempts");
    }

    private shouldRetry(error: unknown, attempt: number, signal?: AbortSignal) {
        if (signal?.aborted) {
            return false;
        }
        if (attempt >= this.policy.maxAttempts) {
            return false;
        }
        if (error instanceof LLMProviderError) {
            return error.retryable;
        }
        return true;
    }

    private async delay(attempt: number, signal?: AbortSignal) {
        const base = this.policy.baseDelayMs;
        const multiplier = this.policy.exponential ? Math.pow(2, attempt - 1) : 1;
        const wait = Math.min(base * multiplier, this.policy.timeoutMs);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, wait);
            const onAbort = () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            };
            if (signal) {
                signal.addEventListener("abort", onAbort, {once: true});
            }
        });
    }
}
