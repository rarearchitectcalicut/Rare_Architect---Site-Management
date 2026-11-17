import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFile } from "node:fs/promises";
import { loadSource } from "./source-loader.js";

test("category cards preserve the real category link and description without invented metrics", async () => {
  const { exports } = await loadSource("components/dashboard/ProjectCategories.jsx", { append: "\nexport { CategoryCard };" });
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(exports.CategoryCard, { category: { id: "real-category-id", name: "Residential", description: "Real description" } })));
  assert.ok(html.includes('href="/admin/categories/real-category-id"'));
  assert.ok(html.includes('aria-label="View projects in Residential"'));
  assert.ok(html.includes("Real description"));
  assert.ok(html.includes("rare-category-cover"));
  assert.ok(!html.includes("No cover image"));
  assert.ok(!html.includes("0 projects"));
});

test("Admin category section precedes approval center in reading order", async () => {
  const source = await readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8');
  assert.ok(source.indexOf('<ProjectCategories />') < source.indexOf('className="admin-dashboard-approvals '));
  assert.equal((source.match(/<ProjectCategories \/>/g) || []).length, 1);
});
