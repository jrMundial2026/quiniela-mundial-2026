import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildStandings, formatMatchScore, getOutcomeLabel } from '../lib/scoring'
import { WORLD_CUP_GROUPS, isGroupStageRound } from '../lib/worldcup'
import type { Match, Player, Prediction, StandingRow } from '../types'

const statusLabel: Record<string, string> = {
  scheduled: 'Pendiente',
  live: 'En vivo',
  in_play: 'En vivo',
  finished: 'Finalizado',
  postponed: 'Pospuesto',
  cancelled: 'Cancelado',
}

const statusClass: Record<string, string> = {
  scheduled: 'status-scheduled',
  live: 'status-live',
  in_play: 'status-live',
  finished: 'status-finished',
  postponed: 'status-postponed',
  cancelled: 'status-cancelled',
}

function getStatusText(status?: string) {
  return statusLabel[status ?? ''] ?? 'Pendiente'
}

function getStatusBadgeClass(status?: string) {
  return statusClass[status ?? ''] ?? 'status-scheduled'
}

function getPredictionText(pred: Prediction) {
  if (pred.prediction_result) {
    return getOutcomeLabel(pred.prediction_result)
  }

  if (typeof pred.home_goals === 'number' && typeof pred.away_goals === 'number') {
    return `${pred.home_goals} - ${pred.away_goals}`
  }

  return 'Sin elegir'
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

function getOutcomeFromMatch(match: Match) {
  if (typeof match.home_goals !== 'number' || typeof match.away_goals !== 'number') return null

  if (match.home_goals > match.away_goals) return 'HOME'
  if (match.home_goals < match.away_goals) return 'AWAY'
  return 'DRAW'
}

function getPredictionOutcome(pred: Prediction) {
  const normalizedPrediction = normalizeOutcome(pred.prediction_result)
  if (normalizedPrediction) return normalizedPrediction

  if (typeof pred.home_goals === 'number' && typeof pred.away_goals === 'number') {
    if (pred.home_goals > pred.away_goals) return 'HOME'
    if (pred.home_goals < pred.away_goals) return 'AWAY'
    return 'DRAW'
  }

  return null
}

function getPredictionVerdict(pred: Prediction, match: Match) {
  if (match.status !== 'finished') return null

  const actualOutcome = getOutcomeFromMatch(match)
  const predictedOutcome = getPredictionOutcome(pred)

  if (!actualOutcome || !predictedOutcome) return null

  return actualOutcome === predictedOutcome
}

function getMostrarMarcador(pred: Prediction, match: Match){
  if (match.status !== 'live' && match.status !== 'finished') {
    return null
  }
  else{
    return true
  }
}

function getEquipoPrediccion(pred: Prediction, match: Match){
  if (pred.prediction_result === "HOME"){
    return match.home_team
  }
  else if (pred.prediction_result === "DRAW"){
    return null
  }
  else if (pred.prediction_result === "AWAY"){
    return match.away_team
  }
  else {
    return null
  }
}

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


function getLocalDateKey(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-CA')
}

export default function PublicTablePage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<(typeof WORLD_CUP_GROUPS)[number]>('A')
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)

  const openGroupModal = () => {
    setIsGroupModalOpen(true)
    window.history.pushState({ modal: 'group' }, '')
  }

  const closeGroupModal = () => {
    setIsGroupModalOpen(false)
    if (window.history.state?.modal === 'group') {
      window.history.back()
    }
  }

  const openPlayerModal = (playerId: string) => {
    setSelectedPlayerId(playerId)
    window.history.pushState({ modal: 'player' }, '')
  }

  const closePlayerModal = () => {
    setSelectedPlayerId(null)
    if (window.history.state?.modal === 'player') {
      window.history.back()
    }
  }

  async function loadData() {
    setLoading(true)
    setError(null)

    const [playersRes, matchesRes, predictionsRes] = await Promise.all([
      supabase.from('players').select('*').range(0,5000).order('name', { ascending: true }),
      supabase.from('matches').select('*').range(0,5000).order('kickoff_at', { ascending: false, nullsFirst: false }),
      supabase.from('predictions').select('*').range(0,5000),
    ])

    if (playersRes.error || matchesRes.error || predictionsRes.error) {
      setError(
        playersRes.error?.message || matchesRes.error?.message || predictionsRes.error?.message || 'No se pudo cargar la información.'
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
      .channel('public-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, loadData)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!isGroupModalOpen && !selectedPlayerId) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (selectedPlayerId) {
        closePlayerModal()
        return
      }

      if (isGroupModalOpen) {
        closeGroupModal()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isGroupModalOpen, selectedPlayerId])

  useEffect(() => {
    const onPopState = () => {
      if (selectedPlayerId) {
        setSelectedPlayerId(null)
        return
      }

      if (isGroupModalOpen) {
        setIsGroupModalOpen(false)
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isGroupModalOpen, selectedPlayerId])

  const standings = useMemo<StandingRow[]>(() => buildStandings(players, matches, predictions), [players, matches, predictions])

  const matchById = useMemo(() => new Map(matches.map((match) => [match.id, match] as const)), [matches])

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  )

  const selectedPlayerPredictions = useMemo(() => {
    if (!selectedPlayerId) return [] as Array<{ pred: Prediction; match: Match }>

    const items: Array<{ pred: Prediction; match: Match }> = []

    for (const pred of predictions) {
      if (pred.player_id !== selectedPlayerId) continue
      const match = matchById.get(pred.match_id)
      if (!match) continue
      items.push({ pred, match })
    }

    items.sort((a, b) => {
      const aTime = new Date(a.match.kickoff_at ?? 0).getTime()
      const bTime = new Date(b.match.kickoff_at ?? 0).getTime()
      return aTime - bTime
    })

    return items
  }, [predictions, selectedPlayerId, matchById])

  const groupMatches = useMemo(
    () =>
      matches.filter((match) => isGroupStageRound(match.round) && (match.group_letter ?? '').toUpperCase() === selectedGroup),
    [matches, selectedGroup]
  )

  const upcomingGroupMatches = useMemo(
    () =>
      [...groupMatches]
        .filter((match) => match.status !== 'finished')
        .sort((a, b) => new Date(a.kickoff_at ?? 0).getTime() - new Date(b.kickoff_at ?? 0).getTime()),
    [groupMatches]
  )

  const finishedGroupMatches = useMemo(
    () =>
      [...groupMatches]
        .filter((match) => match.status === 'finished')
        .sort((a, b) => new Date(b.kickoff_at ?? 0).getTime() - new Date(a.kickoff_at ?? 0).getTime()),
    [groupMatches]
  )

  const liveMatches = useMemo(
    () =>
      [...matches]
        .filter((match) => match.status === 'live')
        .sort((a, b) => new Date(a.kickoff_at ?? 0).getTime() - new Date(b.kickoff_at ?? 0).getTime()),
    [matches]
  )

  const todayMatches = useMemo(
    () => {
      const todayKey = getLocalDateKey(new Date().toISOString())
      if (!todayKey) return [] as Match[]

      return [...matches]
        .filter((match) => getLocalDateKey(match.kickoff_at) === todayKey)
        .sort((a, b) => new Date(a.kickoff_at ?? 0).getTime() - new Date(b.kickoff_at ?? 0).getTime())
    },
    [matches]
  )

  const groupModalBody = (
    <div className="modal-card group-modal-card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div>
          <h3>Resultados, partidos en vivo y próximos</h3>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={closeGroupModal}>
            Cerrar
          </button>
        </div>
      </div>

      <label className="group-picker group-picker-modal">
        
        <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value as (typeof WORLD_CUP_GROUPS)[number])}>
          {WORLD_CUP_GROUPS.map((group) => (
            <option key={group} value={group}>
              Grupo {group}
            </option>
          ))}
        </select>
      </label>

      <div className="match-section">
        <h3>Próximos partidos</h3>
        <div className="match-list match-list-compact">
          {upcomingGroupMatches.length === 0 ? (
            <div className="empty-row">No hay partidos próximos para este grupo.</div>
          ) : (
            upcomingGroupMatches.map((match) => (
              <div key={match.id} className="match-item match-item-modern">
                <div className="match-topline match-topline-modern">
                  <div className="team-block">
                    <strong>{match.home_team} vs {match.away_team}</strong>
                    {/* {match.round ?? 'Fase de grupos'} · */}
                    <span> Grupo {match.group_letter ?? selectedGroup} · {formatKickoff(match.kickoff_at)}</span>
                  </div>

                  <div className="prediction-side">
                      <span className={`status-badge ${getStatusBadgeClass(match.status)}`}>
                        {getStatusText(match.status)}
                      </span>
                      <span className="prediction-score">Marcador {formatMatchScore(match)}</span>
                    </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="match-section">
        <h3>Resultados</h3>
        <div className="match-list match-list-compact">
          {finishedGroupMatches.length === 0 ? (
            <div className="empty-row">Todavía no hay resultados para este grupo.</div>
          ) : (
            finishedGroupMatches.map((match) => (
              <div key={match.id} className="match-item match-item-modern">
                <div className="match-topline match-topline-modern">
                  <div className="team-block">
                    <strong>{match.home_team} vs {match.away_team}</strong>
                    {/* {match.round ?? 'Fase de grupos'} · */}
                    <span> Grupo {match.group_letter ?? selectedGroup} · {formatKickoff(match.kickoff_at)}</span>
                  </div>

                  <div className="prediction-side">
                      <span className={`status-badge ${getStatusBadgeClass(match.status)}`}>
                        {getStatusText(match.status)}
                      </span>
                      <span className="prediction-score">Marcador {formatMatchScore(match)}</span>
                    </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h1>Tabla general</h1>
          <p>Se actualiza en tiempo real, cuando haya partidos en vivo, los aciertos cambian conforme el marcador!</p>
        </div>
        <div className="section-actions">
          <button
            type="button"
            className="ghost-button group-open-button"
            onClick={openGroupModal}
          >
            Ver resultados y proximos partidos por grupo
          </button>
        </div>
      </div>

      {loading ? <div className="state-box">Cargando datos...</div> : null}
      {error ? <div className="state-box error">{error}</div> : null}

      {liveMatches.length > 0 ? (
        <div className="card card-hero">
          <div className="card-headline">
            <h2>Partidos en vivo</h2>
          </div>

          <div className="match-list match-list-compact">
            {liveMatches.map((match) => (
              <div key={match.id} className="match-item match-item-modern">
                <div className="match-topline match-topline-modern">
                  <div className="team-block">
                    <strong>{match.home_team} vs {match.away_team}</strong>
                    <span>
                      {match.round ?? 'Fase de grupos'}
                      {match.group_letter ? ` · Grupo ${match.group_letter}` : ''}
                      {' · '}
                      {formatKickoff(match.kickoff_at)}
                    </span>
                  </div>

                  <div className="prediction-side">
                    <span className={`status-badge ${getStatusBadgeClass(match.status)}`}>
                      {getStatusText(match.status)}
                    </span>
                    <span className="prediction-score">Marcador {formatMatchScore(match)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

        <div className="card card-hero">
          <div className="card-headline">
            <h2>Clasificación</h2>
            <p>Ordenada por aciertos totales.</p>
          </div>

          <div className="table-wrap table-strong">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Participante</th>
                  <th>Aciertos</th>
                  <th>Pronósticos</th>
                </tr>
              </thead>
              <tbody>
                {standings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-row">Todavía no hay datos.</td>
                  </tr>
                ) : (
                  standings.map((row, index) => (
                    <tr key={row.player_id}>
                      <td className="rank-cell">
  <span className={
    index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : ''
  }>
    {index + 1}
  </span>
</td>
                      <td className="player-name-cell">{row.name}</td>
                      <td>{row.correct_results}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button table-action-button"
                          onClick={() => openPlayerModal(row.player_id)}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        

      {isGroupModalOpen ? (
        <div className="modal-backdrop" onClick={closeGroupModal}>
          {groupModalBody}
        </div>
      ) : null}

      {selectedPlayer ? (
        <div className="modal-backdrop" onClick={closePlayerModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Pronósticos de {selectedPlayer.name}</h3>
                <p>{selectedPlayerPredictions.length} pronósticos registrados</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closePlayerModal}>
                  Cerrar
                </button>
              </div>
            </div>

  

            {selectedPlayerPredictions.length === 0 ? (
              <div className="empty-row">Todavía no tiene pronósticos.</div>
            ) : (
              <div className="prediction-list">
                {selectedPlayerPredictions.map(({ pred, match }) => {
                  const verdict = getPredictionVerdict(pred, match)
                  const mostrarMarcadorPredicciones = getMostrarMarcador(pred,match)
                  const mostrarEquipoPrediccion =getEquipoPrediccion(pred,match)
                  return (
                    <div key={pred.id} className="prediction-row">
                      <div className="prediction-main">
                        <strong>
                          {match.home_team} vs {match.away_team}
                        </strong>
                        <span>
                          {match.round ?? 'Fase de grupos'}
                          {match.group_letter ? ` · Grupo ${match.group_letter}` : ''}
                          {' · '}
                          {formatKickoff(match.kickoff_at)}
                        </span>
                      </div>

                      <div className="prediction-side">
                        <span className={`status-badge ${getStatusBadgeClass(match.status)}`}>
                          {getStatusText(match.status)}
                        </span>
                        <span className="prediction-value">Pronóstico: {getPredictionText(pred)} {mostrarEquipoPrediccion !== null ? (
                          <span className="prediction-value">{mostrarEquipoPrediccion}</span>
                        ): null}
                          
                        </span>
                        {verdict !== null ? (
                          <span
                            className="prediction-verdict"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '999px',
                              padding: '0.25rem 0.65rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              letterSpacing: '0.01em',
                              background: verdict ? 'rgba(34, 197, 94, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                              color: verdict ? '#86efac' : '#fca5a5',
                              border: verdict ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                            }}
                          >
                            {verdict ? 'Acertó pronóstico' : 'No acertó pronóstico'}
                          </span>
                        ) : null}
                        {mostrarMarcadorPredicciones !== null ? (
                          <span className="prediction-score">Marcador {formatMatchScore(match)}</span>
                        ): null}
                        
                        
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
