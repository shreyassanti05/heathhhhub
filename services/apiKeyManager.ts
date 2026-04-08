/**
 * ============================================================
 *  API KEY POOL MANAGER — Healthcare Hub
 * ============================================================
 *  Manages up to 5 Gemini API keys with:
 *   - Circular round-robin rotation
 *   - Per-key cooldown on rate-limit (HTTP 429 / quota errors)
 *   - Automatic failover: retries with the next available key
 *   - Console logging for observability
 * ============================================================
 */

import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// 1. Load keys from Vite env vars (VITE_GEMINI_KEY_1 … VITE_GEMINI_KEY_5)
// ---------------------------------------------------------------------------
const RAW_KEYS: (string | undefined)[] = [
    import.meta.env.VITE_GEMINI_KEY_1,
    import.meta.env.VITE_GEMINI_KEY_2,
    import.meta.env.VITE_GEMINI_KEY_3,
    import.meta.env.VITE_GEMINI_KEY_4,
    import.meta.env.VITE_GEMINI_KEY_5,
];

// Filter out undefined / empty strings
export const API_KEYS: string[] = RAW_KEYS.filter(
    (k): k is string => typeof k === 'string' && k.trim().length > 0
);

if (API_KEYS.length === 0) {
    console.error(
        '[KeyPool] ⚠️  No Gemini API keys found. ' +
        'Set VITE_GEMINI_KEY_1 … VITE_GEMINI_KEY_5 in your .env.local file.'
    );
}

// ---------------------------------------------------------------------------
// 2. Pre-build one GoogleGenAI instance per key (avoids re-instantiating)
// ---------------------------------------------------------------------------
const AI_INSTANCES: GoogleGenAI[] = API_KEYS.map(
    (key) => new GoogleGenAI({ apiKey: key })
);

// ---------------------------------------------------------------------------
// 3. State: current index + per-key rate-limit cooldown tracking
// ---------------------------------------------------------------------------
let currentIndex = 0;

/**
 * Map from key index → timestamp (ms) until which the key is in cooldown.
 * 0 means the key is fully available.
 */
const keyCooldownUntil: number[] = new Array(API_KEYS.length).fill(0);

/** How long (ms) a rate-limited key stays in cooldown before being retried. */
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 60 seconds

// ---------------------------------------------------------------------------
// 4. Core helpers
// ---------------------------------------------------------------------------

/**
 * Returns the masked version of a key for safe logging.
 * e.g. "AIzaSyDoo...BskI"
 */
function maskKey(key: string): string {
    if (key.length <= 10) return '***';
    return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

/**
 * Finds the next available (non-rate-limited) key index.
 * Returns -1 if ALL keys are currently in cooldown.
 */
export function getNextAvailableKeyIndex(): number {
    const now = Date.now();
    for (let i = 0; i < API_KEYS.length; i++) {
        const idx = (currentIndex + i) % API_KEYS.length;
        if (keyCooldownUntil[idx] <= now) {
            return idx;
        }
    }
    return -1;
}

/**
 * Marks a specific key index as rate-limited.
 * It will be skipped for RATE_LIMIT_COOLDOWN_MS milliseconds.
 */
export function markKeyRateLimited(keyIndex: number): void {
    keyCooldownUntil[keyIndex] = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    console.warn(
        `[KeyPool] 🚫 Key ${keyIndex} (${maskKey(API_KEYS[keyIndex])}) ` +
        `rate-limited — cooling down for ${RATE_LIMIT_COOLDOWN_MS / 1000}s.`
    );
}

/**
 * Advances the pool to the next available key.
 */
function advanceToNextKey(): void {
    currentIndex = (currentIndex + 1) % API_KEYS.length;
}

// ---------------------------------------------------------------------------
// 5. Rate-limit / quota error detection
// ---------------------------------------------------------------------------

/** Returns true if the error looks like a rate-limit or quota-exceeded error. */
function isRateLimitError(error: unknown): boolean {
    if (!error) return false;
    const msg = String(
        (error as any)?.message ?? (error as any)?.toString?.() ?? ''
    ).toLowerCase();
    const status = (error as any)?.status ?? (error as any)?.code ?? 0;

    return (
        status === 429 ||
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('quota') ||
        msg.includes('resource_exhausted') ||
        msg.includes('too many requests') ||
        msg.includes('rateLimitExceeded') ||
        msg.includes('userRateLimitExceeded')
    );
}

// ---------------------------------------------------------------------------
// 6. Main: executeWithFallback
// ---------------------------------------------------------------------------

/**
 * Executes `fn` using the current GoogleGenAI instance.
 * On rate-limit / quota errors, automatically retries with the next key.
 * Throws if all keys are exhausted or a non-retryable error occurs.
 *
 * @example
 * const result = await executeWithFallback((ai) =>
 *   ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...] })
 * );
 */
export async function executeWithFallback<T>(
    fn: (ai: GoogleGenAI) => Promise<T>
): Promise<T> {
    if (API_KEYS.length === 0) {
        throw new Error('[KeyPool] No API keys configured.');
    }

    let attemptsLeft = API_KEYS.length;

    while (attemptsLeft > 0) {
        const idx = getNextAvailableKeyIndex();

        if (idx === -1) {
            // All keys are in cooldown — find the soonest one to become available
            const soonest = Math.min(...keyCooldownUntil);
            const waitMs = Math.max(0, soonest - Date.now());
            throw new Error(
                `[KeyPool] All ${API_KEYS.length} API keys are rate-limited. ` +
                `Earliest retry in ${Math.ceil(waitMs / 1000)}s.`
            );
        }

        currentIndex = idx;
        const ai = AI_INSTANCES[currentIndex];
        const maskedKey = maskKey(API_KEYS[currentIndex]);

        console.log(`[KeyPool] 🔑 Using key index ${currentIndex} (${maskedKey})`);

        try {
            const result = await fn(ai);
            return result;
        } catch (error: unknown) {
            if (isRateLimitError(error)) {
                markKeyRateLimited(currentIndex);
                advanceToNextKey();
                attemptsLeft--;
                console.warn(
                    `[KeyPool] ↩️  Retrying with next key. ` +
                    `${attemptsLeft} attempt(s) left.`
                );
                // Continue loop → will pick next non-limited key
            } else {
                // Non-retryable error (bad prompt, auth error, network error, etc.)
                throw error;
            }
        }
    }

    throw new Error('[KeyPool] All API key attempts exhausted without success.');
}

// ---------------------------------------------------------------------------
// 7. Utility: current pool status (for debugging dashboards / logs)
// ---------------------------------------------------------------------------

/** Returns a snapshot of the pool's current health. */
export function getKeyPoolStatus(): {
    totalKeys: number;
    availableKeys: number;
    rateLimitedKeys: number;
    keys: { index: number; masked: string; available: boolean; cooldownRemainingMs: number }[];
} {
    const now = Date.now();
    const keys = API_KEYS.map((key, index) => {
        const cooldownRemainingMs = Math.max(0, keyCooldownUntil[index] - now);
        return {
            index,
            masked: maskKey(key),
            available: cooldownRemainingMs === 0,
            cooldownRemainingMs,
        };
    });

    const availableKeys = keys.filter((k) => k.available).length;
    return {
        totalKeys: API_KEYS.length,
        availableKeys,
        rateLimitedKeys: API_KEYS.length - availableKeys,
        keys,
    };
}
