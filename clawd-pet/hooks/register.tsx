import type { Hook, Register, Timer } from 'claude-code'

import { HATS, HEADS } from './hats'
import { CLIPS, SPRITES } from './sprites'

/**
 * clawd-pet: Clawd strolling along the band above the prompt, drawn from the official
 * clawd-quest sprites and played by the app's own clips, scheduled the way clawd-quest does.
 * Where the terminal shows pictures (Ghostty, kitty, iTerm2) Clawd is an Image, pixel for
 * pixel; elsewhere it is the block rendering below. A Client over the band takes clicks.
 *
 * Each animation is decoded once onto a shared canvas anchored at Clawd's feet, then resampled
 * for the terminal into quarter-block sub-pixels (two by two per cell, the way the Claude Code
 * logo is drawn) at any size: `size` is how many columns Clawd's body spans. The band is one
 * Raster as wide as the prompt; Clawd wanders across it, mirrored when walking left, and the
 * frames are repainted in place with $.ui.blit. Everything else is a /pet subcommand.
 */

type Pet = { food: number; love: number; xp: number; hidden: boolean; savedAt: number; size?: number; name?: string; still?: boolean; merged?: boolean; hd?: boolean; sound?: boolean; hat?: string }
type Mood = 'think' | 'search' | 'edit' | 'shell' | 'agent' | 'work' | 'idle' | 'sleep' | 'hungry' | 'alarm' | 'ask' | 'watch' | 'crowded'
type Dollar = Parameters<Hook<'turn.complete'>>[0]

const SLEEP_AFTER_MS = 3 * 60_000
const TICK_MS = 83
const RASTER_KEY = 'clawd-pet'
const SIZE_MIN = 4
const SIZE_MAX = 40
const SIZE_DEFAULT = 9
const INLINE_XP = 155
const HOLD_MS = 20_000 // a taller band stays this long after a turn before it shrinks back
const SLEEP_FRAME_MS = 250 // asleep, Clawd breathes at 4 fps
const DEEP_SLEEP_MS = 10 * 60_000 // after this long with nothing happening, Clawd holds still
const SAVE_EVERY_MS = 60_000
const NIGHT_SLEEP_AFTER_MS = 45_000 // late at night Clawd nods off much sooner
const NIGHT_CHECK_MS = 15 * 60_000
const LONG_TURN_MS = 60_000 // a turn this long shows how long it has run
const TIRED_MS = 3 * 60_000 // and past this Clawd starts to flag
const ASK_MS = 60_000 // how long Clawd keeps waving for an answer nobody gave
const CROWDED = 90 // context window percent where Clawd gets nervous (token-weather's "Compact soon")
const DESKTOP_CELL_PX = 8 // a desktop cell is about this wide, to size Clawd's picture in cells
const DESKTOP_RANGE = 40 // on the desktop Clawd strolls this many cells past its caption, no further
// --- the canvas every frame is placed on: Clawd's 24x16 body with its feet at (AX, AY) ---
const CW = 48
const CH = 40
const AX = 20
const AY = 40
const BODY_LEFT = AX - 12

// `same[i]`: the first frame of the run of identical frames frame i belongs to (41% repeat)
type Anim = { name: string; fps: number; colors: number[]; dark: Set<number>; frames: Uint8Array[]; same: number[] }
const decoded: Record<string, Anim> = {}

/** Base frame plus deltas to full frames on the shared canvas; 255 is transparent. */
function anim(name: string): Anim {
  const key = `${name}|${hatOn() ?? ''}`
  const hit = decoded[key]
  if (hit) return hit
  const t = SPRITES[name]!
  const a = t.a0[2]! > 0 ? t.a0 : [0, 0, t.w, t.h]
  const ox = Math.round(AX - (a[0]! + a[2]! / 2))
  const oy = AY - (a[1]! + a[3]!)
  const raw = Uint8Array.from([...t.base].map(c => (c === '.' ? 255 : parseInt(c, 36))))
  const place = (src: Uint8Array) => {
    const out = new Uint8Array(CW * CH).fill(255)
    for (let i = 0; i < src.length; i++) {
      if (src[i] === 255) continue
      const x = (i % t.w) + ox
      const y = Math.floor(i / t.w) + oy
      if (x >= 0 && x < CW && y >= 0 && y < CH) out[y * CW + x] = src[i]!
    }
    return out
  }
  const frames = [place(raw)]
  const same = [0]
  for (const d of t.deltas) {
    same.push(d ? frames.length : same[same.length - 1]!)
    if (d)
      for (const tok of d.split(',')) {
        const k = tok.length - 1
        raw[parseInt(tok.slice(0, k), 36)] = tok[k] === '.' ? 255 : parseInt(tok[k]!, 36)
      }
    frames.push(place(raw))
  }
  const colors = t.palette.map(c => parseInt(c.slice(1), 16))
  const dark = new Set(colors.map((c, i) => (((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255) < 120 ? i : -1)).filter(i => i >= 0))
  const hat = hatOn()
  if (hat) wear(frames, colors, HATS[hat]!, HEADS[name] ?? [])
  const made = { name, fps: t.fps, colors, dark, frames, same }
  decoded[key] = made
  return made
}

// --- hats: art and head positions from tools/gen_hats.py, which also draws frames-hat/ ---
const hatOn = () => (pet.hat && HATS[pet.hat] ? pet.hat : undefined)

/** Puts the hat on every frame where Clawd's head was found; its colours join the palette. */
function wear(frames: Uint8Array[], colors: number[], hat: (typeof HATS)[string], heads: ([number, number] | null)[]) {
  const keys = Object.keys(hat.colors)
  const base = colors.length
  for (const k of keys) colors.push(parseInt(hat.colors[k]!.slice(1), 16))
  const w = hat.art[0]!.length
  frames.forEach((f, n) => {
    const at = heads[n]
    if (!at) return
    const left = Math.floor((at[0] - w) / 2)
    const top = hat.over ? at[1] - hat.art.length + (hat.drop ?? 0) : at[1]
    hat.art.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = row[i]!
        if (c === '.') continue
        const x = left + i
        const y = top + j
        if (x < 0 || x >= CW || y < 0 || y >= CH) continue
        // a hat on top stays behind what is already there (a raised arm, a lightbulb); a headband is worn over the head
        if (f[y * CW + x] === 255 || !hat.over) f[y * CW + x] = base + keys.indexOf(c)
      }
    })
  })
}

/** A new hat (or none): every drawing made with the old one goes. */
function changeHat(hat: string | undefined) {
  pet.hat = hat
  for (const cache of [decoded, subs, svgCache] as Record<string, unknown>[]) for (const k of Object.keys(cache)) delete cache[k]
  lastPaint = ''
}

// --- terminal sub-pixels: a cell is 2x2 of them, each half a column wide and half a row tall ---
type Sub = { anim: Anim; size: number; w: number; rows: number; margin: number; top: number; frames: Uint8Array[] }
const subs: Record<string, Sub> = {}

/**
 * The animation resampled so Clawd's body spans `size` columns: area-weighted, eyes kept when
 * they cover a third of a sub-pixel, transparent when half of it is empty. The grid is aligned
 * so the body's left edge and the feet fall on cell boundaries.
 */
function sub(name: string, size: number): Sub {
  const key = `${name}|${hatOn() ?? ''}@${size}`
  const hit = subs[key]
  if (hit) return hit
  const a = anim(name)
  const sx = 12 / size // canvas pixels per sub-pixel across (24 px over 2*size sub-pixels)
  const sy = sx * 2 // a sub-pixel is twice as tall as it is wide
  const margin = Math.ceil(BODY_LEFT / (2 * sx)) // whole cells left of the body
  const left0 = BODY_LEFT - margin * 2 * sx
  const w = Math.ceil((CW - left0) / sx / 2) * 2
  const height = Math.ceil(AY / sy / 2) * 2
  const area = sx * sy
  const frames = a.frames.map(f => {
    const out = new Uint8Array(w * height).fill(255)
    for (let j = 0; j < height; j++) {
      const y0 = AY - (height - j) * sy
      const y1 = y0 + sy
      for (let i = 0; i < w; i++) {
        const x0 = left0 + i * sx
        const x1 = x0 + sx
        const cover = new Map<number, number>()
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(CH, Math.ceil(y1)); y++) {
          const dy = Math.min(y + 1, y1) - Math.max(y, y0)
          for (let x = Math.max(0, Math.floor(x0)); x < Math.min(CW, Math.ceil(x1)); x++) {
            const part = (Math.min(x + 1, x1) - Math.max(x, x0)) * dy
            if (part <= 0) continue
            const v = f[y * CW + x]!
            cover.set(v, (cover.get(v) ?? 0) + part)
          }
        }
        let empty = area
        let darkest = -1
        let darkArea = 0
        let best = -1
        let bestArea = 0
        for (const [v, part] of cover) {
          if (v === 255) continue
          empty -= part
          if (a.dark.has(v)) {
            darkArea += part
            if (darkest < 0 || part > (cover.get(darkest) ?? 0)) darkest = v
          } else if (part > bestArea) {
            best = v
            bestArea = part
          }
        }
        if (darkArea >= area / 3) out[j * w + i] = darkest
        else if (empty < area / 2 && best >= 0) out[j * w + i] = best
      }
    }
    keepEyes(a, f, out, w, height, left0, sx, sy)
    tuckEyes(a, out, w, height)
    return out
  })
  let top = height
  for (const f of frames) for (let i = 0; i < f.length && i < top * w; i++) if (f[i] !== 255) top = Math.floor(i / w)
  const made = { anim: a, size, w, rows: height / 2, margin, top: Math.floor(top / 2), frames }
  subs[key] = made
  return made
}

/**
 * Every eye survives the shrink: each cluster of dark canvas pixels that ended up with no dark
 * sub-pixel gets one, at its centre, as long as that spot is on Clawd's body.
 */
function keepEyes(a: Anim, f: Uint8Array, out: Uint8Array, w: number, height: number, left0: number, sx: number, sy: number) {
  const top0 = AY - height * sy
  const subAt = (px: number, py: number) => {
    const i = Math.floor((px + 0.5 - left0) / sx)
    const j = Math.floor((py + 0.5 - top0) / sy)
    return i >= 0 && i < w && j >= 0 && j < height ? j * w + i : -1
  }
  const seen = new Uint8Array(CW * CH)
  for (let start = 0; start < f.length; start++) {
    if (seen[start] || !a.dark.has(f[start]!)) continue
    const stack = [start]
    const cluster: number[] = []
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      cluster.push(p)
      const px = p % CW
      const py = Math.floor(p / CW)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx!
        const ny = py + dy!
        if (nx < 0 || nx >= CW || ny < 0 || ny >= CH) continue
        const n = ny * CW + nx
        if (!seen[n] && a.dark.has(f[n]!)) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    if (cluster.length > 12) continue // a big dark shape (a prop), not an eye
    if (cluster.some(p => {
      const k = subAt(p % CW, Math.floor(p / CW))
      return k >= 0 && a.dark.has(out[k]!)
    })) continue
    const cx = cluster.reduce((t, p) => t + (p % CW), 0) / cluster.length
    const cy = cluster.reduce((t, p) => t + Math.floor(p / CW), 0) / cluster.length
    // the centre if it is on the body, else the cluster's spot nearest the centre that is
    const spots = cluster
      .map(p => ({ k: subAt(p % CW, Math.floor(p / CW)), d: Math.hypot((p % CW) - cx, Math.floor(p / CW) - cy) }))
      .concat([{ k: subAt(Math.round(cx), Math.round(cy)), d: -1 }])
      .filter(c => c.k >= 0 && out[c.k] !== 255)
      .sort((p, q) => p.d - q.d)
    // none on the body: the body sub-pixel beside the centre, toward the inside of the head
    const c = subAt(Math.round(cx), Math.round(cy))
    const near = spots[0]?.k ?? [c - 1, c + 1, c + w, c - w].find(k => c >= 0 && k >= 0 && k < out.length && out[k] !== 255 && !a.dark.has(out[k]!))
    if (near !== undefined) out[near] = f[cluster[0]!]!
  }
}

