import { expect, test } from 'claude-code/testing'

type Engine = import('claude-code/testing').Engine

const BAND = {
  plugin: 'claude-pet',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const engine = (on: Parameters<Parameters<typeof test>[1] & ((...a: any[]) => any)>[1]) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('prompt.submit', async () => ({ text: 'hi' }) as never)
  on('tool.call', async () => ({ result: 'ok', text: 'ok' }) as never)
  on('ui.message', async () => ({}) as never)
}

const caption = async ($: Engine) => {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Text', text: /Lv\./ })
  await ui.unmount()
  return found?.text ?? ''
}

test('the caption says what Claude is doing', async ($, on) => {
  engine(on)
  await $.prompt.submit({ text: 'hi' } as never)
  await $.tool.call({ tool: 'Edit', input: { file_path: '/repo/src/register.tsx', old_string: 'a', new_string: 'b' } } as never)
  expect(await caption($)).toContain('editing register.tsx')
  await $.tool.call({ tool: 'Bash', input: { command: 'ls -la', description: 'List files' } } as never)
  expect(await caption($)).toContain('running List files')
})

test('a click on Clawd pats it; one beside it does nothing', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(BAND)
  // size 9, standing at column 4: the body covers columns 4-12
  await ui.pointer({ type: 'down', x: 70, y: 0, button: 'left' } as never)
  await ui.unmount()
  expect(await caption($)).not.toMatch(/hehe~/)
  const again = await $.ui.mount(BAND)
  await again.pointer({ type: 'down', x: 6, y: 0, button: 'left' } as never)
  await again.unmount()
  expect(await caption($)).toMatch(/hehe~/)
})
