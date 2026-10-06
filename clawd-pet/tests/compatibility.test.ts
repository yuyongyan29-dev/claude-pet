import { expect, mock, test } from 'claude-code/testing'
import type { Register } from 'claude-code'
import { mergeSaved } from '../hooks/storage'
import type { Journal, Pet } from '../hooks/storage'

type On = Parameters<Register>[0]
const NOW = 1_700_000_000_000
const initial: Pet = { food: 80, love: 60, xp: 0, hidden: false, savedAt: NOW, size: 9, name: 'Clawd' }
const BAND = { plugin: 'clawd-pet', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const

function world(on: On, env: Record<string, string> = { HOME: '/home/me' }, storeFull = false) {
  const clock = mock.clock(on, { now: NOW })
  const stored = new Map<string, unknown>()
  on('store.get', async (_$, e) => ({ value: stored.has(e.key) ? JSON.parse(JSON.stringify(stored.get(e.key))) : undefined }))
  on('store.keys', async () => ({ value: [...stored.keys()] }))
  on('store.set', async (_$, e) => { if (storeFull) throw new Error('store exceeds 4 MiB'); stored.set(e.key, JSON.parse(JSON.stringify(e.value))); return { value: undefined } })
  on('store.delete', async (_$, e) => { stored.delete(e.key); return { value: undefined } })
  const dir = env.CLAUDE_CONFIG_DIR || `${env.HOME || env.USERPROFILE}/.claude`
  const base = { pet: initial, tokens: {} }
  const files = new Map<string, string>([[`${dir}/clawd-pet.json`, JSON.stringify(base)]])
  const commands = new Map<string, { name: string; source: 'plugin'; plugin: string; description: string }>()
  const reads: string[] = []
  const writes: string[] = []
  on('env.get', async (_$, e) => ({ value: env[e.name] }))
  on('fs.exists', async (_$, e) => ({ value: e.path.endsWith('.png') || e.path.endsWith(`${dir}/clawd-pet.json`) || files.has(e.path) }))
  on('fs.list', async (_$, e) => ({ value: [...files.keys()].filter(path => path.startsWith(`${e.path}/`)).map(path => ({ name: path.slice(e.path.length + 1), kind: 'file', size: files.get(path)!.length, isLink: false })) } as never))
  on('fs.read', async (_$, e) => {
    reads.push(e.path)
    return { value: e.path.endsWith('stats-cache.json') ? JSON.stringify({ lastComputedDate: '2023-11-13', dailyModelTokens: [] }) : e.path.endsWith(`${dir}/clawd-pet.json`) ? JSON.stringify(base) : files.get(e.path), path: e.path } as never
  })
  on('fs.write', async (_$, e) => { writes.push(e.path); files.set(e.path, e.text); return { value: undefined } })
  on('command.list', async () => ({ value: [...commands.values()] }))
  on('command.register', async (_$, e, next) => {
    commands.set(e.name, { name: e.name, source: 'plugin', plugin: next.origin.plugin, description: e.description })
    return { value: { command: e.name } }
  })
  on('process.run', async () => ({ value: { exitCode: 0, stdout: '14\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'Box', props: {}, children: [] }))
  on('ui.blit', async () => ({ value: {} }))
  on('ui.log', async () => ({ value: undefined }))
  on('session.start', async () => ({ cwd: '/work' } as never))
  on('turn.complete', async () => ({ text: '' } as never))
  on('tool.call', async () => ({ result: 'ok', isError: false } as never))
  return { clock, dir, base, files, reads, writes, commands, stored }
}
const boot = ($: any) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const command = ($: any, args: string, name = 'clawd-pet') => $.command.run({ command: name, args })
const done = ($: any, id: string) => $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: id, usage: { model: 'test', input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })

test('Windows USERPROFILE selects the configuration directory without HOME', async ($, on) => {
  const { reads, writes, stored } = world(on, { USERPROFILE: 'C:/Users/Test' })
  await boot($)
  await command($, 'feed')
  // The macOS test host resolves a drive path relative to the plugin root; Windows accepts it as absolute.
  expect(reads.some(path => path.endsWith('C:/Users/Test/.claude/stats-cache.json'))).toBe(true)
  expect(writes.length).toBe(0)
  expect([...stored.keys()].some(key => key.startsWith('journal:'))).toBe(true)
})

test('CLAUDE_CONFIG_DIR takes precedence over HOME and USERPROFILE', async ($, on) => {
  const { reads } = world(on, { HOME: '/wrong', USERPROFILE: 'C:/wrong', CLAUDE_CONFIG_DIR: '/custom' })
  await boot($)
  expect(reads).toContain('/custom/stats-cache.json')
  expect(reads.some(path => path.includes('/wrong'))).toBe(false)
})

test('simultaneous turns retain every token increment without rewriting the legacy save', async ($, on) => {
  const { writes, base, stored } = world(on)
  await boot($)
  await Promise.all([done($, 'a'), done($, 'b')])
  const parts = [...stored].filter(([key]) => key.startsWith('journal:')).map(([, value]) => value as Journal)
  expect(mergeSaved(base, parts).tokens?.['2023-11-14']).toBe(200)
  expect(writes.some(path => path.endsWith('/clawd-pet.json'))).toBe(false)
})

test('another session retains its tokens and name while this session changes its hat', async ($, on) => {
  const { base, stored } = world(on)
  await boot($)
  stored.set('journal:other', { base, changes: [{ at: NOW, food: 5, love: 3, settings: { name: 'Other' } }], tokens: { '2023-11-14': 300_000_000 } } satisfies Journal)
  await command($, 'hat wizard')
  await done($, 'our-turn')
  expect((await command($, 'stats')).text).toContain('Lv.3 Explorer')
  const parts = [...stored].filter(([key]) => key.startsWith('journal:')).map(([, value]) => value as Journal)
  const merged = mergeSaved(base, parts)
  expect(merged.pet?.name).toBe('Other')
  expect(merged.pet?.hat).toBe('wizard')
  expect(merged.tokens?.['2023-11-14']).toBe(300_000_100)
})

test('/pet remains an alias when it is free', async ($, on) => {
  world(on)
  await boot($)
  expect((await command($, 'name Free', 'pet')).text).toBe('Renamed to Free.')
})

const otherPet: Register = on => {
  on('session.start', async ($, e, next) => {
    await next(e)
    await $.command.register({ name: 'pet', description: 'Another pet' })
    return { cwd: e.cwd } as never
  })
  on('command.run', { command: 'pet' }, async () => ({ text: 'other pet' }))
}

test('a later /pet owner receives its commands; /clawd-pet still works', { plugins: [{ name: 'other-pet', register: otherPet }] }, async ($, on) => {
  world(on)
  await boot($)
  expect((await command($, 'feed', 'pet')).text).toBe('other pet')
  expect((await command($, 'name Safe')).text).toBe('Renamed to Safe.')
  const help = (await command($, 'help')).text ?? ''
  expect(help).toContain('/clawd-pet feed')
  expect(help).not.toContain('/pet feed')
})

const earlierPet: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'pet', description: 'Existing pet' })
    return result
  })
  on('command.run', { command: 'pet' }, async () => ({ text: 'existing pet' }))
}
test('an existing /pet registration is not overwritten', { plugins: [{ name: 'earlier-pet', tier: 'prepend', register: earlierPet }] }, async ($, on) => {
  const { commands } = world(on)
  // Seed the engine registry to model a command present before our session hook.
  commands.set('pet', { name: 'pet', source: 'plugin', plugin: 'earlier-pet', description: 'Existing pet' })
  await boot($)
  expect(commands.get('pet')?.plugin).toBe('earlier-pet')
  expect((await command($, 'stats')).text).toContain('Clawd')
})

