import test from 'node:test'
import assert from 'node:assert/strict'
import { readMonth, stepMonth, reportSyncLabel } from './plannerView.js'

test('month navigation stays in range and crosses years in both directions', () => {
  assert.deepEqual(stepMonth(2026, 12, 1), { year: 2027, month: 1 })
  assert.deepEqual(stepMonth(2026, 1, -1), { year: 2025, month: 12 })
  assert.deepEqual(stepMonth(2020, 1, -1), { year: 2020, month: 1 })
  assert.deepEqual(readMonth('2027-00', new Date(2026, 10, 1)), { year: 2026, month: 11 })
  assert.deepEqual(readMonth('2027-01'), { year: 2027, month: 1 })
})

test('an empty, pending or failed report is not marked as saved', () => {
  assert.equal(reportSyncLabel(false, 'ready', false), '未入力')
  assert.equal(reportSyncLabel(true, 'ready', false), '未同期')
  assert.equal(reportSyncLabel(true, 'saving', false), '保存中')
  assert.equal(reportSyncLabel(true, 'error', false), '同期失敗')
  assert.equal(reportSyncLabel(true, 'ready', true), '保存済み')
})
