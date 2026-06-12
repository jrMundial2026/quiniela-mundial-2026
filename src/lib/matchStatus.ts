export const MATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Pendiente',
  live: 'En vivo',
  finished: 'Finalizado',
}

export const MATCH_STATUS_CLASSES: Record<string, string> = {
  scheduled: 'status-badge status-pending',
  live: 'status-badge status-live',
  finished: 'status-badge status-finished',
}

export function getMatchStatusLabel(status?: string | null) {
  if (!status) return 'Pendiente'
  return MATCH_STATUS_LABELS[status] ?? status
}

export function getMatchStatusClass(status?: string | null) {
  if (!status) return 'status-badge status-pending'
  return MATCH_STATUS_CLASSES[status] ?? 'status-badge status-pending'
}
