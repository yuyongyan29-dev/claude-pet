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
  ({ plugin: 'claude-pet', surface, component: 'AbovePrompt', props: props(bodyColumns, isWorking) }) as const

type Blit = { source?: { file?: string }; cells?: string }

/**
 * The world beneath Clawd on a mock clock: a store, the frames on disk, a terminal that takes
 * pictures (or refuses them as `refuse` says), the hour `date` answers. Returns what was blitted.
 */
function world(on: On, opts: { refuse?: (n: number) => string | undefined; hour?: string; xp?: number } = {}) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const saved = { food: 80, love: 60, xp: opts.xp ?? 0, hidden: false, savedAt: 1_700_000_000_000, size: 9, name: 'Clawd', merged: true }
  mock.store(on, opts.xp === undefined ? undefined : { pet: saved })
  const blits: Blit[] = []
  const toasts: string[] = []
  on('ui.toast', async (_$: any, e: any) => {
    toasts.push(typeof e === 'string' ? e : JSON.stringify(e))
    return { value: undefined } as never
  })
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('fs.exists', async () => ({ value: true }) as never)
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
  (await ui.find({ type: 'Text', text: /Lv\.\d+ · / }))?.text ?? ''
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

test('on the desktop the range follows the window too', async ($, on) => {
  const { clock } = world(on)
  await boot($)
  // Clawd's spot on the row: the spacer before its picture
  const spacer = async (cols: number, run: boolean) => {
    const ui = await $.ui.mount(band(cols, 'desktop'))
    if (run) await pet($, 'run') // from the left edge, a dash to the far one
    await clock.advance(run ? 20_000 : 1_000)
    const row = (await ui.findAll({ type: 'Box' })).find(b => b.props.flexDirection === 'row')
    const width = Number((row?.children as any[] | undefined)?.find((c: any) => c.type === 'Box')?.props.width)
    await ui.unmount()
    return width
  }
  const wide = await spacer(220, true)
  const narrow = await spacer(110, false) // the window narrows with Clawd at the far edge
  expect(wide).toBeGreaterThan(80) // no longer held to 80 columns
  expect(narrow).toBeLessThan(wide)
  expect(narrow).toBeLessThanOrEqual(110 - 12 - 4)
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
  const { clock, blits } = world(on, { xp: 0 })
  await boot($)
  const ui = await $.ui.mount(band(160))
  await clock.advance(150_000)
  const seen = new Set(blits.map(spriteOf).filter(Boolean) as string[])
  expect([...seen].filter(s => !LV1.has(s))).toEqual([])
  expect(seen.size).toBeGreaterThanOrEqual(3)
  await ui.unmount()
})

test('at Lv.10 the big moves come up', async ($, on) => {
  const { clock, blits } = world(on, { xp: 1620 })
  await boot($)
  const ui = await $.ui.mount(band(160))
  await clock.advance(150_000)
  const big = blits.map(spriteOf).filter(s => s && BIG.has(s))
  expect(new Set(big).size).toBeGreaterThanOrEqual(2)
  await ui.unmount()
})

test('a trick waits for its level, and stats say what comes next', async ($, on) => {
  world(on, { xp: 404 })
  await boot($)
  const locked = await pet($, 'spark')
  expect(locked.text).toContain('learns spark at Lv.8')
  const open = await pet($, 'breakdance')
  expect(open.text).toContain('check out my moves')
  const stats = (await pet($, 'stats')).text ?? ''
  expect(stats).toContain('Lv.5 Dancer (xp 404 · Lv.6 at 500)')
  expect(stats).toContain('Lv.6 brings spinning till dizzy, confetti')
})

test('a level up says what Clawd learned', async ($, on) => {
  const { toasts } = world(on, { xp: 495 })
  await boot($)
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  expect(toasts.join(' ')).toContain('reached Lv.6! Learned spinning till dizzy, confetti.')
})
