import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getArchivedAssignments,
  mergeAssignmentOverrides,
} from './lockedAssignments.js'

test('restores class assignments from a legacy archived markdown table', () => {
  const archived = {
    markdown: `# 2026年8月 担当表

|  | 8/22 | 8/29 |
| --- | --- | --- |
| 特別連絡 |  |  |
| 岡崎 | きく | さくら |
| 岡本 | わかば | きく |
| 柴田 | 入門 | わかば |
| 今村 | ○ | ○ |
| 門馬 | × | 入門 |`,
  }

  assert.deepEqual(getArchivedAssignments(archived, ['きく', 'さくら', 'わかば', '入門']), {
    '8/22': { 'きく': '岡崎', 'わかば': '岡本', '入門': '柴田' },
    '8/29': { 'さくら': '岡崎', 'きく': '岡本', 'わかば': '柴田', '入門': '門馬' },
  })
})

test('a later manual exchange overrides the archived assignment', () => {
  const archived = {
    assignmentsBySession: {
      '8/29': { 'きく': '岡本', 'さくら': '岡崎', 'わかば': '柴田', '入門': '門馬' },
    },
  }

  assert.deepEqual(
    mergeAssignmentOverrides(getArchivedAssignments(archived, ['きく', 'さくら', 'わかば', '入門']), {
      '8/29': { 'きく': '岡崎', 'さくら': '岡本' },
    }),
    {
      '8/29': { 'きく': '岡崎', 'さくら': '岡本', 'わかば': '柴田', '入門': '門馬' },
    },
  )
})
