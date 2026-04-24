export const ALL_CLASSES = ['きく', 'さくら', 'わかば', '入門', '入門(denji)', '入門(王)']
export const DEFAULT_CLASSES = ['きく', 'さくら', 'わかば', '入門']

export const DEFAULT_TEACHERS = [
  { name: '岡本', remote: true,  skipMeeting: false, defaultStatus: 'no', classes: ['きく', 'さくら', 'わかば', '入門', '入門(denji)', '入門(王)'] },
  { name: '柴田', remote: false, skipMeeting: false, defaultStatus: 'no', classes: ['さくら', 'わかば', '入門', '入門(denji)', '入門(王)'] },
  { name: '今村', remote: false, skipMeeting: true,  defaultStatus: 'no', classes: ['さくら', 'わかば', '入門', '入門(denji)', '入門(王)'] },
  { name: '門馬', remote: false, skipMeeting: false, defaultStatus: 'no', classes: ['さくら', 'わかば', '入門', '入門(denji)', '入門(王)'] },
  { name: '蔦尾', remote: false, skipMeeting: false, defaultStatus: 'no', classes: ['さくら', 'わかば', '入門', '入門(denji)', '入門(王)'] },
  { name: '岡崎', remote: true,  skipMeeting: false, defaultStatus: 'no', classes: ['きく', 'さくら'] },
  { name: '相良', remote: false, skipMeeting: false, defaultStatus: 'no', classes: ['きく', 'さくら', 'わかば', '入門', '入門(denji)', '入門(王)'] },
  { name: '裴',   remote: false, skipMeeting: false, defaultStatus: 'no', classes: ['さくら', '入門(王)'] },
]

// status.behavior controls scheduling logic; label is user-facing display text
export const DEFAULT_STATUS_OPTIONS = [
  { id: 'yes',          label: '○',     behavior: 'yes' },
  { id: 'maybe',        label: '△',     behavior: 'maybe' },
  { id: 'no',           label: '×',     behavior: 'no' },
  { id: 'meeting_only', label: '例会のみ', behavior: 'meeting_only' },
]

// Behaviors used in scheduling logic
export const BEHAVIORS = [
  { value: 'yes',          label: '出席・担当あり (○ 相当)' },
  { value: 'maybe',        label: '人数不足なら担当 (△ 相当)' },
  { value: 'no',           label: '欠席 (× 相当)' },
  { value: 'meeting_only', label: '例会のみ参加、担当なし' },
]

export const sessionTypeOptions = [
  { value: 'normal',  label: '通常' },
  { value: 'meeting', label: '例会' },
  { value: 'holiday', label: 'やすみ' },
]

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getSaturdaysInMonth(year, month) {
  const dates = []
  const d = new Date(year, month - 1, 1)
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month - 1) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return dates
}

// Wang attends on odd weeks (1st, 3rd, 5th Saturday of the month)
function wangAttends(weekIndex) {
  return weekIndex % 2 === 1
}

// Smart default: Wang weeks auto-split 入門 into 入門(denji)+入門(王) if both exist in allClasses
function smartDefault(weekIndex, defaultClasses, allClasses, wangSplit) {
  if (wangSplit && wangAttends(weekIndex)) {
    const hasDenji = allClasses.includes('入門(denji)')
    const hasWang  = allClasses.includes('入門(王)')
    if (hasDenji && hasWang) {
      const base     = defaultClasses.filter(c => c !== '入門')
      const splitSet = new Set([...base, '入門(denji)', '入門(王)'])
      return allClasses.filter(c => splitSet.has(c))
    }
  }
  return [...defaultClasses]
}