/**
 * An eye on the top edge of the head reads as a notch on a dark terminal: move it one row down
 * into the body, the spot it leaves taking the colour of the body under it.
 */
function tuckEyes(a: Anim, out: Uint8Array, w: number, height: number) {
  for (let j = 0; j < height - 1; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      if (out[k] === 255 || !a.dark.has(out[k]!)) continue
      const above = j > 0 ? out[k - w] : 255
      const below = out[k + w]
      if (above !== 255 || below === 255 || a.dark.has(below!)) continue
      out[k + w] = out[k]!
      out[k] = below!
    }
}

const DEFAULT = 0x01000000
const SPACE = 0x20
// quadrant glyphs by bits: upper-left 1, upper-right 2, lower-left 4, lower-right 8
const QUAD = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]

/**
 * The band: `cols` wide, Clawd's body starting at column `x`, mirrored when facing left.
 * A cell takes its main colour as foreground over the quadrants it fills; an eye or a second
 * colour fills the rest as background when the cell has no empty quadrant.
 */
function scene(s: Sub, f: number, cols: number, rows: number, x: number, flip: boolean, lift = 0): string {
  const frame = s.frames[f]!
  const out = new Uint32Array(cols * rows * 3)
  for (let i = 0; i < cols * rows; i++) out.set([SPACE, DEFAULT, DEFAULT], i * 3)
  const firstRow = s.rows - rows
  // mirrored about the body's centre, so the body keeps its cells
  const mirror = s.margin * 4 + 2 * s.size - 1
  const at = (sxp: number, syp: number): number => {
    if (syp < 0 || syp >= 2 * s.rows) return 255
    const xx = flip ? mirror - sxp : sxp
    return xx < 0 || xx >= s.w ? 255 : frame[syp * s.w + xx]!
  }
  const left = x - s.margin
  for (let r = 0; r < rows; r++) {
    const sr = (firstRow + r) * 2 + lift
    for (let c = 0; c < s.w / 2; c++) {
      const col = left + c
      if (col < 0 || col >= cols) continue
      const q = [at(2 * c, sr), at(2 * c + 1, sr), at(2 * c, sr + 1), at(2 * c + 1, sr + 1)]
      if (q.every(v => v === 255)) continue
      const count = new Map<number, number>()
      let holes = 0
      let eye = -1
      for (const v of q) {
        if (v === 255) holes++
        else if (s.anim.dark.has(v)) eye = v
        else count.set(v, (count.get(v) ?? 0) + 1)
      }
      const ranked = [...count.entries()].sort((p, k) => k[1] - p[1])
      const i = (r * cols + col) * 3
      if (ranked.length === 0) {
        out.set([0x2588, s.anim.colors[eye]!, DEFAULT], i)
        continue
      }
      const fg = ranked[0]![0]
      let bits = 0
      q.forEach((v, n) => {
        if (v !== 255 && !s.anim.dark.has(v)) bits |= 1 << n
      })
      let bg = DEFAULT
      if (eye >= 0) {
        // two colours to a cell: the eye wins over a hole, which takes the body's colour
        bits = 0
        q.forEach((v, n) => {
          if (v !== eye) bits |= 1 << n
        })
        out.set([QUAD[bits]!, s.anim.colors[fg]!, s.anim.colors[eye]!], i)
        continue
      }
      else if (holes === 0 && ranked.length > 1) {
        bits = 0
        q.forEach((v, n) => {
          if (v === fg) bits |= 1 << n
        })
        bg = s.anim.colors[ranked[1]![0]]!
      }
      out.set([QUAD[bits]!, s.anim.colors[fg]!, bg], i)
    }
  }
  return (new Uint8Array(out.buffer) as unknown as { toBase64: () => string }).toBase64()
}

// --- pixel for pixel: Clawd as a picture, where the terminal shows images (Ghostty, kitty, …) ---
/**
 * One frame as a picture: frames/<sprite>/<n>[m].png, made ahead from the same art (the canvas's
 * bottom PIC_PX rows, each pixel 4x4, `m` mirrored). The terminal reads the file itself, so a
 * frame costs a path, not its pixels. A picture blanks every cell of its box, clear pixels too,
 * so the box must stay inside the band and off the caption: `2 * size` columns by picRows.
 */
const PIC_PX = 32
const picRows = (size: number) => Math.max(1, Math.round((PIC_PX * size) / 48))
const picLeft = (size: number) => -Math.round((BODY_LEFT * size) / 24)

function picture(root: string, sp: string, f: number, size: number, flip: boolean) {
  return {
    source: { file: `${root}/${hatOn() ? `frames-hat/${hatOn()}` : 'frames'}/${sp}/${f}${flip ? 'm' : ''}.png`, format: 'png' as const },
    columns: 2 * size,
    rows: picRows(size),
    left: picLeft(size),
  }
}

// --- desktop: one SVG per animation ---
const PX = 2
// the rows each SVG shows, centred on Clawd as it stands (body rows 24-39, a hat up to row 13) and
// tall enough for its highest reach: a raised arm at row 8, a hat in mid-jump at row 3. Below row 39
// is empty, there only to keep the frame centred.
const SVG_ROWS = 48
const svgTop = () => (hatOn() ? 26 : 31.5) - SVG_ROWS / 2
// on the desktop: Clawd drawn 1.3x, centred on a lane only as tall as it was (LANE_PX), so the band
// keeps its height; the frame's empty sky and floor reach into the band's own padding
const DESKTOP_SCALE = 1.3
// beside hud-pane's two rows the card is three rows tall, and Clawd stands as tall as the text block
const DESKTOP_HUD_SCALE = 2.4
const LANE_PX = 34
const LANE_SPACER = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${LANE_PX}"/>`
const svgCache: Record<string, string> = {}

/** One clip as an SVG that plays itself: its frames `start..end`, mirrored when `flip`. */
function svgOf(name: string, flip: boolean, step: number): string {
  const c = clipOf(name)
  const a = anim(c.sp)
  const frames = a.frames.slice(c.start, c.end + 1).filter((_, i) => i % step === 0)
  const n = frames.length
  const dur = Math.round((n * step * 1000) / c.fps)
  const repeat = c.loop ? 'indefinite' : '1'
  const groups = frames
    .map((frame, i) => {
      const paths: Record<number, string> = {}
      for (let y = 0; y < CH; y++) {
        let x = 0
        while (x < CW) {
          const v = frame[y * CW + x]!
          let end = x
          while (end + 1 < CW && frame[y * CW + end + 1] === v) end++
          if (v !== 255) paths[v] = (paths[v] ?? '') + `M${x} ${y}h${end - x + 1}v1h-${end - x + 1}z`
          x = end + 1
        }
      }
      const body = Object.entries(paths)
        .map(([v, d]) => `<path fill="#${a.colors[+v]!.toString(16).padStart(6, '0')}" d="${d}"/>`)
        .join('')
      const values = frames.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')
      // a clip played once holds its last frame
      const last = i === n - 1 && !c.loop ? ' fill="freeze"' : ''
      const flipper = n > 1 ? `<animate attributeName="visibility" values="${values}" dur="${dur}ms" calcMode="discrete" repeatCount="${repeat}"${last}/>` : ''
      return `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${flipper}${body}</g>`
    })
    .join('')
  const mirror = flip ? ` transform="translate(${2 * BODY_LEFT + 24} 0) scale(-1 1)"` : ''
  // framed on what shows (the hat's tip to the feet), so a box centred on the text line centres Clawd
  const top = svgTop()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW * PX}" height="${SVG_ROWS * PX}" viewBox="0 ${top} ${CW} ${SVG_ROWS}" shape-rendering="crispEdges"><g${mirror}>${groups}</g></svg>`
}

function svg(name: string, flip: boolean): string {
  const key = `${name}|${hatOn() ?? ''}:${flip}`
  const hit = svgCache[key]
  if (hit) return hit
  let step = 1
  let out = svgOf(name, flip, step)
  while (out.length > 125_000 && step < 8) out = svgOf(name, flip, ++step)
  svgCache[key] = out
  return out
}

// --- what Clawd does when: the app's own clips, scheduled the way clawd-quest does ---
type Clip = { sp: string; start: number; end: number; fps: number; loop: boolean }

/**
 * A clip by name: one of the app's (CLIPS), a loop of a whole sprite by its name, or `stand`,
 * the still pose Clawd holds between moves. The desk loops stop where getting up begins.
 */
function clipOf(name: string): Clip {
  if (name === 'stand') return { sp: 'Swaying', start: 0, end: 0, fps: 1, loop: true }
  const last = (sp: string) => anim(sp).frames.length - 1
  if (name === 'glance') return { sp: 'Turning', start: 5, end: 10, fps: 14, loop: false } // eyes to the way it is facing
  if (name === 'laptop') return { sp: 'Laptop', start: 2, end: 33, fps: 12, loop: true }
  if (name === 'desktop') return { sp: 'Desktop', start: 2, end: 75, fps: 12, loop: true }
  const c = CLIPS[name]
  if (c) return { sp: c.sp, start: c.start, end: c.end ?? last(c.sp), fps: c.fps, loop: c.end === undefined }
  return { sp: name, start: 0, end: last(name), fps: anim(name).fps, loop: true }
}
const spriteOf = (name: string) => clipOf(name).sp
const clipMs = (name: string) => {
  const c = clipOf(name)
  return ((c.end - c.start + 1) * 1000) / c.fps
}

