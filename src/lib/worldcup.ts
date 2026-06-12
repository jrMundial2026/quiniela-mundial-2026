export const WORLD_CUP_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

export const WORLD_CUP_ROUNDS = [
  'Fase de grupos',
  'Dieciseisavos de final',
  'Octavos de final',
  'Cuartos de final',
  'Semifinal',
  'Final',
] as const

export type WorldCupRound = (typeof WORLD_CUP_ROUNDS)[number]

export function normalizeRoundValue(round?: string | null): WorldCupRound {
  const value = (round ?? '').trim().toLowerCase()

  switch (value) {
    case 'fase de grupos':
      return 'Fase de grupos'
    case 'dieciseisavos de final':
      return 'Dieciseisavos de final'
    case 'octavos de final':
      return 'Octavos de final'
    case 'cuartos de final':
      return 'Cuartos de final'
    case 'semifinal':
      return 'Semifinal'
    case 'final':
      return 'Final'
    default:
      return 'Fase de grupos'
  }
}

export function isGroupStageRound(round?: string | null) {
  return normalizeRoundValue(round) === 'Fase de grupos'
}
