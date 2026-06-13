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

export default function PublicTablePage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<(typeof WORLD_CUP_GROUPS)[number]>('A')
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)

    const [playersRes, matchesRes, predictionsRes] = await Promise.all([
      supabase.from('players').select('*').order('name', { ascending: true }),
      supabase.from('matches').select('*').order('kickoff_at', { ascending: false, nullsFirst: false }),
      supabase.from('predictions').select('*'),
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
    if (!isGroupModalOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsGroupModalOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isGroupModalOpen])

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

  const groupModalBody = (
    <div className="modal-card group-modal-card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div>
          <h3>Resultados y Proximos Partidos Grupo {selectedGroup}</h3>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={() => setIsGroupModalOpen(false)}>
            Cerrar
          </button>
        </div>
      </div>

      <label className="group-picker group-picker-modal">
        <span>Grupo</span>
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
                    <strong>{match.home_team}</strong>
                    <span>{match.round ?? 'Fase de grupos'} · Grupo {match.group_letter ?? selectedGroup}</span>
                  </div>

                  <div className="score-block">
                    <span className="score-value">{formatMatchScore(match)}</span>
                    <span className={`status-badge ${getStatusBadgeClass(match.status)}`}>
                      {getStatusText(match.status)}
                    </span>
                  </div>

                  <div className="team-block team-block-right">
                    <strong>{match.away_team}</strong>
                    <span>{formatKickoff(match.kickoff_at)}</span>
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
                    <strong>{match.home_team}</strong>
                    <span>{match.round ?? 'Fase de grupos'} · Grupo {match.group_letter ?? selectedGroup}</span>
                  </div>

                  <div className="score-block">
                    <span className="score-value">{formatMatchScore(match)}</span>
                    <span className={`status-badge ${getStatusBadgeClass(match.status)}`}>
                      {getStatusText(match.status)}
                    </span>
                  </div>

                  <div className="team-block team-block-right">
                    <strong>{match.away_team}</strong>
                    <span>{formatKickoff(match.kickoff_at)}</span>
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
          <p>Se actualiza al terminar el partido.</p>
        </div>
        <div className="section-actions">
          <button
            type="button"
            className="ghost-button group-open-button"
            onClick={() => setIsGroupModalOpen(true)}
          >
            Ver resultados y proximos partidos por grupo
          </button>
        </div>
      </div>

      {loading ? <div className="state-box">Cargando datos...</div> : null}
      {error ? <div className="state-box error">{error}</div> : null}

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
                      <td className="rank-cell">{index + 1}</td>
                      <td className="player-name-cell">{row.name}</td>
                      <td>{row.correct_results}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button table-action-button"
                          onClick={() => setSelectedPlayerId(row.player_id)}
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
        <div className="modal-backdrop" onClick={() => setIsGroupModalOpen(false)}>
          {groupModalBody}
        </div>
      ) : null}

      {selectedPlayer ? (
        <div className="modal-backdrop" onClick={() => setSelectedPlayerId(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Pronósticos de {selectedPlayer.name}</h3>
                <p>{selectedPlayerPredictions.length} pronósticos registrados</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setSelectedPlayerId(null)}>
                  Cerrar
                </button>
              </div>
            </div>

            {selectedPlayerPredictions.length === 0 ? (
              <div className="empty-row">Todavía no tiene pronósticos.</div>
            ) : (
              <div className="prediction-list">
                {selectedPlayerPredictions.map(({ pred, match }) => (
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
                      <span className="prediction-value">{getPredictionText(pred)}</span>
                      <span className="prediction-score">{formatMatchScore(match)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
