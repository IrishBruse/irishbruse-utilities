import http from "http";
import https from "https";
import type { ListeningPort } from "./listListeningPorts";
import { listeningHttpUrl } from "./listeningHttpUrl";

const PROBE_TIMEOUT_MS = 400;
const BODY_LIMIT = 16 * 1024;

type ProbeResult = "website" | "not-website" | "unreachable";

export type WebsiteHit = {
    website: boolean;
    title?: string;
};

type ProbeRead = {
    result: ProbeResult;
    headers: http.IncomingHttpHeaders;
    body: string;
};

export function responseLooksLikeWebsite(
    statusCode: number,
    headers: http.IncomingHttpHeaders,
    bodyStart: string
): boolean {
    if (statusCode < 200 || statusCode >= 300) {
        return false;
    }

    const contentType = headerValue(headers, "content-type").toLowerCase();
    if (contentType && !contentType.includes("text/html")) {
        return false;
    }

    const body = bodyStart.trimStart().slice(0, 300).toLowerCase();
    return body.startsWith("<!doctype html") || body.startsWith("<html");
}

const NON_DEV_SERVER = /^(chrome|chromium|code|discord|agent-browser|electron)/i;

export function isLocalDevServer(processName: string | undefined): boolean {
    if (!processName) {
        return true;
    }
    return !NON_DEV_SERVER.test(processName);
}

export function pageTitle(html: string): string | undefined {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!match) {
        return undefined;
    }
    const text = decodeHtml(match[1]).replace(/\s+/g, " ").trim();
    return text || undefined;
}

export function listenerKey(port: Pick<ListeningPort, "pid" | "port">): string {
    return `${port.pid}:${port.port}`;
}

export async function selectWebsites(
    ports: readonly ListeningPort[],
    cache: Map<string, WebsiteHit>,
    probe: (url: string) => Promise<WebsiteHit> = probeWebsite
): Promise<ListeningPort[]> {
    const live = new Set(ports.map((port) => listenerKey(port)));
    for (const key of cache.keys()) {
        if (!live.has(key)) {
            cache.delete(key);
        }
    }

    await Promise.all(
        ports.map(async (port) => {
            const key = listenerKey(port);
            if (cache.has(key)) {
                return;
            }
            if (!isLocalDevServer(port.processName)) {
                cache.set(key, { website: false });
                return;
            }
            const url = listeningHttpUrl(port.address, port.port);
            try {
                cache.set(key, await probe(url));
            } catch {
                cache.set(key, { website: false });
            }
        })
    );

    return ports.flatMap((port) => {
        const hit = cache.get(listenerKey(port));
        if (!hit?.website) {
            return [];
        }
        return [{ ...port, label: hit.title || port.label }];
    });
}

export async function probeIsWebsite(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
    return (await probeWebsite(url, timeoutMs)).website;
}

export async function probeWebsite(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<WebsiteHit> {
    const httpResult = await probeOnce(url, timeoutMs);
    if (httpResult.result === "website") {
        return { website: true, title: pageTitle(httpResult.body) };
    }
    if (httpResult.result === "not-website" || !url.startsWith("http://")) {
        return { website: false };
    }
    const httpsResult = await probeOnce(`https://${url.slice("http://".length)}`, timeoutMs);
    if (httpsResult.result !== "website") {
        return { website: false };
    }
    return { website: true, title: pageTitle(httpsResult.body) };
}

function headerValue(headers: http.IncomingHttpHeaders, name: string): string {
    const value = headers[name];
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    return value ?? "";
}

function decodeHtml(value: string): string {
    return value
        .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
        .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
        .replaceAll("&nbsp;", " ")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", "\"")
        .replaceAll("&#39;", "'")
        .replaceAll("&apos;", "'")
        .replaceAll("&amp;", "&");
}

function probeOnce(url: string, timeoutMs: number): Promise<ProbeRead> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result: ProbeResult, headers: http.IncomingHttpHeaders = {}, body = "") => {
            if (settled) {
                return;
            }
            settled = true;
            resolve({ result, headers, body });
        };

        const request = url.startsWith("https:")
            ? https.get(url, { rejectUnauthorized: false, headers: { Accept: "text/html", Connection: "close" } }, onResponse)
            : http.get(url, { headers: { Accept: "text/html", Connection: "close" } }, onResponse);

        request.setTimeout(timeoutMs, () => {
            request.destroy();
            finish("unreachable");
        });
        request.on("error", () => finish("unreachable"));

        function onResponse(response: http.IncomingMessage): void {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
                if (size >= BODY_LIMIT) {
                    return;
                }
                chunks.push(chunk);
                size += chunk.length;
                if (size >= BODY_LIMIT) {
                    response.destroy();
                }
            });
            const done = () => {
                const body = Buffer.concat(chunks).subarray(0, BODY_LIMIT).toString("utf8");
                finish(
                    responseLooksLikeWebsite(response.statusCode ?? 0, response.headers, body)
                        ? "website"
                        : "not-website",
                    response.headers,
                    body
                );
            };
            response.on("end", done);
            response.on("error", done);
            response.on("close", done);
        }
    });
}
