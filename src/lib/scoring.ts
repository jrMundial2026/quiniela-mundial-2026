import type { Match, Player, Prediction, PredictionOutcome, StandingRow } from '../types'

function resultKey(home: number, away: number): PredictionOutcome {
  if (home > away) return 'HOME'
  if (home < away) return 'AWAY'
  return 'DRAW'
}

function normalizePredictionOutcome(pred: Prediction): PredictionOutcome | null {
  if (pred.prediction_result) return pred.prediction_result

  if (typeof pred.home_goals === 'number' && typeof pred.away_goals === 'number') {
    return resultKey(pred.home_goals, pred.away_goals)
  }

  return null
}

function scorePrediction(pred: Prediction, match: Match) {
  if (match.home_goals === null || match.away_goals === null) {
    return { points: 0, correct: false }
  }

  const predictedResult = normalizePredictionOutcome(pred)
  if (!predictedResult) return { points: 0, correct: false }

  const actualResult = resultKey(match.home_goals, match.away_goals)
  const correct = predictedResult === actualResult

  return { points: correct ? 1 : 0, correct }
}

export function buildStandings(players: Player[], matches: Match[], predictions: Prediction[]): StandingRow[] {
  const predByPlayer = new Map<string, Prediction[]>()

  for (const pred of predictions) {
    const list = predByPlayer.get(pred.player_id) ?? []
    list.push(pred)
    predByPlayer.set(pred.player_id, list)
  }

  const matchById = new Map(matches.map((m) => [m.id, m] as const))

  const rows: StandingRow[] = players
    .filter((player) => player.active)
    .map((player) => {
      const playerPreds = predByPlayer.get(player.id) ?? []
      let points = 0
      let correct_results = 0

      for (const pred of playerPreds) {
        const match = matchById.get(pred.match_id)
        if (!match) continue
        const result = scorePrediction(pred, match)
        points += result.points
        if (result.correct) correct_results += 1
      }

      return {
        player_id: player.id,
        name: player.name,
        points,
        correct_results,
        predictions: playerPreds.length,
      }
    })

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.correct_results !== a.correct_results) return b.correct_results - a.correct_results
    return a.name.localeCompare(b.name, 'es')
  })

  return rows
}

export function formatMatchScore(match: Match) {
  if (match.home_goals === null || match.away_goals === null) return 'Pendiente'
  return `${match.home_goals} - ${match.away_goals}`
}

export function getOutcomeLabel(outcome: PredictionOutcome | null | undefined) {
  switch (outcome) {
    case 'HOME':
      return 'Gana local'
    case 'DRAW':
      return 'Empate'
    case 'AWAY':
      return 'Gana visita'
    default:
      return 'Sin elegir'
  }
}
