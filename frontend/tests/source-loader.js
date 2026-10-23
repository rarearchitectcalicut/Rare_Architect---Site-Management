import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as Router from "react-router-dom";
import * as icons from "lucide-react";
import axios from "axios";
import { transformWithOxc } from "vite";

export const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

export async function loadSource(entry, { overrides = {}, append = "" } = {}) {
    const entryPath = resolve(sourceRoot, entry);
    const context = vm.createContext({
        document: { body: { style: {} } }, URLSearchParams,
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    const packages = { react: React, "react/jsx-runtime": jsxRuntime, "react-dom": { createPortal: (children) => children }, "react-router-dom": Router, "lucide-react": icons, axios: { default: axios } };
    const cache = new Map();
    function synthetic(exports) {
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
    }
    async function load(filename) {
        if (cache.has(filename)) return cache.get(filename);
        const pending = (async () => {
            const relative = filename.startsWith(sourceRoot) ? filename.slice(sourceRoot.length).replaceAll("\\", "/") : filename;
            if (overrides[relative]) return synthetic(overrides[relative]);
            if (packages[filename]) return synthetic(packages[filename]);
            if (/\.(jpg|png)$/.test(filename)) return synthetic({ default: "test-image" });
            const source = await readFile(filename, "utf8");
            const { code } = await transformWithOxc(source + (filename === entryPath ? append : ""), filename, { jsx: { runtime: "automatic" } });
            const module = new vm.SourceTextModule(code, { context, initializeImportMeta: (meta) => { meta.env = { VITE_API_BASE_URL: "https://api.test/" }; } });
            await module.link(async (name) => {
                if (packages[name]) return load(name);
                const target = resolve(dirname(filename), name);
                if (extname(target)) return load(target);
                try { return await load(`${target}.js`); }
                catch (error) { if (error.code !== "ENOENT") throw error; return load(`${target}.jsx`); }
            });
            return module;
        })();
        cache.set(filename, pending);
        return pending;
    }
    const module = await load(entryPath);
    await module.evaluate();
    return { exports: module.namespace, load: async (path) => {
        const loaded = await load(resolve(sourceRoot, path));
        if (loaded.status !== "evaluated") await loaded.evaluate();
        return loaded.namespace;
    } };
}
