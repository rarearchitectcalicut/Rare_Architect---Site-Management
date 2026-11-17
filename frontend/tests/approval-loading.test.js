import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSource } from './source-loader.js';

for (const scenario of [
    { name: 'initial queue loading', tab: 'tasks', loading: true, listLoading: false, show: true },
    { name: 'refresh while history is already loaded', tab: 'history', loading: true, listLoading: false, show: true },
    { name: 'history page or filter request', tab: 'history', loading: false, listLoading: true, show: true },
    { name: 'delay page or filter request', tab: 'delays', loading: false, listLoading: true, show: true },
    { name: 'completed queues', tab: 'tasks', loading: false, listLoading: false, show: false },
    { name: 'queue failure', tab: 'tasks', loading: false, listLoading: false, show: false, error: true },
    { name: 'server list failure', tab: 'history', loading: false, listLoading: false, show: false, error: true },
]) {
    test(`Approval Center shared loading screen: ${scenario.name}`, async () => {
        const queues = Object.fromEntries(['tasks','changes','timeline','delays','work','history'].map(key => [key, []]));
        const { exports } = await loadSource('pages/admin/Approvals.jsx', { overrides: {
            'hooks/useApprovalQueues.js': { useApprovalQueues: () => ({ queues, projects: [], errors: scenario.error ? { tasks: 'Queue unavailable' } : {}, loading: scenario.loading, refresh() {}, revision: 0 }) },
            'hooks/useRequestList.js': { useRequestList: () => ({ rows: [], pageRows: [], filters: {}, count: 0, loading: scenario.listLoading, error: scenario.error ? 'List unavailable' : '', page: 1, pageCount: 1, updateFilter() {}, clear() {}, setPage() {} }) },
            'components/LoadingScreen.jsx': { default: ({ message }) => React.createElement('p', { 'data-shared-loader': true }, message) },
        } });
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [`/admin/approvals?tab=${scenario.tab}`] }, React.createElement(exports.default)));
        assert.equal(html.includes('data-shared-loader="true"'), scenario.show);
        if (scenario.show) assert.ok(html.includes('Loading Approval Center...'));
        if (scenario.error) assert.ok(html.includes(scenario.tab === 'history' ? 'List unavailable' : 'Queue unavailable'));
    });
}