const weather: Register = on => {
  on('command.run', { command: 'publish' }, async ($, e) => {
    const line = { full: [{ children: e.args }], compact: [{ children: e.args }] }
    const result = await ($.state.set as any)({ plugin: 'token-weather', key: 'line' }, line, e.args === 'MISSED' ? { ifVersion: 99 } : undefined)
    return { text: String(result.isSet) }
  })
  on('command.run', { command: 'hosted' }, async $ => ({ text: JSON.stringify((await ($.state.get as any)({ plugin: 'claude-pet', key: 'hosts' })).value) }))
}
test('a missed state update leaves the accepted forecast on screen', { plugins: [{ name: 'token-weather', register: weather }] }, async ($, on) => {
  world(on)
  await boot($)
  await $.command.run({ command: 'publish', args: 'ACCEPTED' } as never)
  expect((await $.command.run({ command: 'publish', args: 'MISSED' } as never)).text).toBe('false')
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /ACCEPTED/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /MISSED/ })).toBeUndefined()
  await ui.unmount()
})

const rewrite: Register = on => {
  on('state.set', { plugin: 'token-weather', key: 'line' } as never, async (_$, e: any, next) => next({ ...e, value: { full: [{ children: 'REWRITTEN' }], compact: [{ children: 'REWRITTEN' }] } }))
}
test('a rewritten forecast displays the accepted value, not the attempted one', { plugins: [{ name: 'token-weather', register: weather }, { name: 'rewrite', register: rewrite }] }, async ($, on) => {
  world(on)
  await boot($)
  await $.command.run({ command: 'publish', args: 'ORIGINAL' } as never)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /REWRITTEN/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ORIGINAL/ })).toBeUndefined()
  await ui.unmount()
})

test('legacy token-weather reads the host alias, and hiding Clawd releases it', { plugins: [{ name: 'token-weather', register: weather }] }, async ($, on) => {
  world(on)
  await boot($)
  await $.command.run({ command: 'publish', args: 'WEATHER' } as never)
  expect((await $.command.run({ command: 'hosted', args: '' } as never)).text).toBe('["token-weather"]')
  await command($, 'hide')
  expect((await $.command.run({ command: 'hosted', args: '' } as never)).text).toBe('[]')
})