const MOVING = new Set(['Walking', 'Running', 'CrabWalking'])
// idle flourishes: every clip of the app's that is not work, weighted by how often each comes up,
// the big numbers (dances, magic, confetti) rarer; `fresh` keeps the last few from coming back
const FLOURISH: [string, number][] = [
  ['sway', 3], ['lookAround', 3], ['LookingAroundEyesOnly', 2], ['turning', 3], ['point', 3], ['wave', 3],
  ['danceOnce', 3], ['excitedPick', 2], ['hula', 2], ['startHop', 2], ['Jumping', 2], ['breakOnce', 2],
  ['thinking', 1], ['lightbulb', 1], ['meditate', 1], ['danceCine', 1], ['confettiCine', 1], ['sparkCine', 1],
  ['facepalm', 1], ['Dizzy', 1], ['breakCine', 1],
]
const CHEER = ['danceOnce', 'startHop', 'excitedPick', 'wave', 'Jumping', 'hula', 'breakOnce', 'turning']
// how Clawd gets somewhere: mostly a walk, sometimes sideways like a crab, sometimes a dash
const GAITS: [string, number][] = [['walk', 6], ['crabRun', 2], ['run', 2]]
const GAIT_SPEED: Record<string, number> = { walk: 0.3, crabRun: 0.35, run: 0.9 }
const OUCH = ['facepalm', 'Dizzy', 'disappointed']
const WORK_MOODS = new Set<Mood>(['think', 'search', 'edit', 'shell', 'agent', 'work'])
// at work, between bouts at the desk: a glance, a thought, a point at the screen
const WORK_BEATS: [string, number][] = [
  ['lookAround', 2], ['LookingAroundEyesOnly', 2], ['point', 2], ['thinking', 2], ['turning', 2],
  ['lightbulb', 1], ['excitedPick', 1], ['sway', 1], ['startHop', 1], ['wave', 1],
]
// a quick beat as a tool call comes back, by what it was; at most one every BEAT_GAP_MS
const TOOL_BEATS: Partial<Record<Mood, [string, number][]>> = {
  edit: [['excitedPick', 2], ['startHop', 2], ['point', 1], ['lightbulb', 1]],
  shell: [['point', 2], ['LookingAroundEyesOnly', 2], ['startHop', 1], ['turning', 1]],
  search: [['LookingAroundEyesOnly', 2], ['lookAround', 2], ['point', 1], ['lightbulb', 1]],
  agent: [['wave', 2], ['point', 1], ['Jumping', 1]],
  work: [['turning', 1], ['point', 1], ['sway', 1]],
}
const BEAT_GAP_MS = 3000

// What Clawd learns as it levels up: [level, the move, what it is called]. Everything not listed
// it knows from the start; the showiest moves come last. Every pick of a move goes through
// `knows`, so a move Clawd has not learned never plays, idle, at work or as a reaction.
const LEARNED: [number, string, string][] = [
  [2, 'danceOnce', 'a happy dance'],
  [2, 'excitedPick', 'getting excited'],
  [2, 'run', 'running'],
  [3, 'hula', 'the hula'],
  [3, 'Jumping', 'jumping'],
  [3, 'crabRun', 'a crab walk'],
  [4, 'thinking', 'thinking it over'],
  [4, 'lightbulb', 'bright ideas'],
  [4, 'meditate', 'meditation'],
  [5, 'breakOnce', 'a breakdance move'],
  [5, 'facepalm', 'facepalms'],
  [6, 'Dizzy', 'spinning till dizzy'],
  [6, 'confettiCine', 'confetti'],
  [7, 'danceCine', 'a long dance'],
  [8, 'sparkCine', 'magic'],
  [10, 'breakCine', 'a full breakdance'],
]
const levelFor = (move: string) => LEARNED.find(([, m]) => m === move)?.[0] ?? 1
const knows = (move: string) => levelFor(move) <= levelNow()
/** The move if Clawd knows it, else the plainer one it falls back on. */
const or = (move: string, plain: string) => (knows(move) ? move : plain)

// a title every few levels, in /pet stats and the level-up toast
const TITLES: [number, string][] = [
  [1, 'Hatchling'],
  [3, 'Explorer'],
  [5, 'Dancer'],
  [7, 'Showstar'],
  [8, 'Magician'],
  [10, 'Legend'],
  [20, 'Hero'],
  [30, 'Champion'],
  [50, 'Mythic'],
  [100, 'Celestial'],
  [200, 'Cosmic'],
  [300, 'Galactic'],
  [500, 'Eternal'],
  [1000, 'Infinite'],
]
const titleOf = (level: number) => [...TITLES].reverse().find(([lv]) => lv <= level)![1]
/** The /pet tricks by the level each is learned at (a trick plays a move, often a learned one). */
const TRICK_LEVEL: Record<string, number> = {
  dance: 2, excited: 2, hula: 3, jump: 3, crab: 3, idea: 4, think: 4, meditate: 4,
  breakdance: 5, facepalm: 5, spin: 6, party: 6, spark: 8,
}

const CAPTION: Record<Mood, string> = {
  think: 'thinking…',
  search: 'looking around…',
  edit: 'coding…',
  shell: 'running commands…',
  agent: 'calling for help…',
  work: 'busy…',
  idle: 'strolling',
  sleep: 'meditating…',
  hungry: 'hungry… /pet feed',
  alarm: '⚠ check that command!',
  ask: 'waiting for you…',
  watch: 'watching the replay',
  crowded: 'context almost full · /compact',
}
const CAPTION_COLOR: Record<Mood, string> = {
  think: '#699acb',
  search: '#699acb',
  edit: '#efb154',
  shell: '#77c3ab',
  agent: '#d97757',
  work: '#d97757',
  idle: '#d97757',
  sleep: '#8fb8d8',
  hungry: '#efb154',
  alarm: '#e06c5a',
  ask: '#efb154',
  watch: '#699acb',
  crowded: '#e06c5a',
}
const TOOL_MOOD: Record<string, Mood> = {
  Read: 'search',
  Grep: 'search',
  Glob: 'search',
  WebFetch: 'search',
  WebSearch: 'search',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'shell',
  Agent: 'agent',
  Task: 'agent',
}

/** /pet tricks: the clip, how many times, the line Clawd says. */
const TRICKS: Record<string, [string, number, string]> = {
  dance: ['danceOnce', 2, 'dancing!'],
  breakdance: ['BreakDancing', 1, 'check out my moves!'],
  hula: ['hula', 2, 'aloha~'],
  jump: ['Jumping', 2, 'boing boing!'],
  hop: ['startHop', 2, 'hop hop!'],
  wave: ['wave', 2, 'hi there!'],
  party: ['confettiCine', 1, 'party time!'],
  spark: ['sparkCine', 1, '✦ magic ✦'],
  idea: ['lightbulb', 1, 'I have an idea!'],
  think: ['thinking', 1, 'hmm, let me think…'],
  meditate: ['meditate', 1, 'ommm…'],
  spin: ['Dizzy', 1, 'so dizzy…'],
  turn: ['turning', 1, 'ta-da!'],
  point: ['point', 1, 'look over there!'],
  facepalm: ['facepalm', 1, 'oh no…'],
  sad: ['disappointed', 1, 'feeling a bit down'],
  excited: ['excitedPick', 2, 'so excited!'],
  look: ['lookAround', 1, 'what was that?'],
  crab: ['crabRun', 3, 'crab walk!'],
  laptop: ['laptop', 2, 'pretending to work'],
  desk: ['desktop', 1, 'at the desk'],
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!
const weighted = (list: [string, number][]) => {
  let r = Math.random() * list.reduce((t, [, w]) => t + w, 0)
  for (const [name, w] of list) if ((r -= w) < 0) return name
  return list[0]![0]
}

// --- time: the engine's clock, so a test's mock clock drives Clawd as the real one does ---
// Date.now() plus the engine clock's offset from it, measured at start. When the two disagree (a
// test's mock clock) each tick and hook asks the engine again; otherwise that costs nothing.
let skew = 0
const clockNow = () => Date.now() + skew
const isMocked = () => Math.abs(skew) > 1000
async function syncClock($: Dollar, force = false) {
  if (!force && !isMocked()) return
  skew = (await $.clock.now().catch(() => Date.now())) - Date.now()
}

// --- what the other mods are up to, kept from their state writes as they happen (no reads
// while drawing): token-weather's line and fill, Blast Radius holding a command, Replay Theater
let sideCache: SideLine | null = null
let hudRows: Segment[][] = [] // hud-pane's two rows (weather, model, usage; project, git), drawn just above the readout
let context = 0 // percent of the context window, token-weather's latest reading
let blastHeld = false
let replayOpen = false
let replayIndex = -1
let asking = 0 // when Claude started waiting on the person (a permission prompt), 0 if not
let turnStartedAt = 0
let night = false
let nightCheckedAt = 0

// --- the pet's mind, at module scope: the engine only lets $ reach top-level functions ---
let pet: Pet = { food: 80, love: 60, xp: 0, hidden: false, savedAt: 0 }
let working = false
let workMood: Mood = 'think'
let lastActive = clockNow()
let note = ''
let noteUntil = 0
let noteColor = '#d97757'
const noteNow = () => (note && clockNow() < noteUntil ? note : '')
let doing = '' // what the current tool call is about: "editing register.tsx"
let lastTap = { at: 0, count: 0 }
let lastBeat = 0 // when Clawd last reacted to a tool call coming back
let shownMood: Mood = 'idle'
/** One thing Clawd does: a clip, held `until`, played once, or walked to `to`. */
type Step = { clip: string; until?: number; to?: number; speed?: number }
let step: Step = { clip: 'stand', until: 0 }
let stepAt = 0
let plan: Step[] = []
let shot: { clip: string; until: number } | null = null
let desk = 'laptop'
let playing = 'stand'
let playingAt = 0
let lastPaint = ''
let desktop: { at: number; caption: string } | null = null
let band: { requestId: string; cols: number; rows: number; maxRows: number; x: number; hop: number } | null = null
// a picture hops whole rows: up one while it is over the caption
const hopRows = (lift: number) => (lift >= 2 ? 1 : 0)
let held = { size: 0, rows: 0, until: 0 }
// the status line, centred on the band's bottom row; Clawd hops over it
let cap = { left: 0, width: 0, text: '' }
let lastDecay = clockNow()
let ticker: Timer | undefined
let lastMove = 0
let lastSave = clockNow()
let x = 4
let facing = 1
// Clawd drawn as a picture, pixel for pixel, unless turned off or the terminal cannot show one
// Clawd is always a picture, pixel for pixel; blocks only where the terminal cannot show one
let hd = true
const hdOn = () => hd
// A refused picture is not always a terminal without pictures: right after start the engine has
// not asked the terminal yet, and between drawings nothing is mounted. Pictures come back when
// that passes; only a terminal that keeps refusing keeps the blocks.
let hdRetryAt = 0
let hdRefusals = 0
const HD_TRIES = 3
function retryPictures(now: number): boolean {
  if (hd || hdRetryAt === 0 || now < hdRetryAt) return false
  hd = true
  hdRetryAt = 0
  return true
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))
// Clawd's level is how many tokens Claude Code has used, all told: one level per 100 million (一亿),
// no cap. The days /stats has counted come from stats-cache.json; the turns since, this mod counts
// per local day in its store (every session adds to the same days) until stats-cache catches up.
const TOKENS_PER_LEVEL = 100_000_000
const STATS_REFRESH_MS = 5 * 60_000
type DayTokens = Record<string, number>
let statsBase = 0
let statsThrough = '' // the last day stats-cache.json has counted, YYYY-MM-DD
let statsReadAt = 0
let liveDays: DayTokens = {}
const tokensTotal = () => statsBase + Object.entries(liveDays).reduce((sum, [day, n]) => (day > statsThrough ? sum + n : sum), 0)
const levelNow = () => Math.max(1, Math.floor(tokensTotal() / TOKENS_PER_LEVEL))
const yi = (tokens: number) => `${(tokens / TOKENS_PER_LEVEL).toFixed(1).replace(/\.0$/, '')}亿`
const pad2 = (n: number) => String(n).padStart(2, '0')
const dayOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const turnTokens = (u?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | null) =>
  u ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : 0
