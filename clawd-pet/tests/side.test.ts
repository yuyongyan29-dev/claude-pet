import { expect, test } from 'claude-code/testing'
import type { Register } from 'claude-code'

const BAND = {
  plugin: 'clawd-pet',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

// token-weather as far as Clawd cares: a line it publishes after each turn. The inline plugin
// runs in an environment of its own, so its data lives inside register.
const weather: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const full = [
      { color: '#77c3ab', children: '☀ ' },
      { bold: true, color: '#77c3ab', children: 'Clear' },
      { dimColor: true, children: ' · 19% · 186k/1M · ▂▂▂ +34.4k' },
    ]
    await ($.state.set as any)({ plugin: 'token-weather', key: 'line' }, { full, compact: full.slice(0, 2) })
    return r
  })
}

// The leftmost column Clawd's cells take in a Raster's `cells` (base64 of [char, fg, bg] u32s)
function leftmostCell(raster: { props: Record<string, unknown> }): number {
  const columns = Number(raster.props.columns)
  const bytes = Uint8Array.from(atob(String(raster.props.cells)), c => c.charCodeAt(0))
  const cells = new Uint32Array(bytes.buffer)
  let left = Infinity
  for (let i = 0; i < cells.length / 3; i++) if (cells[i * 3] !== 0x20) left = Math.min(left, i % columns)
  return left
}

test('the forecast and Clawd\'s caption share one line; Clawd strolls from its end to the band\'s', { plugins: [{ name: 'token-weather', register: weather }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)

  for (const columns of [120, 160]) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: columns } })
    // one Text holds both: the readout, then Clawd's name, level and what it is doing
    const line = await ui.find({ type: 'Text', text: /Clear · 19% · 186k\/1M · ▂▂▂ \+34\.4k │ \S+ Lv\.\d+ \w+ · / })
    expect(line).toBeDefined()
    // the band is as wide as the terminal; Clawd's range starts just past the line's end
    // blocks draw a Raster as wide as the band; a picture is an Image in a Box placed at its left
    const raster = (await ui.findAll({ type: 'Raster' }))[0]
    const picture = (await ui.findAll({ type: 'Box' })).find(b => b.props.position === 'absolute' && (b.children as { type?: string }[] | undefined)?.[0]?.type === 'Image')
    if (raster) expect(raster.props.columns).toBe(columns)
    const left = raster ? leftmostCell(raster) : Number(picture?.props.left)
    expect(Number.isFinite(left)).toBe(true) // Clawd is drawn
    expect(left).toBeGreaterThanOrEqual(1 + line!.text!.length + 2)
    await ui.unmount()
  }

  // narrow: the compact forecast and the caption still share the one line
  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 50 } })
  expect(await narrow.find({ type: 'Text', text: /Clear │ \S+ Lv\.\d+/ })).toBeDefined()
  await narrow.unmount()
})

test('on the desktop the forecast rides on Clawd\'s line too', { plugins: [{ name: 'token-weather', register: weather }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 160 } })
  expect(await ui.find({ type: 'Text', text: /Clear · 19%/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Lv\.\d+/ })).toBeDefined()
  await ui.unmount()
})

// token-weather as it ships: the article's long line, which a ~105-column terminal cannot fit beside Clawd
const articleWeather: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const full = [
      { color: 'yellow', bold: true, children: '☀  Clear' },
      { children: '  19% of context' },
      { dimColor: true, children: '  186.3k / 1M' },
      { dimColor: true, children: '   last turns ' },
      { color: 'yellow', children: '▁▂▃▆' },
      { dimColor: true, children: '  ▲ +34.4k last turn' },
    ]
    await ($.state.set as any)({ plugin: 'token-weather', key: 'line' }, { full, compact: full.slice(0, 3) })
    return r
  })
}

test('the forecast never goes missing while Clawd hosts it, at any width', { plugins: [{ name: 'token-weather', register: articleWeather }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)
  for (const columns of [60, 90, 105, 120, 160, 200]) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: columns } })
    expect(await ui.find({ type: 'Text', text: /Clear  19% of context/ })).toBeDefined()
    await ui.unmount()
  }
})

