import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatLessonContentLines,
  formatLessonHandoffLines,
} from './lessonReportFormat.js'

test('keeps every content line untouched when the teacher already uses numbering', () => {
  const lines = formatLessonContentLines('1. 会話練習をしました。\n学習者から質問がありました。\n2. 音読をしました。')

  assert.deepEqual(lines.map((line) => line.display), [
    '1. 会話練習をしました。',
    '学習者から質問がありました。',
    '2. 音読をしました。',
  ])
})

test('numbers content only when no explicit markers are present', () => {
  const lines = formatLessonContentLines('会話練習をしました。\n音読をしました。')

  assert.deepEqual(lines.map((line) => line.display), [
    '1.  会話練習をしました。',
    '2.  音読をしました。',
  ])
})

test('does not mix automatic bullets with a teacher-written bullet list', () => {
  const lines = formatLessonHandoffLines('● コピーは配布済みです。\n次回は第12課からお願いします。')

  assert.deepEqual(lines.map((line) => line.display), [
    '● コピーは配布済みです。',
    '次回は第12課からお願いします。',
  ])
})
