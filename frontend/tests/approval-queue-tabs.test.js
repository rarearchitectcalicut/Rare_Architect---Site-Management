import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './source-loader.js';
const { exports } = await loadSource('components/approvals/ApprovalQueueTabs.jsx');
const queues = Object.fromEntries(['tasks','changes','timeline','delays','work','history'].map(key => [key, [{ id: key }]]));
const buttons = props => exports.default({ queues, tab: 'tasks', onChange() {}, ...props }).props.children.props.children;

test('compact Approval Center tabs retain all six destinations and full accessible names', () => {
 const selected = [], navButtons = buttons({ onChange: id => selected.push(id) });
 assert.deepEqual(Array.from(navButtons, b => b.key), Object.keys(queues));
 for (const button of navButtons) { assert.ok(button.props['aria-label']); button.props.onClick(); }
 assert.deepEqual(selected, Object.keys(queues));
 assert.equal(navButtons.filter(b => b.props['aria-pressed']).length, 1);
});
test('approval navigation preserves server delay totals and unavailable values', () => {
 for (const count of [0, 25, null]) {
  const delay = buttons({ counts: { delays: count } }).find(b => b.key === 'delays');
  const badge = delay.props.children.at(-1);
  assert.equal(badge.props.children, count ?? 'Unavailable');
 }
});
test('approval navigation keeps loading counts distinct from an empty queue and omits a history badge', () => {
 const navButtons = buttons({ loading: true });
 for (const button of navButtons.filter(b => b.key !== 'history')) assert.equal(button.props.children.at(-1).props.children, '...');
 assert.equal(navButtons.find(b => b.key === 'history').props.children.at(-1), false);
});
