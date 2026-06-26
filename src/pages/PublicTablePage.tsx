import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildStandings, formatMatchScore, getOutcomeLabel } from '../lib/scoring'
import { WORLD_CUP_GROUPS, isGroupStageRound } from '../lib/worldcup'
import type { Match, Player, Prediction, StandingRow } from '../types'



type ConfettiParticle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  rotationSpeed: number
  color: string
  shape: 'circle' | 'square'
  life: number
  ttl: number
}

const winnerConfettiColors = ['#60a5fa', '#22c55e', '#facc15', '#f97316', '#ef4444', '#a855f7', '#f8fafc']

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function WinnerCelebration({ winnerName }: { winnerName: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (winnerName) setIsVisible(true)
  }, [winnerName])

  useEffect(() => {
    if (!winnerName || !isVisible) return

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let width = window.innerWidth
    let height = window.innerHeight
    let animationFrame = 0
    let interval: ReturnType<typeof window.setInterval> | null = null
    const particles: ConfettiParticle[] = []
    const animationEnd = Date.now() + 15 * 1000

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const addFirework = (side: 'left' | 'right') => {
      const fromLeft = side === 'left'
      const originX = fromLeft ? randomInRange(width * 0.04, width * 0.16) : randomInRange(width * 0.84, width * 0.96)
      const originY = randomInRange(height * 0.08, height * 0.32)
      const direction = fromLeft ? 1 : -1

      for (let index = 0; index < 58; index += 1) {
        particles.push({
          x: originX,
          y: originY,
          vx: direction * randomInRange(2.2, 8.8),
          vy: randomInRange(-8.5, 4.5),
          size: randomInRange(3, 8),
          rotation: randomInRange(0, Math.PI * 2),
          rotationSpeed: randomInRange(-0.22, 0.22),
          color: winnerConfettiColors[Math.floor(Math.random() * winnerConfettiColors.length)],
          shape: Math.random() > 0.5 ? 'circle' : 'square',
          life: 0,
          ttl: randomInRange(80, 135),
        })
      }
    }

    const drawParticle = (particle: ConfettiParticle) => {
      const opacity = Math.max(1 - particle.life / particle.ttl, 0)
      context.globalAlpha = opacity
      context.fillStyle = particle.color
      context.save()
      context.translate(particle.x, particle.y)
      context.rotate(particle.rotation)

      if (particle.shape === 'circle') {
        context.beginPath()
        context.arc(0, 0, particle.size / 2, 0, Math.PI * 2)
        context.fill()
      } else {
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size)
      }

      context.restore()
      context.globalAlpha = 1
    }

    const tick = () => {
      context.clearRect(0, 0, width, height)

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index]
        particle.life += 1
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.09
        particle.vx *= 0.992
        particle.rotation += particle.rotationSpeed

        drawParticle(particle)

        if (particle.life >= particle.ttl || particle.y > height + 20) {
          particles.splice(index, 1)
        }
      }

      if (Date.now() < animationEnd || particles.length > 0) {
        animationFrame = window.requestAnimationFrame(tick)
      }
    }

    resizeCanvas()
    addFirework('left')
    addFirework('right')
    interval = window.setInterval(() => {
      if (Date.now() >= animationEnd) {
        if (interval) window.clearInterval(interval)
        interval = null
        return
      }

      addFirework('left')
      addFirework('right')
    }, 450)
    animationFrame = window.requestAnimationFrame(tick)
    window.addEventListener('resize', resizeCanvas)

    return () => {
      if (interval) window.clearInterval(interval)
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [winnerName, isVisible])

  if (!winnerName || !isVisible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'radial-gradient(circle at top, rgba(59, 130, 246, 0.18), rgba(2, 6, 23, 0.78))',
        backdropFilter: 'blur(8px)',
      }}
      aria-live="polite"
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: 'min(92vw, 560px)',
          borderRadius: '28px',
          padding: '2rem',
          textAlign: 'center',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.88))',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ fontSize: '4rem', lineHeight: 1 }}>🏆</div>
        <p style={{ margin: '0.8rem 0 0', color: '#bfdbfe', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Ganador de la quiniela
        </p>
        <h2 style={{ margin: '0.6rem 0 0', fontSize: 'clamp(2.2rem, 7vw, 4rem)', color: '#f8fafc', lineHeight: 1 }}>
          Felicidades {winnerName}
        </h2>
        <p style={{ margin: '0.9rem auto 0', maxWidth: '36rem', color: '#cbd5e1', fontSize: '1rem' }}>
          ¡Campeón de la Quiniela del Mundial!
        </p>
        <button
          type="button"
          className="ghost-button"
          style={{ marginTop: '1.5rem' }}
          onClick={() => setIsVisible(false)}
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

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

function isPendingOrLiveMatch(match: Match) {
  const status = (match.status ?? 'scheduled').toLowerCase()
  return status === 'scheduled' || status === 'live' || status === 'in_play'
}

type VictoryPathStatus =
  | 'leader'
  | 'can_overtake'
  | 'can_tie'
  | 'ties_current_leader'
  | 'needs_combination'
  | 'out_of_reach'

function getVictoryPathStatusLabel(status: VictoryPathStatus) {
  switch (status) {
    case 'leader':
      return 'Líder actual'
    case 'can_overtake':
      return 'Puede Ganar'
    case 'can_tie':
      return 'Puede empatar al líder'
    case 'ties_current_leader':
      return 'Ya no le alcanza'
    case 'needs_combination':
      return 'Ya no le alcanza'
    case 'out_of_reach':
      return 'Ya no le alcanza'
    default:
      return ''
  }
}

function getVictoryPathStatusClass(status: VictoryPathStatus) {
  switch (status) {
    case 'leader':
      return 'status-leader'
    case 'can_overtake':
      return 'status-live'
    case 'can_tie':
      return 'status-cantie'
    case 'ties_current_leader':
      return 'status-scheduled'
    case 'needs_combination':
      return 'status-scheduled'
    case 'out_of_reach':
      return 'status-cancelled'
    default:
      return 'status-scheduled'
  }
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
  const [isVictoryPathModalOpen, setIsVictoryPathModalOpen] = useState(false)
  const [winnerName, setWinnerName] = useState('')

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

  const openVictoryPathModal = () => {
    setIsVictoryPathModalOpen(true)
    window.history.pushState({ modal: 'victoryPath' }, '')
  }

  const closeVictoryPathModal = () => {
    setIsVictoryPathModalOpen(false)
    if (window.history.state?.modal === 'victoryPath') {
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

    const [playersRes, matchesRes, predictionsRes, winnerRes] = await Promise.all([
      supabase.from('players').select('*').range(0,5000).order('name', { ascending: true }),
      supabase.from('matches').select('*').range(0,5000).order('kickoff_at', { ascending: false, nullsFirst: false }),
      supabase.from('predictions').select('*').range(0,5000),
      supabase.from('app_settings').select('value').eq('key', 'winner_name').maybeSingle(),
    ])

    if (playersRes.error || matchesRes.error || predictionsRes.error) {
      setError(
        playersRes.error?.message || matchesRes.error?.message || predictionsRes.error?.message || 'No se pudo cargar la información.'
      )
    } else {
      setPlayers((playersRes.data as Player[]) ?? [])
      setMatches((matchesRes.data as Match[]) ?? [])
      setPredictions((predictionsRes.data as Prediction[]) ?? [])

      const rawWinnerName = ((winnerRes.data as { value?: string } | null)?.value ?? '').trim()

      setWinnerName(
        rawWinnerName && rawWinnerName.toUpperCase() !== 'SIN_GANADOR'
          ? rawWinnerName
          : ''
      )
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, loadData)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!isGroupModalOpen && !selectedPlayerId && !isVictoryPathModalOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (selectedPlayerId) {
        closePlayerModal()
        return
      }

      if (isVictoryPathModalOpen) {
        closeVictoryPathModal()
        return
      }

      if (isGroupModalOpen) {
        closeGroupModal()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isGroupModalOpen, selectedPlayerId, isVictoryPathModalOpen])

  useEffect(() => {
    const onPopState = () => {
      if (selectedPlayerId) {
        setSelectedPlayerId(null)
        return
      }

      if (isVictoryPathModalOpen) {
        setIsVictoryPathModalOpen(false)
        return
      }

      if (isGroupModalOpen) {
        setIsGroupModalOpen(false)
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isGroupModalOpen, selectedPlayerId, isVictoryPathModalOpen])

  const standings = useMemo<StandingRow[]>(() => buildStandings(players, matches, predictions), [players, matches, predictions])

  const matchById = useMemo(() => new Map(matches.map((match) => [match.id, match] as const)), [matches])

  const predictionsByPlayerAndMatch = useMemo(() => {
    const map = new Map<string, Map<string, Prediction>>()

    for (const pred of predictions) {
      const playerMap = map.get(pred.player_id) ?? new Map<string, Prediction>()
      playerMap.set(pred.match_id, pred)
      map.set(pred.player_id, playerMap)
    }

    return map
  }, [predictions])

  const victoryPathRows = useMemo(() => {
    const leader = standings[0]
    if (!leader) return [] as Array<{
      player_id: string
      name: string
      rank: number
      currentHits: number
      gap: number
      samePending: number
      differentPending: number
      missingPending: number
      maxReach: number
      canCatch: boolean
      pathStatus: VictoryPathStatus
      isLeader: boolean
    }>

    const leaderPredictions = predictionsByPlayerAndMatch.get(leader.player_id) ?? new Map<string, Prediction>()

    return standings.map((row, index) => {
      if (row.player_id === leader.player_id) {
        return {
          player_id: row.player_id,
          name: row.name,
          rank: index + 1,
          currentHits: row.correct_results,
          gap: 0,
          samePending: 0,
          differentPending: 0,
          missingPending: 0,
          maxReach: row.correct_results,
          canCatch: true,
          pathStatus: 'leader' as VictoryPathStatus,
          isLeader: true,
        }
      }

      const playerPredictions = predictionsByPlayerAndMatch.get(row.player_id) ?? new Map<string, Prediction>()
      let samePending = 0
      let differentPending = 0
      let missingPending = 0

      for (const match of matches) {
        if (!isPendingOrLiveMatch(match)) continue

        const leaderPred = leaderPredictions.get(match.id)
        const playerPred = playerPredictions.get(match.id)
        const leaderOutcome = leaderPred ? getPredictionOutcome(leaderPred) : null
        const playerOutcome = playerPred ? getPredictionOutcome(playerPred) : null

        if (!leaderOutcome || !playerOutcome) {
          missingPending += 1
          continue
        }

        if (leaderOutcome === playerOutcome) {
          samePending += 1
        } else {
          differentPending += 1
        }
      }

      const gap = Math.max(leader.correct_results - row.correct_results, 0)
      const maxReach = row.correct_results + samePending + differentPending

      let pathStatus: VictoryPathStatus = 'needs_combination'

      if (maxReach < leader.correct_results) {
        pathStatus = 'out_of_reach'
      } else if (maxReach === leader.correct_results) {
        pathStatus = 'ties_current_leader'
      } else if (differentPending > gap) {
        pathStatus = 'can_overtake'
      } else if (differentPending === gap) {
        pathStatus = 'can_tie'
      }

      return {
        player_id: row.player_id,
        name: row.name,
        rank: index + 1,
        currentHits: row.correct_results,
        gap,
        samePending,
        differentPending,
        missingPending,
        maxReach,
        canCatch: differentPending >= gap,
        pathStatus,
        isLeader: false,
      }
    })
  }, [standings, predictionsByPlayerAndMatch, matches])

  const leaderName = standings[0]?.name ?? 'primer lugar'

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

  const victoryPathModalBody = (
    <div className="modal-card group-modal-card" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div>
          <h3>Posibilidad de victoria</h3>
          {/* <p>Comparativo contra {leaderName}. Solo se consideran partidos pendientes o en vivo.</p> */}
          <p>Comparativo contra el líder actual. Solo se consideran partidos pendientes o en vivo.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={closeVictoryPathModal}>
            Cerrar
          </button>
        </div>
      </div>

      <div className="match-section">
        <div className="table-wrap table-strong" style={{ marginTop: '0.9rem' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Participante</th>
                <th>Aciertos</th>
                <th>Por remontar</th>
                <th>Iguales vs líder</th>
                <th>Diferentes vs líder</th>
                <th>Posibilidad</th>
              </tr>
            </thead>
            <tbody>
              {victoryPathRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-row">Todavía no hay datos.</td>
                </tr>
              ) : (
                victoryPathRows.map((row) => (
                  <tr
                    key={row.player_id}
                    style={row.rank === 1 ? { background: 'rgba(212, 175, 55, 0.10)' } : row.rank === 2 ? { background: 'rgba(187, 194, 204, 0.10)' } : row.rank === 3 ? { background: 'rgba(205, 127, 50, 0.10)' } : undefined}
                  >
                    <td className="rank-cell">
  <span className={
    row.rank === 1 ? 'rank-1' : row.rank === 2 ? 'rank-2' : row.rank === 3 ? 'rank-3' : ''
  }>
    {row.rank}
  </span>
</td>
                    <td className="player-name-cell">{row.name}</td>
                    <td>{row.currentHits}</td>
                    <td>{row.isLeader ? '-' : row.gap}</td>
                    <td>{row.isLeader ? '-' : row.samePending}</td>
                    <td>{row.isLeader ? '-' : row.differentPending}</td>
                    <td>
                      <span className={`status-badge ${getVictoryPathStatusClass(row.pathStatus)}`}>
                        {getVictoryPathStatusLabel(row.pathStatus)}
                      </span>
                      {!row.isLeader && row.missingPending > 0 ? (
                        <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.75rem', opacity: 0.75 }}>
                          Sin comparar: {row.missingPending}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
      {winnerName ? <WinnerCelebration winnerName={winnerName} /> : null}
      <div className="section-header">
        <div>
          <h1>Tabla genera</h1>
          <p>Se actualiza en tiempo real, cuando haya partidos en vivo, los aciertos cambian conforme el marcador!</p>
        </div>
        <div className="section-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <button
            type="button"
            className="ghost-button group-open-button"
            onClick={openGroupModal}
          >
            Ver resultados y proximos partidos por grupo
          </button>
          <button
            type="button"
            className="ghost-button group-open-button"
            onClick={openVictoryPathModal}
          >
            Posibilidad de Victoria
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
                    <tr
                    key={row.player_id}
                    style={index === 0 ? { background: 'rgba(212, 175, 55, 0.10)' } : index === 1 ? { background: 'rgba(187, 194, 204, 0.10)' } : index === 2 ? { background: 'rgba(205, 127, 50, 0.10)' } : undefined}
                  >
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

      {isVictoryPathModalOpen ? (
        <div className="modal-backdrop" onClick={closeVictoryPathModal}>
          {victoryPathModalBody}
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
