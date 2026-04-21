export const teacherOrder = ['岡本', '柴田', '今村', '門馬', '蔦尾', '岡崎', '相良', '裴']

export const sessions = [
  { key: '5/2', label: '5/2', weekIndex: 1, meeting: false, closed: true },
  { key: '5/9', label: '5/9', weekIndex: 2, meeting: true, closed: false },
  { key: '5/16', label: '5/16', weekIndex: 3, meeting: false, closed: false },
  { key: '5/23', label: '5/23', weekIndex: 4, meeting: false, closed: false },
  { key: '5/30', label: '5/30', weekIndex: 5, meeting: false, closed: false },
]

export const statusOptions = [
  { value: 'yes', label: '○' },
  { value: 'maybe', label: '△' },
  { value: 'no', label: '×' },
  { value: 'meeting_only', label: '総会のみ' },
]

const remotePriority = new Set(['岡本', '岡崎'])
const classRules = {
  'きく': new Set(['岡本', '岡崎', '相良']),
  'さくら': new Set(['岡本', '柴田', '今村', '門馬', '蔦尾', '岡崎', '相良', '裴']),
  'わかば': new Set(['岡本', '柴田', '今村', '門馬', '蔦尾', '相良']),
  '入門': new Set(['岡本', '柴田', '今村', '門馬', '蔦尾', '相良']),
  '入門(denji)': new Set(['岡本', '柴田', '今村', '門馬', '蔦尾', '相良']),
  '入門(王)': new Set(['岡本', '柴田', '今村', '門馬', '蔦尾', '相良', '裴']),
}

function wangAttends(weekIndex) {
  return weekIndex % 2 === 1
}

function teacherPriority(name, meeting) {
  const remoteRank = meeting && remotePriority.has(name) ? 0 : 1
  const imamuraRank = name === '今村' ? 1 : 0
  const orderRank = teacherOrder.indexOf(name)
  return [remoteRank, imamuraRank, orderRank]
}

function comparePriority(a, b, meeting) {
  const left = teacherPriority(a, meeting)
  const right = teacherPriority(b, meeting)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

function scoreAssignment(chosen, assignment, meeting) {
  const remoteCount = chosen.filter((name) => remotePriority.has(name) && meeting).length
  const imamuraPenalty = chosen.filter((name) => name === '今村').length
  const splitBonus = Object.keys(assignment).includes('入門(王)') ? 1 : 0
  const stableOrder = chosen.reduce((sum, name) => sum + teacherOrder.indexOf(name), 0)
  return [remoteCount, -imamuraPenalty, splitBonus, -stableOrder]
}

function compareScore(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function permute(values) {
  if (values.length <= 1) return [values]
  const results = []
  values.forEach((value, index) => {
    const rest = values.slice(0, index).concat(values.slice(index + 1))
    permute(rest).forEach((tail) => {
      results.push([value, ...tail])
    })
  })
  return results
}

function combinations(values, count, start = 0, prefix = [], results = []) {
  if (prefix.length === count) {
    results.push(prefix)
    return results
  }
  for (let i = start; i < values.length; i += 1) {
    combinations(values, count, i + 1, [...prefix, values[i]], results)
  }
  return results
}

function tryAssign(teachers, classes, meeting) {
  if (teachers.length < classes.length) return null
  const sortedTeachers = [...teachers].sort((a, b) => comparePriority(a, b, meeting))
  let best = null
  let bestScore = null

  combinations(sortedTeachers, classes.length).forEach((chosen) => {
    for (const ordered of permute(chosen)) {
      const assignment = Object.fromEntries(classes.map((className, index) => [className, ordered[index]]))
      const valid = classes.every((className) => classRules[className].has(assignment[className]))
      if (!valid) continue
      const currentScore = scoreAssignment(chosen, assignment, meeting)
      if (!bestScore || compareScore(bestScore, currentScore) < 0) {
        best = assignment
        bestScore = currentScore
      }
      break
    }
  })

  return best
}

export function buildSchedule(attendanceByTeacher) {
  return sessions.map((session) => {
    if (session.closed) {
      return {
        ...session,
        special: 'わをん休み',
        assignments: {},
        selectedTeachers: [],
        selectedMaybeTeachers: [],
        meetingOnlyTeachers: [],
        notes: [],
      }
    }

    const attendance = Object.fromEntries(
      teacherOrder.map((teacher) => [teacher, attendanceByTeacher[teacher]?.[session.key] ?? 'no']),
    )

    const yesTeachers = teacherOrder.filter((teacher) => attendance[teacher] === 'yes')
    const maybeTeachers = teacherOrder.filter((teacher) => attendance[teacher] === 'maybe')
    const meetingOnlyTeachers = teacherOrder.filter((teacher) => attendance[teacher] === 'meeting_only')
    const wangHere = wangAttends(session.weekIndex)

    const requiredClasses = wangHere ? ['きく', 'さくら', 'わかば', '入門'] : ['きく', 'さくら', 'わかば', '入門']
    let selectedMaybeTeachers = []
    let assignments = tryAssign(yesTeachers, requiredClasses, session.meeting)

    if (!assignments) {
      const sortedMaybe = [...maybeTeachers].sort((a, b) => comparePriority(a, b, session.meeting))
      for (const teacher of sortedMaybe) {
        selectedMaybeTeachers = [...selectedMaybeTeachers, teacher]
        assignments = tryAssign([...yesTeachers, ...selectedMaybeTeachers], requiredClasses, session.meeting)
        if (assignments) break
      }
    }

    let usedClasses = [...requiredClasses]
    const notes = []

    if (assignments && wangHere) {
      const splitClasses = ['きく', 'さくら', 'わかば', '入門(denji)', '入門(王)']
      const splitAssignments = tryAssign([...yesTeachers, ...selectedMaybeTeachers], splitClasses, session.meeting)
      if (splitAssignments) {
        assignments = splitAssignments
        usedClasses = splitClasses
        notes.push('王さん参加週で人数に余裕があるため、入門を2クラスに分けました。')
      } else {
        notes.push('王さん参加週ですが人数が足りないため、入門は1クラスです。')
      }
    }

    if (!assignments) {
      const pool = [...yesTeachers, ...selectedMaybeTeachers]
      usedClasses = []
      requiredClasses.forEach((className) => {
        const tentative = [...usedClasses, className]
        if (tryAssign(pool, tentative, session.meeting)) usedClasses = tentative
      })
      assignments = tryAssign(pool, usedClasses, session.meeting) ?? {}
      const missing = requiredClasses.filter((className) => !usedClasses.includes(className))
      if (missing.length > 0) {
        notes.push(`人数不足のため未定: ${missing.join('、')}`)
      }
    }

    const selectedTeachers = [...new Set(Object.values(assignments))].sort(
      (a, b) => teacherOrder.indexOf(a) - teacherOrder.indexOf(b),
    )

    let special = session.meeting ? '総会' : ''
    if (session.meeting && selectedMaybeTeachers.length > 0) {
      special = `総会。${selectedMaybeTeachers.join('、')}は人数不足のため追加`
    }
    if (!session.meeting && wangHere && notes.length > 0) {
      special = notes[0]
    }

    return {
      ...session,
      special,
      assignments,
      classes: usedClasses,
      selectedTeachers,
      selectedMaybeTeachers,
      meetingOnlyTeachers,
      notes,
    }
  })
}
