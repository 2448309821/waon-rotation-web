import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_TEACHERS, buildSchedule, teachersForMonth } from './schedule.js'

const yesStatus = [{ id: 'yes', label: '○', behavior: 'yes' }]

function session(key, manualAssignments = {}) {
  return {
    key,
    label: key,
    requiredClasses: ['X', 'Y'],
    manualAssignments,
    meeting: false,
    closed: false,
  }
}

test('random assignment avoids repeating the same class for a teacher when teachers can swap', () => {
  const teachers = [
    { name: 'A', classes: ['X', 'Y'], defaultStatus: 'yes' },
    { name: 'B', classes: ['X', 'Y'], defaultStatus: 'yes' },
  ]

  const schedule = buildSchedule(
    {},
    [session('1/1'), session('1/8')],
    teachers,
    yesStatus,
    { random: true, randomSeed: '0', avoidRepeatedClasses: true },
  )

  for (const teacher of teachers) {
    const assignedClasses = schedule.flatMap((entry) => (
      Object.entries(entry.assignments)
        .filter(([, teacherName]) => teacherName === teacher.name)
        .map(([className]) => className)
    ))
    assert.equal(new Set(assignedClasses).size, 2)
  }
})

test('repeated classes remain allowed when capability rules leave no alternative', () => {
  const teachers = [
    { name: 'A', classes: ['X'], defaultStatus: 'yes' },
    { name: 'B', classes: ['Y'], defaultStatus: 'yes' },
  ]

  const schedule = buildSchedule(
    {},
    [session('1/1'), session('1/8')],
    teachers,
    yesStatus,
    { random: true, randomSeed: '0', avoidRepeatedClasses: true },
  )

  assert.deepEqual(schedule.map((entry) => entry.assignments), [
    { X: 'A', Y: 'B' },
    { X: 'A', Y: 'B' },
  ])
})

test('a monthly-repeat tie avoids repeating the class from the immediately previous session', () => {
  const teachers = [
    { name: 'A', classes: ['X', 'Y'], defaultStatus: 'yes' },
    { name: 'B', classes: ['X', 'Y'], defaultStatus: 'yes' },
  ]

  const schedule = buildSchedule(
    {},
    [
      session('1/1', { X: 'A', Y: 'B' }),
      session('1/8', { X: 'B', Y: 'A' }),
      session('1/15'),
    ],
    teachers,
    yesStatus,
    { random: true, randomSeed: '1', avoidRepeatedClasses: true },
  )

  assert.deepEqual(schedule[2].assignments, { X: 'A', Y: 'B' })
})

test('an automatic assignment does not give a second class to a manually assigned teacher', () => {
  const teachers = [
    { name: 'A', classes: ['X', 'Y'], defaultStatus: 'yes' },
    { name: 'B', classes: ['Y'], defaultStatus: 'yes' },
  ]

  const schedule = buildSchedule(
    {},
    [session('1/1', { X: 'A' })],
    teachers,
    yesStatus,
    { random: false, avoidRepeatedClasses: true },
  )

  assert.deepEqual(schedule[0].assignments, { X: 'A', Y: 'B' })
})

test('a December joiner is absent from earlier months and waits for declared attendance', () => {
  assert.deepEqual(DEFAULT_TEACHERS.at(-1), {
    name: 'インシカン', remote: false, skipMeeting: false,
    defaultStatus: 'no', activeFromMonth: '2026-12', classes: ['入門'],
  })
  const teachers = [
    { name: 'New', classes: ['入門'], activeFromMonth: '2026-12', defaultStatus: 'no' },
  ]
  const lesson = { ...session('12/5'), requiredClasses: ['入門', '入門(王)'] }
  const statuses = [
    ...yesStatus,
    { id: 'no', label: '×', behavior: 'no' },
  ]

  assert.deepEqual(teachersForMonth(teachers, '2026-11'), [])
  assert.deepEqual(teachersForMonth(teachers, '2026-12'), teachers)
  assert.deepEqual(buildSchedule({ New: { '12/5': 'yes' } }, [lesson], teachers, statuses, { monthKey: '2026-11' })[0].assignments, {})
  assert.deepEqual(buildSchedule({}, [lesson], teachers, statuses, { monthKey: '2026-12' })[0].assignments, {})
  assert.deepEqual(buildSchedule({ New: { '12/5': 'yes' } }, [lesson], teachers, statuses, { monthKey: '2026-12' })[0].assignments, { 入門: 'New' })
})