const bar = (n: number) => '▰'.repeat(Math.round(n / 20)) + '▱'.repeat(5 - Math.round(n / 20))
const sizeOf = () => Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(pet.size ?? SIZE_DEFAULT)))
const nameOf = () => (pet.name || 'Clawd').replace(/[<>]/g, '').trim() || 'Clawd'
// Clawd's range: from minX (just right of a readout's line, 0 without one) to rangeRight, set by
// each drawing from the width it is drawn at, on the terminal and the desktop alike
let minX = 0
let rangeRight: number | null = null
const maxX = () => Math.max(minX, rangeRight ?? 80 - sizeOf() - 1)
const walkSpeed = (k: number) => k * Math.max(1, sizeOf() / 9)

/**
 * Keeps Clawd and every walk it has planned inside its range, after the range moved (the terminal
 * resized, the readout's line grew): a walk aimed past an edge would otherwise never arrive.
 */
function keepInRange() {
  const into = (n: number) => Math.max(minX, Math.min(maxX(), n))
  x = into(x)
  if (step.to !== undefined) step = { ...step, to: into(step.to) }
  plan = plan.map(p => (p.to === undefined ? p : { ...p, to: into(p.to) }))
}

function moodNow(now: number): Mood {
  if (blastHeld) return 'alarm'
  if (asking && now - asking < ASK_MS) return 'ask'
  if (working) return workMood
  if (replayOpen) return 'watch'
  if (context >= CROWDED) return 'crowded'
  if (pet.food < 30) return 'hungry'
  if (now - lastActive > (night ? NIGHT_SLEEP_AFTER_MS : SLEEP_AFTER_MS)) return 'sleep'
  return 'idle'
}

/** What Clawd does as it enters a mood: a start, a line. */
function enterMood(mood: Mood, from: Mood, now: number) {
  const line = (text: string, color: string, ms = 3500) => {
    note = text
    noteColor = color
    noteUntil = now + ms
  }
  const start = (clip: string) => {
    shot = { clip, until: now + clipMs(clip) }
    playing = ''
  }
  if (mood === 'alarm') {
    start(or('Jumping', 'startHop'))
    line('whoa, careful!', '#e06c5a')
  } else if (from === 'alarm') {
    line('phew', '#77c3ab', 2000)
  } else if (mood === 'ask') {
    start('wave')
    line('need your OK!', '#efb154')
  } else if (mood === 'crowded') {
    start(or('facepalm', 'disappointed'))
    line('time to /compact!', '#e06c5a')
  } else if (mood === 'watch') {
    line('ooh, a replay', '#699acb', 2000)
  }
}

/** Columns between Clawd's body and the caption; negative while they overlap. */
/** The columns Clawd takes at `at`: its body, or a picture's whole box. */
function span(at: number): [number, number] {
  return hdOn() ? [at + picLeft(sizeOf()), 2 * sizeOf()] : [at, sizeOf()]
}

function capGap(at: number): number {
  if (cap.width === 0) return Infinity
  const [left, width] = span(at)
  return Math.max(cap.left - (left + width), left - (cap.left + cap.width))
}

/** A resting spot clear of the caption, on the side of it nearer to `at`. */
function offCaption(at: number): number {
  if (capGap(at) >= 1) return at
  const [left, width] = span(at)
  const before = cap.left - 1 - width - (left - at)
  const after = cap.left + cap.width + 1 - (left - at)
  if (before < minX) return Math.min(after, maxX())
  if (after > maxX()) return before
  return at + sizeOf() / 2 < cap.left + cap.width / 2 ? before : after
}

/**
 * How many sub-pixel rows Clawd is lifted: a hop up as it nears the caption, over it with its
 * feet a row above the text, a little higher at the top of the arc.
 */
function liftAt(at: number): number {
  const gap = capGap(at)
  if (gap >= 2) return 0
  if (gap >= 0) return 2 - gap
  const [left, width] = span(at)
  const p = (left + width - cap.left) / (cap.width + width)
  return p > 0.3 && p < 0.7 ? 3 : 2
}

/** A walk to somewhere within `reach` columns, clear of the caption; null when it is too short. */
function walk(reach: number, clip = 'walk', speed = 0.3): Step | null {
  if (pet.still) return null
  const span = Math.min(reach, maxX() - minX)
  const from = Math.max(minX, Math.min(maxX() - span, Math.round(x) - span / 2))
  const to = offCaption(Math.round(from + Math.random() * span))
  return Math.abs(to - x) < 3 ? null : { clip, to, speed: walkSpeed(speed) }
}

const hold = (clip: string, ms: number, now: number): Step => ({ clip, until: now + ms })
const once = (clip: string): Step => ({ clip })

/**
 * What Clawd does next in this mood. Idle is clawd-quest's title screen: a still pose, then
 * every few seconds a stroll somewhere or a flourish. At work it settles to the job (the desk,
 * thinking, looking around), and between bouts gets up and paces a few steps.
 */
function nextSteps(mood: Mood, now: number): Step[] {
  const near = Math.max(8, sizeOf() * 3)
  // a turn running long: now and then Clawd flags, then gets back to it
  if (working && turnStartedAt && now - turnStartedAt > TIRED_MS && Math.random() < 0.3)
    return [once(fresh([['disappointed', 2], ['meditate', 1], ['sway', 2], ['Dizzy', 1]]))]
  const stepOff = (): Step[] => {
    const w = Math.random() < 0.7 ? walk(near, 'walk', 0.4) : null
    return w ? [w] : []
  }
  switch (mood) {
    case 'idle': {
      if (step.clip !== 'stand') return [hold('stand', 1200 + Math.random() * 2300, now)]
      const r = Math.random()
      if (r < routineChance()) {
        const steps = pick(routines())().filter((s): s is Step => s !== null)
        if (steps.length) return steps
      }
      const w = r < 0.5 ? wander() : null
      return [w ?? once(fresh(flourishes()))]
    }
    case 'sleep':
      return [hold('Meditating', 8000, now)]
    case 'alarm': {
      // to the right edge, where Blast Radius asks, and point at it until it is answered
      const go = Math.abs(maxX() - x) >= 3 && !pet.still ? [{ clip: or('run', 'walk'), to: maxX(), speed: walkSpeed(knows('run') ? 0.9 : 0.4) }] : []
      return [...go, once(fresh([['point', 3], ['wave', 2], ['Jumping', 1]]))]
    }
    case 'ask':
      return [once(fresh([['wave', 3], ['point', 2], ['Jumping', 1]])), hold('stand', 1200, now)]
    case 'watch':
      return [hold(fresh([['LookingAroundEyesOnly', 3], ['thinking', 2], ['sway', 2]]), 2500 + Math.random() * 2000, now)]
    case 'crowded':
      return [once(fresh([['facepalm', 2], ['disappointed', 2], ['Dizzy', 1], ['lookAround', 1]])), hold('stand', 2500 + Math.random() * 2000, now)]
    case 'hungry':
      return step.clip === 'stand' ? [once('disappointed')] : [hold('stand', 6000 + Math.random() * 4000, now)]
    case 'think':
      return [
        once(fresh([['thinking', 4], ['lightbulb', 2], ['LookingAroundEyesOnly', 2], ['turning', 1], ['meditate', 1], ['sway', 1]])),
        once(fresh(WORK_BEATS)),
        ...workShow(),
        ...(Math.random() < 0.5 ? stepOff() : []),
      ]
    case 'search': {
      const roam = Math.random() < 0.4 ? wander(near * 2) : null
      return [...(roam ? [roam] : []), once(fresh([['lookAround', 4], ['LookingAroundEyesOnly', 3], ['point', 2], ['turning', 1]])), once(fresh(WORK_BEATS)), ...workShow()]
    }
    case 'edit':
    case 'shell': {
      // short bouts at the desk, a beat between them; side-on at the desktop, Clawd's head is
      // lost below size 9 on the terminal's blocks
      desk = sizeOf() >= 9 || hd ? pick(['laptop', 'desktop']) : 'laptop'
      return [hold(desk, 2500 + Math.random() * 2000, now), once(`${desk}Out`), once(fresh(WORK_BEATS)), ...workShow(), ...(Math.random() < 0.5 ? stepOff() : [])]
    }
    case 'agent': {
      const w = walk(maxX(), or(Math.random() < 0.7 ? 'run' : 'crabRun', 'walk'), knows('run') ? 0.9 : 0.4)
      return [w ?? once('wave'), once(fresh([['wave', 3], ['point', 3], ['Jumping', 1], ['excitedPick', 1]]))]
    }
    case 'work':
      return [...stepOff(), once(fresh([['sway', 3], ['thinking', 3], ['lookAround', 2], ['turning', 1]])), once(fresh(WORK_BEATS)), ...workShow()]
  }
}

function stepDone(now: number): boolean {
  if (step.to !== undefined) return Math.abs(step.to - x) < 0.5
  if (step.until !== undefined) return now >= step.until
  return now - stepAt >= clipMs(step.clip)
}

/** Advances Clawd by one tick; true when the clip on screen changed. */
function settle(now: number): boolean {
  if (shot && now >= shot.until) shot = null
  const mood = moodNow(now)
  if (mood !== shownMood && WORK_MOODS.has(mood) && WORK_MOODS.has(shownMood)) {
    // one tool to the next: Clawd carries on with what it is doing, the next move fits the new job
    shownMood = mood
  } else if (mood !== shownMood) {
    // leaving the desk, Clawd gets up first
    const atDesk = step.clip === 'laptop' || step.clip === 'desktop'
    plan = atDesk ? [once(`${step.clip}Out`)] : []
    if (!atDesk) step = { clip: 'stand', until: 0 }
    const from = shownMood
    shownMood = mood
    enterMood(mood, from, now)
  }
  if (!shot && stepDone(now)) {
    if (plan.length === 0) plan = nextSteps(mood, now)
    step = plan.shift()!
    stepAt = now
    // about to walk the other way: face it, and glance that way first
    const dir = step.to === undefined ? 0 : Math.sign(step.to - x)
    if (dir && dir !== facing) {
      facing = dir
      plan.unshift(step)
      step = once('glance')
    }
  }
  if (!shot && step.to !== undefined) {
    const dir = Math.sign(step.to - x)
    if (dir) facing = dir
    // speeds are columns per TICK_MS; the time since the last step decides how far
    const dt = lastMove ? Math.min(250, now - lastMove) : TICK_MS
    x += dir * Math.min(((step.speed ?? walkSpeed(0.3)) * dt) / TICK_MS, Math.abs(step.to - x))
    lastMove = now
  } else lastMove = 0
  const want = shot?.clip ?? step.clip
  if (want === playing) return false
  playing = want
  playingAt = now
  return true
}

function frameNow(now: number): number {
  const c = clipOf(playing)
  const n = Math.floor(((now - playingAt) * c.fps) / 1000)
  const len = c.end - c.start + 1
  return c.start + (c.loop || shot ? n % len : Math.min(n, len - 1))
}

// the sound each reaction makes, when /pet sound is on: little chiptune blips of the mod's own
const SOUND: Record<string, string> = {
  startHop: 'hop', wave: 'wave', danceOnce: 'cheer', excitedPick: 'cheer', confettiCine: 'cheer',
  sparkCine: 'levelup', facepalm: 'ouch', Dizzy: 'ouch', disappointed: 'ouch', hula: 'wave',
}
function react($: Dollar, clip: string, times = 1) {
  shot = { clip, until: clockNow() + times * clipMs(clip) }
  playing = ''
  const sound = SOUND[clip]
  if (sound && pet.sound) void $.audio.play({ asset: `sounds/${sound}.wav` }, { gain: 0.5 }).catch(() => {})
}

