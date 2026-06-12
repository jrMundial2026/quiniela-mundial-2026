import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getMatchStatusClass, getMatchStatusLabel } from '../lib/matchStatus'
import { getTeamFlagEmoji } from '../lib/teamFlags'
import { buildStandings, formatMatchScore } from '../lib/scoring'
import type { Match, Player, Prediction, StandingRow } from '../types'

const GROUP_OPTIONS = ['ALL', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

function sortByKickoff(a: Match, b: Match) {
  const aTime = a.kickoff_at ? new Date(a.kickoff_at).getTime() : Number.POSITIVE_INFINITY
  const bTime = b.kickoff_at ? new Date(b.kickoff_at).getTime() : Number.POSITIVE_INFINITY
  return aTime - bTime
}

function MatchCard({ match }: { match: Match }) {
  return (
    <div className="match-item worldcup-match-item">
      <div className="match-topline worldcup-match-topline">
        <div className="match-team match-team-home">
          <span className="team-flag" aria-hidden="true">{getTeamFlagEmoji(match.home_team)}</span>
          <strong>{match.home_team}</strong>
        </div>
        <span className="match-score">{formatMatchScore(match)}</span>
        <div className="match-team match-team-away">
          <strong>{match.away_team}</strong>
          <span className="team-flag" aria-hidden="true">{getTeamFlagEmoji(match.away_team)}</span>
        </div>
      </div>
      <div className="match-meta worldcup-match-meta">
        <span className="group-badge">{match.round ?? 'Sin ronda'}</span>
        <span className="group-badge group-badge-amber">{match.group_letter ? `Grupo ${match.group_letter}` : 'Sin grupo'}</span>
        <span className={getMatchStatusClass(match.status)}>{getMatchStatusLabel(match.status)}</span>
        <span>{match.kickoff_at ? new Date(match.kickoff_at).toLocaleString('es-MX') : 'Sin fecha'}</span>
      </div>
    </div>
  )
}

export default function PublicTablePage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<(typeof GROUP_OPTIONS)[number]>('ALL')

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

  const standings = useMemo<StandingRow[]>(() => buildStandings(players, matches, predictions), [players, matches, predictions])

  const groupMatches = useMemo(() => {
    const groupFiltered = matches.filter((match) => {
      if (match.round !== 'Fase de grupos') return false
      if (selectedGroup === 'ALL') return true
      return match.group_letter === selectedGroup
    })

    return [...groupFiltered].sort(sortByKickoff)
  }, [matches, selectedGroup])

  const upcomingMatches = useMemo(
    () => groupMatches.filter((match) => match.status !== 'finished'),
    [groupMatches]
  )

  const finishedMatches = useMemo(
    () => groupMatches.filter((match) => match.status === 'finished'),
    [groupMatches]
  )

  return (
    <section className="panel">
      <div className="section-header hero-header">
        <div>
          <h1>Tabla general</h1>
          <p>Se actualiza sola cuando cambias resultados o pronósticos desde admin.</p>
        </div>
        <div className="header-tools">
          <div className="pill">URL pública: #/tabla</div>
          <label className="group-filter">
            <span>Grupo</span>
            <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value as (typeof GROUP_OPTIONS)[number])}>
              <option value="ALL">Todos los grupos</option>
              {GROUP_OPTIONS.filter((group) => group !== 'ALL').map((group) => (
                <option key={group} value={group}>Grupo {group}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? <div className="state-box">Cargando datos...</div> : null}
      {error ? <div className="state-box error">{error}</div> : null}

      <div className="grid-2 public-grid">
        <div className="card worldcup-card">
          <h2>Clasificación</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jugador</th>
                  <th>Puntos</th>
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
                    <tr key={row.player_id} className={index < 3 ? `rank-${index + 1}` : ''}>
                      <td>{index + 1}</td>
                      <td>{row.name}</td>
                      <td>{row.points}</td>
                      <td>{row.correct_results}</td>
                      <td>{row.predictions}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card worldcup-card">
          <div className="card-title-row">
            <div>
              <h2>Partidos del grupo</h2>
              <p>Arriba ves los próximos y abajo los resultados ya finalizados.</p>
            </div>
            <div className="pill">{selectedGroup === 'ALL' ? 'Todos los grupos' : `Grupo ${selectedGroup}`}</div>
          </div>

          <div className="match-section">
            <div className="match-section-header">
              <h3>Próximos partidos</h3>
              <span className="selection-summary">{upcomingMatches.length} por jugar</span>
            </div>
            <div className="match-list worldcup-match-list">
              {upcomingMatches.length === 0 ? (
                <div className="empty-row">Todavía no hay partidos pendientes para este grupo.</div>
              ) : (
                upcomingMatches.map((match) => <MatchCard key={match.id} match={match} />)
              )}
            </div>
          </div>

          <div className="match-section">
            <div className="match-section-header">
              <h3>Resultados</h3>
              <span className="selection-summary">{finishedMatches.length} finalizados</span>
            </div>
            <div className="match-list worldcup-match-list">
              {finishedMatches.length === 0 ? (
                <div className="empty-row">Todavía no hay resultados para este grupo.</div>
              ) : (
                finishedMatches.map((match) => <MatchCard key={match.id} match={match} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
