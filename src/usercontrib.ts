import { Context } from "hono";
import { getSiteConfig, getRefreshTimeout } from "./sites.js";
import { KVNamespace } from "@cloudflare/workers-types";

interface CacheEntry<T> {
    fetchAt: number;
    data: T;
}

let kvInstance: KVNamespace | null = null;

function setKVNamespace(kv: KVNamespace): void {
    kvInstance = kv;
}

function getKV(): KVNamespace | null {
    return kvInstance;
}

async function getCacheEntry(key: string): Promise<CacheEntry<Contribution[]> | undefined> {
    try {
        const kv = getKV();
        if (!kv) {
            console.log("[CACHE] KV namespace not available");
            return undefined;
        }
        const value = await kv.get(key, "json");
        return value as CacheEntry<Contribution[]> | null ?? undefined;
    } catch (error) {
        console.log(`[CACHE READ ERROR] ${key}: ${error instanceof Error ? error.message : "unknown"}`);
        return undefined;
    }
}

async function setCacheEntry(key: string, value: CacheEntry<Contribution[]>): Promise<void> {
    try {
        const kv = getKV();
        if (!kv) {
            console.log("[CACHE WRITE SKIPPED] KV namespace not available");
            return;
        }

        const refreshTimeout = getRefreshTimeout();
        const expirationTtl = Math.ceil(refreshTimeout / 1000); // Convert to seconds

        await kv.put(key, JSON.stringify(value), {
            expirationTtl,
        });
    } catch (error) {
        console.log(`[CACHE WRITE ERROR] ${key}: ${error instanceof Error ? error.message : "unknown"}`);
    }
}

async function getCacheKeys(): Promise<string[]> {
    try {
        const kv = getKV();
        if (!kv) {
            console.log("[CACHE] KV namespace not available");
            return [];
        }
        const list = await kv.list();
        return list.keys.map((k) => k.name);
    } catch (error) {
        console.log(`[CACHE READ ERROR] keys: ${error instanceof Error ? error.message : "unknown"}`);
        return [];
    }
}

async function getCacheSize(): Promise<number> {
    const keys = await getCacheKeys();
    return keys.length;
}
export interface Contribution {
    time: string;
    count: number;
}

interface UserContribItem {
    title: string;
    timestamp: string;
}

interface ApiResponse {
    query?: {
        usercontribs?: UserContribItem[] | false;
    };
    continue?: {
        uccontinue: string;
    };
}

function parseTimezone(tz?: string): string {
    return tz || "UTC";
}

function groupByDate(items: UserContribItem[], timezone: string): Record<string, number> {
    const grouped: Record<string, number> = {};

    for (const item of items) {
        const date = new Date(item.timestamp);
        // Simple timezone handling - convert to specified timezone
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        const parts = formatter.formatToParts(date);
        const dateStr = parts
            .filter((p) => p.type !== "literal")
            .map((p) => p.value)
            .join("-");

        grouped[dateStr] = (grouped[dateStr] || 0) + 1;
    }

    return grouped;
}

function fillYearWithData(grouped: Record<string, number>): Contribution[] {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const result: Contribution[] = [];
    const current = new Date(oneYearAgo);

    while (current <= now) {
        const dateStr = current.toISOString().split("T")[0];
        result.push({
            time: dateStr,
            count: grouped[dateStr] || 0,
        });
        current.setDate(current.getDate() + 1);
    }

    return result;
}

async function fetchUserContributions(api: string, username: string, ucend?: string): Promise<UserContribItem[]> {
    const results: UserContribItem[] = [];
    let uccontinue = "";

    while (true) {
        const params = new URLSearchParams({
            action: "query",
            list: "usercontribs",
            ucuser: username,
            uclimit: "max",
            ucprop: "title|timestamp",
            ucnamespace: "*",
            format: "json",
        });

        if (uccontinue) {
            params.append("uccontinue", uccontinue);
        }

        if (ucend) {
            params.append("ucend", ucend);
        }

        const response = await fetch(`${api}?${params.toString()}`);
        const data: ApiResponse = await response.json();

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        if (data.query?.usercontribs && Array.isArray(data.query.usercontribs)) {
            results.push(...data.query.usercontribs);
        }

        if (!data.continue?.uccontinue) {
            break;
        }

        uccontinue = data.continue.uccontinue;
    }

    return results;
}

export async function getUserContributions(c: Context, siteName: string, username: string, kv: KVNamespace): Promise<Contribution[]> {
    setKVNamespace(kv);
    
    const siteConfig = getSiteConfig(siteName);
    if (!siteConfig) {
        throw new Error(`Unknown site: ${siteName}`);
    }

    const cacheKey = `${siteName}:${username}`;
    const timeout = getRefreshTimeout();

    const cached = await getCacheEntry(cacheKey);
    const now = Date.now();

    if (!cached) {
        const cacheSize = await getCacheSize();
        console.log(`[CACHE MISS] ${cacheKey} (no entry in cache, total: ${cacheSize})`);
    } else {
        const age = now - cached.fetchAt;
        console.log(`[CACHE CHECK] ${cacheKey}: age=${age}ms, timeout=${timeout}ms`);
        if (age < timeout) {
            console.log(`[CACHE HIT] ${cacheKey} (age: ${Math.round(age / 1000)}s)`);
            return cached.data;
        }
        console.log(`[CACHE EXPIRED] ${cacheKey} (expired ${Math.round((age - timeout) / 1000)}s ago)`);
    }

    try {
        console.log(`[FETCHING] ${cacheKey}`);
        const items = await fetchUserContributions(siteConfig.api, username);
        const timezone = parseTimezone(siteConfig.timezone);
        const grouped = groupByDate(items, timezone);
        const contributions = fillYearWithData(grouped);

        await setCacheEntry(cacheKey, {
            fetchAt: Date.now(),
            data: contributions,
        });

        const cacheSize = await getCacheSize();
        const cacheKeys = await getCacheKeys();
        console.log(`[CACHED] ${cacheKey} with ${contributions.length} records, cache size: ${cacheSize}`);
        console.log(`[CACHE KEYS] ${cacheKeys.join(", ")}`);
        return contributions;
    } catch (error) {
        if (cached) {
            console.log(`[FALLBACK] ${cacheKey} using expired cache on error`);
            return cached.data;
        }
        throw error;
    }
}