// the big numbers: past Lv.5 each level makes them a quarter more likely, routines and confetti too
const BIG = new Set(['danceOnce', 'breakOnce', 'hula', 'Jumping', 'danceCine', 'confettiCine', 'sparkCine', 'breakCine'])
const flair = () => Math.min(5, Math.max(0, levelNow() - 5)) // held at Lv.10's, so the big moves never crowd out the rest
// From Lv.10 (Legend) on, Clawd shows off: the full-length numbers three times as likely idle,
// big moves between bouts at work, and a show to close a turn.
const CINE = new Set(['danceCine', 'confettiCine', 'sparkCine', 'breakCine'])
const showy = () => levelNow() >= 10
const flourishes = (): [string, number][] =>
  FLOURISH.map(([m, w]): [string, number] => [m, (BIG.has(m) ? w * (1 + 0.25 * flair()) : w) * (showy() && CINE.has(m) ? 3 : 1)])
const routineChance = () => (showy() ? 0.35 : Math.min(0.3, 0.18 + 0.02 * flair()))
const confettiChance = () => (showy() ? 0.35 : Math.min(0.25, 0.1 + 0.02 * flair()))
// at work the long numbers stay out (a full breakdance runs 25 s); these keep the desk lively
const WORK_SHOW: [string, number][] = [['danceOnce', 3], ['Jumping', 3], ['hula', 2], ['breakOnce', 2], ['excitedPick', 2], ['danceCine', 1], ['confettiCine', 1]]
const workShow = (): Step[] => (Math.random() < (showy() ? 0.3 : 0.08) ? [once(fresh(WORK_SHOW))] : [])
// how a turn ends: confetti, else a big number, else a cheer
const FINALE: [string, number][] = [['danceCine', 2], ['sparkCine', 1], ['breakOnce', 2], ['danceOnce', 2], ['hula', 1]]
const finale = () =>
  Math.random() < confettiChance() && knows('confettiCine')
    ? 'confettiCine'
    : showy() && Math.random() < 0.4
      ? fresh(FINALE)
      : fresh(CHEER.map((c): [string, number] => [c, 1]))

// the clips played lately, so a pick skips them and Clawd keeps changing
let recent: string[] = []
function fresh(list: [string, number][]): string {
  const known = list.filter(([c]) => knows(c))
  const pool = known.length ? known : ([['sway', 1]] as [string, number][])
  const left = pool.filter(([c]) => !recent.includes(c))
  const clip = weighted(left.length ? left : pool)
  recent = [...recent, clip].slice(-5)
  return clip
}

/** A walk in some gait, to anywhere in Clawd's range. */
function wander(reach = maxX()): Step | null {
  const gait = weighted(GAITS.filter(([g]) => knows(g)))
  return walk(reach, gait, GAIT_SPEED[gait])
}

// little routines: a few moves strung together, now and then, so Clawd seems to have a plan
const ROUTINES: [number, () => (Step | null)[]][] = [
  [1, () => [wander(), once('lookAround'), once('point')]],
  [2, () => [walk(maxX(), 'run', 0.9), once('startHop'), once('wave')]],
  [3, () => [walk(maxX(), 'crabRun', 0.35), once('Jumping')]],
  [3, () => [once('turning'), once('hula'), once('wave')]],
  [4, () => [once('thinking'), once('lightbulb'), once('excitedPick')]],
  [4, () => [wander(), once('meditate')]],
  [5, () => [once('LookingAroundEyesOnly'), once('facepalm')]],
  [6, () => [once('Jumping'), once('Dizzy'), once('sway')]],
  [7, () => [once('danceOnce'), once('breakOnce'), once('confettiCine')]],
  [8, () => [once('sparkCine'), once('excitedPick')]],
]
const routines = () => ROUTINES.filter(([lv]) => lv <= levelNow()).map(([, r]) => r)

// A one-line readout another mod hands over to draw beside Clawd, on the caption's row, so the
// two never share a cell: Clawd strolls only to the right of it. Each entry is that mod's
// published line ({ full, compact } runs of Text props) and the name it publishes under.
type Segment = { children: string; color?: string; bold?: boolean; dimColor?: boolean }
type SideLine = { full: Segment[]; compact: Segment[] }
const SIDE = { plugin: 'token-weather', key: 'line' } as const
const HOSTS = { plugin: 'clawd-pet', key: 'hosts' } as const
const SIDE_GAP = 3 // a column of margin on the left, two between the line and Clawd's range
const SIDE_SEP = ' │ ' // between the readout and Clawd's own caption on that line
const PET_ROOM = 12 // columns Clawd keeps to stroll in, beyond its own width
const CAP_ROOM = 18 // columns kept for what Clawd is doing when deciding if the line fits (it is cut past that)

/** Tells token-weather whether Clawd draws its line (and so it should not draw its own). */
async function syncHosts($: Dollar) {
  await $.state.set(HOSTS, pet.hidden ? [] : ['token-weather']).catch(() => {})
}

// the other mods' values Clawd follows, each named where it is read (the engine lists them)
const TW_READINGS = { plugin: 'token-weather', key: 'readings' } as const
const BLAST_HELD = { plugin: 'blast-radius', key: 'held' } as const
const HUD_ROWS = { plugin: 'hud-pane', key: 'rows' } as const
const REPLAY_STATE = { plugin: 'replay-theater', key: 'state' } as const
const ACHIEVEMENT = { plugin: 'achievements', key: 'latest' } as const
type OtherGet = (ref: { plugin: string; key: string }) => Promise<{ value?: unknown }>
/** A read of another plugin's value: undefined when that plugin is not here. */
const valueOf = (read: Promise<{ value?: unknown }>) => read.then(r => r.value).catch(() => undefined)

const asLine = (v: unknown): SideLine | null =>
  v && typeof v === 'object' && Array.isArray((v as SideLine).full) ? (v as SideLine) : null
type Reading = { percent?: number }
const lastPercent = (v: unknown) => (Array.isArray(v) && v.length ? Number((v[v.length - 1] as Reading).percent) || 0 : 0)
type ReplayState = { isOpen?: boolean; index?: number }
type Held = { decision?: string | null } | null

/** Takes in one state write of the mods Clawd follows; true when something Clawd shows changed. */
let cheeredAt = 0 // the achievement Clawd last celebrated, by when it was unlocked
function follow(plugin: string, key: string, value: unknown): boolean {
  if (plugin === 'token-weather' && key === 'line') {
    sideCache = asLine(value)
    return true
  }
  if (plugin === 'hud-pane' && key === 'rows') {
    hudRows = Array.isArray(value) ? (value as Segment[][]).filter(Array.isArray) : []
    return true
  }
  if (plugin === 'token-weather' && key === 'readings') {
    const was = context
    context = lastPercent(value)
    return (was >= CROWDED) !== (context >= CROWDED)
  }
  if (plugin === 'blast-radius' && key === 'held') {
    const was = blastHeld
    blastHeld = !!value && (value as Held)?.decision == null
    return was !== blastHeld
  }
  if (plugin === 'achievements' && key === 'latest') {
    // an achievement unlocked (only a new one: the value seen at start is no news)
    const got = value as { name?: string; at?: number } | null
    if (!got?.at || got.at <= cheeredAt) return false
    const fresh = cheeredAt > 0
    cheeredAt = got.at
    if (!fresh) return false
    shot = { clip: or('danceCine', 'danceOnce'), until: clockNow() + clipMs(or('danceCine', 'danceOnce')) }
    playing = ''
    note = `🏆 ${got.name ?? ''}!`
    noteUntil = clockNow() + 6000
    noteColor = '#efb154'
    return true
  }
  if (plugin === 'replay-theater' && key === 'state') {
    const r = (value ?? {}) as ReplayState
    const was = replayOpen
    replayOpen = !!r.isOpen
    const moved = replayOpen && was && typeof r.index === 'number' && r.index !== replayIndex
    replayIndex = typeof r.index === 'number' ? r.index : -1
    if (moved) {
      shot = { clip: 'point', until: clockNow() + clipMs('point') } // a new step: Clawd points at it
      playing = ''
    }
    return was !== replayOpen || moved
  }
  return false
}

/** What Clawd follows, as it stands at start (a mod that wrote before Clawd loaded). */
async function catchUp($: Dollar) {
  follow('token-weather', 'line', await valueOf(($.state.get as unknown as OtherGet)(SIDE)))
  follow('token-weather', 'readings', await valueOf(($.state.get as unknown as OtherGet)(TW_READINGS)))
  follow('blast-radius', 'held', await valueOf(($.state.get as unknown as OtherGet)(BLAST_HELD)))
  follow('hud-pane', 'rows', await valueOf(($.state.get as unknown as OtherGet)(HUD_ROWS)))
  follow('replay-theater', 'state', await valueOf(($.state.get as unknown as OtherGet)(REPLAY_STATE)))
  // what was unlocked before Clawd loaded is no news: remember it without dancing
  if (!cheeredAt) cheeredAt = ((await valueOf(($.state.get as unknown as OtherGet)(ACHIEVEMENT))) as { at?: number } | undefined)?.at || 1
}

/** Asks the machine its hour now and then: late at night Clawd gets sleepy sooner. */
async function checkNight($: Dollar, now: number) {
  if (now - nightCheckedAt < NIGHT_CHECK_MS) return
  nightCheckedAt = now
  try {
    const { stdout } = await $.process.run(['date', '+%H'], { timeoutMs: 2000 })
    const hour = Number(stdout.trim())
    if (Number.isFinite(hour)) night = hour >= 23 || hour < 6
  } catch {
    // no processes here (the desktop's own host): Clawd keeps day hours
  }
}

/**
 * The one line of text the band shows beside Clawd: the readout, whole or without its chart,
 * then Clawd's caption in a fixed room. Its width is what Clawd's range gives up; none when
 * even the short form leaves Clawd too little room.
 */
function fitSide(line: SideLine | null, total: number): { segments: Segment[]; width: number } {
  if (!line) return { segments: [], width: 0 }
  const caption = widthOf(`${nameOf()} ${badge()} · `) + CAP_ROOM
  const room = total - sizeOf() - PET_ROOM - SIDE_GAP - widthOf(SIDE_SEP) - caption
  for (const segments of [line.full, line.compact]) {
    const width = segments.reduce((w, seg) => w + widthOf(seg.children), 0)
    if (width <= room) return { segments, width: SIDE_GAP + width + widthOf(SIDE_SEP) + caption }
  }
  return { segments: [], width: 0 }
}

// One save for every Claude Code that runs Clawd, the terminal's and the desktop app's (which loads
// the plugin under another name, so its $.store is another): <config dir>/clawd-pet.json.
type Saved = { pet?: Pet; tokens?: DayTokens }
let savedAt = ''
async function claudeDir($: Dollar) {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) || `${(await $.env.get('HOME')) ?? ''}/.claude`
}
async function savedFile($: Dollar) {
  if (!savedAt) savedAt = `${await claudeDir($)}/clawd-pet.json`
  return savedAt
}
/** The shared save; before it exists, what this plugin's own store held, so nothing is lost. */
async function readSaved($: Dollar): Promise<Saved> {
  const file = await savedFile($)
  if (await $.fs.exists(file).catch(() => false)) {
    try {
      return JSON.parse(await $.fs.read(file)) as Saved
    } catch {
      return {} // caught mid-write by another session: nothing this time
    }
  }
  return {
    pet: (await $.store.get('pet').catch(() => undefined)) as Pet | undefined,
    tokens: (await $.store.get('tokens').catch(() => undefined)) as DayTokens | undefined,
  }
}
async function writeSaved($: Dollar, part: Saved) {
  const next = { ...(await readSaved($)), ...part }
  await $.fs.write(await savedFile($), `${JSON.stringify(next, null, 2)}\n`).catch(err => $.ui.log(`clawd-pet: save failed: ${err}`))
}

