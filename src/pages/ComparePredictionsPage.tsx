import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatMatchScore } from '../lib/scoring'
import type { Match, Player, Prediction, PredictionOutcome } from '../types'

type ComparisonFilter = 'all' | 'same' | 'different'
type ComparisonRelation = 'same' | 'different' | 'single'

function formatKickoff(kickoffAt: string | null) {
  if (!kickoffAt) return 'Sin fecha'

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(kickoffAt))
}

function normalizeOutcome(value?: string | null) {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (!normalized) return null

  if (['home', 'local', 'gana local', '1'].includes(normalized)) return 'HOME'
  if (['draw', 'empate', 'x', 'tie'].includes(normalized)) return 'DRAW'
  if (['away', 'visita', 'visitante', 'gana visita', '2'].includes(normalized)) return 'AWAY'

  return null
}

function getPredictionOutcome(pred: Prediction | null) {
  if (!pred) return null

  const normalizedPrediction = normalizeOutcome(pred.prediction_result)
  if (normalizedPrediction) return normalizedPrediction

  if (typeof pred.home_goals === 'number' && typeof pred.away_goals === 'number') {
    if (pred.home_goals > pred.away_goals) return 'HOME'
    if (pred.home_goals < pred.away_goals) return 'AWAY'
    return 'DRAW'
  }

  return null
}

function getPredictionVerdictLabel(pred: Prediction | null, match: Match | null) {
  if (!pred || !match || match.status !== 'finished') return null

  const actualOutcome = getOutcomeFromMatch(match)
  const predictedOutcome = getPredictionOutcome(pred)

  if (!actualOutcome || !predictedOutcome) return null

  return actualOutcome === predictedOutcome ? 'Acertó' : 'No acertó'
}

function getOutcomeFromMatch(match: Match | null) {
  if (!match || typeof match.home_goals !== 'number' || typeof match.away_goals !== 'number') return null

  if (match.home_goals > match.away_goals) return 'HOME'
  if (match.home_goals < match.away_goals) return 'AWAY'
  return 'DRAW'
}

function getPredictionLabel(pred: Prediction | null, match: Match | null) {
  if (!pred) return 'Sin pronóstico'

  if (pred.prediction_result) {
    switch (pred.prediction_result) {
      case 'HOME':
        return `Gana ${match?.home_team ?? 'local'}`
      case 'DRAW':
        return 'Empate'
      case 'AWAY':
        return `Gana ${match?.away_team ?? 'visita'}`
      default:
        return 'Sin elegir'
    }
  }

  if (typeof pred.home_goals === 'number' && typeof pred.away_goals === 'number') {
    return `${pred.home_goals} - ${pred.away_goals}`
  }

  return 'Sin elegir'
}

function getRelationLabel(relation: ComparisonRelation) {
  switch (relation) {
    case 'same':
      return 'Iguales'
    case 'different':
      return 'Diferentes'
    case 'single':
      return 'Solo uno'
    default:
      return ''
  }
}

function getRelationStyle(relation: ComparisonRelation) {
  switch (relation) {
    case 'same':
      return {
        background: 'rgba(34, 197, 94, 0.16)',
        color: '#86efac',
        border: '1px solid rgba(34, 197, 94, 0.35)',
      }
    case 'different':
      return {
        background: 'rgba(251, 191, 36, 0.14)',
        color: '#fde68a',
        border: '1px solid rgba(251, 191, 36, 0.35)',
      }
    case 'single':
      return {
        background: 'rgba(148, 163, 184, 0.12)',
        color: '#cbd5e1',
        border: '1px solid rgba(148, 163, 184, 0.28)',
      }
    default:
      return {}
  }
}

function getFilterButtonStyle(active: boolean) {
  return active
    ? {
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        border: 'none',
        boxShadow: '0 10px 25px rgba(37, 99, 235, 0.25)',
      }
    : {
        background: 'rgba(148, 163, 184, 0.1)',
        border: '1px solid rgba(148, 163, 184, 0.14)',
        boxShadow: 'none',
      }
}