// hud-pane as far as Clawd cares: two rows of Text runs it publishes after each turn
const hud: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const rows = [
      [{ dimColor: true, children: '🇺🇸 LOS ANGELES | ☀️ 33°C | 13:45 | ' }, { color: 'cyan', children: '[Opus 5.5 ○ low]' }],
      [{ color: 'yellow', children: 'demo' }, { color: 'magenta', children: ' git:(main)' }],
    ]
    await ($.state.set as any)({ plugin: 'hud-pane', key: 'rows' }, rows)
    return r
  })
}

test('hud-pane\'s two rows are one line just above the readout, laid over the band', { plugins: [{ name: 'token-weather', register: weather }, { name: 'hud-pane', register: hud }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 160 } })
  expect(await ui.find({ type: 'Text', text: /LOS ANGELES \| ☀️ 33°C.* · demo git:\(main\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Clear · 19%.*│ \S+ Lv\.\d+/ })).toBeDefined()
  await ui.unmount()
})

test('squeezed by a notice above, the text block stays', { plugins: [{ name: 'token-weather', register: weather }, { name: 'hud-pane', register: hud }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 160, maxRows: 4 } })
  expect(await ui.find({ type: 'Text', text: /demo git:\(main\)/ })).toBeDefined()
  await ui.unmount()
})

test('on the desktop hud-pane\'s rows sit just above Clawd\'s line, inside the card', { plugins: [{ name: 'token-weather', register: weather }, { name: 'hud-pane', register: hud }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 160 } })
  expect(await ui.find({ type: 'Text', text: /LOS ANGELES \| ☀️ 33°C/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /demo git:\(main\)/ })).toBeDefined()
  // in the flow, not laid over: the card clips whatever spills past its edge
  const hudText = await ui.find({ type: 'Text', text: /demo git:\(main\)/ })
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes.some(b => b.props.position === 'absolute' && (b.props.top as number) < 0)).toBe(false)
  expect(hudText).toBeDefined()
  await ui.unmount()
})

test('Clawd strolls right of hud-pane\'s rows, never under them', { plugins: [{ name: 'token-weather', register: weather }, { name: 'hud-pane', register: hud }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 160 } })
  const widest = '🇺🇸 LOS ANGELES | ☀️ 33°C | 13:45 | [Opus 5.5 ○ low]'.length
  const raster = (await ui.findAll({ type: 'Raster' }))[0]
  const picture = (await ui.findAll({ type: 'Box' })).find(b => b.props.position === 'absolute' && (b.children as { type?: string }[] | undefined)?.[0]?.type === 'Image')
  const left = raster ? leftmostCell(raster) : Number(picture?.props.left)
  expect(Number.isFinite(left)).toBe(true)
  expect(left).toBeGreaterThanOrEqual(1 + widest)
  await ui.unmount()
})

test('on the desktop hud-pane\'s two rows are one line of session info: the card is two lines, not three', { plugins: [{ name: 'token-weather', register: weather }, { name: 'hud-pane', register: hud }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 160 } })
  expect(await ui.find({ type: 'Text', text: /\[Opus 5\.5 ○ low\] · demo git:\(main\)/ })).toBeDefined()
  await ui.unmount()
})

test('on the desktop Clawd stands on its lane and rises above it, never spilling below (the card would scroll)', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 160 } })
  const frame = (await ui.findAll({ type: 'Box' })).find(b => b.props.position === 'absolute' && b.children?.some((c: any) => c.type === 'Svg'))
  expect(frame?.props.alignItems).toBe('flex-end')
  const svg = String((frame?.children as any[]).find((c: any) => c.type === 'Svg')?.props.source)
  expect(svg).toMatch(/viewBox="0 -8 48 48"/) // the frame ends at the feet (row 39)
  await ui.unmount()
})

// image-view as far as Clawd cares: the pasted images it publishes while the draft holds their tags
const imageView: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await ($.state.set as any)({ plugin: 'image-view', key: 'images' }, [{ n: 1, path: '/tmp/1.png', size: { width: 10, height: 10 } }])
    return r
  })
}

test('while image-view shows thumbnails Clawd steps out of the band; its caption stays', { plugins: [{ name: 'image-view', register: imageView }] }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  await $.turn.complete({ answer: 'done' } as never)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 160 } })
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Lv\.\d+/ })).toBeDefined()
  await ui.unmount()
})