async function save($: Dollar) {
  pet.savedAt = clockNow()
  await writeSaved($, { pet })
}

/** Rereads the lifetime token count: stats-cache.json's days, then this mod's own days since. */
async function readTokens($: Dollar) {
  statsReadAt = clockNow()
  const dir = await claudeDir($)
  try {
    const stats = JSON.parse(await $.fs.read(`${dir}/stats-cache.json`)) as {
      lastComputedDate?: string
      dailyModelTokens?: { date: string; tokensByModel?: Record<string, number> }[]
    }
    statsBase = (stats.dailyModelTokens ?? []).reduce((sum, d) => sum + Object.values(d.tokensByModel ?? {}).reduce((a, b) => a + b, 0), 0)
    statsThrough = stats.lastComputedDate ?? ''
  } catch {
    // no stats yet: the turns this mod counted are all there is
  }
  liveDays = (await readSaved($)).tokens ?? {}
}

/** Adds a finished turn's tokens to today, and drops the days stats-cache.json now counts itself. */
async function countTokens($: Dollar, tokens: number) {
  const days = { ...((await readSaved($)).tokens ?? {}) }
  if (tokens > 0) {
    const day = dayOf(clockNow())
    days[day] = (days[day] ?? 0) + tokens
  }
  for (const day of Object.keys(days)) if (day <= statsThrough) delete days[day]
  liveDays = days
  await writeSaved($, { tokens: days })
}

// what Clawd plays between turns; the band is never shorter than the tallest of them
const RESTING = [...FLOURISH.map(([c]) => spriteOf(c)), 'Swaying', 'Meditating', 'Disappointed', ...MOVING]
const floors: Record<number, number> = {}
const rowsOf = (name: string, size: number) => {
  const s = sub(name, size)
  return s.rows - s.top
}

/**
 * The band's height, steady so the prompt does not jump with every animation: at least the
 * tallest resting animation, grown at once for a taller one, and kept grown through the turn
 * and HOLD_MS after it.
 */
function bandRows(now: number): number {
  const size = sizeOf()
  // a picture: its box, and a row above for the hop
  if (hdOn()) return picRows(size) + 1
  // resting animations, and walking with the two rows a hop over the caption takes
  const floor = (floors[size] ??= Math.max(...RESTING.map(n => rowsOf(n, size) + (MOVING.has(n) ? 2 : 0))))
  const need = Math.max(floor, rowsOf(spriteOf(playing || 'stand'), size) + Math.ceil(liftAt(Math.round(x)) / 2))
  if (held.size !== size || need >= held.rows) held = { size, rows: need, until: now + HOLD_MS }
  else if (working) held.until = now + HOLD_MS
  else if (now >= held.until) held = { size, rows: need, until: now + HOLD_MS }
  return held.rows
}

/** Hunger and mood fade at one rate whether or not a session is open. */
function decay(now: number) {
  const minutes = (now - lastDecay) / 60_000
  lastDecay = now
  pet.food = clamp(pet.food - minutes / 6)
  pet.love = clamp(pet.love - minutes / 12)
}

/**
 * How long until Clawd next has something to show: the next frame of a moving clip (at most
 * 1000 / TICK_MS a second), the end of a still pose, slower asleep, and nothing at all hidden.
 */
const stepLeft = (now: number) =>
  step.until !== undefined ? step.until - now : step.to !== undefined ? TICK_MS : stepAt + clipMs(step.clip) - now

function waitMs(now: number): number | null {
  if (pet.hidden) return null
  if (band === null && desktop === null) return 500
  if (shownMood === 'sleep' && !shot) return now - lastActive > DEEP_SLEEP_MS ? 5000 : SLEEP_FRAME_MS
  const c = clipOf(playing)
  if (step.to !== undefined && !shot) return TICK_MS
  if (c.end === c.start && !shot) {
    const left = step.until !== undefined ? step.until - now : 500
    return Math.max(TICK_MS, Math.min(1000, left))
  }
  // the next frame that looks different; a run of identical frames needs no wake-up
  const frameMs = 1000 / c.fps
  const same = anim(c.sp).same
  const len = c.end - c.start + 1
  const n = Math.floor((now - playingAt) / frameMs)
  const at = (k: number) => same[c.start + (c.loop || shot ? k % len : Math.min(k, len - 1))]
  let k = n + 1
  while (k < n + len && at(k) === at(n)) k++
  if (!c.loop && !shot && k >= len) return Math.max(TICK_MS, Math.min(1000, stepLeft(now)))
  return Math.max(TICK_MS, Math.min(1000, playingAt + k * frameMs - now))
}

/** Runs one tick, then waits until the next is due; an event that wakes Clawd calls kick. */
async function loop($: Dollar) {
  await syncClock($)
  const now = clockNow()
  void checkNight($, now)
  if (now - lastSave >= SAVE_EVERY_MS) {
    lastSave = now
    decay(now)
    void save($)
  }
  tick($)
  const ms = waitMs(clockNow())
  ticker = ms === null ? undefined : $.clock.after(ms, () => void loop($))
}

function kick($: Dollar) {
  ticker?.cancel()
  ticker = $.clock.after(0, () => void loop($))
}

/** A picture the terminal would not take: why decides whether that is for now or for good. */
function refused($: Dollar, why: string) {
  if (/no Image of its own is mounted|not mounted/i.test(why)) return // between drawings
  if (/not asked yet/i.test(why)) {
    // the terminal (Ghostty) has not been asked about pictures yet: stay a picture, which shows
    // once it has, never blocks in between
    $.clock.after(3_000, () => $.ui.invalidate('ui.render'))
    return
  }
  hdRefusals += 1
  hd = false // blocks for now
  hdRetryAt = hdRefusals < HD_TRIES ? clockNow() + 60_000 : 0
  $.ui.log(`clawd-pet: pictures refused (${why}); blocks${hdRetryAt ? ', trying pictures again soon' : ''}`)
  $.ui.invalidate('ui.render')
}

function tick($: Dollar) {
  if (pet.hidden) return
  const now = clockNow()
  if (retryPictures(now)) {
    $.ui.invalidate('ui.render') // draw the picture again; its next blit says if it holds
    return
  }
  const changed = settle(now)
  if (desktop && (changed || Math.round(x) !== desktop.at || captionText() !== desktop.caption)) {
    $.ui.invalidate('ui.render')
    return
  }
  if (band === null) return
  if (Math.min(bandRows(now), band.maxRows) !== band.rows || captionText() !== cap.text) {
    $.ui.invalidate('ui.render')
    return
  }
  // deep asleep: the frame on screen stays
  if (!changed && !shot && shownMood === 'sleep' && now - lastActive > DEEP_SLEEP_MS) return
  const f = frameNow(now)
  const flip = facing < 0
  const lift = liftAt(Math.round(x))
  const key = `${playing}:${anim(spriteOf(playing)).same[f]}:${Math.round(x)}:${flip}:${band.cols}:${lift}`
  if (key === lastPaint) return
  lastPaint = key
  if (hdOn()) {
    // the picture moves by a redraw (a step along, a hop), and changes frames by a blit
    if (Math.round(x) !== band.x || hopRows(lift) !== band.hop) {
      $.ui.invalidate('ui.render')
      return
    }
    const pic = picture($.plugin.root, spriteOf(playing), f, sizeOf(), flip)
    void $.ui.blit({ requestId: band.requestId, key: RASTER_KEY, source: pic.source }).then(
      r => ('deny' in r && r.deny ? refused($, r.deny) : (hdRefusals = 0)),
      err => refused($, String((err as Error)?.message ?? err)), // a refusal may come as a rejection
    )
    return
  }
  const s = sub(spriteOf(playing), sizeOf())
  void $.ui.blit({ requestId: band.requestId, key: RASTER_KEY, cells: scene(s, f, band.cols, band.rows, Math.round(x), flip, lift) }).catch(() => {})
}

