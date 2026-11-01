import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function mediaResolver(apiBase, origin = "http://192.168.1.5:5173") {
    const source = await readFile(new URL("../src/utils/mediaUrl.js", import.meta.url), "utf8");
    const module = new vm.SourceTextModule(source, {
        context: vm.createContext({ URL, location: { origin } }),
        initializeImportMeta: (meta) => { meta.env = { VITE_API_BASE_URL: apiBase }; },
    });
    await module.link(() => {});
    await module.evaluate();
    return module.namespace.getMediaUrl;
}

test("relative API configuration resolves project and category images on the phone origin", async () => {
    const resolve = await mediaResolver("/api/v1/");
    assert.equal(resolve("/media/projects/cover.jpg"), "http://192.168.1.5:5173/media/projects/cover.jpg");
    assert.equal(resolve("media/project_categories/cover.webp"), "http://192.168.1.5:5173/media/project_categories/cover.webp");
});

test("proxied Django loopback image URLs use the phone-accessible media proxy", async () => {
    const resolve = await mediaResolver("/api/v1/");
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
        assert.equal(resolve(`http://${host}:8000/media/projects/cover.jpg?v=2`), "http://192.168.1.5:5173/media/projects/cover.jpg?v=2");
    }
});

test("separate API origins and external image hosts are preserved", async () => {
    const resolve = await mediaResolver("https://api.example.com/api/v1/");
    assert.equal(resolve("/media/projects/cover.jpg"), "https://api.example.com/media/projects/cover.jpg");
    assert.equal(resolve("https://cdn.example.com/cover.jpg"), "https://cdn.example.com/cover.jpg");
    assert.equal(resolve("http://127.0.0.1:8000/media/cover.jpg"), "http://127.0.0.1:8000/media/cover.jpg");
    const proxyResolve = await mediaResolver("/api/v1/");
    assert.equal(proxyResolve("https://cdn.example.com/cover.jpg"), "https://cdn.example.com/cover.jpg");
});

test("missing images and non-HTTP schemes are rejected", async () => {
    const resolve = await mediaResolver("/api/v1/");
    for (const value of [null, undefined, "", 12, "javascript:alert(1)", "data:image/png;base64,abc", "ftp://example.com/cover.jpg"]) {
        assert.equal(resolve(value), null);
    }
});
