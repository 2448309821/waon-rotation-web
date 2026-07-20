export const BACKUP_FORMAT = 'wawon-rotation-backup'
export const BACKUP_VERSION = 1
export const LOCAL_HISTORY_KEY = 'wawon-rotation-state-history-v1'
export const MAX_LOCAL_SNAPSHOTS = 20

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nestedEntryCount(value) {
  if (!isPlainObject(value)) return 0
  return Object.values(value).reduce((sum, item) => (
    sum + (isPlainObject(item) ? Object.keys(item).length : 0)
  ), 0)
}

export function summarizeState(state) {
  const safeState = isPlainObject(state) ? state : {}
  return {
    year: Number(safeState.year) || null,
    month: Number(safeState.month) || null,
    teachers: Array.isArray(safeState.teachers) ? safeState.teachers.length : 0,
    lessonReportMonths: isPlainObject(safeState.lessonReportsByMonth) ? Object.keys(safeState.lessonReportsByMonth).length : 0,
    lessonReports: nestedEntryCount(safeState.lessonReportsByMonth),
    bulletinPosts: Array.isArray(safeState.bulletinBoard) ? safeState.bulletinBoard.length : 0,
    archivedSchedules: isPlainObject(safeState.archivedSchedules) ? Object.keys(safeState.archivedSchedules).length : 0,
    memoMonths: isPlainObject(safeState.memosByMonth) ? Object.keys(safeState.memosByMonth).length : 0,
  }
}

export function createBackupEnvelope(state, source = '手動バックアップ') {
  const createdAt = new Date().toISOString()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    source,
    summary: summarizeState(state),
    state,
  }
}

export function parseBackupText(text) {
  const parsed = JSON.parse(text)
  let envelope = null

  if (parsed?.format === BACKUP_FORMAT && isPlainObject(parsed.state)) {
    envelope = parsed
  } else if (Array.isArray(parsed) && isPlainObject(parsed[0]?.state)) {
    envelope = createBackupEnvelope(parsed[0].state, 'Supabaseエクスポート')
    envelope.sourceUpdatedAt = parsed[0].updated_at ?? null
  } else if (isPlainObject(parsed?.state)) {
    envelope = createBackupEnvelope(parsed.state, '共有状態エクスポート')
  } else if (isPlainObject(parsed) && Array.isArray(parsed.teachers)) {
    envelope = createBackupEnvelope(parsed, '旧形式バックアップ')
  }

  if (!envelope || !Array.isArray(envelope.state?.teachers)) {
    throw new Error('Wawonのバックアップファイルとして読み取れません。')
  }

  return {
    ...envelope,
    summary: summarizeState(envelope.state),
  }
}

export function loadLocalSnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => isPlainObject(item?.state)) : []
  } catch {
    return []
  }
}

function storeSnapshotsWithFallback(snapshots) {
  let next = snapshots.slice(0, MAX_LOCAL_SNAPSHOTS)
  while (next.length > 0) {
    try {
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(next))
      return next
    } catch {
      next = next.slice(0, Math.max(0, next.length - 2))
    }
  }
  return []
}

export function saveLocalSnapshot(state, source, options = {}) {
  if (!isPlainObject(state)) return loadLocalSnapshots()
  const history = loadLocalSnapshots()
  const stateJson = JSON.stringify(state)
  const latestJson = history[0]?.state ? JSON.stringify(history[0].state) : ''
  if (!options.force && latestJson === stateJson) return history
  const latestCreatedAt = Date.parse(history[0]?.createdAt || '')
  const minIntervalMs = Number(options.minIntervalMs) || 0
  if (!options.force && minIntervalMs > 0 && Number.isFinite(latestCreatedAt) && Date.now() - latestCreatedAt < minIntervalMs) {
    return history
  }

  const envelope = createBackupEnvelope(state, source)
  const snapshot = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...envelope,
  }
  return storeSnapshotsWithFallback([snapshot, ...history])
}

export function removeLocalSnapshot(snapshotId) {
  return storeSnapshotsWithFallback(loadLocalSnapshots().filter((item) => item.id !== snapshotId))
}