/** "2m" or "1h 5m": how long the turn has run, once it has run long. */
function elapsed(now: number): string {
  if (!working || !turnStartedAt || now - turnStartedAt < LONG_TURN_MS) return ''
  const m = Math.floor((now - turnStartedAt) / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
const captionNow = () => {
  const now = clockNow()
  const said = noteNow()
  if (said) return said
  if (shownMood === 'alarm' || shownMood === 'ask') return CAPTION[shownMood]
  const base = (working && doing) || (shownMood === 'sleep' && night ? "it's late… zzz" : CAPTION[shownMood])
  const long = elapsed(now)
  return long ? `${base} · ${long}` : base
}
/** "Lv.5 Dancer": the level and its title, always beside Clawd's name. */
const badge = () => `Lv.${levelNow()} ${titleOf(levelNow())}`
const captionText = () => `${nameOf()} ${badge()} · ${captionNow()}`

const short = (text: string, n = 28) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)
const base = (path: string) => path.split('/').filter(Boolean).pop() ?? path

/** A few words on what a tool call does, from its input. */
function describe(tool: string, input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : '')
  const file = str('file_path') || str('notebook_path') || str('path')
  switch (tool) {
    case 'Read':
      return `reading ${short(base(file))}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `editing ${short(base(file))}`
    case 'Write':
      return `writing ${short(base(file))}`
    case 'Grep':
      return `searching "${short(str('pattern'), 20)}"`
    case 'Glob':
      return `finding ${short(str('pattern'), 22)}`
    case 'Bash':
      return `running ${short(str('description') || str('command').split('\n')[0] || 'a command')}`
    case 'WebFetch':
      return `fetching ${short(str('url').replace(/^https?:\/\//, ''))}`
    case 'WebSearch':
      return `searching the web`
    case 'Agent':
    case 'Task':
      return `asking ${short(str('subagent_type') || 'a helper', 18)} for help`
    default:
      return tool.startsWith('mcp__') ? `using ${short(tool.split('__').pop() ?? tool, 20)}` : `using ${short(tool, 20)}`
  }
}

/** Terminal columns a string takes: East Asian wide and emoji count two. */
const widthOf = (text: string) =>
  [...text].reduce((w, ch) => w + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0)

function say($: Dollar, text: string, color = '#d97757', ms = 3000) {
  note = text
  noteColor = color
  noteUntil = clockNow() + ms
  $.ui.invalidate('ui.render')
  $.clock.after(ms, () => $.ui.invalidate('ui.render'))
}

const HELP = [
  '/pet                          show or hide (hidden only until the session ends)',
  '/pet feed | pat               feed | pat',
  '/pet size 6                   any size 4-40 (body width in columns); /pet bigger | smaller',
  '/pet come | run | stay | roam come here | run a lap | stay put | wander again',
  `/pet ${Object.keys(TRICKS).join(' | ')}   (some learned at higher levels)`,
  `/pet hat ${Object.keys(HATS).join(' | ')} | off`,
  '/pet name Yanbaby             rename',
  '/pet sound on | off           little chiptune sounds for its reactions (off by default)',
  '/pet stats                    level, title, hunger, mood, moves learned',
  'click Clawd to pat it; click it a lot and it gets dizzy',
].join('\n')

/** Runs a /pet subcommand and answers with the line to show. */
async function command($: Dollar, raw: string): Promise<string> {
  // forgive copied placeholders: /pet size <4> and /pet name <Bob> mean 4 and Bob
  const cleaned = raw.replace(/[<>"'“”「」]/g, ' ').trim()
  const [first = '', ...rest] = cleaned.split(/\s+/)
  const bare = /^\d+(\.\d+)?$/.test(first) // /pet 6 is /pet size 6
  const head = bare ? 'size' : first
  const verb = head.toLowerCase()
  const arg = bare ? first : rest.join(' ')
  lastActive = clockNow()
  if (verb === '') {
    pet.hidden = !pet.hidden
    await save($)
    $.ui.invalidate('ui.render')
    return pet.hidden ? `${nameOf()} is hiding. /pet brings it back.` : `${nameOf()} is back! /pet help for tricks.`
  }
  if (verb === 'help') return HELP
  if (verb === 'hide' || verb === 'show') {
    pet.hidden = verb === 'hide'
    await save($)
    $.ui.invalidate('ui.render')
    return pet.hidden ? `${nameOf()} is hiding.` : `${nameOf()} is back!`
  }
  if (pet.hidden) {
    pet.hidden = false
    $.ui.invalidate('ui.render')
  }
  if (verb === 'size' || verb === 'bigger' || verb === 'smaller' || verb === 'big' || verb === 'small') {
    const now = sizeOf()
    const want =
      verb === 'bigger' ? now + Math.max(1, Math.round(now / 4))
      : verb === 'smaller' ? now - Math.max(1, Math.round(now / 5))
      : verb === 'big' ? 18
      : verb === 'small' ? SIZE_DEFAULT
      : Number(arg.match(/\d+(\.\d+)?/)?.[0] ?? NaN)
    if (!Number.isFinite(want)) return `Size is ${now}. Try /pet size 6 (any number ${SIZE_MIN}-${SIZE_MAX}, the body's width in columns).`
    pet.size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(want)))
    x = Math.max(minX, Math.min(x, maxX()))
    plan = []
    step = { clip: 'stand', until: 0 }
    await save($)
    $.ui.invalidate('ui.render')
    return `${nameOf()} is now size ${pet.size} (${SIZE_MIN}-${SIZE_MAX}).`
  }
  if (verb === 'feed') {
    if (pet.food >= 95) {
      react($, 'facepalm')
      say($, "I'm full!", '#efb154')
    } else {
      pet.food = clamp(pet.food + 25)
      react($, 'startHop', 2)
      say($, 'yum!', '#e8495c')
    }
    await save($)
    return `${nameOf()} food ${bar(pet.food)}`
  }
  if (verb === 'pat') {
    pet.love = clamp(pet.love + 15)
    react($, pet.love >= 100 ? 'danceOnce' : 'wave')
    say($, pet.love >= 100 ? 'love you!' : 'hehe~', '#e8495c')
    await save($)
    return `${nameOf()} mood ${bar(pet.love)}`
  }
  if (verb === 'come') {
    pet.still = false
    plan = [{ clip: 'walk', to: offCaption(Math.round((minX + maxX()) / 2)), speed: walkSpeed(0.4) }, once('wave'), hold('stand', 6000, clockNow())]
    step = { clip: 'stand', until: 0 }
    say($, 'coming!')
    return `${nameOf()} is coming over.`
  }
  if (verb === 'run') {
    pet.still = false
    plan = [{ clip: or('run', 'walk'), to: x < (minX + maxX()) / 2 ? maxX() : minX, speed: walkSpeed(knows('run') ? 0.9 : 0.4) }, once('startHop')]
    step = { clip: 'stand', until: 0 }
    say($, 'zoom!')
    return `${nameOf()} is running.`
  }
  if (verb === 'stay' || verb === 'roam') {
    pet.still = verb === 'stay'
    plan = []
    if (step.to !== undefined) step = { clip: 'stand', until: 0 }
    await save($)
    return pet.still ? `${nameOf()} stays put. /pet roam to let it wander.` : `${nameOf()} is wandering again.`
  }
  if (verb === 'name') {
    if (!arg) return `Its name is ${nameOf()}. Try /pet name Yanbaby`
    pet.name = arg.slice(0, 12)
    await save($)
    react($, 'wave')
    say($, `call me ${pet.name}!`)
    return `Renamed to ${pet.name}.`
  }
  if (verb === 'hat' || verb === 'hats') {
    const which = arg.toLowerCase().replace(/[^a-z]/g, '')
    const all = Object.keys(HATS)
    if (!which) return `${nameOf()} wears ${hatOn() ? `a ${HATS[hatOn()!]!.name}` : 'no hat'}. /pet hat ${all.join(' | ')} | off`
    if (/^(off|none|no|remove)$/.test(which)) {
      changeHat(undefined)
      await save($)
      kick($)
      return `${nameOf()} took its hat off.`
    }
    const hat = all.find(h => h === which || h.startsWith(which)) ?? (which === 'top' ? 'tophat' : undefined)
    if (!hat) return `No hat called ${arg}. Try ${all.join(', ')}.`
    changeHat(hat)
    await save($)
    react($, 'turning')
    say($, `my ${HATS[hat]!.name}!`)
    return `${nameOf()} put on the ${HATS[hat]!.name}.`
  }
  if (verb === 'hd' || verb === 'pixel') {
    // no more blocks by choice: this only tries pictures again after a terminal could not show one
    hd = true
    hdRefusals = 0
    hdRetryAt = 0
    $.ui.invalidate('ui.render')
    return `${nameOf()} is always drawn pixel for pixel (Ghostty, kitty, iTerm2…); blocks only where the terminal cannot show pictures.`
  }
  if (verb === 'sound' || verb === 'mute') {
    pet.sound = verb === 'mute' ? false : /^(off|0|no|false)$/i.test(arg) ? false : /^(on|1|yes|true)$/i.test(arg) ? true : !pet.sound
    await save($)
    if (pet.sound) react($, 'wave')
    return pet.sound ? `${nameOf()} makes little sounds now. /pet sound off to mute.` : `${nameOf()} is quiet.`
  }
  if (verb === 'stats') {
    const level = levelNow()
    const next = LEARNED.filter(([lv]) => lv > level)
    const at = next[0]?.[0]
    const known = FLOURISH.filter(([m]) => knows(m)).length + routines().length
    const total = FLOURISH.length + ROUTINES.length
    return [
      `${nameOf()}  Lv.${level} ${titleOf(level)} (${yi(tokensTotal())} tokens · Lv.${level + 1} at ${yi((level + 1) * TOKENS_PER_LEVEL)})`,
      `food ${bar(pet.food)} ${Math.round(pet.food)}%`,
      `mood ${bar(pet.love)} ${Math.round(pet.love)}%`,
      `size ${sizeOf()} · ${hdOn() ? 'pixel-perfect' : 'blocks'} · sound ${pet.sound ? 'on' : 'off'}`,
      `moves: ${known}/${total} learned${at ? ` · Lv.${at} brings ${next.filter(([lv]) => lv === at).map(([, , name]) => name).join(', ')}` : ' · all of them!'}`,
    ].join('\n')
  }
  const trick = TRICKS[verb]
  if (trick && (TRICK_LEVEL[verb] ?? 1) > levelNow()) {
    react($, 'turning')
    return `${nameOf()} learns ${verb} at Lv.${TRICK_LEVEL[verb]} (now Lv.${levelNow()}). Keep working together!`
  }
  if (trick) {
    react($, trick[0], trick[1])
    say($, trick[2], '#e8495c', Math.min(6000, trick[1] * clipMs(trick[0])))
    pet.love = clamp(pet.love + 2)
    return `${nameOf()}: ${trick[2]}`
  }
  return `${nameOf()} doesn't know "${head}".\n${HELP}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await syncClock($, true)
    lastActive = lastDecay = lastSave = clockNow()
    const saved = (await readSaved($)).pet
    if (saved && typeof saved.food === 'number') {
      const minutes = Math.max(0, (clockNow() - (saved.savedAt || clockNow())) / 60_000)
      pet = { ...saved, food: clamp(saved.food - minutes / 6), love: clamp(saved.love - minutes / 12) }
      lastDecay = clockNow()
      if (typeof pet.size !== 'number') pet.size = SIZE_DEFAULT
    }
    // every session opens with Clawd out: /pet hides it for this session only
    pet.hidden = false
    // once: the xp Clawd earned as the inline dev mod, whose store this install cannot read
    if (!pet.merged) {
      pet.xp += INLINE_XP
      pet.name = nameOf()
      pet.merged = true
      await save($)
    }
    delete pet.hd // the old blocks-or-pictures choice: pictures always now
    // pictures need the frames made ahead; without them, blocks
    if (!(await $.fs.exists(`${$.plugin.root}/frames/Swaying/0.png`).catch(() => false))) hd = false
    await readTokens($)
    await syncHosts($)
    await catchUp($)
    void checkNight($, clockNow())
    await $.command.register({ name: 'pet', description: 'Clawd the pet: /pet help for everything (feed, pat, size, dance…)' })
    kick($)
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    await syncClock($)
    const text = await command($, e.args)
    await syncHosts($) // hide and show flip who draws the readout
    kick($)
    return { text }
  })

  on('prompt.submit', async ($, e, next) => {
    await syncClock($)
    working = true
    turnStartedAt = clockNow()
    asking = 0
    workMood = 'think'
    doing = ''
    lastActive = clockNow()
    react($, 'startHop')
    kick($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await syncClock($)
    working = true
    workMood = TOOL_MOOD[e.tool] ?? 'work'
    const input = ((e as { input?: unknown }).input ?? {}) as Record<string, unknown>
    doing = describe(e.tool, input)
    lastActive = clockNow()
    kick($)
    const ran = await next(e)
    asking = 0 // whatever it waited on (a permission prompt) is answered
    const beats = TOOL_BEATS[workMood]
    if (!ran.isError && !ran.deny && beats && clockNow() - lastBeat > BEAT_GAP_MS && Math.random() < 0.6) {
      lastBeat = clockNow()
      react($, fresh(beats))
    }
    if (ran.isError) react($, pick(OUCH.filter(knows)))
    else if (!ran.deny) {
      // a passing test run is a treat
      const cmd = typeof input.command === 'string' ? input.command : ''
      if (e.tool === 'Bash' && /\b(test|tests|jest|vitest|pytest|mocha|rspec|cargo test|go test)\b/.test(cmd)) {
        pet.food = clamp(pet.food + 5)
        react($, 'excitedPick')
        say($, 'tests pass! yum', '#77c3ab')
      }
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await syncClock($)
    turnStartedAt = 0
    asking = 0
    const before = levelNow()
    working = false
    lastActive = clockNow()
    doing = ''
    if (clockNow() - statsReadAt >= STATS_REFRESH_MS) await readTokens($)
    await countTokens($, turnTokens(e.usage))
    pet.food = clamp(pet.food + 2) // a snack for every finished turn
    const level = levelNow()
    if (level > before) {
      // a level up: the newest move it learned, and a toast with all it learned
      const learned = LEARNED.filter(([lv]) => lv > before && lv <= level)
      const newest = learned.map(([, m]) => m).filter(m => !GAIT_SPEED[m]).pop()
      react($, newest ?? or('sparkCine', 'startHop'))
      const title = titleOf(level) !== titleOf(before) ? ` · ${titleOf(level)}` : ''
      const what = learned.length ? ` Learned ${learned.map(([, , name]) => name).join(', ')}.` : ''
      $.ui.toast(`${nameOf()} reached Lv.${level}${title}!${what}`)
    } else react($, finale())
    kick($)
    await save($)
    return next(e)
  })

  // a click on the band: on Clawd, a pat; a flurry of them makes it dizzy
  on('ui.message', async ($, e, next) => {
    if (e.element !== 'touch') return next(e)
    await syncClock($)
    const at = (e.data as { x?: number } | null)?.x ?? -1
    const body = Math.round(x)
    if (at < body - 1 || at > body + sizeOf()) return {}
    const now = clockNow()
    lastTap = now - lastTap.at < 1500 ? { at: now, count: lastTap.count + 1 } : { at: now, count: 1 }
    lastActive = now
    pet.love = clamp(pet.love + 3)
    if (lastTap.count >= 4) {
      react($, or('Dizzy', 'startHop'))
      say($, knows('Dizzy') ? 'whoa… dizzy' : 'hey hey hey!', '#efb154')
      lastTap = { at: 0, count: 0 }
    } else {
      react($, lastTap.count === 1 ? 'wave' : 'startHop')
      say($, lastTap.count === 1 ? 'hehe~' : 'hey!', '#e8495c', 1500)
    }
    kick($)
    return {}
  })

  // Claude waits on the person (a permission prompt): Clawd waves for attention
  on('classic.Notification', async ($, e, next) => {
    await syncClock($)
    const kind = `${e.notification_type ?? ''} ${e.message ?? ''}`
    if (/permission|approv|allow/i.test(kind)) asking = clockNow()
    else if (/idle|waiting for your input/i.test(kind) && !working) say($, 'your turn~', '#77c3ab')
    kick($)
    return next(e)
  })

  // the other mods' state, followed as they write it: no reads while drawing
  on('state.set', async ($, e, next) => {
    const r = await next(e)
    const w = e as unknown as { plugin: string; key: string; value: unknown }
    if (w.plugin !== 'clawd-pet' && follow(w.plugin, w.key, w.value)) {
      $.ui.invalidate('ui.render')
      kick($)
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (pet.hidden || e.props.hasSurvey) return next(e)
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    working = e.props.isWorking
    await syncClock($)
    const now = clockNow()
    settle(now)
    const caption = captionNow()
    const color = noteNow() ? noteColor : CAPTION_COLOR[shownMood]
    const below = await next(e)

    // the readout (token-weather) rides on Clawd's line on both surfaces; where that line has no
    // room it gets a line of its own above Clawd, so it shows whenever Clawd hosts it
    const total = Math.max(20, Math.min(512, e.props.bodyColumns))
    const side = fitSide(sideCache, total)
    const runsOf = (segments: Segment[]) =>
      segments.map(seg => {
        const { Text } = $.ui.resolve(e)
        return (
          <Text color={seg.color} bold={seg.bold} dimColor={seg.dimColor}>
            {seg.children}
          </Text>
        )
      })
    const runs = runsOf(side.segments)
    const alone =
      side.width === 0 && sideCache
        ? (() => {
            const { Box, Text } = $.ui.resolve(e)
            const fits = (segments: Segment[]) => segments.reduce((w, seg) => w + widthOf(seg.children), 0) + 2 <= total
            const segments = fits(sideCache.full) ? sideCache.full : sideCache.compact
            return (
              <Box paddingLeft={1}>
                <Text wrap="truncate">{runsOf(segments)}</Text>
              </Box>
            )
          })()
        : null
    if (e.surface === 'desktop') {
      // the desktop: one compact line, the readout and Clawd's caption fixed on the left, then a lane
      // where Clawd strolls. Clawd floats in the lane (absolute), drawn larger than the lane is tall
      // and centred on it, so neither its size nor its walk moves the text or grows the band.
      // A new clip, a step along or a new caption is a redraw.
      const { Box, Text, Svg } = $.ui.resolve(e)
      const scale = hudRows.length > 0 ? DESKTOP_HUD_SCALE : DESKTOP_SCALE
      const petPx = Math.round(CW * scale)
      const petCells = Math.ceil(petPx / DESKTOP_CELL_PX)
      const widthOfRuns = (segments: Segment[]) => segments.reduce((w, seg) => w + widthOf(seg.children), 0)
      // the text never gives way: the full readout while Clawd keeps a lane of at least 12 cells
      const textCells = (segments: Segment[]) => (segments.length ? widthOfRuns(segments) + 3 : 0) + widthOf(captionText()) + 2
      const readout = sideCache ? (textCells(sideCache.full) + petCells + 12 <= total ? sideCache.full : sideCache.compact) : []
      // the lane is what the text leaves, up to DESKTOP_RANGE cells of stroll
      minX = 0
      rangeRight = Math.max(0, Math.min(DESKTOP_RANGE, total - textCells(readout) - petCells - 2))
      keepInRange()
      desktop = { at: Math.round(x), caption: captionText() }
      // the lane where Clawd strolls: beside the one text row, or beside the whole block with hud-pane's rows
      const lane = (
        <Box position="relative" flexGrow={1} flexShrink={1} minWidth={0}>
          <Svg source={LANE_SPACER} alt="" width={1} height={LANE_PX} />
          <Box position="absolute" top={0} bottom={0} left={Math.round(x)} alignItems="center" justifyContent="center" overflow="visible">
            <Svg key={`pet-${playing}-${playingAt}`} source={svg(playing, facing < 0)} alt={`${nameOf()}: ${caption}`} width={petPx} height={Math.round(SVG_ROWS * scale)} />
          </Box>
        </Box>
      )
      const line = (
        <Box flexDirection="row" columnGap={1} alignItems="center">
          {readout.length > 0 && (
            <Box flexShrink={0}>
              <Text wrap="truncate">{runsOf(readout)}</Text>
            </Box>
          )}
          {readout.length > 0 && <Text dimColor>│</Text>}
          <Box flexShrink={0}>
            <Text wrap="truncate">
              <Text bold color="#d97757">{nameOf()}</Text>
              <Text dimColor> Lv.{levelNow()} </Text>
              <Text color="#efb154">{titleOf(levelNow())}</Text>
              <Text dimColor> · </Text>
              <Text color={color}>{caption}</Text>
            </Text>
          </Box>
          {hudRows.length === 0 && lane}
        </Box>
      )
      return (
        <Box flexDirection="column">
          {hudRows.length > 0 ? (
            // hud-pane's rows above Clawd's line: the desktop card has no blank rows and clips what
            // spills, so here (the one exception) the band grows by these rows; Clawd strolls beside
            // the whole block, drawn as tall as it
            <Box flexDirection="row" columnGap={1}>
              <Box flexDirection="column" flexShrink={0}>
                {hudRows.map(row => (
                  <Text wrap="truncate">{runsOf(row)}</Text>
                ))}
                {line}
              </Box>
              {lane}
            </Box>
          ) : (
            line
          )}
          {below}
        </Box>
      )
    }

    // the terminal: one Raster as wide as the band, Clawd strolling across it with its feet on the
    // bottom row, the caption laid over the middle of that row. With a readout (token-weather) the
    // readout and the caption share one line on the left, and Clawd strolls from its end to the band's.
    const cols = Math.max(20, Math.min(512, e.props.bodyColumns))
    const s = sub(spriteOf(playing), sizeOf())
    const maxRows = e.props.maxRows - 1
    const text = captionText()
    const width = Math.min(widthOf(text), cols)
    // beside a readout the caption rides on its line, so Clawd's range holds no text to hop over
    cap = side.width ? { left: 0, width: 0, text } : { left: Math.floor((cols - width) / 2), width, text }
    // the line ends where Clawd's range begins, so the range follows the terminal's width and the
    // line's length; a longer line nudges Clawd right
    const lineWidth = side.width
      ? Math.min(side.width - SIDE_GAP, side.segments.reduce((w, seg) => w + widthOf(seg.children), 0) + widthOf(SIDE_SEP) + widthOf(text))
      : 0
    minX = side.width ? Math.min(1 + lineWidth + 2, Math.max(0, cols - sizeOf() - 1)) : 0
    rangeRight = cols - sizeOf() - 1
    const fullRows = bandRows(now)
    const rows = Math.min(fullRows, maxRows)
    const { Box, Text, Raster, Image, Client } = $.ui.resolve(e)
    // Clawd's caption as runs of Text, to sit inside another Text (a fragment there is refused)
    const own = [
      <Text bold color="#d97757">{nameOf()}</Text>,
      <Text dimColor> Lv.{levelNow()} </Text>,
      <Text color="#efb154">{titleOf(levelNow())}</Text>,
      <Text dimColor> · </Text>,
      <Text color={color}>{caption}</Text>,
    ]
    const readout = (
      <Text wrap="truncate">
        {runs}
        <Text dimColor>{SIDE_SEP}</Text>
        {own}
      </Text>
    )
    keepInRange()
    if (rows < 1)
      return side.width ? <Box flexDirection="column">{below}<Box paddingLeft={1}>{readout}</Box></Box> : <Box flexDirection="column">{below}{alone}</Box>
    band = { requestId: e.requestId, cols, rows, maxRows, x: Math.round(x), hop: hopRows(liftAt(Math.round(x))) }
    const f = frameNow(now)
    const flip = facing < 0
    const lift = liftAt(Math.round(x))
    lastPaint = `${playing}:${anim(spriteOf(playing)).same[f]}:${Math.round(x)}:${flip}:${cols}:${lift}`
    const pic = hdOn() ? picture($.plugin.root, spriteOf(playing), f, sizeOf(), flip) : null
    return (
      <Box flexDirection="column">
        {below}
        {alone}
        <Box width={cols} height={rows}>
          {pic ? (
            // kept inside Clawd's range: a picture blanks its whole box, and a readout may sit left of it
            <Box position="absolute" bottom={hopRows(lift)} left={Math.max(minX, Math.min(cols - pic.columns, Math.round(x) + pic.left))}>
              <Image key={RASTER_KEY} source={pic.source} columns={pic.columns} rows={pic.rows} alt=" " />
            </Box>
          ) : (
            <Raster key={RASTER_KEY} columns={cols} rows={rows} cells={scene(s, f, cols, rows, Math.round(x), flip, lift)} />
          )}
          <Box position="absolute" top={0} left={0}>
            <Client key="touch" module="./touch.tsx" width={cols} height={rows} />
          </Box>
          {side.width === 0 ? (
            <Box position="absolute" bottom={0} left={cap.left} width={width}>
              <Text wrap="truncate">{own}</Text>
            </Box>
          ) : (
            <Box position="absolute" bottom={0} left={1} width={side.width - SIDE_GAP}>
              {readout}
            </Box>
          )}
          {hudRows.length > 0 && fullRows <= maxRows && rows > hudRows.length && (
            // only while Clawd's whole box fits: squeezed (a notice or menu above), the rows would spill over it;
            // hud-pane's rows, laid over the band's blank rows just above the readout (the band keeps its size)
            <Box position="absolute" bottom={1} left={1} width={Math.max(10, cols - 2)} flexDirection="column">
              {hudRows.map(row => (
                <Text wrap="truncate">{runsOf(row)}</Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
