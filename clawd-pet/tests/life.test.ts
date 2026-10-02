import { expect, mock, test } from 'claude-code/testing'
import type { Register } from 'claude-code'

type Engine = import('claude-code/testing').Engine
type On = Parameters<Parameters<typeof test>[1] & ((...a: any[]) => any)>[1]

const props = (bodyColumns: number, isWorking = false) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 20,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})
const band = (bodyColumns: number, surface: 'terminal' | 'desktop' = 'terminal', isWorking = false) =>
  ({ plugin: 'clawd-pet', surface, component: 'AbovePrompt', props: props(bodyColumns, isWorking) }) as const

type Blit = { source?: { file?: string }; cells?: string }

/**
 * The world beneath Clawd on a mock clock: a store, the frames on disk, a terminal that takes
 * pictures (or refuses them as `refuse` says), the hour `date` answers. Returns what was blitted.
 */
function world(on: On, opts: { refuse?: (n: number) => string | undefined; hour?: string; tokens?: number } = {}) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const saved = { food: 80, love: 60, xp: 0, hidden: false, savedAt: 1_700_000_000_000, size: 9, name: 'Clawd', merged: true }
  mock.store(on, opts.tokens === undefined ? undefined : { pet: saved })
  // the level is lifetime tokens: stats-cache.json counts them, one level per 一亿
  const stats = { lastComputedDate: '2023-11-13', dailyModelTokens: [{ date: '2023-11-13', tokensByModel: { 'claude-opus-5': opts.tokens ?? 0 } }] }
  on('env.get', async (_$: any, e: any) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }) as never)
  on('fs.read', async (_$: any, e: any) => ({ value: JSON.stringify(stats), path: e.path }) as never)
  // no shared save yet: the pet comes from the plugin's store, and saves go nowhere
  on('fs.exists', async (_$: any, e: any) => ({ value: !String(e.path).endsWith('clawd-pet.json') }) as never)
  on('fs.write', async () => ({ value: undefined }) as never)
  const blits: Blit[] = []
  const toasts: string[] = []
  on('ui.toast', async (_$: any, e: any) => {
    toasts.push(typeof e === 'string' ? e : JSON.stringify(e))
    return { value: undefined } as never
  })
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('command.register', async () => ({ value: { command: 'pet' } }) as never)
  on('process.run', async () => ({ value: { exitCode: 0, stdout: `${opts.hour ?? '14'}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never)
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('ui.blit', async (_$: any, e: any) => {
    blits.push(e)
    const deny = opts.refuse?.(blits.length)
    return (deny ? { deny } : { value: {} }) as never
  })
  on('ui.log', async () => ({ value: undefined }) as never)
  on('prompt.submit', async () => ({ text: 'hi' }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('tool.call', async () => ({ result: 'ok', text: 'ok' }) as never)
  on('classic.Notification', async () => ({}) as never)
  return { clock, blits, toasts }
}

const boot = ($: Engine) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as never)
const pet = ($: Engine, args: string) => $.command.run({ command: 'pet', args } as never)
const spriteOf = (b: Blit) => b.source?.file?.match(/frames\/([^/]+)\//)?.[1]
const caption = async (ui: { find: (q: object) => Promise<{ text?: string } | undefined> }) =>
  (await ui.find({ type: 'Text', text: /Lv\.\d+ \w+ · / }))?.text ?? ''
/** The left edge of Clawd's picture box on the terminal. */
const pictureLeft = async (ui: { findAll: (q: object) => Promise<any[]> }) => {
  const box = (await ui.findAll({ type: 'Box' })).find(b => b.props.position === 'absolute' && b.children?.[0]?.type === 'Image')
  return Number(box?.props.left)
}

test('idle, Clawd keeps changing what it does', async ($, on) => {
  const { clock, blits } = world(on)
  await boot($)
  const ui = await $.ui.mount(band(160))
  await clock.advance(4 * 60_000)
  const seen = new Set(blits.map(spriteOf).filter(Boolean))
  expect(seen.size).toBeGreaterThanOrEqual(6)
  await ui.unmount()
})

test('the range follows the width, and a walk cut short by a resize does not get stuck', async ($, on) => {
  const { clock, blits } = world(on)
  await boot($)
  let ui = await $.ui.mount(band(160))
  await pet($, 'run') // a dash to the far side
  await clock.advance(400)
  await pet($, 'run')
  await clock.advance(400)
  await ui.unmount()
  // the terminal narrows mid-dash
  ui = await $.ui.mount(band(90))
  const from = blits.length
  await clock.advance(30_000)
  expect(await pictureLeft(ui)).toBeLessThanOrEqual(90 - 18)
  // past the dash: Clawd went on to other things
  const after = blits.slice(from).map(spriteOf)
  expect(after.some(s => s && s !== 'Running' && s !== 'Walking' && s !== 'CrabWalking')).toBe(true)
  await ui.unmount()
})

test('on the desktop Clawd strolls a lane after the text: at most 40 cells, less when the window is narrow', async ($, on) => {
  const { clock } = world(on)
  await boot($)
  // Clawd's spot: the left of the absolute Box it floats in, inside its lane
  const spot = async (cols: number) => {
    const ui = await $.ui.mount(band(cols, 'desktop'))
    await pet($, 'run') // a lap of the lane: out to its far end and back
    let left = 0
    let fixed = 0
    for (let i = 0; i < 40; i++) {
      await clock.advance(500)
      const boxes = await ui.findAll({ type: 'Box' })
      left = Math.max(left, Number(boxes.find(b => b.props.position === 'absolute')?.props.left ?? 0))
      fixed = boxes.filter(b => b.props.flexShrink === 0).length // the text never gives way
    }
    await ui.unmount()
    return { left, fixed }
  }
  const wide = await spot(220)
  // narrow enough that the window, not DESKTOP_RANGE, ends the lane (at 90 a short caption still leaves 40)
  const narrow = await spot(60)
  expect(wide.left).toBeGreaterThan(20)
  expect(wide.left).toBeLessThanOrEqual(40)
  expect(narrow.left).toBeLessThan(wide.left)
  expect(wide.fixed).toBeGreaterThanOrEqual(1)
})

test('a terminal not asked about pictures yet never gets blocks', async ($, on) => {
  const { clock, blits } = world(on, { refuse: n => (n <= 3 ? 'the Image draws its alt here: the terminal draws no placeholder images (env: terminal=ghostty, not asked yet)' : undefined) })
  await boot($)
  const ui = await $.ui.mount(band(120))
  let rasters = 0
  for (let i = 0; i < 20; i++) {
    await clock.advance(1000)
    rasters += (await ui.findAll({ type: 'Raster' })).length
  }
  expect(rasters).toBe(0)
  expect(blits.length).toBeGreaterThan(3) // pictures went on past the refusals
  await ui.unmount()
})

test('a terminal without pictures gets blocks, and pictures are tried again later', async ($, on) => {
  const { clock, blits } = world(on, { refuse: () => 'the Image draws its alt here: the terminal draws no placeholder images' })
  await boot($)
  const ui = await $.ui.mount(band(120))
  let blocks = false
  for (let i = 0; i < 30 && !blocks; i++) {
    await clock.advance(1_000)
    blocks = (await ui.findAll({ type: 'Raster' })).length === 1
  }
  expect(blocks).toBe(true)
  const pictures = () => blits.filter(b => b.source).length
  const before = pictures()
  await clock.advance(65_000)
  expect(pictures()).toBeGreaterThan(before)
  await ui.unmount()
})

test('pictures that keep failing at start come back by themselves, no /pet hd needed', async ($, on) => {
  // the terminal refuses pictures for ten minutes (past the quick retries), then takes them
  let refusing = true
  const { clock } = world(on, { refuse: () => (refusing ? 'the Image draws its alt here: the terminal draws no placeholder images' : undefined) })
  await boot($)
  const ui = await $.ui.mount(band(120))
  for (let i = 0; i < 20; i++) await clock.advance(30_000)
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(1) // blocks meanwhile
  refusing = false
  for (let i = 0; i < 24; i++) await clock.advance(30_000)
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(0) // a picture again
  await ui.unmount()
})

test('a resumed session whose terminal was only just asked stays a picture, never blocks', async ($, on) => {
  const { clock } = world(on, { refuse: n => (n <= 3 ? 'the terminal has not yet said whether it reads files on this machine; asked now, blit again' : undefined) })
  await boot($)
  const ui = await $.ui.mount(band(120))
  let rasters = 0
  for (let i = 0; i < 20; i++) {
    await clock.advance(500)
    rasters += (await ui.findAll({ type: 'Raster' })).length
  }
  expect(rasters).toBe(0)
  await ui.unmount()
})

// the other mods, as far as Clawd follows them: their state writes
// the other mods as far as Clawd follows them: each writes its own value, named where it writes
const tokenWeather: Register = on => {
  on('command.run', { command: 'fake-tw' }, async ($, e: any) => {
    await ($.state.set as any)({ plugin: 'token-weather', key: 'readings' }, JSON.parse(e.args))
    return { text: 'ok' }
  })
}
const blastRadius: Register = on => {
  on('command.run', { command: 'fake-blast' }, async ($, e: any) => {
    await ($.state.set as any)({ plugin: 'blast-radius', key: 'held' }, JSON.parse(e.args))
    return { text: 'ok' }
  })
}
const replayTheater: Register = on => {
  on('command.run', { command: 'fake-replay' }, async ($, e: any) => {
    await ($.state.set as any)({ plugin: 'replay-theater', key: 'state' }, JSON.parse(e.args))
    return { text: 'ok' }
  })
}
const write = ($: Engine, command: string, value: unknown) =>
  $.command.run({ command, args: JSON.stringify(value) } as never)
const fakes = [
  { name: 'token-weather', register: tokenWeather },
  { name: 'blast-radius', register: blastRadius },
  { name: 'replay-theater', register: replayTheater },
]

test('Clawd follows the other mods', { plugins: fakes }, async ($, on) => {
  const { clock } = world(on)
  await boot($)
  const ui = await $.ui.mount(band(160))

  await write($, 'fake-tw', [{ tokens: 950_000, window: 1_000_000, percent: 95 }])
  await clock.advance(300)
  expect(await caption(ui)).toMatch(/compact/)

  await write($, 'fake-blast', { command: 'rm -rf build', decision: null })
  await clock.advance(300)
  expect(await caption(ui)).toMatch(/careful|check that command/)
  await write($, 'fake-blast', null)
  await clock.advance(5_000)
  expect(await caption(ui)).not.toMatch(/check that command/)

  await write($, 'fake-tw', [{ tokens: 100_000, window: 1_000_000, percent: 10 }])
  await write($, 'fake-replay', { isOpen: true, index: 0 })
  await clock.advance(300)
  expect(await caption(ui)).toMatch(/replay/)
  await ui.unmount()
})

test('Clawd waves when Claude waits on a permission prompt', async ($, on) => {
  const { clock } = world(on)
  await boot($)
  const ui = await $.ui.mount(band(160, 'terminal', true))
  await ($ as any).classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await clock.advance(300)
  expect(await caption(ui)).toMatch(/need your OK|waiting for you/)
  await $.tool.call({ tool: 'Bash', input: { command: 'ls' } } as never)
  await clock.advance(4_000)
  expect(await caption(ui)).not.toMatch(/waiting for you/)
  await ui.unmount()
})

test('a long turn shows how long it has run', async ($, on) => {
  const { clock } = world(on)
  await boot($)
  await $.prompt.submit({ text: 'hi' } as never)
  const ui = await $.ui.mount(band(160, 'terminal', true))
  await clock.advance(150_000)
  expect(await caption(ui)).toMatch(/· 2m/)
  await ui.unmount()
})

test('late at night Clawd nods off sooner', async ($, on) => {
  const { clock } = world(on, { hour: '02' })
  await boot($)
  const ui = await $.ui.mount(band(160))
  await clock.advance(60_000)
  expect(await caption(ui)).toMatch(/late/)
  await ui.unmount()
})

// the sprites of the moves Clawd knows from Lv.1: standing, looking, turning, pointing, waving, hops, walks
const LV1 = new Set(['Swaying', 'LookingAround', 'LookingAroundEyesOnly', 'Turning', 'Pointing', 'Waving', 'JumpingHappy', 'Walking'])
const BIG = new Set(['DancingHappy', 'BreakDancing', 'Hula', 'Jumping', 'Confetti', 'Spark'])

test('at Lv.1 Clawd only does what it has learned', async ($, on) => {
  const { clock, blits } = world(on, { tokens: 0 })
  await boot($)
  const ui = await $.ui.mount(band(160))
  await clock.advance(150_000)
  const seen = new Set(blits.map(spriteOf).filter(Boolean) as string[])
  expect([...seen].filter(s => !LV1.has(s))).toEqual([])
  expect(seen.size).toBeGreaterThanOrEqual(3)
  await ui.unmount()
})

test('at Lv.10 the big moves come up', async ($, on) => {
  const { clock, blits } = world(on, { tokens: 1_000_000_000 })
  await boot($)
  const ui = await $.ui.mount(band(160))
  // three stretches of idling, each woken first so Clawd does not doze off
  for (let i = 0; i < 3; i++) {
    await pet($, 'stats')
    await clock.advance(150_000)
  }
  const big = blits.map(spriteOf).filter(s => s && BIG.has(s))
  expect(new Set(big).size).toBeGreaterThanOrEqual(2)
  await ui.unmount()
})

test('a trick waits for its level, and stats say what comes next', async ($, on) => {
  world(on, { tokens: 520_000_000 })
  await boot($)
  const locked = await pet($, 'spark')
  expect(locked.text).toContain('learns spark at Lv.8')
  const open = await pet($, 'breakdance')
  expect(open.text).toContain('check out my moves')
  const stats = (await pet($, 'stats')).text ?? ''
  expect(stats).toContain('Lv.5 Dancer (5.2亿 tokens · Lv.6 at 6亿)')
  expect(stats).toContain('Lv.6 brings spinning till dizzy, confetti')
})

test('a level up says what Clawd learned', async ($, on) => {
  const { toasts } = world(on, { tokens: 599_000_000 })
  await boot($)
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', usage: { model: 'claude-opus-5', input_tokens: 10, output_tokens: 990, cache_read_input_tokens: 1_500_000, cache_creation_input_tokens: 0 } } as never)
  expect(toasts.join(' ')).toContain('reached Lv.6! Learned spinning till dizzy, confetti.')
})

test('the title rides beside the name, all the time', async ($, on) => {
  const { clock } = world(on, { tokens: 520_000_000 })
  await boot($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(160, surface))
    await clock.advance(300)
    expect(await caption(ui)).toMatch(/^Clawd Lv\.5 Dancer · /)
    await ui.unmount()
  }
})

test('at work Clawd stays lively: many moves across a busy turn', async ($, on) => {
  const { clock, blits } = world(on, { tokens: 520_000_000 })
  await boot($)
  await $.prompt.submit({ text: 'hi' } as never)
  const ui = await $.ui.mount(band(160, 'terminal', true))
  const calls = [
    { tool: 'Read', input: { file_path: '/repo/a.ts' } },
    { tool: 'Edit', input: { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' } },
    { tool: 'Bash', input: { command: 'npm run build', description: 'Build' } },
    { tool: 'Grep', input: { pattern: 'foo' } },
  ]
  for (let i = 0; i < 24; i++) {
    await $.tool.call(calls[i % calls.length] as never)
    await clock.advance(5_000)
  }
  const seen = new Set(blits.map(spriteOf).filter(Boolean))
  // two minutes of a busy turn: before this, about 8 moves, a change every 7 s, 9 tenths at the desk
  const seq = blits.map(spriteOf).filter(Boolean) as string[]
  const switches = seq.filter((s, i) => i > 0 && s !== seq[i - 1]).length
  const desk = seq.filter(s => s === 'Laptop' || s === 'Desktop').length / Math.max(1, seq.length)
  expect(seen.size).toBeGreaterThanOrEqual(11)
  expect(switches).toBeGreaterThanOrEqual(35)
  expect(desk).toBeLessThan(0.6)
  expect(seen.has('Laptop') || seen.has('Desktop')).toBe(true) // still gets work done at the desk
  await ui.unmount()
})

test('the level has no cap: one per 一亿 tokens, every move past Lv.10', async ($, on) => {
  world(on, { tokens: 20_586_000_000 })
  await boot($)
  const stats = (await pet($, 'stats')).text ?? ''
  expect(stats).toContain('Lv.205 Cosmic (205.9亿 tokens · Lv.206 at 206亿)')
  expect(stats).toContain('moves: 31/31 learned · all of them!')
})

test('past Legend the titles keep coming: Mythic at Lv.50, Celestial at Lv.100', async ($, on) => {
  world(on, { tokens: 5_000_000_000 })
  await boot($)
  expect((await pet($, 'stats')).text ?? '').toContain('Lv.50 Mythic')
})

test('Celestial at Lv.100', async ($, on) => {
  world(on, { tokens: 10_050_000_000 })
  await boot($)
  expect((await pet($, 'stats')).text ?? '').toContain('Lv.100 Celestial')
})

test('from Lv.10 Clawd shows off at work too: big moves between bouts at the desk', async ($, on) => {
  const { clock, blits } = world(on, { tokens: 20_586_000_000 })
  await boot($)
  await $.prompt.submit({ text: 'hi' } as never)
  const ui = await $.ui.mount(band(160, 'terminal', true))
  const calls = [
    { tool: 'Edit', input: { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' } },
    { tool: 'Bash', input: { command: 'npm run build', description: 'Build' } },
  ]
  for (let i = 0; i < 36; i++) {
    await $.tool.call(calls[i % calls.length] as never)
    await clock.advance(5_000)
  }
  const big = new Set(blits.map(spriteOf).filter(s => s && BIG.has(s)))
  expect(big.size).toBeGreaterThanOrEqual(2)
  await ui.unmount()
})

test('titles keep going: Hero at Lv.20', async ($, on) => {
  world(on, { tokens: 2_000_000_000 })
  await boot($)
  expect((await pet($, 'stats')).text ?? '').toContain('Lv.20 Hero')
})

test('/pet hat puts a hat on: the pictures come from frames-hat, and off takes it off', async ($, on) => {
  const { clock, blits } = world(on, { tokens: 0 })
  await boot($)
  const ui = await $.ui.mount(band(160))
  expect((await pet($, 'hat wizard')).text).toContain('put on the wizard hat')
  await clock.advance(5_000)
  const worn = blits.map(b => b.source?.file ?? '').filter(Boolean)
  expect(worn.at(-1)).toMatch(/\/frames-hat\/wizard\/\w+\/\d+m?\.png$/)
  expect((await pet($, 'hat')).text).toContain('wears a wizard hat')
  expect((await pet($, 'hat top')).text).toContain('put on the top hat')
  expect((await pet($, 'hat pirate')).text).toContain('No hat called pirate')
  expect((await pet($, 'hat off')).text).toContain('took its hat off')
  const before = blits.length
  await clock.advance(5_000)
  expect(blits.slice(before).map(b => b.source?.file ?? '').filter(Boolean).at(-1)).toMatch(/\/frames\/\w+\/\d+m?\.png$/)
  await ui.unmount()
})

test('a hat drawn as blocks too, where the terminal shows no pictures', async ($, on) => {
  const { clock, blits } = world(on, { tokens: 0, refuse: () => 'no pictures here' })
  await boot($)
  const ui = await $.ui.mount(band(160))
  await clock.advance(3_000)
  const bare = blits.filter(b => b.cells).at(-1)?.cells ?? ''
  await pet($, 'hat crown')
  await clock.advance(3_000)
  const crowned = blits.filter(b => b.cells).at(-1)?.cells ?? ''
  expect(crowned).not.toEqual(bare)
  // the cells are base64 bytes; the crown's gold (#f5c542) is among their colours
  const bytes = [...atob(crowned)].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  expect(bytes).toMatch(/42c5f5|f5c542/)
  await ui.unmount()
})
