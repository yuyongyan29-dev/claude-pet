import { expect, test } from 'claude-code/testing'

type Engine = import('claude-code/testing').Engine

const BAND = {
  plugin: 'claude-pet',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

/** The band's height, and how far up the picture's box reaches (rows + hop), if Clawd is a picture. */
const measure = async ($: Engine) => {
  const ui = await $.ui.mount(BAND)
  const boxes = await ui.findAll({ type: 'Box' })
  const band = boxes.find(b => b.props.width === 80 && typeof b.props.height === 'number')
  const image = await ui.find({ type: 'Image' })
  const holder = boxes.find(b => b.props.position === 'absolute' && typeof b.props.bottom === 'number' && b.children.some(c => (c as { type?: string }).type === 'Image'))
  await ui.unmount()
  const reach = image ? (image.props.rows as number) + ((holder?.props.bottom as number) ?? 0) : 0
  return { height: band?.props.height as number, reach }
}

test('the band keeps one height while Clawd strolls and works, and the picture stays inside it', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('prompt.submit', async () => ({ text: 'hi' }) as never)
  const resting = await measure($)
  expect(resting.height).toBeGreaterThan(0)
  expect(resting.reach).toBeLessThanOrEqual(resting.height)
  await $.prompt.submit({ text: 'hi' } as never)
  const working = await measure($)
  expect(working.reach).toBeLessThanOrEqual(working.height)
  await $.turn.complete({ answer: 'done' } as never)
  const after = await measure($)
  // a picture's band never changes; blocks may grow for a tall clip but never snap back mid-turn
  expect(after.height).toBeGreaterThanOrEqual(resting.height)
  expect(after.reach).toBeLessThanOrEqual(after.height)
})