export default function ComparePredictionsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeftPlayerId, setSelectedLeftPlayerId] = useState<string>('')
  const [selectedRightPlayerId, setSelectedRightPlayerId] = useState<string>('')
  const [filter, setFilter] = useState<ComparisonFilter>('all')
  const comparisonListTopRef = useRef<HTMLDivElement | null>(null)

  const changeFilter = (nextFilter: ComparisonFilter) => {
    setFilter(nextFilter)

    window.setTimeout(() => {
      comparisonListTopRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 0)
  }

  async function loadData() {
    setLoading(true)
    setError(null)

    const [playersRes, matchesRes, predictionsRes] = await Promise.all([
      supabase.from('players').select('*').range(0, 5000).order('name', { ascending: true }),
      supabase.from('matches').select('*').range(0, 5000).order('kickoff_at', { ascending: false, nullsFirst: false }),
      supabase.from('predictions').select('*').range(0, 5000),
    ])

    if (playersRes.error || matchesRes.error || predictionsRes.error) {
      setError(
        playersRes.error?.message ||
          matchesRes.error?.message ||
          predictionsRes.error?.message ||
          'No se pudo cargar la información.'
      )
    } else {
      setPlayers((playersRes.data as Player[]) ?? [])
      setMatches((matchesRes.data as Match[]) ?? [])
      setPredictions((predictionsRes.data as Prediction[]) ?? [])
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()

    const channel = supabase
      .channel('compare-predictions-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, loadData)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  const visiblePlayers = useMemo(
    () => {
      const activePlayers = players.filter((player) => player.active)
      return activePlayers.length > 0 ? activePlayers : players
    },
    [players]
  )

  useEffect(() => {
    if (visiblePlayers.length === 0) return

    if (!selectedLeftPlayerId) {
      setSelectedLeftPlayerId(visiblePlayers[0]?.id ?? '')
    }

    if (!selectedRightPlayerId) {
      setSelectedRightPlayerId(visiblePlayers[1]?.id ?? visiblePlayers[0]?.id ?? '')
    }
  }, [visiblePlayers, selectedLeftPlayerId, selectedRightPlayerId])

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player] as const)), [players])

  const predictionsByPlayer = useMemo(() => {
    const map = new Map<string, Prediction[]>()

    for (const pred of predictions) {
      const list = map.get(pred.player_id) ?? []
      list.push(pred)
      map.set(pred.player_id, list)
    }

    return map
  }, [predictions])

  const leftPlayer = playerById.get(selectedLeftPlayerId) ?? null
  const rightPlayer = playerById.get(selectedRightPlayerId) ?? null

  const comparisonRows = useMemo(() => {
    if (!selectedLeftPlayerId || !selectedRightPlayerId || selectedLeftPlayerId === selectedRightPlayerId) {
      return [] as Array<{
        match: Match
        leftPred: Prediction | null
        rightPred: Prediction | null
        leftOutcome: PredictionOutcome | null
        rightOutcome: PredictionOutcome | null
        relation: ComparisonRelation
      }>
    }

    const leftPredictions = predictionsByPlayer.get(selectedLeftPlayerId) ?? []
    const rightPredictions = predictionsByPlayer.get(selectedRightPlayerId) ?? []
    const matchById = new Map(matches.map((match) => [match.id, match] as const))

    const leftByMatch = new Map(leftPredictions.map((pred) => [pred.match_id, pred] as const))
    const rightByMatch = new Map(rightPredictions.map((pred) => [pred.match_id, pred] as const))

    const matchIds = new Set([...leftByMatch.keys(), ...rightByMatch.keys()])
    const rows: Array<{
      match: Match
      leftPred: Prediction | null
      rightPred: Prediction | null
      leftOutcome: PredictionOutcome | null
      rightOutcome: PredictionOutcome | null
      relation: ComparisonRelation
    }> = []

    for (const matchId of matchIds) {
      const match = matchById.get(matchId)
      if (!match) continue

      const leftPred = leftByMatch.get(matchId) ?? null
      const rightPred = rightByMatch.get(matchId) ?? null

      if (!leftPred && !rightPred) continue

      const leftOutcome = getPredictionOutcome(leftPred)
      const rightOutcome = getPredictionOutcome(rightPred)

      let relation: ComparisonRelation = 'single'
      if (leftPred && rightPred && leftOutcome && rightOutcome) {
        relation = leftOutcome === rightOutcome ? 'same' : 'different'
      }

      rows.push({
        match,
        leftPred,
        rightPred,
        leftOutcome,
        rightOutcome,
        relation,
      })
    }

    rows.sort((a, b) => new Date(a.match.kickoff_at ?? 0).getTime() - new Date(b.match.kickoff_at ?? 0).getTime())

    return rows
  }, [matches, predictionsByPlayer, selectedLeftPlayerId, selectedRightPlayerId])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return comparisonRows
    return comparisonRows.filter((row) => row.relation === filter)
  }, [comparisonRows, filter])

  const counts = useMemo(() => {
    const same = comparisonRows.filter((row) => row.relation === 'same').length
    const different = comparisonRows.filter((row) => row.relation === 'different').length
    const single = comparisonRows.filter((row) => row.relation === 'single').length

    return {
      total: comparisonRows.length,
      same,
      different,
      single,
    }
  }, [comparisonRows])

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h1>Comparar pronósticos</h1>
          <p>Selecciona dos participantes y revisa en qué partidos coinciden o difieren.</p>
        </div>
      </div>

      {loading ? <div className="state-box">Cargando datos...</div> : null}
      {error ? <div className="state-box error">{error}</div> : null}

      <div className="card">
        <div className="card-headline">
          <h2>Participantes</h2>
          <p>Elige dos participantes para comparar sus pronósticos.</p>
        </div>

        <div className="row-2" style={{ marginTop: '0.8rem' }}>
          <label>
            Participante 1
            <select value={selectedLeftPlayerId} onChange={(event) => setSelectedLeftPlayerId(event.target.value)}>
              {visiblePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Participante 2
            <select value={selectedRightPlayerId} onChange={(event) => setSelectedRightPlayerId(event.target.value)}>
              {visiblePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedLeftPlayerId && selectedRightPlayerId && selectedLeftPlayerId === selectedRightPlayerId ? (
          <div className="state-box" style={{ marginTop: '0.8rem' }}>
            Elige dos participantes diferentes para comparar.
          </div>
        ) : null}
      </div>

      <div className="card" style={{position: 'sticky',
  top: 0,
  zIndex: 20,
  background: 'var(--card-bg, #0f172a)',
  paddingTop: '8px',
  paddingBottom: '8px',}}>
        <div className="card-headline">
          <h2>Filtro</h2>
          <p>Mostrar:</p>
        </div>

        <div className="inline-actions" style={{ marginTop: '0.8rem' }}>
          <button type="button" onClick={() => changeFilter('all')} style={getFilterButtonStyle(filter === 'all')}>
            Todos
          </button>
          <button type="button" onClick={() => changeFilter('same')} style={getFilterButtonStyle(filter === 'same')}>
            Iguales
          </button>
          <button type="button" onClick={() => changeFilter('different')} style={getFilterButtonStyle(filter === 'different')}>
            Diferentes
          </button>
        </div>

        {/* <div className="inline-actions" style={{ marginTop: '0.8rem' }}>
          <span className="pill">Comparados: {counts.total}</span>
          <span className="pill">Iguales: {counts.same}</span>
          <span className="pill">Diferentes: {counts.different}</span>
          <span className="pill">Solo uno: {counts.single}</span>
        </div> */}
      </div>

      <div ref={comparisonListTopRef} className="card" style={{ scrollMarginTop: '140px' }}>
        
          <h3>{leftPlayer?.name ?? 'Participante 1'} vs {rightPlayer?.name ?? 'Participante 2'}</h3>
       

        <div className="match-list match-list-compact" style={{ marginTop: '0.9rem' }}>
          {selectedLeftPlayerId && selectedRightPlayerId && selectedLeftPlayerId !== selectedRightPlayerId ? (
            filteredRows.length === 0 ? (
              <div className="empty-row">
                No hay coincidencias para este filtro.
              </div>
            ) : (
              filteredRows.map((row) => {
                const leftVerdict = getPredictionVerdictLabel(row.leftPred, row.match)
                const rightVerdict = getPredictionVerdictLabel(row.rightPred, row.match)

                return (
                <div key={row.match.id} className="match-item">
                  <div className="match-topline" >
                      <strong>
                        {row.match.home_team} vs {row.match.away_team}
                      </strong>
                      
                    <div className="prediction-side" style={{ gap: '0.45rem', minWidth: '100px' }}>
                      <span className="prediction-score">Marcador {formatMatchScore(row.match)}</span>
                    </div>
                    
                  </div>
                    <div style={{marginTop: '3px'}}>
                      {filter === 'all' ? (
                        <span className="status-badge" style={getRelationStyle(row.relation)}>
                          {getRelationLabel(row.relation)}
                        </span>
                      ) : null}
                    </div>
                  <div className="grid-2" style={{ marginTop: '0.9rem' }}>
                    <div className="mini-item">
                      <div>
                        <strong>{leftPlayer?.name ?? 'Participante 1'}</strong>
                        <span>{getPredictionLabel(row.leftPred, row.match)}</span>
                        {leftVerdict ? (
                          <span
                            className="prediction-verdict"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '999px',
                              padding: '0.2rem 0.6rem',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              marginTop: '0.45rem',
                              background: leftVerdict === 'Acertó' ? 'rgba(34, 197, 94, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                              color: leftVerdict === 'Acertó' ? '#86efac' : '#fca5a5',
                              border: leftVerdict === 'Acertó' ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                            }}
                          >
                            {leftVerdict}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mini-item">
                      <div>
                        <strong>{rightPlayer?.name ?? 'Participante 2'}</strong>
                        <span>{getPredictionLabel(row.rightPred, row.match)}</span>
                        {rightVerdict ? (
                          <span
                            className="prediction-verdict"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '999px',
                              padding: '0.2rem 0.6rem',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              marginTop: '0.45rem',
                              background: rightVerdict === 'Acertó' ? 'rgba(34, 197, 94, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                              color: rightVerdict === 'Acertó' ? '#86efac' : '#fca5a5',
                              border: rightVerdict === 'Acertó' ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                            }}
                          >
                            {rightVerdict}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                )
              })
            )
          ) : (
            <div className="empty-row">
              Selecciona dos participantes diferentes para ver la comparación.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