export function generateSessions(year, month, sessionTypesByMonth, sessionClassesByMonth, sessionManualByMonth = {}, sessionSpecialNotesByMonth = {}, defaultClasses, allClasses, specialRules = {}) {
  const { wangSplit = true } = specialRules
  const monthKey = `${year}-${month}`
  const typeMap  = sessionTypesByMonth[monthKey] ?? {}
  const classMap = sessionClassesByMonth[monthKey] ?? {}
  const manualMap = sessionManualByMonth[monthKey] ?? {}
  const specialNotesMap = sessionSpecialNotesByMonth[monthKey] ?? {}

  return getSaturdaysInMonth(year, month).map((date, index) => {
    const key       = `${month}/${date.getDate()}`
    const type      = typeMap[key] ?? (month === 4 ? 'meeting' : 'normal')
    const weekIndex = index + 1
    return {
      key,
      label: key,
      weekIndex,
      meeting: type === 'meeting',
      closed:  type === 'holiday',
      requiredClasses: classMap[key] ?? smartDefault(weekIndex, defaultClasses, allClasses, wangSplit),
      classesOverridden: !!classMap[key],
      manualAssignments: manualMap[key] ?? {},
      specialNote: specialNotesMap[key] ?? '',
    }
  })
}

// ── Scheduling logic ──────────────────────────────────────────────────────────

function buildClassRules(teachers) {
  const rules = {}
  for (const t of teachers) {
    for (const cls of t.classes) {
      if (!rules[cls]) rules[cls] = new Set()
      rules[cls].add(t.name)
    }
  }
  return rules
}

function teacherPriorityScore(teacher, allTeachers, meeting) {
  return [
    meeting && teacher.remote      ? 0 : 1,
    meeting && teacher.skipMeeting ? 1 : 0,
    allTeachers.indexOf(teacher),
  ]
}

function comparePriority(a, b, allTeachers, meeting) {
  const la = teacherPriorityScore(a, allTeachers, meeting)
  const lb = teacherPriorityScore(b, allTeachers, meeting)
  for (let i = 0; i < la.length; i++) if (la[i] !== lb[i]) return la[i] - lb[i]
  return 0
}

function scoreAssignment(chosen, allTeachers, meeting) {
  return [
    chosen.filter(t => t.remote && meeting).length,
    -chosen.filter(t => t.skipMeeting && meeting).length,
    -chosen.reduce((s, t) => s + allTeachers.indexOf(t), 0),
  ]
}

