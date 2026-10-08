// Adds Jev's product group (group-question.json: the 12 groups of product_types.json, with
// "annet" for other) to each product in data/enriched.json, as `jev_response`.
//
//   bun run label-group

import { rename } from "node:fs/promises";
import enriched from "../data/enriched.json";
import jev_question from "./group-question.json";

type Item = {
    category: string;
    name: string;
    brand: string;
    chain: string;
    jev_response?: unknown;
};

const API_URL = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 30_000;
const ITEMS_TO_RUN = 5000;
const CONCURRENCY = 4; // Rate limits are unpublished, so start low and raise it.
const MAX_RETRIES = 3;
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

async function queryJev(state: Record<string, string>): Promise<any> {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            state,
            model: "jev-latest",
            questions: {
                new_choice: {
                    type: "choice",
                    instructions: "Hvilken kategori tilhører dette produktet?",
                    criteria: jev_question.new_choice_1.criteria,
                },
            },
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
async function queryWithRetry(state: Record<string, string>): Promise<any> {
    for (let attempt = 0;; attempt++) {
        try {
            return await queryJev(state);
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

const queue = items
    .filter((item) => item.jev_response === undefined)
    .slice(0, ITEMS_TO_RUN);

const startedAt = Date.now();
const total = queue.length;
let next = 0;
let completed = 0;
let succeeded = 0;
let failed = 0;

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
        `ok ${succeeded} fail ${failed}`;

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
            const data = await queryWithRetry(state);
            const answer = data?.answers?.new_choice;

            if (answer === undefined) {
                throw new Error(
                    `response has no answers.new_choice: ${
                        JSON.stringify(data).slice(0, 200)
                    }`,
                );
            }

            item.jev_response = data;
            succeeded++;
        } catch (err) {
            failed++;
            const message = err instanceof Error ? err.message : String(err);
            // Clear the progress line, print the error, then redraw progress below it.
            process.stdout.write("\r\x1b[K");
            console.error(`FAIL ${item.name}: ${message}`);
        } finally {
            completed++;
            await scheduleSave();
            renderProgress();
        }
    }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await saveChain;

process.stdout.write("\n");
console.log(
    `Done in ${formatDuration(Date.now() - startedAt)}. ${succeeded} succeeded, ${failed} failed.`,
);