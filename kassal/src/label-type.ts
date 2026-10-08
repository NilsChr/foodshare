// Adds Jev's product type (one of the 137 in product_types.json) to each item in
// data/enriched.json, as `jev_type_response`. Same pattern as label-group.ts, which runs first.
//
// Asks like the app does (productQuestion in pocketbase/pb_hooks/product_types.js): only the
// types of the item's group from the earlier group run (`jev_response`), plus the runner-up
// group when that answer was below SURE_GROUP. Items with the same title are asked once.
//
//   bun run label-type

import { rename } from "node:fs/promises";
import enriched from "../data/enriched.json";
import productTypes from "../../pocketbase/pb_hooks/product_types.json";

type Item = {
    title: string;
    category: string;
    name: string;
    brand: string;
    chain: string;
    jev_response?: any;
    jev_type_response?: unknown;
};

const API_URL = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 30_000;
const ITEMS_TO_RUN = 40000; // All distinct titles (~45,600); use 100 to test the cost.
const CONCURRENCY = 16; // Rate limits are unpublished, so start low and raise it.
const MAX_RETRIES = 3;
const SAVE_EVERY = 500; // The file is ~60 MB; saving after every item is slow.
const SURE_GROUP = 0.8; // Same as product_types.js
const DATA_PATH = `${import.meta.dir}/../data/enriched.json`;

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
    throw new Error("TYPESAFE_API_KEY is not set");
}

class JevError extends Error {
    constructor(
        message: string,
        public status?: number,
        public retryAfterMs?: number,
    ) {
        super(message);
    }
}

// The group run used "annet"; product_types.json calls it "other".
const groupKey = (choice: string) => (choice === "annet" ? "other" : choice);

// The likeliest group, plus the runner-up when Jev was unsure (likelyGroups in product_types.js).
function likelyGroups(item: Item): string[] {
    const p: Record<string, number> = item.jev_response?.answers?.new_choice?.probabilities ?? {};
    const ranked = Object.keys(p).sort((a, b) => (p[b] ?? 0) - (p[a] ?? 0));
    const groups = ranked.map(groupKey);
    return (p[ranked[0]!] ?? 0) >= SURE_GROUP ? groups.slice(0, 1) : groups.slice(0, 2);
}

// The types of the given groups, each with its flyer words (productQuestion in product_types.js).
function productQuestion(groups: string[]) {
    const criteria: Record<string, string> = {};
    for (const t of productTypes.types) {
        if (groups.includes(t.group)) criteria[t.key] = `${t.name}: ${t.aliases.slice(0, 6).join(", ")}`;
    }
    criteria.none = "None of these";
    return {
        type: "choice",
        instructions: "Which grocery product type is this (a Norwegian grocery product)?",
        criteria,
    };
}

async function queryJev(state: Record<string, string>, groups: string[]): Promise<any> {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            state,
            model: "jev-latest",
            questions: { product: productQuestion(groups) },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text();

    if (!res.ok) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : undefined;
        throw new JevError(
            `JEV HTTP ${res.status}: ${text.slice(0, 500)}`,
            res.status,
            retryAfterMs,
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new JevError(`JEV returned non-JSON: ${text.slice(0, 200)}`);
    }
}

// Retries 429 and 5xx responses with exponential backoff, honoring Retry-After.
async function queryWithRetry(state: Record<string, string>, groups: string[]): Promise<any> {
    for (let attempt = 0;; attempt++) {
        try {
            return await queryJev(state, groups);
        } catch (err) {
            const retryable = err instanceof JevError &&
                err.status !== undefined &&
                (err.status === 429 || err.status >= 500);

            if (!retryable || attempt >= MAX_RETRIES) throw err;

            const delay = (err as JevError).retryAfterMs ??
                1000 * 2 ** attempt + Math.random() * 500;
            await Bun.sleep(delay);
        }
    }
}

// Write to a temp file, then rename, so a crash can't leave a half-written file.
async function save(items: Item[]) {
    const tmp = `${DATA_PATH}.tmp`;
    await Bun.write(tmp, JSON.stringify(items, null, 2));
    await rename(tmp, DATA_PATH);
}

const items = enriched as Item[];

// Saves run one at a time. Parallel saves would race on the same .tmp file.
let saveChain: Promise<void> = Promise.resolve();
function scheduleSave(): Promise<void> {
    saveChain = saveChain
        .then(() => save(items))
        .catch((err) => console.error("SAVE FAILED:", err));
    return saveChain;
}

// One item per title; titles already asked (in an earlier run) are skipped.
const asked = new Set(
    items.filter((item) => item.jev_type_response !== undefined).map((item) => item.title.toLowerCase().trim()),
);
const queue: Item[] = [];
for (const item of items) {
    const key = item.title.toLowerCase().trim();
    if (asked.has(key) || !item.jev_response?.answers?.new_choice) continue;
    asked.add(key);
    queue.push(item);
    if (queue.length >= ITEMS_TO_RUN) break;
}

const startedAt = Date.now();
const total = queue.length;
let next = 0;
let completed = 0;
let succeeded = 0;
let failed = 0;
let inputTokens = 0;

function formatDuration(ms: number): string {
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function renderProgress() {
    const width = 30;
    const ratio = total === 0 ? 1 : completed / total;
    const filled = Math.round(ratio * width);
    const bar = "█".repeat(filled) + "░".repeat(width - filled);

    const elapsed = Date.now() - startedAt;
    const perItem = completed > 0 ? elapsed / completed : 0;
    const remaining = perItem * (total - completed);

    const line = `[${bar}] ${completed}/${total} ` +
        `(${(ratio * 100).toFixed(1)}%) ` +
        `elapsed ${formatDuration(elapsed)} ` +
        `ETA ${completed > 0 ? formatDuration(remaining) : "--"} ` +
        `ok ${succeeded} fail ${failed} tokens ${inputTokens}`;

    // \r returns to line start, \x1b[K clears the rest of the line.
    process.stdout.write(`\r\x1b[K${line}`);
}

async function worker() {
    while (next < queue.length) {
        const item = queue[next++];
        if (!item) break;

        const state = {
            category: item.category,
            name: item.name,
            brand: item.brand,
            chain: item.chain,
        };

        try {
            const data = await queryWithRetry(state, likelyGroups(item));
            const answer = data?.answers?.product;

            if (answer === undefined) {
                throw new Error(
                    `response has no answers.product: ${
                        JSON.stringify(data).slice(0, 200)
                    }`,
                );
            }

            item.jev_type_response = data;
            inputTokens += data?.usage?.input_tokens ?? 0;
            succeeded++;
        } catch (err) {
            failed++;
            const message = err instanceof Error ? err.message : String(err);
            // Clear the progress line, print the error, then redraw progress below it.
            process.stdout.write("\r\x1b[K");
            console.error(`FAIL ${item.name}: ${message}`);
        } finally {
            completed++;
            if (completed % SAVE_EVERY === 0) await scheduleSave();
            renderProgress();
        }
    }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await scheduleSave();

process.stdout.write("\n");
console.log(
    `Done in ${formatDuration(Date.now() - startedAt)}. ${succeeded} succeeded, ${failed} failed. ` +
        `${inputTokens} input tokens (${Math.round(inputTokens / Math.max(succeeded, 1))} per item).`,
);
