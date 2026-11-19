import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/appearance.js', import.meta.url), 'utf8');
function openAppearance({ saved = null, blocked = false } = {}) {
    const window = new EventTarget();
    const root = { dataset: {}, style: {} };
    const storage = new Map(saved === null ? [] : [['rare.appearance', saved]]);
    let browserColor;
    vm.runInNewContext(source, {
        window, Event, document: { documentElement: root, querySelector: () => ({ setAttribute: (_, color) => { browserColor = color; } }) },
        localStorage: {
            getItem: (key) => { if (blocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
            setItem: (key, value) => { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); },
        },
    });
    return { root, storage, color: () => browserColor,
        send: (type, properties) => window.dispatchEvent(Object.assign(new Event(type), properties)) };
}

test('first paint uses light mode unless dark mode was saved', () => {
    const app = openAppearance();
    assert.equal(app.root.dataset.appearance, 'light');
    assert.equal(app.root.dataset.theme, 'light');
    assert.equal(app.color(), '#f8f9fc');
    const dark = openAppearance({ saved: 'dark' });
    assert.equal(dark.root.dataset.theme, 'dark');
    assert.equal(dark.root.style.colorScheme, 'dark');
    assert.equal(dark.color(), '#111720');
});
test('changing appearance saves the choice and updates the browser chrome', () => {
    const app = openAppearance();
    app.send('rare:appearance-change', { detail: 'dark' });
    assert.equal(app.storage.get('rare.appearance'), 'dark');
    assert.equal(app.root.dataset.theme, 'dark');
    assert.equal(app.color(), '#111720');
    app.send('rare:appearance-change', { detail: 'light' });
    assert.equal(app.root.dataset.theme, 'light');
    assert.equal(app.storage.get('rare.appearance'), 'light');
});
test('cross-tab changes and clearing storage update the active theme', () => {
    const app = openAppearance({ saved: 'dark' });
    app.send('storage', { key: 'unrelated', newValue: 'light' });
    assert.equal(app.root.dataset.theme, 'dark');
    app.send('storage', { key: 'rare.appearance', newValue: 'light' });
    assert.equal(app.root.dataset.theme, 'light');
    app.send('storage', { key: null, newValue: null });
    assert.equal(app.root.dataset.appearance, 'light');
});
test('legacy System preferences and unavailable storage keep the toggle usable', () => {
    assert.equal(openAppearance({ saved: 'system' }).root.dataset.theme, 'light');
    const app = openAppearance({ blocked: true });
    app.send('rare:appearance-change', { detail: 'dark' });
    assert.equal(app.root.dataset.theme, 'dark');
    app.send('rare:appearance-change', { detail: 'invalid' });
    assert.equal(app.root.dataset.appearance, 'light');
});
