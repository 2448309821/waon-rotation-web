import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSchedule } from './schedule.js'

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
