import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getOutcomeLabel } from '../lib/scoring'
import { WORLD_CUP_GROUPS, WORLD_CUP_ROUNDS, isGroupStageRound, normalizeRoundValue } from '../lib/worldcup'
import type { Match, Player, Prediction, PredictionOutcome } from '../types'

const emptyMatch = {
  id: '',
  round: 'Fase de grupos',
  group_letter: 'A',
  kickoff_at: '',
  home_team: '',
  away_team: '',
  home_goals: '',
  away_goals: '',
  status: 'scheduled' as Match['status'],
}

const emptyPrediction = {
  id: '',
  player_id: '',
  match_id: '',
  prediction_result: '' as '' | PredictionOutcome,
}

function splitBulkEntries(value: string) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function getMatchRoundPayload(round: string | null | undefined) {
  return normalizeRoundValue(round)
}

function isGroupStage(round: string | null | undefined) {
  return isGroupStageRound(round)
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p>Haz los cambios y guarda para actualizar la base.</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose} aria-label="Cerrar ventana">
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [playerName, setPlayerName] = useState('')
  const [bulkPlayers, setBulkPlayers] = useState('')
  const [matchForm, setMatchForm] = useState(emptyMatch)
  const [predictionForm, setPredictionForm] = useState(emptyPrediction)
  const [playerQuery, setPlayerQuery] = useState('')
  const [matchQuery, setMatchQuery] = useState('')
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)

  async function refreshData() {
    const [playersRes, matchesRes, predictionsRes] = await Promise.all([
      supabase.from('players').select('*').order('name', { ascending: true }),
      supabase.from('matches').select('*').order('kickoff_at', { ascending: false, nullsFirst: false }),
      supabase.from('predictions').select('*').order('created_at', { ascending: false }),
    ])

    if (!playersRes.error) setPlayers((playersRes.data as Player[]) ?? [])
    if (!matchesRes.error) setMatches((matchesRes.data as Match[]) ?? [])
    if (!predictionsRes.error) setPredictions((predictionsRes.data as Prediction[]) ?? [])
  }

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
      setSessionReady(true)
      if (data.session) await refreshData()
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUserEmail(session?.user.email ?? null)
      if (session) {
        await refreshData()
      } else {
        setPlayers([])
        setMatches([])
        setPredictions([])
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userEmail) return
    const channel = supabase
      .channel('admin-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, refreshData)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userEmail])

  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player.name] as const)), [players])
  const matchMap = useMemo(
    () => new Map(matches.map((match) => [match.id, `${match.home_team} vs ${match.away_team}`] as const)),
    [matches]
  )

  const filteredPlayers = useMemo(() => {
    const term = playerQuery.trim().toLowerCase()
    if (!term) return players
    return players.filter((player) => player.name.toLowerCase().includes(term))
  }, [players, playerQuery])

  const filteredMatches = useMemo(() => {
    const term = matchQuery.trim().toLowerCase()
    if (!term) return matches
    return matches.filter((match) => {
      const haystack = [match.home_team, match.away_team, match.round ?? '', match.status].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [matches, matchQuery])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setAuthError(error.message)
  }

  async function handleLogout() {
    setBusy(true)
    await supabase.auth.signOut()
    setBusy(false)
  }

  async function createPlayer(name: string) {
    const cleanName = name.trim()
    if (!cleanName) return false

    const { error } = await supabase.from('players').insert({ name: cleanName })
    if (error) {
      setAuthError(error.message)
      return false
    }

    return true
  }

  async function handlePlayerSubmit(e: FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setBusy(true)
    const created = await createPlayer(playerName)
    if (created) {
      setPlayerName('')
      await refreshData()
    }
    setBusy(false)
  }

  async function addBulkPlayers() {
    const names = splitBulkEntries(bulkPlayers)

    if (names.length === 0) return
    setAuthError(null)
    setBusy(true)

    const { error } = await supabase.from('players').upsert(
      names.map((name) => ({ name })),
      { onConflict: 'name' }
    )

    setBusy(false)
    if (!error) {
      setBulkPlayers('')
      await refreshData()
    } else {
      setAuthError(error.message)
    }
  }

  async function savePlayerEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingPlayer) return

    const name = editingPlayer.name.trim()
    if (!name) return

    setAuthError(null)
    setBusy(true)
    const { error } = await supabase
      .from('players')
      .update({ name, active: editingPlayer.active })
      .eq('id', editingPlayer.id)

    setBusy(false)
    if (!error) {
      setEditingPlayer(null)
      await refreshData()
    } else {
      setAuthError(error.message)
    }
  }

  async function togglePlayer(player: Player) {
    setAuthError(null)
    setBusy(true)
    const { error } = await supabase.from('players').update({ active: !player.active }).eq('id', player.id)
    setBusy(false)
    if (!error) await refreshData()
    else setAuthError(error.message)
  }

  async function deletePlayer(player: Player) {
    if (!confirm(`Borrar a ${player.name}?`)) return
    setAuthError(null)
    setBusy(true)
    const { error } = await supabase.from('players').delete().eq('id', player.id)
    setBusy(false)
    if (!error) await refreshData()
    else setAuthError(error.message)
  }

  async function saveMatch(e: FormEvent) {
    e.preventDefault()
    const normalizedRound = getMatchRoundPayload(matchForm.round)
    const payload = {
      round: normalizedRound,
      group_letter: isGroupStage(normalizedRound) ? (matchForm.group_letter || 'A').trim().toUpperCase() : null,
      kickoff_at: matchForm.kickoff_at ? new Date(matchForm.kickoff_at).toISOString() : null,
      home_team: matchForm.home_team.trim(),
      away_team: matchForm.away_team.trim(),
      home_goals: matchForm.home_goals === '' ? null : Number(matchForm.home_goals),
      away_goals: matchForm.away_goals === '' ? null : Number(matchForm.away_goals),
      status: matchForm.status,
    }

    if (!payload.home_team || !payload.away_team) return
    setAuthError(null)
    setBusy(true)
    const query = matchForm.id
      ? supabase.from('matches').update(payload).eq('id', matchForm.id)
      : supabase.from('matches').insert(payload)
    const { error } = await query
    setBusy(false)
    if (!error) {
      setMatchForm(emptyMatch)
      await refreshData()
    } else {
      setAuthError(error.message)
    }
  }

  function openMatchEditor(match: Match) {
    setEditingMatch({
      ...match,
      round: getMatchRoundPayload(match.round),
      group_letter: match.group_letter ?? 'A',
    })
  }

  async function saveMatchEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingMatch) return

    const normalizedRound = getMatchRoundPayload(editingMatch.round)
    const payload = {
      round: normalizedRound,
      group_letter: isGroupStage(normalizedRound) ? (editingMatch.group_letter || 'A').trim().toUpperCase() : null,
      kickoff_at: editingMatch.kickoff_at ? new Date(editingMatch.kickoff_at).toISOString() : null,
      home_team: editingMatch.home_team.trim(),
      away_team: editingMatch.away_team.trim(),
      home_goals: editingMatch.home_goals === null || editingMatch.home_goals === undefined ? null : Number(editingMatch.home_goals),
      away_goals: editingMatch.away_goals === null || editingMatch.away_goals === undefined ? null : Number(editingMatch.away_goals),
      status: editingMatch.status,
    }

    if (!payload.home_team || !payload.away_team) return

    setAuthError(null)
    setBusy(true)
    const { error } = await supabase.from('matches').update(payload).eq('id', editingMatch.id)
    setBusy(false)
    if (!error) {
      setEditingMatch(null)
      await refreshData()
    } else {
      setAuthError(error.message)
    }
  }

  async function deleteMatch(match: Match) {
    if (!confirm(`Borrar el partido ${match.home_team} vs ${match.away_team}?`)) return
    setAuthError(null)
    setBusy(true)
    const { error } = await supabase.from('matches').delete().eq('id', match.id)
    setBusy(false)
    if (!error) await refreshData()
    else setAuthError(error.message)
  }

  async function savePrediction(e: FormEvent) {
    e.preventDefault()
    if (!predictionForm.player_id || !predictionForm.match_id || !predictionForm.prediction_result) return
    const payload = {
      player_id: predictionForm.player_id,
      match_id: predictionForm.match_id,
      prediction_result: predictionForm.prediction_result,
    }
    setAuthError(null)
    setBusy(true)
    const { error } = await supabase.from('predictions').upsert(payload, { onConflict: 'player_id,match_id' })
    setBusy(false)
    if (!error) {
      setPredictionForm(emptyPrediction)
      await refreshData()
    } else {
      setAuthError(error.message)
    }
  }

  async function deletePrediction(prediction: Prediction) {
    if (!confirm('Borrar este pronóstico?')) return
    setAuthError(null)
    setBusy(true)
    const { error } = await supabase.from('predictions').delete().eq('id', prediction.id)
    setBusy(false)
    if (!error) await refreshData()
    else setAuthError(error.message)
  }

  if (!sessionReady) {
    return <div className="state-box">Preparando sesión...</div>
  }

  if (!userEmail) {
    return (
      <section className="panel narrow">
        <div className="section-header">
          <div>
            <h1>Admin</h1>
            <p>Acceso privado para cargar jugadores, partidos y resultados.</p>
          </div>
          <div className="pill">URL privada: #/admin</div>
        </div>

        <div className="card">
          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              Correo
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="tu-correo@..." />
            </label>
            <label>
              Contraseña
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </label>
            {authError ? <div className="state-box error">{authError}</div> : null}
            <button disabled={busy} type="submit">Entrar</button>
          </form>
        </div>
      </section>
    )
  }

  return (
    <section className="panel admin-layout">
      <div className="section-header">
        <div>
          <h1>Administración</h1>
          <p>Hola, {userEmail}. Desde aquí puedes editar todo.</p>
        </div>
        <button disabled={busy} onClick={handleLogout} type="button">Salir</button>
      </div>

      {authError ? <div className="state-box error">{authError}</div> : null}

      <div className="grid-2 admin-grid-top">
        <div className="card admin-card">
          <div className="card-title-row">
            <div>
              <h2>Jugadores</h2>
              <p>Agrega uno por uno o importa varios al mismo tiempo.</p>
            </div>
            <div className="pill">{filteredPlayers.length} visibles</div>
          </div>

          <form className="form-grid" onSubmit={handlePlayerSubmit}>
            <label>
              Agregar uno
              <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Nombre del jugador" />
            </label>
            <button disabled={busy} type="submit">Guardar jugador</button>
          </form>
          <div className="divider" />
          <label>
            Cargar varios, uno por línea o separados por coma
            <textarea value={bulkPlayers} onChange={(e) => setBulkPlayers(e.target.value)} rows={5} placeholder={`Ana\nLuis\nPedro`} />
          </label>
          <button disabled={busy} onClick={addBulkPlayers} type="button">Importar lista</button>

          <div className="list-toolbar">
            <input value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} placeholder="Buscar jugador..." />
          </div>

          <div className="mini-list scroll-box">
            {filteredPlayers.length === 0 ? (
              <div className="empty-row">No hay jugadores con ese filtro.</div>
            ) : (
              filteredPlayers.map((player) => (
                <div key={player.id} className="mini-item">
                  <div>
                    <strong>{player.name}</strong>
                    <span>{player.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div className="inline-actions">
                    <button disabled={busy} onClick={() => setEditingPlayer(player)} type="button">Editar</button>
                    <button disabled={busy} onClick={() => togglePlayer(player)} type="button">
                      {player.active ? 'Ocultar' : 'Activar'}
                    </button>
                    <button disabled={busy} onClick={() => deletePlayer(player)} type="button">Borrar</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card admin-card">
          <div className="card-title-row">
            <div>
              <h2>Partidos</h2>
              <p>Crea o ajusta los partidos y sus resultados.</p>
            </div>
            <div className="pill">{filteredMatches.length} visibles</div>
          </div>

          <form className="form-grid" onSubmit={saveMatch}>
            <div className="row-2">
              <label>
                Ronda
                <select value={matchForm.round} onChange={(e) => setMatchForm((p) => ({ ...p, round: e.target.value, group_letter: e.target.value === 'Fase de grupos' ? p.group_letter || 'A' : '' }))}>
                  {WORLD_CUP_ROUNDS.map((round) => (
                    <option key={round} value={round}>{round}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha y hora
                <input type="datetime-local" value={matchForm.kickoff_at} onChange={(e) => setMatchForm((p) => ({ ...p, kickoff_at: e.target.value }))} />
              </label>
            </div>
            {isGroupStage(matchForm.round) ? (
              <div className="row-2">
                <label>
                  Grupo
                  <select value={matchForm.group_letter} onChange={(e) => setMatchForm((p) => ({ ...p, group_letter: e.target.value }))}>
                    {WORLD_CUP_GROUPS.map((group) => (
                      <option key={group} value={group}>Grupo {group}</option>
                    ))}
                  </select>
                </label>
                <div />
              </div>
            ) : null}
            <div className="row-2">
              <label>
                Local
                <input value={matchForm.home_team} onChange={(e) => setMatchForm((p) => ({ ...p, home_team: e.target.value }))} placeholder="México" />
              </label>
              <label>
                Visitante
                <input value={matchForm.away_team} onChange={(e) => setMatchForm((p) => ({ ...p, away_team: e.target.value }))} placeholder="Argentina" />
              </label>
            </div>
            <div className="row-3">
              <label>
                Goles local
                <input type="number" value={matchForm.home_goals} onChange={(e) => setMatchForm((p) => ({ ...p, home_goals: e.target.value }))} />
              </label>
              <label>
                Goles visita
                <input type="number" value={matchForm.away_goals} onChange={(e) => setMatchForm((p) => ({ ...p, away_goals: e.target.value }))} />
              </label>
              <label>
                Estado
                <select value={matchForm.status} onChange={(e) => setMatchForm((p) => ({ ...p, status: e.target.value as Match['status'] }))}>
                  <option value="scheduled">Pendiente</option>
                  <option value="live">En vivo</option>
                  <option value="finished">Finalizado</option>
                </select>
              </label>
            </div>
            <button disabled={busy} type="submit">{matchForm.id ? 'Actualizar partido' : 'Guardar partido'}</button>
            {matchForm.id ? (
              <button disabled={busy} onClick={() => setMatchForm(emptyMatch)} type="button">Cancelar edición</button>
            ) : null}
          </form>

          <div className="list-toolbar">
            <input value={matchQuery} onChange={(e) => setMatchQuery(e.target.value)} placeholder="Buscar partido..." />
          </div>

          <div className="mini-list scroll-box tall-compact">
            {filteredMatches.length === 0 ? (
              <div className="empty-row">No hay partidos con ese filtro.</div>
            ) : (
              filteredMatches.map((match) => (
                <div key={match.id} className="mini-item">
                  <div>
                    <strong>{match.home_team} vs {match.away_team}</strong>
                    <span>{match.round ?? 'Sin ronda'} · {match.home_goals === null || match.away_goals === null ? 'Pendiente' : `${match.home_goals}-${match.away_goals}`} · {match.status === 'scheduled' ? 'Pendiente' : match.status === 'live' ? 'En vivo' : 'Finalizado'}</span>
                  </div>
                  <div className="inline-actions">
                    <button disabled={busy} onClick={() => openMatchEditor(match)} type="button">Editar</button>
                    <button disabled={busy} onClick={() => deleteMatch(match)} type="button">Borrar</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card bottom-card admin-card">
        <div className="card-title-row">
          <div>
            <h2>Pronósticos</h2>
            <p>Solo se guarda si gana local, empate o gana visita.</p>
          </div>
          <div className="pill">{predictions.length} totales</div>
        </div>

        <form className="form-grid" onSubmit={savePrediction}>
          <div className="row-2">
            <label>
              Jugador
              <select value={predictionForm.player_id} onChange={(e) => setPredictionForm((p) => ({ ...p, player_id: e.target.value }))}>
                <option value="">Selecciona</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </label>
            <label>
              Partido
              <select value={predictionForm.match_id} onChange={(e) => setPredictionForm((p) => ({ ...p, match_id: e.target.value }))}>
                <option value="">Selecciona</option>
                {matches.map((match) => (
                  <option key={match.id} value={match.id}>{match.home_team} vs {match.away_team}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Pronóstico
            <select value={predictionForm.prediction_result} onChange={(e) => setPredictionForm((p) => ({ ...p, prediction_result: e.target.value as '' | PredictionOutcome }))}>
              <option value="">Selecciona</option>
              <option value="HOME">Gana local</option>
              <option value="DRAW">Empate</option>
              <option value="AWAY">Gana visita</option>
            </select>
          </label>
          <button disabled={busy} type="submit">Guardar pronóstico</button>
        </form>

        <div className="mini-list scroll-box tall-compact">
          {predictions.length === 0 ? (
            <div className="empty-row">Todavía no hay pronósticos.</div>
          ) : (
            predictions.map((pred) => (
              <div key={pred.id} className="mini-item">
                <div>
                  <strong>{playerMap.get(pred.player_id) ?? 'Jugador borrado'}</strong>
                  <span>{matchMap.get(pred.match_id) ?? 'Partido borrado'} · {getOutcomeLabel(pred.prediction_result)}</span>
                </div>
                <div className="inline-actions">
                  <button disabled={busy} onClick={() => setPredictionForm({ id: pred.id, player_id: pred.player_id, match_id: pred.match_id, prediction_result: pred.prediction_result ?? '' })} type="button">Editar</button>
                  <button disabled={busy} onClick={() => deletePrediction(pred)} type="button">Borrar</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {editingPlayer ? (
        <Modal title="Editar jugador" onClose={() => setEditingPlayer(null)}>
          <form className="form-grid" onSubmit={savePlayerEdit}>
            <label>
              Nombre
              <input value={editingPlayer.name} onChange={(e) => setEditingPlayer((p) => (p ? { ...p, name: e.target.value } : p))} />
            </label>
            <label className="inline-switch">
              <input
                type="checkbox"
                checked={editingPlayer.active}
                onChange={(e) => setEditingPlayer((p) => (p ? { ...p, active: e.target.checked } : p))}
              />
              <span>Activo</span>
            </label>
            <div className="modal-actions">
              <button type="submit" disabled={busy}>Guardar cambios</button>
              <button type="button" className="ghost-button" onClick={() => setEditingPlayer(null)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingMatch ? (
        <Modal title="Editar partido" onClose={() => setEditingMatch(null)}>
          <form className="form-grid" onSubmit={saveMatchEdit}>
            <div className="row-2">
              <label>
                Ronda
                <select value={normalizeRoundValue(editingMatch.round)} onChange={(e) => setEditingMatch((p) => (p ? { ...p, round: e.target.value } : p))}>
                  {WORLD_CUP_ROUNDS.map((round) => (
                    <option key={round} value={round}>{round}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha y hora
                <input
                  type="datetime-local"
                  value={editingMatch.kickoff_at ? editingMatch.kickoff_at.slice(0, 16) : ''}
                  onChange={(e) => setEditingMatch((p) => (p ? { ...p, kickoff_at: e.target.value } : p))}
                />
              </label>
            </div>
            {isGroupStage(editingMatch.round) ? (
              <div className="row-2">
                <label>
                  Grupo
                  <select value={editingMatch.group_letter ?? 'A'} onChange={(e) => setEditingMatch((p) => (p ? { ...p, group_letter: e.target.value } : p))}>
                    {WORLD_CUP_GROUPS.map((group) => (
                      <option key={group} value={group}>Grupo {group}</option>
                    ))}
                  </select>
                </label>
                <div />
              </div>
            ) : null}
            <div className="row-2">
              <label>
                Local
                <input value={editingMatch.home_team} onChange={(e) => setEditingMatch((p) => (p ? { ...p, home_team: e.target.value } : p))} />
              </label>
              <label>
                Visitante
                <input value={editingMatch.away_team} onChange={(e) => setEditingMatch((p) => (p ? { ...p, away_team: e.target.value } : p))} />
              </label>
            </div>
            <div className="row-3">
              <label>
                Goles local
                <input
                  type="number"
                  value={editingMatch.home_goals ?? ''}
                  onChange={(e) =>
                    setEditingMatch((p) =>
                      p
                        ? { ...p, home_goals: e.target.value === '' ? null : Number(e.target.value) }
                        : p
                    )
                  }
                />
              </label>
              <label>
                Goles visita
                <input
                  type="number"
                  value={editingMatch.away_goals ?? ''}
                  onChange={(e) =>
                    setEditingMatch((p) =>
                      p
                        ? { ...p, away_goals: e.target.value === '' ? null : Number(e.target.value) }
                        : p
                    )
                  }
                />
              </label>
              <label>
                Estado
                <select value={editingMatch.status} onChange={(e) => setEditingMatch((p) => (p ? { ...p, status: e.target.value as Match['status'] } : p))}>
                  <option value="scheduled">Pendiente</option>
                  <option value="live">En vivo</option>
                  <option value="finished">Finalizado</option>
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button type="submit" disabled={busy}>Guardar cambios</button>
              <button type="button" className="ghost-button" onClick={() => setEditingMatch(null)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
