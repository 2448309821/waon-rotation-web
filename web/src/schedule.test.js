import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_TEACHERS, buildSchedule, generateSessions, sessionTypeOptions, teachersForMonth } from './schedule.js'

test('a generic event stays open without classes and keeps its own label', () => {
  assert.ok(sessionTypeOptions.some(option => option.value === 'event' && option.label === 'イベント'))
  const days = generateSessions(2026, 12, {'2026-12': {'12/12': 'event'}},
    {'2026-12': {'12/12': ['X']}}, {'2026-12': {'12/12': {X: 'A'}}}, {}, ['X'], ['X'])
  const schedule = buildSchedule({}, days, [{ name: 'A', classes: ['X'], defaultStatus: 'yes' }], yesStatus)
  const day = schedule.find(session => session.key === '12/12')
  assert.equal(day.closed, false)
  assert.deepEqual(day.requiredClasses, [])
  assert.deepEqual(day.assignments, {})
  assert.deepEqual(day.unassignedClasses, [])
  assert.equal(day.special, 'イベント')
  assert.equal(schedule.find(session => session.key === '12/19').special, '交流会')
})

test('December year-end event stays open without lessons, even with previous overrides', () => {
  const make = types => generateSessions(2026, 12, types, {}, {'2026-12': {'12/19': {X:'A'}}}, {}, ['X'], ['X'])
  const days = make({})
  const event = buildSchedule({}, days, [{name:'A', classes:['X'], defaultStatus:'yes'}], yesStatus)[2]
  assert.equal(event.eventLabel, '交流会')
  assert.equal(event.closed, false)
  assert.deepEqual(event.assignments, {})
  assert.deepEqual(event.unassignedClasses, [])
  assert.equal(event.special, '交流会')
  assert.equal(event.specialNote, '')
  assert.equal(days[3].closed, true)
  assert.equal(make({'2026-12': {'12/19':'normal'}})[2].eventLabel, '')
})

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

test('looks ahead and swaps the first week when the next week has only one eligible teacher', () => {
  const teachers = [
    { name: 'B', classes: ['X', 'Y'], defaultStatus: 'yes', maxMonthlyAssignments: 2 },
    { name: 'A', classes: ['X', 'Y'], defaultStatus: 'no', maxMonthlyAssignments: 1 },
    { name: 'C', classes: ['Y'], defaultStatus: 'no', maxMonthlyAssignments: 1 },
  ]
  const attendance = { A: { '1/1': 'yes' }, C: { '1/15': 'yes' } }
  const sessions = [
    session('1/1'),
    { ...session('1/8'), eventLabel: 'イベント' },
    session('1/15'),
  ]
  const rules = { avoidRepeatedClasses: true }
  const original = buildSchedule(attendance, sessions, teachers, yesStatus, { ...rules, optimizeRepeats: false })
  const improved = buildSchedule(attendance, sessions, teachers, yesStatus, rules)
  assert.deepEqual(original.map(day => day.assignments), [{ X: 'B', Y: 'A' }, {}, { X: 'B', Y: 'C' }])
  assert.deepEqual(improved.map(day => day.assignments), [{ X: 'A', Y: 'B' }, {}, { X: 'B', Y: 'C' }])
  assert.deepEqual(improved.map(day => day.selectedTeachers), original.map(day => day.selectedTeachers))
  assert.deepEqual(improved.map(day => day.unassignedClasses), original.map(day => day.unassignedClasses))

  const withManual = buildSchedule(attendance, [session('1/1', { X: 'B' }), ...sessions.slice(1)], teachers, yesStatus, rules)
  assert.deepEqual(withManual.map(day => day.assignments), original.map(day => day.assignments))
})

test('coordinates more than two lesson dates without changing selected teachers', () => {
  const teachers = [
    { name: 'B', classes: ['X', 'Y'], defaultStatus: 'yes' },
    { name: 'A', classes: ['X', 'Y'], defaultStatus: 'yes' },
    { name: 'C', classes: ['Y'], defaultStatus: 'no' },
  ]
  const attendance = { A: { '1/22': 'no' }, C: { '1/22': 'yes' } }
  const sessions = ['1/1', '1/8', '1/15', '1/22'].map(key => session(key))
  const result = buildSchedule(attendance, sessions, teachers, yesStatus, { avoidRepeatedClasses: true })
  assert.deepEqual(result.map(day => day.assignments), [
    { X: 'A', Y: 'B' },
    { X: 'B', Y: 'A' },
    { X: 'A', Y: 'B' },
    { X: 'B', Y: 'C' },
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
