import type { ClientModule } from 'claude-code'

/**
 * clawd-pet's touch layer: an empty region over the band that tells the hooks module which
 * column was clicked; the module decides whether that was Clawd.
 */
const Touch: ClientModule = (_props, surface) => {
  if (surface.state === undefined) {
    surface.onPointer(e => {
      if (e.type === 'down') surface.post({ x: Math.floor(e.fine?.x ?? e.x), y: e.y })
    })
    surface.setState(true)
  }
  const { Box } = surface.elements
  return <Box width={surface.columns || 1} height={surface.rows || 1} />
}

export default Touch
