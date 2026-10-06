import { expect, test } from 'claude-code/testing'
import { terminalRows } from '../hooks/layout'

test('chained row estimates include multiline wide text, spacing and controls', () => {
  const text = { type: 'Text', props: {}, children: ['中文中文\nnext'] }
  expect(terminalRows(text, 4)).toBe(3)
  expect(terminalRows({ ...text, props: { wrap: 'truncate' } }, 4)).toBe(2)
  const tree = { type: 'Box', props: { flexDirection: 'column', padding: 1, paddingY: 0, margin: 1, gap: 1 }, children: [text, { type: 'Button', props: { label: 'Other mod' } }] }
  expect(terminalRows(tree, 6)).toBe(7)
  expect(terminalRows({ type: 'Box', props: { position: 'absolute', height: 10 } }, 6)).toBe(0)
})
