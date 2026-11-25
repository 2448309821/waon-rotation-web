export function readMonth(value, today = new Date()) {
  if (/^(20[2-3]\d|2040)-(0[1-9]|1[0-2])$/.test(value)) {
    const [year, month] = value.split('-').map(Number)
    return { year, month }
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}

export function stepMonth(year, month, delta) {
  const i = Math.max(2020 * 12, Math.min(2040 * 12 + 11, year * 12 + month - 1 + delta))
  return { year: Math.floor(i / 12), month: i % 12 + 1 }
}

export function reportSyncLabel(hasReport, status, acknowledged) {
  if (!hasReport) return '未入力'
  if (status === 'error') return '同期失敗'
  if (status === 'saving') return '保存中'
  return status === 'ready' && acknowledged ? '保存済み' : '未同期'
}

export function rosterAttendanceBehavior(options, declared, fallback, isEvent) {
  if (isEvent && declared == null) return 'no'
  return options.find(option => option.id === (declared ?? fallback ?? 'no'))?.behavior ?? 'no'
}