const otherBand: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    return Box({ flexDirection: 'column', children: [Box({ height: 4, children: [Text({ children: ['Other mod'] })] }), below] })
  })
}
test('the picture fits the rows left by another mod, and yields when none remain', { plugins: [{ name: 'other-band', register: otherBand }] }, async ($, on) => {
  world(on)
  await boot($)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 6 } })
  const boxes = await ui.findAll({ type: 'Box' })
  const ourBand = boxes.find(b => b.props.width === 100 && typeof b.props.height === 'number')
  expect(ourBand?.props.height).toBeLessThanOrEqual(2)
  const image = await ui.find({ type: 'Image' })
  expect(image?.props.rows).toBeLessThanOrEqual(ourBand?.props.height)
  expect(await ui.find({ type: 'Text', text: 'Other mod' })).toBeDefined()
  await ui.unmount()
  const full = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 4 } })
  expect(await full.find({ type: 'Image' })).toBeUndefined()
  expect(await full.find({ type: 'Text', text: 'Other mod' })).toBeDefined()
  await full.unmount()
})

test('explicit block mode keeps animating without retrying images', async ($, on) => {
  const { clock } = world(on)
  await boot($)
  await command($, 'pixel')
  const ui = await $.ui.mount(BAND)
  await clock.advance(65_000)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await command($, 'hd')
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  await ui.unmount()
})


test('a full plugin store archives concurrent increments without losing or doubling them', async ($, on) => {
  const { files, base, stored } = world(on, { HOME: '/home/me' }, true)
  await boot($)
  await Promise.all([done($, 'a'), done($, 'b')])
  await command($, 'name Archived')
  await done($, 'c')
  const parts = [...files].filter(([path]) => path.includes('/clawd-pet-history/')).map(([, text]) => JSON.parse(text) as Journal)
  const saved = mergeSaved(base, parts)
  expect(saved.tokens?.['2023-11-14']).toBe(300)
  expect(saved.pet?.name).toBe('Archived')
  expect(stored.size).toBe(0)
  expect(files.get('/home/me/.claude/clawd-pet.json')).toBe(JSON.stringify(base))
})

test('a forecast already present at startup is advertised to its owner', { plugins: [{ name: 'token-weather', register: weather }] }, async ($, on) => {
  world(on)
  on('state.get', { plugin: 'token-weather', key: 'line' } as never, async () => ({ value: { value: { full: [{ children: 'PREEXISTING' }], compact: [{ children: 'PREEXISTING' }] }, version: 1 } }) as never)
  await boot($)
  expect((await $.command.run({ command: 'hosted', args: '' } as never)).text).toBe('["token-weather"]')
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /PREEXISTING/ })).toBeDefined()
  await ui.unmount()
})

test('an actual legacy mod retains ownership of its hosts value', { plugins: [{ name: 'token-weather', register: weather }] }, async ($, on) => {
  world(on)
  on('state.get', { plugin: 'claude-pet', key: 'hosts' } as never, async () => ({ value: { value: ['another-mod'], version: 1 } }) as never)
  await boot($)
  expect((await $.command.run({ command: 'hosted', args: '' } as never)).text).toBe('["another-mod"]')
})

test('hosting is republished after /clear without requiring session.start', { plugins: [{ name: 'token-weather', register: weather }] }, async ($, on) => {
  world(on)
  on('classic.SessionStart', async () => ({}))
  on('state.get', { plugin: 'token-weather', key: 'line' } as never, async () => ({ value: { value: { full: [{ children: 'RESTORED' }], compact: [{ children: 'RESTORED' }] }, version: 1 } }) as never)
  await $.classic.SessionStart({ source: 'clear' })
  expect((await $.command.run({ command: 'hosted', args: '' } as never)).text).toBe('["token-weather"]')
})

test('a narrow, short terminal contains its image or block fallback', async ($, on) => {
  world(on)
  await boot($)
  await command($, 'size 40')
  for (const cols of [1, 5, 20, 80]) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: cols, maxRows: 1 } })
    const image = await ui.find({ type: 'Image' })
    if (image) {
      expect(Number(image.props.rows)).toBeLessThanOrEqual(1)
      expect(Number(image.props.columns)).toBeLessThanOrEqual(cols)
    } else {
      const blocks = await ui.find({ type: 'Raster' })
      expect(blocks).toBeDefined()
      expect(Number(blocks!.props.rows)).toBeLessThanOrEqual(1)
      expect(Number(blocks!.props.columns)).toBeLessThanOrEqual(cols)
    }
    await ui.unmount()
  }
})

test('an archive and a leftover store copy count only once', async ($, on) => {
  const { base, files, stored } = world(on)
  const part: Journal = { base, changes: [], tokens: { '2023-11-14': 300_000_000 } }
  stored.set('journal:closed', part)
  files.set('/home/me/.claude/clawd-pet-history/closed.json', JSON.stringify(part))
  await boot($)
  expect((await command($, 'stats')).text).toContain('Lv.3 Explorer')
})

test('unchanged periodic saves do not create empty archives when the store is full', async ($, on) => {
  const { clock, files } = world(on, { HOME: '/home/me' }, true)
  await boot($)
  await command($, 'name Saved')
  const archives = () => [...files.keys()].filter(path => path.includes('/clawd-pet-history/')).length
  const before = archives()
  await clock.advance(130_000)
  expect(archives()).toBe(before)
})
