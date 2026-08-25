function cloneAssignments(assignments) {
  return Object.fromEntries(
    Object.entries(assignments ?? {}).map(([sessionKey, byClass]) => [sessionKey, { ...(byClass ?? {}) }]),
  )
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

export function getArchivedAssignments(archive, allClasses) {
  if (archive?.assignmentsBySession && Object.keys(archive.assignmentsBySession).length > 0) {
    return cloneAssignments(archive.assignmentsBySession)
  }

  const lines = String(archive?.markdown ?? '').split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => /^\|/.test(line) && tableCells(line).slice(1).some((cell) => /^\d{1,2}\/\d{1,2}$/.test(cell)))
  if (headerIndex < 0) return {}

  const sessionKeys = tableCells(lines[headerIndex]).slice(1)
  const assignments = {}
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/^\|/.test(line)) break
    const cells = tableCells(line)
    if (isSeparatorRow(cells)) continue
    const teacherName = cells[0]
    if (!teacherName || ['特別連絡', '区分', '未担当'].includes(teacherName)) continue

    sessionKeys.forEach((sessionKey, sessionIndex) => {
      const value = cells[sessionIndex + 1] ?? ''
      const assignedClasses = allClasses.filter((className) => (
        value.split('/').map((part) => part.trim()).includes(className)
      ))
      assignedClasses.forEach((className) => {
        assignments[sessionKey] = { ...(assignments[sessionKey] ?? {}), [className]: teacherName }
      })
    })
  }
  return assignments
}

export function mergeAssignmentOverrides(baseAssignments, manualAssignments) {
  const keys = new Set([...Object.keys(baseAssignments ?? {}), ...Object.keys(manualAssignments ?? {})])
  return Object.fromEntries(
    [...keys].map((sessionKey) => [sessionKey, {
      ...(baseAssignments?.[sessionKey] ?? {}),
      ...(manualAssignments?.[sessionKey] ?? {}),
    }]),
  )
}
