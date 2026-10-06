/** Estimate a chained terminal tree's rows from its declared cell geometry. */
export function terminalRows(node: unknown, columns: number): number {
  if (node == null) return 0
  if (typeof node === 'string') return Math.max(1, node.split('\n').length)
  const element = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const p = element.props ?? {}
  if (p.position === 'absolute') return 0
  const n = (key: string) => typeof p[key] === 'number' ? Math.max(0, p[key] as number) : 0
  const side = (edge: string, axis: string, all: string) => typeof p[edge] === 'number' ? n(edge) : typeof p[axis] === 'number' ? n(axis) : n(all)
  const outer = side('marginTop', 'marginY', 'margin') + side('marginBottom', 'marginY', 'margin')
  if (typeof p.height === 'number') return n('height') + outer
  if (element.type === 'Image' || element.type === 'Raster') return n('rows') + outer
  if (element.type === 'Client') return n('height') + outer
  const children = element.children ?? []
  if (element.type === 'Text') {
    const textOf = (child: unknown): string => typeof child === 'string' ? child : ((child as typeof element)?.children ?? []).map(textOf).join('')
    const text = children.map(textOf).join('')
    const width = Math.max(1, n('width') || columns)
    const cells = (line: string) => [...line].reduce((sum, ch) => sum + (/\p{Mark}|[\u200d\ufe0e\ufe0f]/u.test(ch) ? 0 : /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0)
    return text.split('\n').reduce((sum, line) => sum + (p.wrap && p.wrap !== 'wrap' ? 1 : Math.max(1, Math.ceil(cells(line) / width))), 0) + outer
  }
  if (element.type !== 'Box') return Math.max(1, String(p.text ?? p.label ?? '').split('\n').length) + outer
  const border = p.borderStyle ? 2 : 0
  const padding = side('paddingTop', 'paddingY', 'padding') + side('paddingBottom', 'paddingY', 'padding') + border
  const inner = Math.max(1, (n('width') || columns) - side('paddingLeft', 'paddingX', 'padding') - side('paddingRight', 'paddingX', 'padding') - border)
  const heights = children.map(child => terminalRows(child, inner))
  const content = p.flexDirection === 'column' ? heights.reduce((sum, h) => sum + h, 0) + Math.max(0, heights.length - 1) * (typeof p.rowGap === 'number' ? n('rowGap') : n('gap')) : Math.max(0, ...heights)
  return Math.max(n('minHeight'), content + padding) + outer
}
