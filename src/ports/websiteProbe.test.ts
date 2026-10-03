import http from "http";
import type { AddressInfo } from "net";
import { describe, expect, it, vi } from "vitest";
import type { ListeningPort } from "./listListeningPorts";
import { isLocalDevServer, pageTitle, probeIsWebsite, probeWebsite, responseLooksLikeWebsite, selectWebsites } from "./websiteProbe";

function port(partial: Partial<ListeningPort> & Pick<ListeningPort, "port" | "pid">): ListeningPort {
    return {
        address: `127.0.0.1:${partial.port}`,
        processName: "node",
        label: "app",
        ...partial,
    };
}

describe("responseLooksLikeWebsite", () => {
    it("accepts an html document", () => {
        expect(responseLooksLikeWebsite(200, { "content-type": "text/html" }, "<!DOCTYPE html><title>Hi</title>")).toBe(true);
        expect(responseLooksLikeWebsite(200, {}, "\n<html lang=\"en\"></html>")).toBe(true);
    });

    it("rejects json, redirects, and html error text", () => {
        expect(responseLooksLikeWebsite(200, { "content-type": "application/json" }, "{\"ok\":true}")).toBe(false);
        expect(responseLooksLikeWebsite(200, { "content-type": "text/html" }, "")).toBe(false);
        expect(responseLooksLikeWebsite(200, { "content-type": "text/html; charset=UTF-8" }, "WebSockets request was expected")).toBe(false);
        expect(responseLooksLikeWebsite(302, { location: "/" }, "")).toBe(false);
        expect(responseLooksLikeWebsite(404, {}, "")).toBe(false);
    });
});

describe("pageTitle", () => {
    it("reads and decodes the document title", () => {
        expect(pageTitle("<!DOCTYPE html><title>Docs &amp; Notes</title>")).toBe("Docs & Notes");
        expect(pageTitle("<title>  Line\none  </title>")).toBe("Line one");
        expect(pageTitle("<p>no title</p>")).toBeUndefined();
    });
});

describe("selectWebsites", () => {
    it("probes each listener once and uses the page title", async () => {
        const probe = vi.fn(async (url: string) => ({
            website: url.endsWith(":5175"),
            title: url.endsWith(":5175") ? "Inline Markdown" : undefined,
        }));
        const cache = new Map<string, { website: boolean; title?: string }>();
        const listeners = [port({ port: 5175, pid: 1, label: "markdownInline" }), port({ port: 6463, pid: 2, label: "Discord" })];

        await expect(selectWebsites(listeners, cache, probe)).resolves.toEqual([
            { ...listeners[0], label: "Inline Markdown" },
        ]);
        await expect(selectWebsites(listeners, cache, probe)).resolves.toEqual([
            { ...listeners[0], label: "Inline Markdown" },
        ]);

        expect(probe).toHaveBeenCalledTimes(2);
    });

    it("drops a cached result when the listener is gone", async () => {
        const probe = vi.fn(async () => ({ website: true, title: "Docs" }));
        const cache = new Map<string, { website: boolean; title?: string }>();
        const site = port({ port: 5175, pid: 1 });

        await selectWebsites([site], cache, probe);
        await selectWebsites([], cache, probe);

        expect(cache.size).toBe(0);
        await selectWebsites([site], cache, probe);
        expect(probe).toHaveBeenCalledTimes(2);
    });
});

describe("selectWebsites", () => {
    it("skips browsers and editor utilities without probing them", async () => {
        const probe = vi.fn(async () => ({ website: true, title: "Should not show" }));
        const cache = new Map<string, { website: boolean; title?: string }>();
        const listeners = [
            port({ port: 33601, pid: 3, processName: "chrome", label: "dashboard" }),
            port({ port: 33039, pid: 4, processName: "agent-browser-l", label: "agent-browser" }),
            port({ port: 6011, pid: 5, processName: "code", label: "docs" }),
        ];

        await expect(selectWebsites(listeners, cache, probe)).resolves.toEqual([]);
        expect(probe).not.toHaveBeenCalled();
        expect(isLocalDevServer("MainThread")).toBe(true);
    });
});

describe("probeIsWebsite", () => {
    it("detects an html server and skips a json server", async () => {
        const html = await listen((response) => {
            response.writeHead(200, { "Content-Type": "text/html" });
            response.end("<!DOCTYPE html><p>ok</p>");
        });
        const json = await listen((response) => {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end("{\"ok\":true}");
        });

        await expect(probeIsWebsite(html.url, 1000)).resolves.toBe(true);
        await expect(probeWebsite(html.url, 1000)).resolves.toEqual({ website: true, title: undefined });
        await expect(probeIsWebsite(json.url, 1000)).resolves.toBe(false);

        await html.close();
        await json.close();
    });

    it("reads a title from the page", async () => {
        const html = await listen((response) => {
            response.writeHead(200, { "Content-Type": "text/html" });
            response.end("<!DOCTYPE html><title>Docs &amp; Notes</title>");
        });

        await expect(probeWebsite(html.url, 1000)).resolves.toEqual({ website: true, title: "Docs & Notes" });
        await html.close();
    });
});

function listen(handler: (response: http.ServerResponse) => void): Promise<{ url: string; close: () => Promise<void> }> {
    const server = http.createServer((_request, response) => handler(response));
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address() as AddressInfo;
            resolve({
                url: `http://127.0.0.1:${address.port}`,
                close: () =>
                    new Promise((done) => {
                        server.close(() => done());
                    }),
            });
        });
    });
}
