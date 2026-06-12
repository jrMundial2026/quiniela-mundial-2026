export type Player = {
  id: string
  name: string
  active: boolean
  created_at: string
}

export type Match = {
  id: string
  round: string | null
  group_letter: string | null
  kickoff_at: string | null
  home_team: string
  away_team: string
  home_goals: number | null
  away_goals: number | null
  status: 'scheduled' | 'live' | 'finished'
  created_at: string
  updated_at: string
}

export type PredictionOutcome = 'HOME' | 'DRAW' | 'AWAY'

export type Prediction = {
  id: string
  player_id: string
  match_id: string
  prediction_result: PredictionOutcome | null
  // Backward compatibility with the first schema version.
  home_goals?: number | null
  away_goals?: number | null
  created_at: string
  updated_at: string
}

export type StandingRow = {
  player_id: string
  name: string
  points: number
  correct_results: number
  predictions: number
}