function compareScore(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

function permute(vals) {
  if (vals.length <= 1) return [vals]
  const out = []
  vals.forEach((v, i) => {
    const rest = vals.slice(0, i).concat(vals.slice(i + 1))
    permute(rest).forEach(tail => out.push([v, ...tail]))
  })
  return out
}

function combinations(vals, k, start = 0, prefix = [], results = []) {
  if (prefix.length === k) { results.push(prefix); return results }
  for (let i = start; i < vals.length; i++)
    combinations(vals, k, i + 1, [...prefix, vals[i]], results)
  return results
}

function seededRandom(seed) {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = ((s << 5) - s + seed.charCodeAt(i)) | 0
  s = Math.abs(s) || 1
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

function tryAssign(available, classes, classRules, allTeachers, meeting, random, seed) {
  if (available.length < classes.length) return null
  if (!random) {
    const sorted = [...available].sort((a, b) => comparePriority(a, b, allTeachers, meeting))
    let best = null, bestScore = null
    for (const chosen of combinations(sorted, classes.length)) {
      for (const ordered of permute(chosen)) {
        const assignment = Object.fromEntries(classes.map((cls, i) => [cls, ordered[i].name]))
        if (!classes.every(cls => classRules[cls]?.has(assignment[cls]))) continue
        const score = scoreAssignment(chosen, allTeachers, meeting)
        if (!bestScore || compareScore(bestScore, score) < 0) { best = assignment; bestScore = score }
      }
    }
    return best
  }

  const rng = seededRandom(seed)
  const validAssignments = []
  const sorted = [...available].sort((a, b) => comparePriority(a, b, allTeachers, meeting))
  for (const chosen of combinations(sorted, classes.length)) {
    for (const ordered of permute(chosen)) {
      const assignment = Object.fromEntries(classes.map((cls, i) => [cls, ordered[i].name]))
      if (!classes.every(cls => classRules[cls]?.has(assignment[cls]))) continue
      validAssignments.push(assignment)
    }
  }
  if (validAssignments.length === 0) return null
  const pick = Math.floor(rng() * validAssignments.length)
  return validAssignments[pick]
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildSchedule(attendanceByTeacher, sessions, teachers, statusOptions, specialRules = {}) {
  const classRules = buildClassRules(teachers)
  // Map status id → behavior; unknown ids treated as 'no'
  const behaviorOf = Object.fromEntries(statusOptions.map(o => [o.id, o.behavior]))
  const random = specialRules.random === true
  const seed = specialRules.randomSeed ?? `${Date.now().toString(36)}`

  return sessions.map(session => {
    if (session.closed) {
      return {
        ...session,
        special: 'わをん休み',
        assignments: {}, classes: [],
        selectedTeachers: [], selectedMaybeTeachers: [],
        meetingOnlyTeachers: [], unassignedClasses: [], notes: [],
      }
    }

    const manualAssignments = session.manualAssignments ?? {}
    const requiredClasses = session.requiredClasses ?? []

    // Apply manual assignments first
    let assignments = { ...manualAssignments }
    const manuallyAssignedClasses = Object.keys(manualAssignments)
    const remainingClasses = requiredClasses.filter(c => !manuallyAssignedClasses.includes(c))

    // Resolve each teacher's effective status for this session
    const getStatus = t =>
      attendanceByTeacher[t.name]?.[session.key] ?? t.defaultStatus ?? 'no'

    const yesTeachers         = teachers.filter(t => behaviorOf[getStatus(t)] === 'yes')
    const maybeTeachers       = teachers.filter(t => behaviorOf[getStatus(t)] === 'maybe')
    const meetingOnlyTeachers = teachers.filter(t => behaviorOf[getStatus(t)] === 'meeting_only')

    let selectedMaybeTeachers = []
    let autoAssignments = remainingClasses.length > 0 ? tryAssign(yesTeachers, remainingClasses, classRules, teachers, session.meeting, random, seed) : {}

    if (!autoAssignments) {
      const sortedMaybe = [...maybeTeachers].sort((a, b) => comparePriority(a, b, teachers, session.meeting))
      for (const t of sortedMaybe) {
        selectedMaybeTeachers = [...selectedMaybeTeachers, t]
        autoAssignments = remainingClasses.length > 0 ? tryAssign(
          [...yesTeachers, ...selectedMaybeTeachers],
          remainingClasses, classRules, teachers, session.meeting, random, seed,
        ) : {}
        if (autoAssignments) break
      }
    }

    // Merge manual and auto assignments
    assignments = { ...assignments, ...autoAssignments }

    let usedClasses = [...requiredClasses]
    let unassignedClasses = []
    const notes = []

    if (!autoAssignments && remainingClasses.length > 0) {
      const pool = [...yesTeachers, ...selectedMaybeTeachers]
      usedClasses = []
      for (const cls of remainingClasses) {
        if (tryAssign(pool, [...usedClasses, cls], classRules, teachers, session.meeting, random, seed))
          usedClasses.push(cls)
      }
      autoAssignments = tryAssign(pool, usedClasses, classRules, teachers, session.meeting, random, seed) ?? {}
      assignments = { ...assignments, ...autoAssignments }
      unassignedClasses = remainingClasses.filter(c => !usedClasses.includes(c))
      if (unassignedClasses.length > 0)
        notes.push(`人数不足のため未定: ${unassignedClasses.join('、')}`)
    }

    const teacherNames = teachers.map(t => t.name)
    const selectedTeachers = [...new Set(Object.values(assignments))].sort(
      (a, b) => teacherNames.indexOf(a) - teacherNames.indexOf(b)
    )

    let special = ''
    if (session.specialNote && session.specialNote.trim()) {
      special = session.meeting ? `会議 ${session.specialNote}` : session.specialNote
    } else if (session.meeting) {
      special = '会議'
    }
    if (session.meeting && selectedMaybeTeachers.length > 0)
      special = `${special}。${selectedMaybeTeachers.map(t => t.name).join('、')}は人数不足のため追加`
    if (Object.keys(manualAssignments).length > 0)
      notes.push('手動設定あり')
    if (!session.meeting && session.classesOverridden && requiredClasses.some(c => c.includes('王')))
      notes.push('入門分割週（手動設定）')

    return {
      ...session,
      special,
      assignments,
      classes: usedClasses,
      selectedTeachers,
      selectedMaybeTeachers: selectedMaybeTeachers.map(t => t.name),
      meetingOnlyTeachers:   meetingOnlyTeachers.map(t => t.name),
      unassignedClasses,
      notes,
    }
  })
}
