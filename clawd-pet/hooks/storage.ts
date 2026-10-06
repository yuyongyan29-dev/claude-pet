export type Pet = { food: number; love: number; xp: number; hidden: boolean; savedAt: number; size?: number; name?: string; still?: boolean; merged?: boolean; hd?: boolean; sound?: boolean; hat?: string }
export type DayTokens = Record<string, number>
export type Saved = { pet?: Pet; tokens?: DayTokens }
type Change = { at: number; food: number; love: number; settings: Record<string, unknown> }
export type Journal = { base: Saved; changes: Change[]; tokens: DayTokens }
const SETTINGS = ['size', 'name', 'still', 'hd', 'sound', 'hat'] as const
const clamp = (n: number) => Math.max(0, Math.min(100, n))
export function mergeSaved(base: Saved, journals: Journal[]): Saved {
  const tokens = { ...base.tokens }
  for (const part of journals) for (const [day, n] of Object.entries(part.tokens)) tokens[day] = (tokens[day] ?? 0) + n
  const pet = base.pet ? { ...base.pet } : undefined
  if (pet) {
    const changes = journals.flatMap(part => part.changes).sort((a, b) => a.at - b.at)
    for (const change of changes) {
      const minutes = Math.max(0, (change.at - pet.savedAt) / 60_000)
      pet.food = clamp(clamp(pet.food - minutes / 6) + change.food)
      pet.love = clamp(clamp(pet.love - minutes / 12) + change.love)
      for (const key of SETTINGS) if (key in change.settings) {
        if (change.settings[key] === null) delete pet[key]
        else (pet as unknown as Record<string, unknown>)[key] = change.settings[key]
      }
      pet.savedAt = Math.max(pet.savedAt, change.at)
    }
  }
  return { pet, tokens }
}

