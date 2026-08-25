import React, { useEffect, useRef, useState } from 'react'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/700.css'
import waonIcon1 from './assets/brand-icons/waon-icon-1.webp'
import waonIcon2 from './assets/brand-icons/waon-icon-2.webp'
import waonIcon3 from './assets/brand-icons/waon-icon-3.webp'
import waonIcon4 from './assets/brand-icons/waon-icon-4.webp'
import waonIcon5 from './assets/brand-icons/waon-icon-5.webp'
import waonIcon6 from './assets/brand-icons/waon-icon-6.webp'
import {
  ALL_CLASSES,
  BEHAVIORS,
  DEFAULT_CLASSES,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_TEACHERS,
  buildSchedule,
  generateSessions,
  sessionTypeOptions,
} from './schedule'
import { ROTATION_STATE_ID, supabase } from './supabase'
import {
  createBackupEnvelope,
  loadLocalSnapshots,
  parseBackupText,
  saveLocalSnapshot,
  summarizeState,
} from './stateBackup'
import {
  formatLessonContentLines,
  formatLessonHandoffLines,
} from './lessonReportFormat'
import {
  getArchivedAssignments,
  mergeAssignmentOverrides,
} from './lockedAssignments'

function AutoTextarea({ value, onChange, rows = 3, style, ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea ref={ref} value={value} onChange={onChange} rows={rows} style={{ resize: 'none', overflowY: 'hidden', ...style }} {...props} />
  )
}

const STORAGE_KEY = 'rotation-web-state-v7'
const IDENTITY_KEY = 'rotation-web-identity-v1'
const TEXT_SCALE_KEY = 'rotation-web-text-scale-v1'
const DEFAULT_TEXT_SCALE_KEY = 'rotation-web-default-text-scale-v1'
const THEME_STORAGE_KEY = 'waon-theme'
const UI_MODE_KEY = 'waon-ui-mode'
const MIN_TEXT_SCALE = 80
const MAX_TEXT_SCALE = 200
const ADMIN_NAME = '裴'
const MONTH_JP = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const BRAND_ICONS = [
  { id: 'pencil', label: 'えんぴつ', src: waonIcon1 },
  { id: 'sakura-book', label: 'さくら本', src: waonIcon2 },
  { id: 'class', label: '教室', src: waonIcon3 },
  { id: 'japan', label: '和風', src: waonIcon4 },
  { id: 'enso', label: '円相', src: waonIcon5 },
  { id: 'rainbow-book', label: 'みんな', src: waonIcon6 },
]
const SEEDED_MONTH_KEY = '2026-5'
const REPEATED_CLASS_RULE_START_MONTH = '2026-8'
const SEEDED_SESSION_TYPES = {
  [SEEDED_MONTH_KEY]: {
    '5/2': 'holiday',
    '5/9': 'meeting',
  },
}
const FIXED_MAY_2026_CLASSES = {
  '5/9': ['\u304d\u304f', '\u3055\u304f\u3089', '\u308f\u304b\u3070', '\u5165\u9580'],
  '5/16': ['\u304d\u304f', '\u3055\u304f\u3089', '\u308f\u304b\u3070', '\u5165\u9580'],
  '5/23': ['\u304d\u304f', '\u3055\u304f\u3089', '\u308f\u304b\u3070', '\u5165\u9580'],
  '5/30': ['\u304d\u304f', '\u3055\u304f\u3089', '\u308f\u304b\u3070', '\u5165\u9580', '\u5165\u9580(\u738b)'],
}
const FIXED_MAY_2026_MANUAL = {
  '5/9': {
    '\u304d\u304f': '\u5ca1\u5d0e',
    '\u308f\u304b\u3070': '\u9580\u99ac',
    '\u5165\u9580': '\u8526\u5c3e',
    '\u3055\u304f\u3089': '\u88f4',
  },
  '5/16': {
    '\u304d\u304f': '\u5ca1\u5d0e',
    '\u3055\u304f\u3089': '\u5ca1\u672c',
    '\u308f\u304b\u3070': '\u8526\u5c3e',
    '\u5165\u9580': '\u76f8\u826f',
  },
  '5/23': {
    '\u304d\u304f': '\u5ca1\u5d0e',
    '\u3055\u304f\u3089': '\u5ca1\u672c',
    '\u308f\u304b\u3070': '\u67f4\u7530',
    '\u5165\u9580': '\u4eca\u6751',
  },
  '5/30': {
    '\u304d\u304f': '\u5ca1\u672c',
    '\u3055\u304f\u3089': '\u67f4\u7530',
    '\u308f\u304b\u3070': '\u4eca\u6751',
    '\u5165\u9580': '\u76f8\u826f',
    '\u5165\u9580(\u738b)': '\u88f4',
  },
}
const SEEDED_ATTENDANCE = {
  [SEEDED_MONTH_KEY]: {
    岡本: { '5/9': 'meeting_only', '5/16': 'yes', '5/23': 'yes', '5/30': 'maybe' },
    柴田: { '5/9': 'meeting_only', '5/16': 'yes', '5/23': 'yes', '5/30': 'yes' },
    今村: { '5/9': 'maybe', '5/16': 'no', '5/23': 'yes', '5/30': 'yes' },
    門馬: {},
    蔦尾: { '5/9': 'yes', '5/16': 'yes', '5/23': 'yes', '5/30': 'no' },
    岡崎: { '5/9': 'yes', '5/16': 'yes', '5/23': 'yes', '5/30': 'no' },
    相良: { '5/9': 'no', '5/16': 'yes', '5/23': 'no', '5/30': 'yes' },
    裴: { '5/9': 'yes' },
  },
}
const SEEDED_MEMOS = {
  [SEEDED_MONTH_KEY]: {
    '5/2': 'わをん休み',
    '5/9': '例会。岡本さんと柴田さんは例会のみ。裴さんを追加。今村さんは△。',
    '5/16': '王さん参加週。人数に余裕があれば入門を2クラスに分ける。',
    '5/23': '王さんは不参加。',
    '5/30': '王さん参加週。人数が足りなければ入門は1クラス。岡本さんは△。',
  },
}

function buildFallbackState() {
  return {
    year: 2026,
    month: 5,
    allClasses: ALL_CLASSES,
    defaultClasses: DEFAULT_CLASSES,
    statusOptions: DEFAULT_STATUS_OPTIONS,
    specialRules: {
      wangSplit: true,
      randomSeed: Math.random().toString(36).slice(2),
      avoidRepeatedClassesFromMonth: REPEATED_CLASS_RULE_START_MONTH,
    },
    teachers: DEFAULT_TEACHERS,
    currentTeacher: DEFAULT_TEACHERS[0].name,
    sessionTypesByMonth: SEEDED_SESSION_TYPES,
    sessionClassesByMonth: {},
    sessionManualByMonth: {},
    sessionSpecialNotesByMonth: {},
    attendanceByMonth: SEEDED_ATTENDANCE,
    memosByMonth: SEEDED_MEMOS,
    lockedMonths: {},
    archivedSchedules: {},
    meetingNotesByMonth: {},
    myMemosByTeacher: {},
    lessonReportsByMonth: {},
    studentDefaults: {},
    attendanceCountsByMonth: {},
    bulletinBoard: [],
    brandIconId: BRAND_ICONS[0].id,
  }
}

function mergeState(saved) {
  const fallback = buildFallbackState()
  if (!saved) return fallback
  const builtInStatusOptions = Object.fromEntries(DEFAULT_STATUS_OPTIONS.map((opt) => [opt.id, opt]))
  const mergedStatusOptions = (saved.statusOptions ?? DEFAULT_STATUS_OPTIONS).map((opt) => (
    builtInStatusOptions[opt.id] ? { ...opt, ...builtInStatusOptions[opt.id] } : opt
  ))
  const savedSessionManualByMonth = saved.sessionManualByMonth ?? {}
  const savedSessionClassesByMonth = saved.sessionClassesByMonth ?? {}
  const mayManualIsMissing = Object.keys(savedSessionManualByMonth[SEEDED_MONTH_KEY] ?? {}).length === 0
  return {
    year: saved.year ?? fallback.year,
    month: saved.month ?? fallback.month,
    allClasses: saved.allClasses ?? ALL_CLASSES,
    defaultClasses: saved.defaultClasses ?? DEFAULT_CLASSES,
    statusOptions: mergedStatusOptions,
    specialRules: {
      avoidRepeatedClassesFromMonth: REPEATED_CLASS_RULE_START_MONTH,
      ...(saved.specialRules ?? { wangSplit: true, randomSeed: Math.random().toString(36).slice(2) }),
    },
    teachers: saved.teachers ?? DEFAULT_TEACHERS,
    currentTeacher: saved.currentTeacher ?? fallback.currentTeacher,
    sessionTypesByMonth: { ...SEEDED_SESSION_TYPES, ...(saved.sessionTypesByMonth ?? {}) },
    sessionClassesByMonth: {
      ...savedSessionClassesByMonth,
      ...(mayManualIsMissing ? {
        [SEEDED_MONTH_KEY]: {
          ...(savedSessionClassesByMonth[SEEDED_MONTH_KEY] ?? {}),
          ...FIXED_MAY_2026_CLASSES,
        },
      } : {}),
    },
    sessionManualByMonth: {
      ...savedSessionManualByMonth,
      ...(mayManualIsMissing ? { [SEEDED_MONTH_KEY]: FIXED_MAY_2026_MANUAL } : {}),
    },
    sessionSpecialNotesByMonth: saved.sessionSpecialNotesByMonth ?? {},
    attendanceByMonth: { ...SEEDED_ATTENDANCE, ...(saved.attendanceByMonth ?? {}) },
    memosByMonth: { ...SEEDED_MEMOS, ...(saved.memosByMonth ?? {}) },
    lockedMonths: saved.lockedMonths ?? {},
    archivedSchedules: saved.archivedSchedules ?? {},
    meetingNotesByMonth: saved.meetingNotesByMonth ?? {},
    myMemosByTeacher: saved.myMemosByTeacher ?? {},
    lessonReportsByMonth: saved.lessonReportsByMonth ?? {},
    studentDefaults: saved.studentDefaults ?? {},
    attendanceCountsByMonth: saved.attendanceCountsByMonth ?? {},
    bulletinBoard: Array.isArray(saved.bulletinBoard) ? saved.bulletinBoard : [],
    brandIconId: BRAND_ICONS.some((icon) => icon.id === saved.brandIconId) ? saved.brandIconId : fallback.brandIconId,
  }
}

const REMOTE_PROTECTED_STATE_KEYS = [
  'sessionTypesByMonth',
  'sessionClassesByMonth',
  'sessionManualByMonth',
  'sessionSpecialNotesByMonth',
  'attendanceByMonth',
  'memosByMonth',
  'lockedMonths',
  'archivedSchedules',
  'meetingNotesByMonth',
  'myMemosByTeacher',
  'lessonReportsByMonth',
  'studentDefaults',
  'attendanceCountsByMonth',
]

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseStateSnapshot(snapshot) {
  try {
    return snapshot ? JSON.parse(snapshot) : null
  } catch {
    return null
  }
}

function sameStateValue(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return Object.is(a, b)
  }
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function mergeProtectedValueForSave(localValue, baseValue, remoteValue) {
  if (localValue == null && isPlainObject(remoteValue)) {
    return remoteValue
  }

  if (!isPlainObject(localValue)) {
    return sameStateValue(localValue, baseValue) ? (remoteValue ?? localValue) : localValue
  }

  const remoteObject = isPlainObject(remoteValue) ? remoteValue : {}
  const baseObject = isPlainObject(baseValue) ? baseValue : {}
  const nextValue = { ...remoteObject }

  Object.entries(localValue).forEach(([key, localChild]) => {
    const baseChild = baseObject[key]
    const remoteChild = remoteObject[key]

    if (sameStateValue(localChild, baseChild)) {
      nextValue[key] = remoteChild ?? localChild
      return
    }

    if (isPlainObject(localChild) && (isPlainObject(baseChild) || isPlainObject(remoteChild))) {
      nextValue[key] = mergeProtectedValueForSave(localChild, baseChild, remoteChild)
      return
    }

    nextValue[key] = localChild
  })

  Object.keys(remoteObject).forEach((key) => {
    if (hasOwn(localValue, key)) return
    if (hasOwn(baseObject, key)) {
      delete nextValue[key]
    }
  })

  return nextValue
}

function buildProtectedStateForSave(localState, remoteState, baseState) {
  if (!remoteState) return localState
  const nextState = { ...localState }

  REMOTE_PROTECTED_STATE_KEYS.forEach((key) => {
    nextState[key] = mergeProtectedValueForSave(localState?.[key], baseState?.[key], remoteState?.[key])
  })

  return nextState
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildFallbackState()
    return mergeState(JSON.parse(raw))
  } catch {
    return buildFallbackState()
  }
}

function loadIdentity() {
  try {
    return localStorage.getItem(IDENTITY_KEY) || ''
  } catch {
    return ''
  }
}

function loadTextScale() {
  try {
    const saved = localStorage.getItem(DEFAULT_TEXT_SCALE_KEY) ?? localStorage.getItem(TEXT_SCALE_KEY)
    const numeric = Number(saved)
    if (Number.isFinite(numeric) && numeric > 0) return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Math.round(numeric)))
    if (saved === 'large') return 112
    if (saved === 'xlarge') return 126
    return 100
  } catch {
    return 100
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'clay'
  } catch {
    return 'clay'
  }
}

function loadUiMode() {
  try {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('ui')
    if (['auto', 'desktop', 'mobile'].includes(fromUrl)) return fromUrl
    const saved = localStorage.getItem(UI_MODE_KEY)
    return ['auto', 'desktop', 'mobile'].includes(saved) ? saved : 'auto'
  } catch {
    return 'auto'
  }
}

function ClassChip({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`class-chip ${checked ? 'class-chip-on' : ''} ${disabled ? 'class-chip-disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  )
}

function scheduleCellText(teacher, session, attendance, statusOptions) {
  const assigned = Object.entries(session.assignments || {})
    .filter(([, assignedTeacher]) => assignedTeacher === teacher.name)
    .map(([className]) => className)
    .join(' / ')
  if (assigned) return assigned
  if (session.closed) return ''
  if (session.meetingOnlyTeachers?.includes(teacher.name) || session.maybeMeetingTeachers?.includes(teacher.name)) return '会議'
  const statusId = attendance?.[teacher.name]?.[session.key] ?? teacher.defaultStatus ?? 'no'
  const behavior = statusOptions.find((option) => option.id === statusId)?.behavior ?? 'no'
  if (behavior === 'yes') return '○'
  if (behavior === 'maybe' || behavior === 'maybe_meeting') return '△'
  return '×'
}

function buildHtmlExport(year, month, teachers, sessions, schedule, attendance, statusOptions) {
  const rows = []
  rows.push('<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-size:14px}td,th{border:1px solid #000;padding:6px 10px;text-align:center}th{background:#f3f4f6}</style></head><body>')
  rows.push(`<h1>${year}年${month}月 担当表</h1>`)
  rows.push('<p>☆　当番は当てませんので、当日の担当者が協力して教室の準備をお願いします。</p>')
  rows.push('<table>')
  rows.push('<tr><th></th>' + sessions.map((s) => `<th>${s.label}</th>`).join('') + '</tr>')
  rows.push('<tr><td>区分</td>' + schedule.map((s) => `<td>${s.closed ? '休み' : s.meeting ? '例会' : '通常'}</td>`).join('') + '</tr>')
  rows.push('<tr><td>特別連絡</td>' + schedule.map((s) => `<td>${s.special || ''}</td>`).join('') + '</tr>')
  for (const teacher of teachers) {
    const row = schedule.map((s) => `<td>${scheduleCellText(teacher, s, attendance, statusOptions)}</td>`)
    rows.push(`<tr><td><b>${teacher.name}</b></td>${row.join('')}</tr>`)
  }
rows.push('</table>')
  rows.push('<p>＊事務業務はその日の担当者が助け合って行い、最後に全員で確認してください。</p>')
  rows.push('</body></html>')
  return rows.join('\n')
}

function buildMarkdownExport(year, month, teachers, sessions, schedule, memos, attendance, statusOptions) {
  const lines = []
  lines.push(`# ${year}年${month}月 担当表`)
  lines.push('')
  lines.push(`|  | ${sessions.map((s) => s.label).join(' | ')} |`)
  lines.push(`| --- | ${sessions.map(() => '---').join(' | ')} |`)
  lines.push(`| 特別連絡 | ${schedule.map((s) => s.special || '').join(' | ')} |`)
  if (schedule.some((s) => s.unassignedClasses?.length > 0)) {
    lines.push(`| 未担当 | ${schedule.map((s) => (s.unassignedClasses || []).join('、')).join(' | ')} |`)
  }
  for (const teacher of teachers) {
    const row = schedule.map((s) => scheduleCellText(teacher, s, attendance, statusOptions))
    lines.push(`| ${teacher.name} | ${row.join(' | ')} |`)
  }
  lines.push('')
  lines.push('## メモ')
  lines.push('')
  for (const session of sessions) {
    lines.push(`- ${session.label}: ${memos[session.key] || ''}`)
  }
  return lines.join('\n')
}

function scheduleTypeLabel(session) {
  if (session.closed) return '休み'
  if (session.meeting) return '例会'
  return '通常'
}

function buildRotationTableDocx(year, month, teachers, sessions, schedule, attendance, statusOptions) {
  const tableWidth = 9000
  const nameColWidth = 1400
  const dayColWidth = Math.floor((tableWidth - nameColWidth) / Math.max(1, sessions.length))
  const colGrid = [nameColWidth, ...sessions.map(() => dayColWidth)]
  const bodyRows = []

  const makeCell = (text, width, { align = 'center', bold = false } = {}) => (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>${wordParagraph(text, { align, bold, size: 28, after: 0, line: 280 })}</w:tc>`
  )

  const makeRow = (cells) => `<w:tr>${cells.join('')}</w:tr>`

  bodyRows.push(makeRow([
    makeCell('', nameColWidth, { bold: true }),
    ...sessions.map((s) => makeCell(s.label, dayColWidth, { bold: true })),
  ]))
  bodyRows.push(makeRow([
    makeCell('区分', nameColWidth),
    ...schedule.map((s) => makeCell(scheduleTypeLabel(s), dayColWidth)),
  ]))
  bodyRows.push(makeRow([
    makeCell('特別連絡', nameColWidth, { align: 'left' }),
    ...schedule.map((s) => makeCell(s.special || '', dayColWidth, { align: 'left' })),
  ]))

  for (const teacher of teachers) {
    const row = schedule.map((s) => scheduleCellText(teacher, s, attendance, statusOptions))
    bodyRows.push(makeRow([
      makeCell(teacher.name, nameColWidth),
      ...row.map((cellText) => makeCell(cellText, dayColWidth, { align: 'left' })),
    ]))
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${wordParagraph(`${year} 年 ${month} 月  担当表`, { align: 'center', bold: true, size: 48, after: 240, line: 360 })}
${wordParagraph('☆　当番は当てませんので、当日の担当者が協力して教室の準備をお願いします。', { size: 24, after: 140, line: 260 })}
<w:tbl>
<w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="595959"/><w:left w:val="single" w:sz="8" w:color="595959"/><w:bottom w:val="single" w:sz="8" w:color="595959"/><w:right w:val="single" w:sz="8" w:color="595959"/><w:insideH w:val="single" w:sz="8" w:color="595959"/><w:insideV w:val="single" w:sz="8" w:color="595959"/></w:tblBorders></w:tblPr>
<w:tblGrid>${colGrid.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
${bodyRows.join('')}
</w:tbl>
${wordParagraph('＊事務業務はその日の担当者が助け合って行い、最後に全員で確認してください。', { size: 24, after: 0, line: 260 })}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`

  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: documentXml },
  ])
}

// ── LINE text builder ─────────────────────────────────────────────────────────
function buildLineText(year, month, schedule, memos) {
  const lines = [`【${year}年${month}月 担当表】`, '']
  for (const session of schedule) {
    const typeLabel = session.closed ? 'やすみ' : session.meeting ? '例会' : ''
    lines.push(`◆ ${session.label}${typeLabel ? `（${typeLabel}）` : ''}`)
    if (session.closed) {
      lines.push('わをん休み')
    } else {
      if (session.selectedTeachers.length > 0)
        lines.push(`出席：${session.selectedTeachers.join('・')}`)
      if (session.meetingOnlyTeachers.length > 0)
        lines.push(`例会のみ：${session.meetingOnlyTeachers.join('・')}`)
      if (session.maybeMeetingTeachers?.length > 0)
        lines.push(`△・会議○：${session.maybeMeetingTeachers.join('・')}`)
      if (session.selectedMaybeTeachers?.length > 0)
        lines.push(`△から追加：${session.selectedMaybeTeachers.join('・')}`)
      const memo = memos[session.key]
      if (memo) lines.push(`※ ${memo}`)
      for (const [cls, teacher] of Object.entries(session.assignments))
        lines.push(`${cls} → ${teacher}`)
      if (session.unassignedClasses?.length > 0)
        lines.push(`⚠ 未担当：${session.unassignedClasses.join('・')}`)
    }
    lines.push('─'.repeat(14))
    lines.push('')
  }
  return lines.join('\n').trim()
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function wordRun(text, { bold = false, size = 24 } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Meiryo" w:hAnsi="Meiryo" w:eastAsia="Meiryo" w:cs="Meiryo"/><w:sz w:val="${size}"/>${bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
}

function wordParagraph(text, { bold = false, size = 24, align = 'left', after = 0, line = 240, firstLine = 0, hanging = 0 } = {}) {
  const ind = firstLine || hanging ? `<w:ind${firstLine ? ` w:firstLine="${firstLine}"` : ''}${hanging ? ` w:hanging="${hanging}"` : ''}/>` : ''
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="${after}" w:line="${line}" w:lineRule="auto"/>${ind}</w:pPr>${wordRun(text, { bold, size })}</w:p>`
}

function textToWordParagraphs(value, options = {}) {
  const lines = String(value ?? '').split(/\r?\n/)
  return lines.map((line) => wordParagraph(line, options)).join('')
}

function contentToNumberedWordParagraphs(value, { line = 240 } = {}) {
  const lines = formatLessonContentLines(value)
  if (lines.length === 0) return wordParagraph('', { bold: true, size: 24 })
  return lines.map((item) => wordParagraph(item.display, { bold: true, size: 24, after: 0, line })).join('')
}

function handoffToBulletWordParagraphs(value, { line = 240 } = {}) {
  const lines = formatLessonHandoffLines(value)
  if (lines.length === 0) return wordParagraph('', { bold: true, size: 24 })
  return lines.map((item) => wordParagraph(item.display, { bold: true, size: 24, after: 0, line })).join('')
}

const LESSON_REPORT_PAGE = {
  tableLeftMm: 15.05,
  tableTopMm: 47.91,
  tableWidthMm: 176.72,
  colWidthsMm: [51.15, 51.15, 74.43],
  rowHeightsMm: [8.47, 8.41, 24.93, 115.75, 49.74],
  footerTopMm: 260.4,
}

function mmToDxa(mm) {
  return Math.round((mm / 25.4) * 1440)
}

const LESSON_REPORT_WORD = {
  tableWidth: mmToDxa(LESSON_REPORT_PAGE.tableWidthMm),
  colWidths: LESSON_REPORT_PAGE.colWidthsMm.map(mmToDxa),
  rowHeights: [6.6, 6.9, 24.93, 115.75, 49.74].map(mmToDxa),
  leftMargin: mmToDxa(LESSON_REPORT_PAGE.tableLeftMm),
  topMargin: mmToDxa(LESSON_REPORT_PAGE.tableTopMm),
  rightMargin: mmToDxa(210 - LESSON_REPORT_PAGE.tableLeftMm - LESSON_REPORT_PAGE.tableWidthMm),
  bottomMargin: mmToDxa(14),
}

function wordCell(content, { span = 1, width = LESSON_REPORT_WORD.tableWidth, vMerge = false, padTop = 55, padBottom = 55, padLeft = 120, padRight = 120 } = {}) {
  const gridSpan = span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''
  const merge = vMerge ? '<w:vMerge w:val="restart"/>' : ''
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan}${merge}<w:tcMar><w:top w:w="${padTop}" w:type="dxa"/><w:left w:w="${padLeft}" w:type="dxa"/><w:bottom w:w="${padBottom}" w:type="dxa"/><w:right w:w="${padRight}" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`
}

function wordRow(cells, height) {
  const rowProperties = height ? `<w:trPr><w:trHeight w:val="${height}" w:hRule="atLeast"/></w:trPr>` : ''
  return `<w:tr>${rowProperties}${cells}</w:tr>`
}

function crc32(bytes) {
  let crc = -1
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ -1) >>> 0
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff]
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

function makeZip(files) {
  const encoder = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0
  const { time, day } = dosDateTime()

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name)
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(data)
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(time), ...u16(day),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ])
    chunks.push(local, nameBytes, data)
    central.push({ file, nameBytes, data, crc, offset, time, day })
    offset += local.length + nameBytes.length + data.length
  })

  let centralSize = 0
  central.forEach((entry) => {
    const header = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(entry.time), ...u16(entry.day),
      ...u32(entry.crc), ...u32(entry.data.length), ...u32(entry.data.length), ...u16(entry.nameBytes.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(entry.offset),
    ])
    chunks.push(header, entry.nameBytes)
    centralSize += header.length + entry.nameBytes.length
  })

  chunks.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]))
  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

function normalizeLessonNumber(value) {
  const normalized = String(value ?? '').replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
  if (/^\d+$/.test(normalized)) return Number(normalized)
  const jp = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  if (jp[normalized] != null) return jp[normalized]
  return null
}

function countLessonAttendees(attendees, fallback = '') {
  const text = String(attendees ?? '')
  const explicit = text.match(/計\s*[（(]?\s*([0-9０-９一二三四五六七八九十]+)\s*[）)]?\s*名?/)
  if (explicit) {
    const count = normalizeLessonNumber(explicit[1])
    if (count != null) return String(count)
  }
  const cleaned = text
    .replace(/出席者/g, '')
    .replace(/計\s*[（(]?\s*[0-9０-９一二三四五六七八九十]+\s*[）)]?\s*名?/g, '')
    .trim()
  const inferred = cleaned.split(/[、,\s　]+/).filter(Boolean).length
  if (inferred > 0) return String(inferred)
  return fallback ? String(fallback) : ''
}


function lessonAttendeeCountValue(report) {
  const manualCount = String(report?.attendeeCount ?? '').trim()
  if (manualCount) return manualCount
  return countLessonAttendees(report?.attendees)
}

function lessonReportNeedsCompactWordLayout(report) {
  const fields = [report?.unit, report?.content, report?.handoff].map((value) => String(value ?? ''))
  const characterCount = Array.from(fields.join('').replace(/\s/g, '')).length
  const lineCount = fields.reduce((total, value) => total + value.split(/\r?\n/).filter((line) => line.trim()).length, 0)
  return characterCount > 560 || lineCount > 12
}

function buildLessonReportDocx(report) {
  const attendeeCount = lessonAttendeeCountValue(report)
  const compactLayout = lessonReportNeedsCompactWordLayout(report)
  const { tableWidth, colWidths, rightMargin, leftMargin } = LESSON_REPORT_WORD
  const rowHeights = compactLayout
    ? [6.6, 6.9, 0, 0, 0].map((height) => height ? mmToDxa(height) : 0)
    : LESSON_REPORT_WORD.rowHeights
  const topMargin = compactLayout ? mmToDxa(15) : LESSON_REPORT_WORD.topMargin
  const bottomMargin = compactLayout ? mmToDxa(12) : LESSON_REPORT_WORD.bottomMargin
  const paragraphLine = compactLayout ? 220 : 240
  const contentPadding = compactLayout ? 35 : 55
  const unitParagraphs = textToWordParagraphs(`単元　${report.unit || ''}`, { size: 24, after: 0, line: paragraphLine })
  const contentParagraphs = contentToNumberedWordParagraphs(report.content, { line: paragraphLine })
  const handoffParagraphs = `${wordParagraph('申し送り及び感想：', { bold: true, size: 24, after: 0, line: paragraphLine })}${handoffToBulletWordParagraphs(report.handoff, { line: paragraphLine })}`
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:tbl>
<w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:jc w:val="left"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="555555"/><w:left w:val="single" w:sz="4" w:color="555555"/><w:bottom w:val="single" w:sz="4" w:color="555555"/><w:right w:val="single" w:sz="4" w:color="555555"/><w:insideH w:val="single" w:sz="4" w:color="555555"/><w:insideV w:val="single" w:sz="4" w:color="555555"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="${colWidths[0]}"/><w:gridCol w:w="${colWidths[1]}"/><w:gridCol w:w="${colWidths[2]}"/></w:tblGrid>
${wordRow(`
${wordCell(wordParagraph(report.dateText, { size: 24, after: 0, line: 220 }), { width: colWidths[0], padTop: 20, padBottom: 20 })}
${wordCell(wordParagraph(`クラス　　${report.className}`, { size: 24, after: 0, line: 220 }), { width: colWidths[1], padTop: 20, padBottom: 20 })}
${wordCell(wordParagraph(`担当　　${report.teacherName}`, { size: 24, after: 0, line: 220 }), { width: colWidths[2], padTop: 20, padBottom: 20 })}
`, rowHeights[0])}
${wordRow(wordCell(wordParagraph(`出席者　　${report.attendees || ''}　計(${attendeeCount})名`, { size: 24, after: 0, line: 220 }), { span: 3, width: tableWidth, padTop: 20, padBottom: 20 }), rowHeights[1])}
${wordRow(wordCell(unitParagraphs, { span: 3, width: tableWidth, padTop: contentPadding, padBottom: contentPadding }), rowHeights[2])}
${wordRow(wordCell(contentParagraphs, { span: 3, width: tableWidth, padTop: contentPadding, padBottom: contentPadding, padLeft: 260, padRight: 260 }), rowHeights[3])}
${wordRow(wordCell(handoffParagraphs, { span: 3, width: tableWidth, padTop: contentPadding, padBottom: contentPadding, padLeft: 260, padRight: 260 }), rowHeights[4])}
</w:tbl>
<w:sectPr><w:footerReference w:type="default" r:id="rId1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${topMargin}" w:right="${rightMargin}" w:bottom="${bottomMargin}" w:left="${leftMargin}" w:header="720" w:footer="720"/></w:sectPr>
</w:body></w:document>`
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${wordParagraph('日本語ボランティアグループ　　わをん', { align: 'right', size: 24 })}</w:ftr>`

  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>' },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/footer1.xml', data: footerXml },
  ])
}

function buildLessonReportPdfHtml(report) {
  const attendeeCount = lessonAttendeeCountValue(report)
  const contentItems = formatLessonContentLines(report.content)
  const handoffItems = formatLessonHandoffLines(report.handoff)
  const page = LESSON_REPORT_PAGE
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeXml(report.className)} ${escapeXml(report.dateText)} 授業記録</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 210mm; height: 297mm; margin: 0; }
  body { font-family: Meiryo, "Yu Gothic", sans-serif; color: #111; font-size: 11pt; line-height: 1.35; }
  .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; background: white; }
  .report {
    position: absolute;
    left: ${page.tableLeftMm}mm;
    top: ${page.tableTopMm}mm;
    width: ${page.tableWidthMm}mm;
    height: ${page.rowHeightsMm.reduce((sum, value) => sum + value, 0).toFixed(2)}mm;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .report td { border: 0.18mm solid #555; vertical-align: top; padding: 1.25mm 2.1mm; overflow: hidden; }
  .row-1 { height: ${page.rowHeightsMm[0]}mm; }
  .row-2 { height: ${page.rowHeightsMm[1]}mm; }
  .row-3 { height: ${page.rowHeightsMm[2]}mm; }
  .row-4 { height: ${page.rowHeightsMm[3]}mm; }
  .row-5 { height: ${page.rowHeightsMm[4]}mm; }
  .top td { font-size: 11pt; line-height: 1.25; }
  .attendees { font-size: 10.5pt; line-height: 1.25; }
  .unit { font-size: 10.5pt; line-height: 1.42; }
  .content { padding: 2.1mm 7.5mm 2.1mm 10mm !important; font-weight: 700; font-size: 10.5pt; line-height: 1.45; }
  .report-line { margin: 0 0 1mm; padding-left: 6mm; text-indent: -6mm; }
  .handoff { padding: 2.1mm 7.5mm !important; font-weight: 700; font-size: 10.5pt; line-height: 1.45; }
  .handoff-title { margin: 0 0 1.2mm; }
  .footer {
    position: absolute;
    left: ${page.tableLeftMm}mm;
    top: ${page.footerTopMm}mm;
    width: ${page.tableWidthMm}mm;
    text-align: right;
    font-size: 10.5pt;
  }
  @media screen { body { background: #eee; } .page { margin: 0 auto; box-shadow: 0 0 0 1px #ddd; } }
</style>
</head>
<body>
<div class="page">
  <table class="report">
    <colgroup><col style="width:${page.colWidthsMm[0]}mm"><col style="width:${page.colWidthsMm[1]}mm"><col style="width:${page.colWidthsMm[2]}mm"></colgroup>
    <tr class="top row-1">
      <td>${escapeXml(report.dateText)}</td>
      <td>クラス　　${escapeXml(report.className)}</td>
      <td>担当　　${escapeXml(report.teacherName)}</td>
    </tr>
    <tr class="row-2"><td colspan="3" class="attendees">出席者　　${escapeXml(report.attendees || '')}　計(${escapeXml(attendeeCount)})名</td></tr>
    <tr class="row-3"><td colspan="3" class="unit">単元　${escapeXml(report.unit || '').replace(/\n/g, '<br>')}</td></tr>
    <tr class="row-4"><td colspan="3" class="content">${contentItems.map((line) => `<div class="report-line">${escapeXml(line.display)}</div>`).join('')}</td></tr>
    <tr class="row-5"><td colspan="3" class="handoff"><div class="handoff-title">申し送り及び感想：</div>${handoffItems.map((line) => `<div class="report-line">${escapeXml(line.display)}</div>`).join('')}</td></tr>
  </table>
  <div class="footer">日本語ボランティアグループ　　わをん</div>
</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));</script>
</body>
</html>`
}

function buildLessonReportPdfElement(report) {
  const attendeeCount = lessonAttendeeCountValue(report)
  const contentItems = formatLessonContentLines(report.content)
  const handoffItems = formatLessonHandoffLines(report.handoff)
  const page = LESSON_REPORT_PAGE
  const root = document.createElement('div')
  root.style.position = 'fixed'
  root.style.left = '-10000px'
  root.style.top = '0'
  root.style.width = '210mm'
  root.style.minHeight = '297mm'
  root.style.background = '#fff'
  root.style.fontFamily = '"Noto Sans JP", Meiryo, "Yu Gothic", sans-serif'
  root.style.color = '#111'
  root.style.fontSize = '12pt'
  root.style.lineHeight = '1.45'
  root.innerHTML = `
    <div style="position:relative;width:210mm;min-height:297mm;background:#fff;">
      <table data-report-table="true" style="position:absolute;left:${page.tableLeftMm}mm;top:${page.tableTopMm}mm;width:${page.tableWidthMm}mm;border-collapse:collapse;table-layout:fixed;">
        <colgroup>
          <col style="width:${page.colWidthsMm[0]}mm">
          <col style="width:${page.colWidthsMm[1]}mm">
          <col style="width:${page.colWidthsMm[2]}mm">
        </colgroup>
        <tr style="height:${page.rowHeightsMm[0]}mm;">
          <td style="border:0.18mm solid #555;vertical-align:top;padding:1.2mm 1.85mm 0.6mm;overflow:hidden;font-size:12pt;line-height:1.15;">${escapeXml(report.dateText)}</td>
          <td style="border:0.18mm solid #555;vertical-align:top;padding:1.2mm 1.85mm 0.6mm;overflow:hidden;font-size:12pt;line-height:1.15;">クラス　　${escapeXml(report.className)}</td>
          <td style="border:0.18mm solid #555;vertical-align:top;padding:1.2mm 1.85mm 0.6mm;overflow:hidden;font-size:12pt;line-height:1.15;">担当　　${escapeXml(report.teacherName)}</td>
        </tr>
        <tr style="height:${page.rowHeightsMm[1]}mm;">
          <td colspan="3" style="border:0.18mm solid #555;vertical-align:top;padding:1.15mm 1.85mm 0.6mm;overflow:hidden;font-size:12pt;line-height:1.18;">出席者　　${escapeXml(report.attendees || '')}　計(${escapeXml(attendeeCount)})名</td>
        </tr>
        <tr style="height:${page.rowHeightsMm[2]}mm;">
          <td colspan="3" style="border:0.18mm solid #555;vertical-align:top;padding:1.15mm 1.85mm;overflow:hidden;font-size:12pt;line-height:1.46;">単元　${escapeXml(report.unit || '').replace(/\n/g, '<br>')}</td>
        </tr>
        <tr>
          <td data-report-content-cell="true" colspan="3" style="border:0.18mm solid #555;vertical-align:top;padding:1.45mm 7.5mm 1.45mm 9.7mm;font-weight:700;font-size:12pt;line-height:1.46;">
            <div data-report-content="true" style="min-height:${page.rowHeightsMm[3] - 3.2}mm;">
            ${contentItems.map((line) => `<div style="margin:0 0 1mm 0;padding-left:6.1mm;text-indent:-6.1mm;">${escapeXml(line.display)}</div>`).join('')}
            </div>
          </td>
        </tr>
        <tr>
          <td data-report-handoff-cell="true" colspan="3" style="border:0.18mm solid #555;vertical-align:top;padding:1.45mm 7.5mm;font-weight:700;font-size:12pt;line-height:1.46;">
            <div data-report-handoff="true" style="min-height:${page.rowHeightsMm[4] - 3.2}mm;">
            <div style="margin:0;">申し送り及び感想：</div>
            ${handoffItems.map((line) => `<div style="margin:0 0 0.7mm 0;padding-left:6.1mm;text-indent:-6.1mm;">${escapeXml(line.display)}</div>`).join('')}
            </div>
          </td>
        </tr>
      </table>
      <div data-report-footer="true" style="position:absolute;left:${page.tableLeftMm}mm;top:${page.footerTopMm}mm;width:${page.tableWidthMm}mm;text-align:right;font-size:12pt;">日本語ボランティアグループ　　わをん</div>
    </div>
  `
  return root
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return window.btoa(binary)
}

async function renderElementToA4PdfBlob(element, prepareElement) {
  document.body.appendChild(element)
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    await document.fonts?.ready
    prepareElement?.(element)
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2.5,
      useCORS: true,
      logging: false,
    })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    const pages = []
    const pageHeightPx = Math.floor(canvas.width * (297 / 210))
    for (let offsetY = 0, pageIndex = 0; offsetY < canvas.height; offsetY += pageHeightPx, pageIndex += 1) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = pageHeightPx
      const context = pageCanvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      if (pageIndex > 0) pdf.addPage()
      const pageImage = pageCanvas.toDataURL('image/jpeg', 0.96)
      pages.push(pageImage)
      pdf.addImage(pageImage, 'JPEG', 0, 0, 210, 297)
    }
    return { blob: pdf.output('blob'), pages }
  } finally {
    element.remove()
  }
}

async function renderElementToPngBlob(element, prepareElement) {
  document.body.appendChild(element)
  try {
    const { default: html2canvas } = await import('html2canvas')
    await document.fonts?.ready
    prepareElement?.(element)
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2.5,
      useCORS: true,
      logging: false,
    })
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNGデータを作成できませんでした。')
    return blob
  } finally {
    element.remove()
  }
}

function ScrollNav({ sections, activeSection, navOpen, onToggle }) {
  function scrollTo(id) {
    const el = document.getElementById(id)
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - 18
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }
  return (
    <>
      <button type="button" className={`scroll-nav-toggle ${navOpen ? 'scroll-nav-toggle-open' : ''}`} onClick={() => onToggle?.()} aria-expanded={navOpen} aria-controls="scroll-nav-panel">
        {navOpen ? '目次を閉じる' : '目次'}
      </button>
      <nav id="scroll-nav-panel" className={`scroll-nav ${navOpen ? 'scroll-nav-open' : ''}`} aria-label="セクションナビ">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`scroll-nav-item ${activeSection === s.id ? 'scroll-nav-item-active' : ''}`}
            onClick={() => { scrollTo(s.id); onToggle?.(false) }}
            title={s.label}
          >
            {s.label}
          </button>
        ))}
      </nav>
    </>
  )
}

function ModeSwitch({ uiMode, onChange, compact = false }) {
  return (
    <div className={compact ? 'ui-mode-switch ui-mode-switch-compact' : 'ui-mode-switch'} aria-label="UI表示切替">
      {[
        { id: 'auto', label: '自動' },
        { id: 'desktop', label: 'デスクトップ' },
        { id: 'mobile', label: 'スマホ' },
      ].map((mode) => (
        <button key={mode.id} type="button" className={uiMode === mode.id ? 'active' : ''} onClick={() => onChange(mode.id)}>
          {mode.label}
        </button>
      ))}
    </div>
  )
}

function getBrandIcon(iconId) {
  return BRAND_ICONS.find((icon) => icon.id === iconId) ?? BRAND_ICONS[0]
}

function BrandMark({ iconId, size = 'normal' }) {
  const icon = getBrandIcon(iconId)
  return (
    <span className={`brand-mark brand-mark-${size}`}>
      <img src={icon.src} alt="Wawon" />
    </span>
  )
}

function BrandIconPicker({ value, onChange, compact = false }) {
  const activeIcon = getBrandIcon(value)
  return (
    <details className={compact ? 'brand-icon-picker brand-icon-picker-compact' : 'brand-icon-picker'}>
      <summary className="brand-icon-picker-summary">
        <span className="brand-icon-summary-left">
          <span className="brand-icon-picker-label">サイトアイコン</span>
          <strong>{activeIcon.label}</strong>
        </span>
        <img src={activeIcon.src} alt="" />
      </summary>
      <div className="brand-icon-options">
        {BRAND_ICONS.map((icon) => (
          <button
            key={icon.id}
            type="button"
            className={value === icon.id ? 'brand-icon-option active' : 'brand-icon-option'}
            onClick={() => onChange?.(icon.id)}
            title={icon.label}
            aria-label={icon.label}
          >
            <img src={icon.src} alt="" />
          </button>
        ))}
      </div>
    </details>
  )
}

function IdentityGate({ teachers, onSelect, uiMode = 'auto', onUiModeChange = () => {}, brandIconId = BRAND_ICONS[0].id, onBrandIconChange = () => {} }) {
  const previewSections = ['ホーム', '出席入力', '担当表', '伝言板・メモ']
  return (
    <div className="page">
      <aside className="app-sidebar" aria-label="メインナビゲーション">
        <div className="sidebar-brand">
          <BrandMark iconId={brandIconId} />
          <div>
            <strong>Wawon</strong>
            <span>Rotation</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {previewSections.map((label, index) => (
            <button key={label} type="button" className={`sidebar-link ${index === 0 ? 'sidebar-link-active' : ''}`} disabled>
              <span className="sidebar-index">{String(index + 1).padStart(2, '0')}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>ダッシュボード</span>
          <strong>ログイン待ち</strong>
        </div>
        <BrandIconPicker value={brandIconId} onChange={onBrandIconChange} compact />
        <ModeSwitch uiMode={uiMode} onChange={onUiModeChange} />
      </aside>

      <main className="app-main">
      <section className="hero identity-hero">
        <div>
          <p className="eyebrow">Wawon Rotation</p>
          <h1>新しい担当表ワークスペースへ</h1>
          <p className="lead">左の目次で6つの画面に分け、出席、担当表、各回設定、先生ごとの担当可能クラスを見やすく整理します。</p>
          <BrandIconPicker value={brandIconId} onChange={onBrandIconChange} />
          <ModeSwitch uiMode={uiMode} onChange={onUiModeChange} compact />
        </div>
      </section>

      <section className="panel identity-panel">
        <h2 className="panel-title">まず自分の名前を選んでください</h2>
        <div className="identity-grid">
          {teachers.map((teacher) => (
            <button
              key={teacher.name}
              type="button"
              className={`identity-card ${teacher.name === ADMIN_NAME ? 'identity-card-admin' : ''}`}
              onClick={() => onSelect(teacher.name)}
            >
              <strong>{teacher.name}</strong>
              <span>{teacher.name === ADMIN_NAME ? '管理者' : '本人入力'}</span>
            </button>
          ))}
        </div>
      </section>
      </main>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState(loadLocalState)
  const [identity, setIdentity] = useState(loadIdentity)
  const [theme, setTheme] = useState(loadTheme)
  const [textScale, setTextScale] = useState(loadTextScale)
  const [textScaleDraft, setTextScaleDraft] = useState(() => String(loadTextScale()))
  const [cloudStatus, setCloudStatus] = useState('connecting')
  const [cloudMessage, setCloudMessage] = useState('共有データに接続しています...')
  const [exportMessage, setExportMessage] = useState('')
  const [scheduleDownloadStatus, setScheduleDownloadStatus] = useState('')
  const [sessionOpen, setSessionOpen] = useState(true)
  const [specialOpen, setSpecialOpen] = useState(false)
  const [teacherOpen, setTeacherOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState('')
  const [activeSection, setActiveSection] = useState('')
  const [activeView, setActiveView] = useState('home')
  const [uiMode, setUiMode] = useState(loadUiMode)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [mobileAdminPanel, setMobileAdminPanel] = useState('sessions')
  const [activeLessonReportId, setActiveLessonReportId] = useState('')
  const [backupHistory, setBackupHistory] = useState(loadLocalSnapshots)
  const [restoreCandidate, setRestoreCandidate] = useState(null)
  const [backupMessage, setBackupMessage] = useState('')
  const [mailPanelOpen, setMailPanelOpen] = useState(false)
  const [mailDispatchStatus, setMailDispatchStatus] = useState('idle')
  const [mailDispatchMessage, setMailDispatchMessage] = useState('')
  const [mailPreviewTab, setMailPreviewTab] = useState('email')
  const [mailPreviewConfirmed, setMailPreviewConfirmed] = useState(false)
  const [mailPdfPreview, setMailPdfPreview] = useState({ status: 'idle', url: '', base64: '', filename: '', pages: [], bytes: 0, error: '' })
  const [lessonMailPanelOpen, setLessonMailPanelOpen] = useState(false)
  const [lessonMailDispatchStatus, setLessonMailDispatchStatus] = useState('idle')
  const [lessonMailDispatchMode, setLessonMailDispatchMode] = useState('')
  const [lessonMailDispatchMessage, setLessonMailDispatchMessage] = useState('')
  const [lessonMailPreviewTab, setLessonMailPreviewTab] = useState('email')
  const [lessonMailPreviewConfirmed, setLessonMailPreviewConfirmed] = useState(false)
  const [lessonMailPdfPreview, setLessonMailPdfPreview] = useState({ status: 'idle', url: '', base64: '', filename: '', pages: [], bytes: 0, error: '' })
  const [navOpen, setNavOpen] = useState(false)
  const [showNewBulletin, setShowNewBulletin] = useState(false)
  const [newBulletinText, setNewBulletinText] = useState('')
  const [editingBulletinId, setEditingBulletinId] = useState(null)
  const [editingBulletinText, setEditingBulletinText] = useState('')
  const [bulletinDragOverId, setBulletinDragOverId] = useState(null)
  const [teacherDragOverIdx, setTeacherDragOverIdx] = useState(null)
  const newTeacherRef = useRef(null)
  const newClassRef = useRef(null)
  const newStatusRef = useRef(null)
  const cloudReadyRef = useRef(false)
  const saveTimerRef = useRef(null)
  const lastSyncedStateRef = useRef('')
  const stateRef = useRef(state)
  const urlTeacherRef = useRef(null)
  const backupFileRef = useRef(null)
  const bulletinDragRef = useRef(null)
  const teacherDragRef = useRef(null)
  const mailPdfUrlRef = useRef('')
  const lessonMailPdfUrlRef = useRef('')
  const mailPdfGenerationRef = useRef(0)
  const lessonMailPdfGenerationRef = useRef(0)

  const {
    year,
    month,
    allClasses,
    defaultClasses,
    statusOptions,
    specialRules,
    teachers,
    currentTeacher,
    sessionTypesByMonth,
    sessionClassesByMonth,
    sessionManualByMonth,
    sessionSpecialNotesByMonth,
    attendanceByMonth,
    memosByMonth,
    lockedMonths,
    archivedSchedules,
    meetingNotesByMonth,
    myMemosByTeacher,
    lessonReportsByMonth,
    studentDefaults,
    attendanceCountsByMonth,
    bulletinBoard,
    brandIconId,
  } = state

  const monthKey = `${year}-${month}`
  const today = new Date()
  const todayKey = `${today.getMonth() + 1}/${today.getDate()}`
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const isThisMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const attendance = attendanceByMonth[monthKey] ?? {}
  const memos = memosByMonth[monthKey] ?? {}
  const meetingNotes = meetingNotesByMonth[monthKey] ?? {}
  const myMemo = identity ? (myMemosByTeacher[identity]?.[monthKey] ?? '') : ''
  const isAdmin = identity === ADMIN_NAME
  const effectiveTeacher = isAdmin ? currentTeacher : identity
  const isMonthLocked = !!(lockedMonths?.[monthKey])
  const canEditAdmin = isAdmin && !isMonthLocked
  const activeBrandIconId = BRAND_ICONS.some((icon) => icon.id === brandIconId) ? brandIconId : BRAND_ICONS[0].id
  const effectiveSpecialRules = specialRulesForMonthKey(monthKey)

  function specialRulesForMonthKey(targetMonthKey) {
    const monthSeed = specialRules.randomSeedByMonth?.[targetMonthKey]
    const [targetYear, targetMonth] = targetMonthKey.split('-').map(Number)
    const [startYear, startMonth] = (specialRules.avoidRepeatedClassesFromMonth ?? REPEATED_CLASS_RULE_START_MONTH).split('-').map(Number)
    const avoidRepeatedClasses = (targetYear * 12 + targetMonth) >= (startYear * 12 + startMonth)
    return {
      ...specialRules,
      avoidRepeatedClasses,
      ...(monthSeed ? { randomSeed: monthSeed } : {}),
    }
  }

  function manualAssignmentsForMonthKey(targetMonthKey) {
    const currentManualAssignments = sessionManualByMonth[targetMonthKey] ?? {}
    if (!lockedMonths?.[targetMonthKey]) return sessionManualByMonth

    const archivedAssignments = getArchivedAssignments(
      archivedSchedules?.[targetMonthKey],
      allClasses,
    )
    return {
      ...sessionManualByMonth,
      [targetMonthKey]: mergeAssignmentOverrides(archivedAssignments, currentManualAssignments),
    }
  }

  const sessions = generateSessions(year, month, sessionTypesByMonth, sessionClassesByMonth, manualAssignmentsForMonthKey(monthKey), sessionSpecialNotesByMonth, defaultClasses, allClasses, effectiveSpecialRules)

  let schedule = []
  try {
    schedule = buildSchedule(attendance, sessions, teachers, statusOptions, effectiveSpecialRules)
  } catch (error) {
    console.error(error)
  }

  // ── Persist theme ────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage failures on restricted browsers/devices.
    }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(UI_MODE_KEY, uiMode)
    } catch {
      // Ignore storage failures.
    }
  }, [uiMode])

  // ── Persist local state ──────────────────────────────────────────────────────
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore storage failures on restricted browsers/devices.
    }
  }, [state])

  useEffect(() => {
    try {
      if (identity) localStorage.setItem(IDENTITY_KEY, identity)
      else localStorage.removeItem(IDENTITY_KEY)
    } catch {
      // Ignore storage failures on restricted browsers/devices.
    }
  }, [identity])

  useEffect(() => () => {
    if (mailPdfUrlRef.current) URL.revokeObjectURL(mailPdfUrlRef.current)
    if (lessonMailPdfUrlRef.current) URL.revokeObjectURL(lessonMailPdfUrlRef.current)
  }, [])

  useEffect(() => {
    setTextScaleDraft(String(textScale))
  }, [textScale])

  function normalizeTextScale(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) return null
    return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Math.round(numeric)))
  }

  function applyTextScaleDraft() {
    const normalized = normalizeTextScale(textScaleDraft)
    if (normalized == null) {
      setTextScaleDraft(String(textScale))
      return
    }
    setTextScale(normalized)
  }

  function saveDefaultTextScale() {
    const normalized = normalizeTextScale(textScaleDraft)
    if (normalized == null) return
    setTextScale(normalized)
    setTextScaleDraft(String(normalized))
    try {
      localStorage.setItem(DEFAULT_TEXT_SCALE_KEY, String(normalized))
    } catch {
      // Ignore storage failures on restricted browsers/devices.
    }
  }

  function resetTextScale() {
    setTextScale(100)
    setTextScaleDraft('100')
  }

  function setBrandIcon(iconId) {
    if (!BRAND_ICONS.some((icon) => icon.id === iconId)) return
    setState((s) => ({ ...s, brandIconId: iconId }))
  }

  useEffect(() => {
    if (!identity || isAdmin) return
    if (currentTeacher !== identity) {
      setState((s) => ({ ...s, currentTeacher: identity }))
    }
  }, [identity, isAdmin, currentTeacher])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobileViewport(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  // ── URL ?t= auto-select ──────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('t')
    if (t) urlTeacherRef.current = t
  }, [])

  useEffect(() => {
    const t = urlTeacherRef.current
    if (!t || identity) return
    if (teachers.some((tc) => tc.name === t)) {
      selectIdentity(t)
      urlTeacherRef.current = null
      const url = new URL(window.location.href)
      url.searchParams.delete('t')
      window.history.replaceState({}, '', url.toString())
    }
  }, [teachers, identity]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Supabase sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true

    async function loadRemoteState() {
      setCloudStatus('connecting')
      setCloudMessage('共有データを読み込んでいます...')

      const { data, error } = await supabase
        .from('rotation_states')
        .select('state, updated_at')
        .eq('id', ROTATION_STATE_ID)
        .maybeSingle()

      if (!alive) return

      if (error) {
        console.error(error)
        setCloudStatus('error')
        setCloudMessage('共有データを読み込めませんでした。接続設定を確認してください。')
        return
      }

      if (data?.state) {
        const merged = mergeState(data.state)
        const snapshot = JSON.stringify(merged)
        setBackupHistory(saveLocalSnapshot(stateRef.current, 'Supabase読込前'))
        lastSyncedStateRef.current = snapshot
        setState(merged)
        setCloudStatus('ready')
        setCloudMessage('共有データを読み込みました。ほかの端末にも同じ内容が表示されます。')
      } else {
        setCloudStatus('ready')
        setCloudMessage('共有データはまだありません。次の変更時に作成します。')
      }

      cloudReadyRef.current = true
    }

    loadRemoteState()

    const channel = supabase
      .channel('rotation-shared-state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rotation_states', filter: `id=eq.${ROTATION_STATE_ID}` }, (payload) => {
        if (!alive) return
        const remoteState = payload.new?.state
        if (!remoteState) return
        const mergedRemote = mergeState(remoteState)
        const remoteSnapshot = JSON.stringify(mergedRemote)
        if (remoteSnapshot === lastSyncedStateRef.current) return
        const localState = stateRef.current
        const localSnapshot = JSON.stringify(localState)
        const baseState = parseStateSnapshot(lastSyncedStateRef.current)
        const hasUnsavedLocalChanges = !!lastSyncedStateRef.current && localSnapshot !== lastSyncedStateRef.current
        const nextState = hasUnsavedLocalChanges
          ? buildProtectedStateForSave(localState, mergedRemote, baseState)
          : mergedRemote
        setBackupHistory(saveLocalSnapshot(stateRef.current, '共有更新前', { minIntervalMs: 5 * 60 * 1000 }))
        lastSyncedStateRef.current = remoteSnapshot
        stateRef.current = nextState
        setState(nextState)
        setCloudStatus('ready')
        setCloudMessage(hasUnsavedLocalChanges
          ? '未保存の入力を残したまま、ほかの端末の更新を取り込みました。'
          : 'ほかの端末から最新の共有データを受け取りました。')
      })
      .subscribe()

    return () => {
      alive = false
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!cloudReadyRef.current) return

    const snapshot = JSON.stringify(state)
    if (snapshot === lastSyncedStateRef.current) return

    setCloudStatus('saving')
    setCloudMessage('共有データを保存しています...')

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const { data: remoteData, error: remoteError } = await supabase
        .from('rotation_states')
        .select('state')
        .eq('id', ROTATION_STATE_ID)
        .maybeSingle()

      if (remoteError) {
        console.error(remoteError)
        setCloudStatus('error')
        setCloudMessage('共有データを保存できませんでした。')
        return
      }

      const remoteState = remoteData?.state ? mergeState(remoteData.state) : null
      const baseState = parseStateSnapshot(lastSyncedStateRef.current)
      const stateToSave = buildProtectedStateForSave(state, remoteState, baseState)
      const saveSnapshot = JSON.stringify(stateToSave)
      const payload = { id: ROTATION_STATE_ID, state: stateToSave, updated_at: new Date().toISOString() }
      if (remoteState) {
        setBackupHistory(saveLocalSnapshot(remoteState, 'Supabase保存前', { minIntervalMs: 5 * 60 * 1000 }))
      }
      const { error } = await supabase.from('rotation_states').upsert(payload)

      if (error) {
        console.error(error)
        setCloudStatus('error')
        setCloudMessage('共有データを保存できませんでした。')
        return
      }

      lastSyncedStateRef.current = saveSnapshot
      if (saveSnapshot !== snapshot) setState(stateToSave)
      setCloudStatus('ready')
      setCloudMessage('共有データを保存しました。ほかの端末にも反映されます。')
    }, 700)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [state])

  // ── Identity ─────────────────────────────────────────────────────────────────
  function selectIdentity(name) {
    setIdentity(name)
    setMailPanelOpen(false)
    setMailDispatchStatus('idle')
    setMailDispatchMessage('')
    setMailPreviewConfirmed(false)
    setLessonMailPanelOpen(false)
    setLessonMailDispatchStatus('idle')
    setLessonMailDispatchMode('')
    setLessonMailDispatchMessage('')
    setLessonMailPreviewConfirmed(false)
    if (name !== ADMIN_NAME) setState((s) => ({ ...s, currentTeacher: name }))
  }

  function switchIdentity() {
    setIdentity('')
    setExportMessage('')
    setMailPanelOpen(false)
    setMailDispatchStatus('idle')
    setMailDispatchMessage('')
    setMailPreviewConfirmed(false)
    setLessonMailPanelOpen(false)
    setLessonMailDispatchStatus('idle')
    setLessonMailDispatchMode('')
    setLessonMailDispatchMessage('')
    setLessonMailPreviewConfirmed(false)
  }

  // ── Month ────────────────────────────────────────────────────────────────────
  function setYear(y) { setState((s) => ({ ...s, year: y })) }
  function setMonth(m) { setState((s) => ({ ...s, month: m })) }

  // ── Lock / Finalize ───────────────────────────────────────────────────────────
  function finalizeMonth() {
    if (!isAdmin) return
    const markdown = buildMarkdownExport(year, month, teachers, sessions, schedule, memos, attendance, statusOptions)
    setState((s) => ({
      ...s,
      lockedMonths: { ...(s.lockedMonths ?? {}), [monthKey]: true },
      archivedSchedules: {
        ...(s.archivedSchedules ?? {}),
        [monthKey]: {
          savedAt: new Date().toISOString(),
          markdown,
          assignmentsBySession: Object.fromEntries(
            schedule.map((session) => [session.key, { ...(session.assignments ?? {}) }]),
          ),
          label: `${year}年${month}月`,
        },
      },
    }))
    setExportMessage(`✓ ${year}年${month}月を確定しました`)
    setTimeout(() => setExportMessage(''), 3500)
  }

  function unlockMonth() {
    if (!isAdmin) return
    setState((s) => ({
      ...s,
      lockedMonths: { ...(s.lockedMonths ?? {}), [monthKey]: false },
    }))
  }

  // ── LINE text ─────────────────────────────────────────────────────────────────
  async function copyLineText() {
    const text = buildLineText(year, month, schedule, memos)
    try {
      await navigator.clipboard.writeText(text)
      setExportMessage('✓ LINE用テキストをコピーしました')
    } catch {
      setExportMessage('コピーできませんでした')
    }
    setTimeout(() => setExportMessage(''), 3500)
  }

  // ── Markdown export ───────────────────────────────────────────────────────────
  async function exportMonthTable() {
    const markdown = buildMarkdownExport(year, month, teachers, sessions, schedule, memos, attendance, statusOptions)
    const fileName = `${year}-${String(month).padStart(2, '0')}-rotation.md`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown)
        setExportMessage('Markdownをコピーしました。')
      } else {
        setExportMessage('コピーできないため、ファイルを保存しました。')
      }
    } catch {
      setExportMessage('コピーできないため、ファイルを保存しました。')
    }

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportHtmlTable() {
    const html = buildHtmlExport(year, month, teachers, sessions, schedule, attendance, statusOptions)
    const fileName = `${year}-${String(month).padStart(2, '0')}-rotation.html`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportWordTable() {
    const fileName = `${year}年${month}月_担当表.docx`
    const blob = buildRotationTableDocx(year, month, teachers, sessions, schedule, attendance, statusOptions)
    downloadBlob(blob, fileName)
    setExportMessage('Word担当表を保存しました。')
    setTimeout(() => setExportMessage(''), 3500)
  }

  async function exportSchedulePdf() {
    if (scheduleDownloadStatus) return
    setScheduleDownloadStatus('pdf')
    setExportMessage('PDF担当表を作成しています...')
    try {
      const result = await createScheduleMailPdfBlob()
      downloadBlob(result.blob, `${year}年${month}月_担当表.pdf`)
      setExportMessage('PDF担当表を保存しました。')
    } catch (error) {
      setExportMessage('')
      window.alert(`PDF出力に失敗しました。\n${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setScheduleDownloadStatus('')
      setTimeout(() => setExportMessage(''), 3500)
    }
  }

  async function exportSchedulePng() {
    if (scheduleDownloadStatus) return
    setScheduleDownloadStatus('png')
    setExportMessage('PNG担当表を作成しています...')
    try {
      const blob = await renderElementToPngBlob(buildScheduleMailPdfElement())
      downloadBlob(blob, `${year}年${month}月_担当表.png`)
      setExportMessage('PNG担当表を保存しました。')
    } catch (error) {
      setExportMessage('')
      window.alert(`PNG出力に失敗しました。\n${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setScheduleDownloadStatus('')
      setTimeout(() => setExportMessage(''), 3500)
    }
  }

  function resetMailPdfPreview() {
    mailPdfGenerationRef.current += 1
    if (mailPdfUrlRef.current) URL.revokeObjectURL(mailPdfUrlRef.current)
    mailPdfUrlRef.current = ''
    setMailPdfPreview({ status: 'idle', url: '', base64: '', filename: '', pages: [], bytes: 0, error: '' })
  }

  function resetLessonMailPdfPreview() {
    lessonMailPdfGenerationRef.current += 1
    if (lessonMailPdfUrlRef.current) URL.revokeObjectURL(lessonMailPdfUrlRef.current)
    lessonMailPdfUrlRef.current = ''
    setLessonMailPdfPreview({ status: 'idle', url: '', base64: '', filename: '', pages: [], bytes: 0, error: '' })
  }

  function buildScheduleMailPdfElement() {
    const preview = scheduleMailPreviewData()
    const root = document.createElement('div')
    const dateColumnWidth = (156 / Math.max(1, preview.headers.length)).toFixed(2)
    const tableRows = preview.rows.map((row, rowIndex) => {
      const cells = row.cells.map((cell) => {
        const color = cell === '○' ? '#2d7f5e' : cell === '△' ? '#a86616' : cell === '×' ? '#77827f' : cell === '会議' ? '#236a78' : '#172b29'
        const weight = ['○', '△', '×', '会議'].includes(cell) ? 700 : 500
        return `<td style="border:0.18mm solid #9eb7b3;padding:2.3mm 1.2mm;text-align:center;vertical-align:middle;color:${color};font-weight:${weight};overflow-wrap:anywhere;">${escapeXml(cell || '') || '&nbsp;'}</td>`
      }).join('')
      const background = row.id === 'unassigned' ? '#fff1f1' : rowIndex % 2 === 0 ? '#ffffff' : '#f8faf9'
      return `<tr style="background:${background};"><th style="border:0.18mm solid #9eb7b3;padding:2.3mm 1.8mm;text-align:left;background:#edf5f3;font-weight:700;">${escapeXml(row.label)}</th>${cells}</tr>`
    }).join('')
    const notes = preview.notes.length > 0
      ? `<div style="margin-top:5mm;padding:3mm 4mm;border:0.18mm solid #c7d6d3;background:#f8faf9;font-size:9.5pt;line-height:1.55;"><strong>メモ</strong>${preview.notes.map((note) => `<div>${escapeXml(note)}</div>`).join('')}</div>`
      : ''
    root.style.position = 'fixed'
    root.style.left = '-10000px'
    root.style.top = '0'
    root.style.width = '210mm'
    root.style.minHeight = '297mm'
    root.style.background = '#fff'
    root.style.fontFamily = '"Noto Sans JP", Meiryo, "Yu Gothic", sans-serif'
    root.style.color = '#172b29'
    root.innerHTML = `
      <div style="position:relative;width:210mm;min-height:297mm;padding:16mm 15mm 18mm;box-sizing:border-box;background:#fff;">
        <h1 style="margin:0;text-align:center;font-size:20pt;line-height:1.25;">${year}年${month}月 担当表</h1>
        <p style="margin:2mm 0 7mm;text-align:center;color:#55706c;font-size:10pt;">確定済みの担当表</p>
        <table style="width:180mm;border-collapse:collapse;table-layout:fixed;font-size:10pt;line-height:1.35;">
          <colgroup><col style="width:24mm">${preview.headers.map(() => `<col style="width:${dateColumnWidth}mm">`).join('')}</colgroup>
          <thead><tr><th style="border:0.18mm solid #9eb7b3;padding:2.3mm 1.8mm;text-align:left;background:#236f69;color:#fff;">名前</th>${preview.headers.map((header) => `<th style="border:0.18mm solid #9eb7b3;padding:2.3mm 1.2mm;text-align:center;background:#236f69;color:#fff;">${escapeXml(header)}</th>`).join('')}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${notes}
        <div style="position:absolute;left:15mm;right:15mm;bottom:10mm;text-align:right;color:#55706c;font-size:9.5pt;">日本語ボランティアグループ　わをん</div>
      </div>
    `
    return root
  }

  async function createScheduleMailPdfBlob() {
    return renderElementToA4PdfBlob(buildScheduleMailPdfElement())
  }

  async function createLessonReportPdfBlob(report) {
    const normalized = normalizeLessonReportForExport(report)
    return renderElementToA4PdfBlob(buildLessonReportPdfElement(normalized), (reportElement) => {
      const pxPerMm = reportElement.getBoundingClientRect().width / 210
      const table = reportElement.querySelector('[data-report-table="true"]')
      const footer = reportElement.querySelector('[data-report-footer="true"]')
      const content = reportElement.querySelector('[data-report-content="true"]')
      const handoff = reportElement.querySelector('[data-report-handoff="true"]')
      const contentCell = reportElement.querySelector('[data-report-content-cell="true"]')
      const handoffCell = reportElement.querySelector('[data-report-handoff-cell="true"]')
      if (!table || !footer) return
      const rootTop = reportElement.getBoundingClientRect().top
      const pageHeight = 297 * pxPerMm
      const footerGap = 4 * pxPerMm
      const footerBottomGap = 8 * pxPerMm
      const footerFloor = LESSON_REPORT_PAGE.footerTopMm * pxPerMm

      function measureRequiredHeight() {
        const tableBottom = table.getBoundingClientRect().bottom - rootTop
        const footerHeight = footer.getBoundingClientRect().height
        const footerTop = Math.max(footerFloor, tableBottom + footerGap)
        return { footerTop, requiredHeight: footerTop + footerHeight + footerBottomGap }
      }

      let layout = measureRequiredHeight()
      if (layout.requiredHeight > pageHeight) {
        if (content) content.style.minHeight = '0'
        if (handoff) handoff.style.minHeight = '0'
        if (contentCell) contentCell.style.paddingBlock = '0.9mm'
        if (handoffCell) handoffCell.style.paddingBlock = '0.9mm'
        layout = measureRequiredHeight()
      }

      if (layout.requiredHeight > pageHeight) {
        const currentTop = table.getBoundingClientRect().top - rootTop
        const overflow = layout.requiredHeight - pageHeight + 3 * pxPerMm
        table.style.top = `${Math.max(15 * pxPerMm, currentTop - overflow)}px`
        layout = measureRequiredHeight()
      }

      const totalHeight = layout.requiredHeight <= pageHeight
        ? pageHeight
        : Math.ceil(layout.requiredHeight / pageHeight) * pageHeight
      const footerTop = layout.footerTop
      footer.style.top = `${footerTop}px`
      reportElement.style.height = `${totalHeight}px`
      reportElement.firstElementChild.style.height = `${totalHeight}px`
    })
  }

  async function prepareScheduleMailPdf() {
    resetMailPdfPreview()
    const generation = ++mailPdfGenerationRef.current
    const filename = `${year}年${month}月_担当表.pdf`
    setMailPdfPreview({ status: 'loading', url: '', base64: '', filename, pages: [], bytes: 0, error: '' })
    try {
      const result = await createScheduleMailPdfBlob()
      const base64 = await blobToBase64(result.blob)
      if (generation !== mailPdfGenerationRef.current) return
      const url = URL.createObjectURL(result.blob)
      mailPdfUrlRef.current = url
      setMailPdfPreview({ status: 'ready', url, base64, filename, pages: result.pages, bytes: result.blob.size, error: '' })
    } catch (error) {
      if (generation !== mailPdfGenerationRef.current) return
      setMailPdfPreview({
        status: 'error',
        url: '',
        base64: '',
        filename,
        pages: [],
        bytes: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function prepareLessonMailPdf(report) {
    resetLessonMailPdfPreview()
    const generation = ++lessonMailPdfGenerationRef.current
    const filename = lessonReportMailDraft(report).attachmentName
    setLessonMailPdfPreview({ status: 'loading', url: '', base64: '', filename, pages: [], bytes: 0, error: '' })
    try {
      const result = await createLessonReportPdfBlob(report)
      const base64 = await blobToBase64(result.blob)
      if (generation !== lessonMailPdfGenerationRef.current) return
      const url = URL.createObjectURL(result.blob)
      lessonMailPdfUrlRef.current = url
      setLessonMailPdfPreview({ status: 'ready', url, base64, filename, pages: result.pages, bytes: result.blob.size, error: '' })
    } catch (error) {
      if (generation !== lessonMailPdfGenerationRef.current) return
      setLessonMailPdfPreview({
        status: 'error',
        url: '',
        base64: '',
        filename,
        pages: [],
        bytes: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function scheduleMailDraft() {
    const tableText = buildMarkdownExport(year, month, teachers, sessions, schedule, memos, attendance, statusOptions)
    return {
      subject: `【わをん】${year}年${month}月 担当表`,
      body: `${year}年${month}月の担当表をお知らせします。\n\n${tableText}\n\n添付のPDFファイルとWordファイルをご確認ください。\n\n連絡者：${identity || '未選択'}`,
    }
  }

  function openScheduleMailPanel() {
    setMailDispatchStatus('idle')
    setMailDispatchMessage('')
    setMailPreviewTab('attachment')
    setMailPreviewConfirmed(false)
    setMailPanelOpen(true)
    prepareScheduleMailPdf()
  }

  function closeScheduleMailPanel() {
    if (mailDispatchStatus === 'sending') return
    setMailPanelOpen(false)
    resetMailPdfPreview()
  }

  async function copyScheduleMailDraft() {
    const draft = scheduleMailDraft()
    try {
      await navigator.clipboard.writeText(`件名: ${draft.subject}\n\n${draft.body}`)
      setMailDispatchMessage('メール下書きをコピーしました。')
    } catch {
      setMailDispatchMessage('コピーできませんでした。ブラウザの権限を確認してください。')
    }
  }

  async function sendScheduleEmail() {
    if (!identity || !isMonthLocked || !mailPreviewConfirmed || mailPdfPreview.status !== 'ready') return
    const recipientCount = Math.max(0, teachers.length - 1)
    setMailDispatchStatus('sending')
    setMailDispatchMessage('送信しています...')
    const { data, error } = await supabase.functions.invoke('send-schedule-email', {
      body: {
        monthKey,
        senderName: identity,
        pdfFilename: mailPdfPreview.filename,
        pdfBase64: mailPdfPreview.base64,
      },
    })
    if (error || !data?.sent) {
      let responseError = null
      try {
        responseError = error?.context?.clone ? await error.context.clone().json() : null
      } catch {
        responseError = null
      }
      const reason = data?.error || responseError?.error || error?.message || 'mail_send_failed'
      setMailDispatchStatus('error')
      setMailDispatchMessage(reason === 'already_sent'
        ? 'この月の担当表はすでに送信済みです。'
        : reason === 'invalid_pdf_attachment'
            ? 'PDFを確認画面で作り直してから送信してください。'
        : reason === 'invalid_sender'
            ? '選択した先生の連絡先設定がありません。管理者へ確認してください。'
            : 'メール送信機能はまだサーバーに設定されていません。下書きコピーを利用できます。')
      return
    }
    setMailDispatchStatus('sent')
    setMailDispatchMessage(`${data.recipientCount ?? recipientCount}名へ担当表メールを送信しました。`)
  }

  function lessonReportMailDraft(report) {
    if (!report) return { subject: '', body: '', attachmentName: '', wordAttachmentName: '', mailDateText: '' }
    const day = Number(String(report.sessionKey || '').split('/')[1])
    const reportMonth = Number(report.calendarMonth || month)
    const mailDateText = `${reportMonth}月${Number.isFinite(day) ? day : ''}日`
    const safeClassName = report.className.replace(/[\\/:*?"<>|]/g, '_')
    return {
      mailDateText,
      subject: `【授業報告】${mailDateText} ${report.className}クラス`,
      attachmentName: `${mailDateText}_${safeClassName}_授業記録.pdf`,
      wordAttachmentName: `${mailDateText}_${safeClassName}_授業記録.docx`,
      body: [
        'わをんの皆さま',
        '',
        'お疲れさまです。',
        `${mailDateText}の${report.className}クラスの授業報告をお送りします。`,
        `担当は${report.teacherName}です。`,
        '添付のPDFファイルとWordファイルをご確認ください。',
        '',
        'よろしくお願いいたします。',
        report.teacherName,
      ].join('\n'),
    }
  }

  function openLessonReportMail() {
    if (!selectedLessonReport) return
    setLessonMailDispatchStatus('idle')
    setLessonMailDispatchMode('')
    setLessonMailDispatchMessage('')
    setLessonMailPreviewTab('attachment')
    setLessonMailPreviewConfirmed(false)
    setLessonMailPanelOpen(true)
    prepareLessonMailPdf(selectedLessonReport)
  }

  function closeLessonReportMail() {
    if (lessonMailDispatchStatus === 'sending') return
    setLessonMailPanelOpen(false)
    resetLessonMailPdfPreview()
  }

  async function sendLessonReportEmail(report, deliveryMode = 'broadcast') {
    if (!identity || !report || !lessonMailPreviewConfirmed || lessonMailPdfPreview.status !== 'ready') return
    if (report.teacherName !== identity) {
      setLessonMailDispatchStatus('error')
      setLessonMailDispatchMessage('担当者本人の名前で開いている時だけ送信できます。')
      return
    }
    if (report.status !== '完了' || !report.updatedAt) {
      setLessonMailDispatchStatus('error')
      setLessonMailDispatchMessage('授業記録の全項目を入力し、共有データへの保存完了後に送信してください。')
      return
    }
    if (cloudStatus !== 'ready') {
      setLessonMailDispatchStatus('error')
      setLessonMailDispatchMessage('共有データの保存完了後に送信してください。')
      return
    }
    const senderTest = deliveryMode === 'sender_test'
    const recipientCount = senderTest ? 1 : Math.max(0, teachers.length - 1)
    const draft = lessonReportMailDraft(report)
    setLessonMailDispatchMode(deliveryMode)
    setLessonMailDispatchStatus('sending')
    setLessonMailDispatchMessage(senderTest ? '本人宛てのテストメールを送信しています...' : '授業報告を送信しています...')
    const { data, error } = await supabase.functions.invoke('send-lesson-report-email', {
      body: {
        monthKey: report.monthKey || monthKey,
        reportId: report.id,
        senderName: identity,
        deliveryMode,
        pdfFilename: lessonMailPdfPreview.filename,
        pdfBase64: lessonMailPdfPreview.base64,
      },
    })
    if (error || !data?.sent) {
      let responseError = null
      try {
        responseError = error?.context?.clone ? await error.context.clone().json() : null
      } catch {
        responseError = null
      }
      const reason = data?.error || responseError?.error || error?.message || 'mail_send_failed'
      const messages = {
        already_sent: 'この保存内容はすでに送信済みです。記録を変更して保存すると再送できます。',
        send_in_progress: 'この授業報告は現在送信中です。少し待ってから確認してください。',
        invalid_sender: '選択した先生の連絡先設定がありません。管理者へ確認してください。',
        sender_not_report_teacher: '担当者本人の名前で開いている時だけ送信できます。',
        report_not_saved: '授業記録が共有データに保存されていません。',
        report_incomplete: '単元・授業内容・申し送りを入力してから送信してください。',
        report_teacher_unavailable: 'この記録の担当者を確認できませんでした。',
        invalid_pdf_attachment: 'PDFを確認画面で作り直してから送信してください。',
      }
      setLessonMailDispatchStatus('error')
      setLessonMailDispatchMessage(messages[reason] || 'メール送信機能はまだサーバーに設定されていません。')
      return
    }
    setLessonMailDispatchStatus('sent')
    setLessonMailDispatchMessage(senderTest
      ? '本人の登録メールアドレスだけにテスト送信しました。'
      : `${data.recipientCount ?? recipientCount}名へ授業報告を送信しました。`)
  }

  // ── Archive ───────────────────────────────────────────────────────────────────
  function downloadArchive(key, arc) {
    const blob = new Blob([arc.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${key}-rotation.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  function deleteArchive(key) {
    if (!isAdmin) return
    setState((s) => {
      const next = { ...(s.archivedSchedules ?? {}) }
      delete next[key]
      return { ...s, archivedSchedules: next }
    })
  }

  // ── Teacher shareable links ───────────────────────────────────────────────────
  async function copyTeacherLink(teacherName) {
    const url = new URL(window.location.href)
    url.searchParams.set('t', teacherName)
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopiedLink(teacherName)
      setTimeout(() => setCopiedLink(''), 2500)
    } catch {}
  }

  // ── Session settings ──────────────────────────────────────────────────────────
  function setSessionType(sessionKey, type) {
    if (!canEditAdmin) return
    setState((s) => ({
      ...s,
      sessionTypesByMonth: {
        ...s.sessionTypesByMonth,
        [monthKey]: { ...(s.sessionTypesByMonth[monthKey] ?? {}), [sessionKey]: type },
      },
    }))
  }

  function getSessionClasses(session) {
    return sessionClassesByMonth[monthKey]?.[session.key] ?? session.requiredClasses
  }

  function setSessionClasses(sessionKey, classes) {
    if (!canEditAdmin) return
    const ordered = allClasses.filter((c) => classes.includes(c))
    setState((s) => ({
      ...s,
      sessionClassesByMonth: {
        ...s.sessionClassesByMonth,
        [monthKey]: { ...(s.sessionClassesByMonth[monthKey] ?? {}), [sessionKey]: ordered },
      },
    }))
  }

  function toggleSessionClass(session, cls, enabled) {
    const current = getSessionClasses(session)
    const next = enabled ? [...current, cls] : current.filter((c) => c !== cls)
    setSessionClasses(session.key, next)
  }

  function resetSessionClasses(sessionKey) {
    if (!canEditAdmin) return
    setState((s) => {
      const classesByMonth = { ...(s.sessionClassesByMonth[monthKey] ?? {}) }
      delete classesByMonth[sessionKey]

      const manualByMonth = { ...(s.sessionManualByMonth[monthKey] ?? {}) }
      delete manualByMonth[sessionKey]

      const countsByMonth = { ...(s.attendanceCountsByMonth[monthKey] ?? {}) }
      const countsBySession = { ...(countsByMonth[sessionKey] ?? {}) }
      delete countsBySession.students
      if (Object.keys(countsBySession).length === 0) {
        delete countsByMonth[sessionKey]
      } else {
        countsByMonth[sessionKey] = countsBySession
      }

      return {
        ...s,
        sessionClassesByMonth: { ...s.sessionClassesByMonth, [monthKey]: classesByMonth },
        sessionManualByMonth: { ...s.sessionManualByMonth, [monthKey]: manualByMonth },
        attendanceCountsByMonth: { ...s.attendanceCountsByMonth, [monthKey]: countsByMonth },
      }
    })
  }

  function getManualAssignment(session, cls) {
    return sessionManualByMonth[monthKey]?.[session.key]?.[cls]
  }

  function setManualAssignment(sessionKey, cls, teacher) {
    if (!canEditAdmin) return
    setState((s) => {
      const existingByMonth = s.sessionManualByMonth[monthKey] ?? {}
      const existingBySession = existingByMonth[sessionKey] ?? {}
      return {
        ...s,
        sessionManualByMonth: {
          ...s.sessionManualByMonth,
          [monthKey]: {
            ...existingByMonth,
            [sessionKey]: { ...existingBySession, [cls]: teacher },
          },
        },
      }
    })
  }

  function resetManualAssignment(sessionKey, cls) {
    if (!canEditAdmin) return
    setState((s) => {
      const byMonth = { ...(s.sessionManualByMonth[monthKey] ?? {}) }
      const bySession = { ...(byMonth[sessionKey] ?? {}) }
      if (cls) {
        delete bySession[cls]
      } else {
        delete bySession[sessionKey]
      }
      if (Object.keys(bySession).length === 0) {
        delete byMonth[sessionKey]
      }
      return { ...s, sessionManualByMonth: { ...s.sessionManualByMonth, [monthKey]: byMonth } }
    })
  }

  function getSessionSpecialNote(sessionKey) {
    return sessionSpecialNotesByMonth[monthKey]?.[sessionKey] ?? ''
  }

  function setSessionSpecialNote(sessionKey, note) {
    if (!canEditAdmin) return
    setState((s) => ({
      ...s,
      sessionSpecialNotesByMonth: {
        ...s.sessionSpecialNotesByMonth,
        [monthKey]: { ...(s.sessionSpecialNotesByMonth[monthKey] ?? {}), [sessionKey]: note },
      },
    }))
  }

  function setStudentDefault(cls, count) {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, studentDefaults: { ...s.studentDefaults, [cls]: count } }))
  }

  function getStudentDefault(cls) {
    return studentDefaults[cls] ?? 0
  }

  function getStudentCount(sessionKey, cls) {
    const override = attendanceCountsByMonth[monthKey]?.[sessionKey]?.students?.[cls]
    if (override !== undefined) return override
    return getStudentDefault(cls)
  }

  function setStudentCount(sessionKey, cls, count) {
    if (!identity) return
    setState((s) => {
      const byMonth = { ...(s.attendanceCountsByMonth[monthKey] ?? {}) }
      const bySession = { ...(byMonth[sessionKey] ?? {}) }
      const students = { ...(bySession.students ?? {}) }
      if (count === (s.studentDefaults[cls] ?? 0)) {
        delete students[cls]
      } else {
        students[cls] = count
      }
      bySession.students = students
      if (Object.keys(students).length === 0) {
        delete bySession.students
      }
      byMonth[sessionKey] = bySession
      return { ...s, attendanceCountsByMonth: { ...s.attendanceCountsByMonth, [monthKey]: byMonth } }
    })
  }

  function setVolunteerOverride(sessionKey, count) {
    if (!identity) return
    setState((s) => {
      const byMonth = { ...(s.attendanceCountsByMonth[monthKey] ?? {}) }
      const bySession = { ...(byMonth[sessionKey] ?? {}) }
      bySession.volunteersOverride = count
      byMonth[sessionKey] = bySession
      return { ...s, attendanceCountsByMonth: { ...s.attendanceCountsByMonth, [monthKey]: byMonth } }
    })
  }

  function getAttendanceCounts(sessionKey) {
    const session = schedule.find((s) => s.key === sessionKey)
    if (!session) return { studentTotal: 0, volunteer: 0, total: 0, byClass: {} }

    const countOverride = attendanceCountsByMonth[monthKey]?.[sessionKey]
    const volunteerOverride = countOverride?.volunteersOverride
    const volunteer = volunteerOverride != null ? volunteerOverride
      : session.selectedTeachers.length + session.selectedMaybeTeachers.length

    const openClasses = getSessionClasses(session)
    let studentTotal = 0
    const byClass = {}
    for (const cls of openClasses) {
      const n = getStudentCount(sessionKey, cls)
      byClass[cls] = n
      studentTotal += n
    }

    return { studentTotal, volunteer, total: studentTotal + volunteer, byClass }
  }

  function setSpecialRule(key, value) {
    if (!canEditAdmin) return
    setState((s) => {
      const nextRules = {
        ...s.specialRules,
        [key]: value,
      }
      if (key === 'random' && value === true) {
        nextRules.randomSeedByMonth = {
          ...(s.specialRules?.randomSeedByMonth ?? {}),
          [monthKey]: Math.random().toString(36).slice(2),
        }
      }
      return { ...s, specialRules: nextRules }
    })
  }

  function rerollRandomAssignments() {
    if (!canEditAdmin) return
    setState((s) => ({
      ...s,
      specialRules: {
        ...s.specialRules,
        random: true,
        randomSeedByMonth: {
          ...(s.specialRules?.randomSeedByMonth ?? {}),
          [monthKey]: Math.random().toString(36).slice(2),
        },
      },
    }))
  }

  // ── Classes ───────────────────────────────────────────────────────────────────
  function addGlobalClass() {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, allClasses: [...s.allClasses, '新しいクラス'] }))
    setTimeout(() => newClassRef.current?.focus(), 50)
  }

  function renameGlobalClass(idx, newName) {
    if (!canEditAdmin) return
    const oldName = allClasses[idx]
    setState((s) => ({
      ...s,
      allClasses: s.allClasses.map((c, i) => (i === idx ? newName : c)),
      defaultClasses: s.defaultClasses.map((c) => (c === oldName ? newName : c)),
      teachers: s.teachers.map((t) => ({ ...t, classes: t.classes.map((c) => (c === oldName ? newName : c)) })),
      sessionClassesByMonth: Object.fromEntries(
        Object.entries(s.sessionClassesByMonth).map(([mk, sess]) => [
          mk,
          Object.fromEntries(Object.entries(sess).map(([sk, cls]) => [sk, cls.map((c) => (c === oldName ? newName : c))])),
        ]),
      ),
    }))
  }

  function deleteGlobalClass(idx) {
    if (!canEditAdmin) return
    const name = allClasses[idx]
    setState((s) => ({
      ...s,
      allClasses: s.allClasses.filter((_, i) => i !== idx),
      defaultClasses: s.defaultClasses.filter((c) => c !== name),
      teachers: s.teachers.map((t) => ({ ...t, classes: t.classes.filter((c) => c !== name) })),
      sessionClassesByMonth: Object.fromEntries(
        Object.entries(s.sessionClassesByMonth).map(([mk, sess]) => [
          mk,
          Object.fromEntries(Object.entries(sess).map(([sk, cls]) => [sk, cls.filter((c) => c !== name)])),
        ]),
      ),
    }))
  }

  function toggleDefaultClass(cls, enabled) {
    if (!canEditAdmin) return
    setState((s) => ({
      ...s,
      defaultClasses: enabled ? s.allClasses.filter((c) => [...s.defaultClasses, cls].includes(c)) : s.defaultClasses.filter((c) => c !== cls),
    }))
  }

  // ── Status options ────────────────────────────────────────────────────────────
  function addStatusOption() {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, statusOptions: [...s.statusOptions, { id: `custom_${Date.now()}`, label: '新しい状態', behavior: 'no' }] }))
    setTimeout(() => newStatusRef.current?.focus(), 50)
  }

  function updateStatusOption(idx, field, value) {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, statusOptions: s.statusOptions.map((option, i) => (i === idx ? { ...option, [field]: value } : option)) }))
  }

  function deleteStatusOption(idx) {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, statusOptions: s.statusOptions.filter((_, i) => i !== idx) }))
  }

  // ── Teachers ──────────────────────────────────────────────────────────────────
  function handleSelectTeacher(name) {
    if (!teachers.find((t) => t.name === name)) return
    if (!isAdmin && name !== identity) return
    setState((s) => ({ ...s, currentTeacher: name }))
  }

  function getEffectiveStatus(teacherName, sessionKey) {
    const teacher = teachers.find((t) => t.name === teacherName)
    return attendance[teacherName]?.[sessionKey] ?? teacher?.defaultStatus ?? 'no'
  }

  function handleStatusChange(sessionKey, value) {
    const targetTeacher = effectiveTeacher
    if (!targetTeacher) return
    if (isMonthLocked) return
    setState((s) => {
      const currentMonth = s.attendanceByMonth[monthKey] ?? {}
      return {
        ...s,
        attendanceByMonth: {
          ...s.attendanceByMonth,
          [monthKey]: {
            ...currentMonth,
            [targetTeacher]: { ...(currentMonth[targetTeacher] ?? {}), [sessionKey]: value },
          },
        },
      }
    })
  }

  function setMemo(sessionKey, value) {
    setState((s) => ({
      ...s,
      memosByMonth: {
        ...s.memosByMonth,
        [monthKey]: { ...(s.memosByMonth[monthKey] ?? {}), [sessionKey]: value },
      },
    }))
  }

  function setMeetingNote(sessionKey, value) {
    setState((s) => ({
      ...s,
      meetingNotesByMonth: {
        ...s.meetingNotesByMonth,
        [monthKey]: { ...(s.meetingNotesByMonth[monthKey] ?? {}), [sessionKey]: value },
      },
    }))
  }

  function setMyMemo(value) {
    if (!identity) return
    setState((s) => ({
      ...s,
      myMemosByTeacher: {
        ...s.myMemosByTeacher,
        [identity]: {
          ...(s.myMemosByTeacher[identity] ?? {}),
          [monthKey]: value,
        },
      },
    }))
  }

  function updateLessonReport(reportId, updates) {
    if (!reportId) return
    setState((s) => ({
      ...s,
      lessonReportsByMonth: {
        ...(s.lessonReportsByMonth ?? {}),
        [monthKey]: {
          ...((s.lessonReportsByMonth ?? {})[monthKey] ?? {}),
          [reportId]: {
            ...(((s.lessonReportsByMonth ?? {})[monthKey] ?? {})[reportId] ?? {}),
            ...updates,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    }))
  }

  function setLessonReportField(reportId, field, value) {
    if (field === 'attendees') {
      setState((s) => {
        const currentReport = (((s.lessonReportsByMonth ?? {})[monthKey] ?? {})[reportId] ?? {})
        const currentManualCount = String(currentReport.attendeeCount ?? '').trim()
        const previousAutoCount = countLessonAttendees(currentReport.attendees)
        const nextUpdates = { attendees: value }
        if (!currentManualCount || currentManualCount === previousAutoCount) {
          nextUpdates.attendeeCount = countLessonAttendees(value)
        }
        return {
          ...s,
          lessonReportsByMonth: {
            ...(s.lessonReportsByMonth ?? {}),
            [monthKey]: {
              ...((s.lessonReportsByMonth ?? {})[monthKey] ?? {}),
              [reportId]: {
                ...currentReport,
                ...nextUpdates,
                updatedAt: new Date().toISOString(),
              },
            },
          },
        }
      })
      return
    }
    updateLessonReport(reportId, { [field]: value })
  }

  function normalizeLessonReportForExport(report) {
    return {
      ...report,
      attendeeCount: lessonAttendeeCountValue(report),
    }
  }

  function lessonReportFileBase(report) {
    return `${report.className}_${report.dateText.replace(/[（）/]/g, '-')}_授業記録`
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportLessonReportDocx(report) {
    if (!report) return
    const normalized = normalizeLessonReportForExport(report)
    downloadBlob(buildLessonReportDocx(normalized), `${lessonReportFileBase(report)}.docx`)
  }

  async function exportLessonReportPdf(report) {
    if (!report) return
    try {
      const result = await createLessonReportPdfBlob(report)
      downloadBlob(result.blob, `${lessonReportFileBase(report)}.pdf`)
    } catch (error) {
      window.alert(`PDF出力に失敗しました。\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function createBulletin() {
    const msg = newBulletinText.trim()
    if (!msg) return
    const post = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      author: identity,
      message: msg,
      confirmedBy: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setState((s) => ({ ...s, bulletinBoard: [post, ...(Array.isArray(s.bulletinBoard) ? s.bulletinBoard : [])] }))
    setNewBulletinText('')
    setShowNewBulletin(false)
  }

  function startEditBulletin(post) {
    setEditingBulletinId(post.id)
    setEditingBulletinText(post.message)
  }

  function saveEditBulletin() {
    const msg = editingBulletinText.trim()
    if (!msg) return
    setState((s) => ({
      ...s,
      bulletinBoard: (Array.isArray(s.bulletinBoard) ? s.bulletinBoard : []).map((p) =>
        p.id === editingBulletinId ? { ...p, message: msg, updatedAt: new Date().toISOString() } : p
      ),
    }))
    setEditingBulletinId(null)
    setEditingBulletinText('')
  }

  function cancelEditBulletin() {
    setEditingBulletinId(null)
    setEditingBulletinText('')
  }

  function deleteBulletin(id) {
    setState((s) => ({
      ...s,
      bulletinBoard: (Array.isArray(s.bulletinBoard) ? s.bulletinBoard : []).filter((p) => p.id !== id),
    }))
  }

  function togglePinBulletin(id) {
    setState((s) => ({
      ...s,
      bulletinBoard: (Array.isArray(s.bulletinBoard) ? s.bulletinBoard : []).map((p) =>
        p.id === id ? { ...p, pinned: !p.pinned } : p
      ),
    }))
  }

  function toggleImportantBulletin(id) {
    setState((s) => {
      const board = Array.isArray(s.bulletinBoard) ? s.bulletinBoard : []
      return {
        ...s,
        bulletinBoard: board.map((p) => {
          if (p.id !== id) return p
          if (false) return p // all users can mark important
          return { ...p, important: !p.important }
        }),
      }
    })
  }

  function toggleConfirmBulletin(id) {
    if (!identity) return
    setState((s) => ({
      ...s,
      bulletinBoard: (Array.isArray(s.bulletinBoard) ? s.bulletinBoard : []).map((p) => {
        if (p.id !== id) return p
        const confirmedBy = Array.isArray(p.confirmedBy) ? p.confirmedBy : []
        return confirmedBy.includes(identity)
          ? { ...p, confirmedBy: confirmedBy.filter((name) => name !== identity) }
          : { ...p, confirmedBy: [...confirmedBy, identity] }
      }),
    }))
  }

  function moveBulletin(id, dir) {
    setState((s) => {
      const board = Array.isArray(s.bulletinBoard) ? s.bulletinBoard : []
      const sorted = [...board.filter((p) => p.pinned), ...board.filter((p) => !p.pinned)]
      const idx = sorted.findIndex((p) => p.id === id)
      if (idx < 0) return s
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= sorted.length) return s
      if (!!sorted[idx].pinned !== !!sorted[swapIdx].pinned) return s
      ;[sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]]
      return { ...s, bulletinBoard: sorted }
    })
  }

  function reorderBulletin(dragId, dropId) {
    if (dragId === dropId) return
    setState((s) => {
      const board = Array.isArray(s.bulletinBoard) ? s.bulletinBoard : []
      const sorted = [...board.filter((p) => p.pinned), ...board.filter((p) => !p.pinned)]
      const fromIdx = sorted.findIndex((p) => p.id === dragId)
      const toIdx   = sorted.findIndex((p) => p.id === dropId)
      if (fromIdx < 0 || toIdx < 0) return s
      if (!!sorted[fromIdx].pinned !== !!sorted[toIdx].pinned) return s
      const next = [...sorted]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return { ...s, bulletinBoard: next }
    })
  }

  function reorderTeacher(fromIdx, toIdx) {
    if (!canEditAdmin || fromIdx === toIdx) return
    setState((s) => {
      const arr = [...s.teachers]
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return { ...s, teachers: arr }
    })
  }

  function updateTeacher(idx, field, value) {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, teachers: s.teachers.map((t, i) => (i === idx ? { ...t, [field]: value } : t)) }))
  }

  function setTeacherMonthlyLimit(teacherName, value) {
    if (!canEditAdmin && teacherName !== identity) return
    const nextValue = value === '' ? '' : Math.max(0, Math.min(31, Number(value) || 0))
    setState((s) => ({
      ...s,
      teachers: s.teachers.map((t) => (t.name === teacherName ? { ...t, maxMonthlyAssignments: nextValue } : t)),
    }))
  }

  function toggleTeacherClass(idx, cls, enabled) {
    if (!canEditAdmin) return
    setState((s) => ({
      ...s,
      teachers: s.teachers.map((t, i) => {
        if (i !== idx) return t
        const set = new Set(enabled ? [...t.classes, cls] : t.classes.filter((c) => c !== cls))
        return { ...t, classes: s.allClasses.filter((c) => set.has(c)) }
      }),
    }))
  }

  function addTeacher() {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, teachers: [...s.teachers, { name: '新しい先生', remote: false, skipMeeting: false, defaultStatus: 'no', maxMonthlyAssignments: '', classes: [] }] }))
    setTimeout(() => newTeacherRef.current?.focus(), 50)
  }

  function deleteTeacher(idx) {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, teachers: s.teachers.filter((_, i) => i !== idx) }))
  }

  function moveTeacher(idx, dir) {
    if (!canEditAdmin) return
    setState((s) => {
      const arr = [...s.teachers]
      const swap = idx + dir
      if (swap < 0 || swap >= arr.length) return s
      ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
      return { ...s, teachers: arr }
    })
  }

  // ── Six-screen app navigation ────────────────────────────────────────────────
  const navSections = [
    { id: 'home', label: 'ホーム', adminOnly: false },
    { id: 'attendance', label: '出席', adminOnly: false },
    { id: 'attendanceStats', label: '出席統計', adminOnly: false, hidden: true },
    { id: 'schedule', label: '担当表', adminOnly: false },
    { id: 'sessions', label: '各回設定', adminOnly: true, hidden: true },
    { id: 'lessonReports', label: '授業記録', adminOnly: false },
    { id: 'collab', label: '伝言板・メモ', adminOnly: false },
    { id: 'settings', label: '管理設定', adminOnly: true },
  ]
  const mobileNavSections = [
    { id: 'home', label: 'ホーム', shortLabel: 'ホーム', adminOnly: false },
    { id: 'attendance', label: '出席', shortLabel: '出席', adminOnly: false },
    { id: 'schedule', label: '担当表', shortLabel: '担当', adminOnly: false },
    { id: 'lessonReports', label: '授業記録', shortLabel: '記録', adminOnly: false },
    { id: 'mobileMore', label: 'その他', shortLabel: 'その他', adminOnly: false },
    { id: 'attendanceStats', label: '出席統計', shortLabel: '統計', adminOnly: false, hidden: true },
    { id: 'collab', label: 'メモ・連絡板', shortLabel: 'メモ', adminOnly: false, hidden: true },
    { id: 'settings', label: '管理', shortLabel: '管理', adminOnly: true, hidden: true },
  ]

  // IntersectionObserver for scroll nav active state — must be before conditional return
  useEffect(() => {
    if (!identity) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    navSections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [identity, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gate ──────────────────────────────────────────────────────────────────────
  if (!identity || !teachers.some((t) => t.name === identity)) {
    return <IdentityGate teachers={teachers} onSelect={selectIdentity} uiMode={uiMode} onUiModeChange={setUiMode} brandIconId={activeBrandIconId} onBrandIconChange={setBrandIcon} />
  }

  const archiveEntries = Object.entries(archivedSchedules ?? {}).sort(([a], [b]) => b.localeCompare(a))
  const sortedBulletin = [...bulletinBoard.filter((p) => p.pinned), ...bulletinBoard.filter((p) => !p.pinned)]
  const unassignedCount = schedule.reduce((sum, session) => sum + (session.unassignedClasses?.length ?? 0), 0)
  const editableSessions = sessions.filter((session) => !session.closed)
  const explicitAttendanceCount = teachers.reduce((sum, teacher) => (
    sum + editableSessions.filter((session) => attendance[teacher.name]?.[session.key] !== undefined).length
  ), 0)
  const totalAttendanceSlots = teachers.length * editableSessions.length
  const mobileAttendanceDoneCount = teachers.filter((teacher) => (
    editableSessions.some((session) => attendance[teacher.name]?.[session.key] !== undefined)
  )).length
  const meetingCount = sessions.filter((session) => session.meeting && !session.closed).length
  const lessonReports = lessonReportsByMonth?.[monthKey] ?? {}
  const lessonReportOptions = buildLessonReportOptionsForMonth(year, month)
  const selectedLessonReportId = lessonReportOptions.some((item) => item.id === activeLessonReportId)
    ? activeLessonReportId
    : (lessonReportOptions[0]?.id ?? '')
  const selectedLessonOption = lessonReportOptions.find((item) => item.id === selectedLessonReportId)
  const selectedLessonReport = selectedLessonOption ? {
    ...selectedLessonOption,
    attendees: '',
    attendeeCount: '',
    unit: '',
    content: '',
    handoff: '',
    ...(lessonReports[selectedLessonOption.id] ?? {}),
    } : null
  const lessonReportGroups = [...new Map(lessonReportOptions.map((item) => [item.sessionKey, item.sessionLabel])).entries()].map(([sessionKey, label]) => {
    const items = lessonReportOptions.filter((option) => option.sessionKey === sessionKey)
    const doneCount = items.filter((item) => item.status === '完了').length
    return { sessionKey, label, items, doneCount }
  }).filter((group) => group.items.length > 0)
  const selectedLessonGroup = lessonReportGroups.find((group) => group.sessionKey === selectedLessonOption?.sessionKey) ?? lessonReportGroups[0]
  const lessonReportMonthKeys = [...new Set([
    monthKey,
    ...Object.keys(lessonReportsByMonth ?? {}),
    ...Object.keys(attendanceByMonth ?? {}),
    ...Object.keys(sessionTypesByMonth ?? {}),
    ...Object.keys(sessionClassesByMonth ?? {}),
    ...Object.keys(sessionManualByMonth ?? {}),
    ...Object.keys(lockedMonths ?? {}),
  ])].filter((key) => /^\d{4}-\d{1,2}$/.test(key)).sort((a, b) => {
    const [ay, am] = a.split('-').map(Number)
    const [by, bm] = b.split('-').map(Number)
    return (ay * 12 + am) - (by * 12 + bm)
  })
  const lessonReportTimeline = lessonReportMonthKeys.flatMap((key) => {
    const [targetYear, targetMonth] = key.split('-').map(Number)
    return buildLessonReportOptionsForMonth(targetYear, targetMonth)
  }).sort((a, b) => a.dateTimestamp - b.dateTimestamp || a.className.localeCompare(b.className, 'ja'))
  const selectedTimelineIndex = lessonReportTimeline.findIndex((item) => item.monthKey === monthKey && item.id === selectedLessonReportId)
  const sameClassTimeline = selectedLessonOption
    ? lessonReportTimeline.filter((item) => item.className === selectedLessonOption.className)
    : []
  const selectedSameClassIndex = sameClassTimeline.findIndex((item) => item.monthKey === monthKey && item.id === selectedLessonReportId)
  const previousLessonOption = selectedSameClassIndex > 0
    ? sameClassTimeline[selectedSameClassIndex - 1]
    : (selectedTimelineIndex > 0 ? lessonReportTimeline[selectedTimelineIndex - 1] : null)
  const nextLessonOption = selectedSameClassIndex >= 0 && selectedSameClassIndex < sameClassTimeline.length - 1
    ? sameClassTimeline[selectedSameClassIndex + 1]
    : (selectedTimelineIndex >= 0 && selectedTimelineIndex < lessonReportTimeline.length - 1 ? lessonReportTimeline[selectedTimelineIndex + 1] : null)
  const previousLessonReferenceOption = selectedTimelineIndex > 0 && selectedLessonOption
    ? [...lessonReportTimeline.slice(0, selectedTimelineIndex)].reverse().find((item) => (
      item.className === selectedLessonOption.className && lessonReportsByMonth?.[item.monthKey]?.[item.id]
    ))
    : null
  const previousLessonReference = previousLessonReferenceOption ? {
    ...previousLessonReferenceOption,
    ...(lessonReportsByMonth?.[previousLessonReferenceOption.monthKey]?.[previousLessonReferenceOption.id] ?? {}),
  } : null
  const effectiveUiMode = uiMode === 'auto' ? (isMobileViewport ? 'mobile' : 'desktop') : uiMode
  const canUseView = (sections, id) => sections.some((item) => item.id === id && (!item.adminOnly || isAdmin))
  const currentDesktopView = canUseView(navSections, activeView) ? activeView : 'home'
  const currentDesktopMainView = currentDesktopView === 'attendanceStats'
    ? 'attendance'
    : (currentDesktopView === 'sessions' ? 'schedule' : currentDesktopView)
  const currentMobileView = canUseView(mobileNavSections, activeView) ? activeView : 'home'
  const currentMobileMainView = ['attendanceStats', 'collab', 'settings'].includes(currentMobileView)
    ? 'mobileMore'
    : currentMobileView

  function UiModeSwitch({ compact = false }) {
    return <ModeSwitch uiMode={uiMode} onChange={setUiMode} compact={compact} />
  }

  function MonthlyLimitControl({ teacherName, compact = false }) {
    const teacher = teachers.find((t) => t.name === teacherName)
    if (!teacher) return null
    const limit = teacher.maxMonthlyAssignments ?? ''
    const assignedCount = schedule.filter((session) => assignedClassesFor(session, teacherName).length > 0).length
    const canEditLimit = canEditAdmin || teacherName === identity
    return (
      <div className={compact ? 'monthly-limit-card monthly-limit-card-compact' : 'monthly-limit-card'}>
        <div>
          <span>今月の担当希望</span>
          <strong>{limit === '' ? '上限なし' : `${limit}回まで`}</strong>
          <small>現在 {assignedCount}回 / {editableSessions.length}回</small>
        </div>
        <label>
          <span>月上限</span>
          <input
            type="number"
            min="0"
            max="31"
            inputMode="numeric"
            placeholder="なし"
            value={limit}
            onChange={(e) => setTeacherMonthlyLimit(teacherName, e.target.value)}
            disabled={!canEditLimit}
          />
        </label>
      </div>
    )
  }

  function AppHeader({ title, subtitle, actions }) {
    return (
      <header className="screen-header">
        <div>
          <p className="eyebrow">Wawon Rotation</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="screen-header-side">
          <div className={`identity-badge ${isAdmin ? 'identity-badge-admin' : ''}`}>
            <strong>{identity}</strong>
            <span>{isAdmin ? '管理者' : '本人入力'}</span>
          </div>
          <div className={`cloud-status cloud-status-${cloudStatus}`}>
            <strong>共有データ</strong>
            <span>{cloudMessage}</span>
          </div>
          {actions}
        </div>
      </header>
    )
  }

  function ContextTabs({ items }) {
    return (
      <nav className="context-tabs" aria-label="関連画面">
        {items.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeView === item.id ? 'active' : ''}
            onClick={() => setActiveView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    )
  }

  function MonthControls() {
    return (
      <div className="control-grid">
        <label className="field-block">
          <span>年</span>
          <input type="number" value={year} min={2020} max={2040} onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 2020 && v <= 2040) setYear(v) }} />
        </label>
        <label className="field-block">
          <span>月</span>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {MONTH_JP.map((label, i) => <option key={i + 1} value={i + 1}>{label}</option>)}
          </select>
        </label>
        <div className="field-block">
          <span>&nbsp;</span>
          <button type="button" className="ghost-btn" onClick={() => { const now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }}>今月に戻る</button>
        </div>
        <label className="field-block field-wide">
          <span>文字サイズ</span>
          <div className="inline-field">
            <input type="number" value={textScaleDraft} min={MIN_TEXT_SCALE} max={MAX_TEXT_SCALE} step={5} onChange={(e) => setTextScaleDraft(e.target.value)} onBlur={applyTextScaleDraft} />
            <button type="button" className="ghost-btn" onClick={applyTextScaleDraft}>適用</button>
            <button type="button" className="ghost-btn" onClick={resetTextScale}>100%</button>
            <button type="button" className="primary-btn" onClick={saveDefaultTextScale}>既定に保存</button>
          </div>
        </label>
      </div>
    )
  }

  function ExportActions() {
    return (
      <div className="action-row">
        <button type="button" className="primary-btn" onClick={openScheduleMailPanel}>担当表をメール送信</button>
        <ScheduleDownloadActions />
        {isAdmin ? <button type="button" className="ghost-btn" onClick={copyLineText}>LINE用テキスト</button> : null}
        {isAdmin ? <button type="button" className="ghost-btn" onClick={exportMonthTable}>月表を保存</button> : null}
        {isAdmin ? <button type="button" className="ghost-btn" onClick={exportHtmlTable}>HTML表</button> : null}
        {isAdmin ? <button type="button" className={isMonthLocked ? 'success-btn' : 'primary-btn'} onClick={isMonthLocked ? unlockMonth : finalizeMonth}>
          {isMonthLocked ? '確定済み' : '今月を確定'}
        </button> : null}
        {exportMessage ? <span className="inline-message">{exportMessage}</span> : null}
      </div>
    )
  }

  function ScheduleDownloadActions({ mobile = false }) {
    const buttons = (
      <>
        <button type="button" className="ghost-btn" onClick={exportWordTable} disabled={!!scheduleDownloadStatus} aria-label="担当表をWordで保存">
          Word保存
        </button>
        <button type="button" className="ghost-btn" onClick={exportSchedulePdf} disabled={!!scheduleDownloadStatus} aria-label="担当表をPDFで保存">
          {scheduleDownloadStatus === 'pdf' ? 'PDF作成中...' : 'PDF保存'}
        </button>
        <button type="button" className="ghost-btn" onClick={exportSchedulePng} disabled={!!scheduleDownloadStatus} aria-label="担当表をPNG画像で保存">
          {scheduleDownloadStatus === 'png' ? 'PNG作成中...' : 'PNG保存'}
        </button>
      </>
    )
    if (mobile) {
      return (
        <details className="mobile-download-menu">
          <summary>担当表をダウンロード</summary>
          <div className="mobile-download-buttons">{buttons}</div>
        </details>
      )
    }
    return (
      <div className="schedule-download-block">
        <strong>担当表をダウンロード</strong>
        <div className="schedule-download-buttons">{buttons}</div>
      </div>
    )
  }

  function MailPreviewTabs({ value, onChange }) {
    return (
      <div className="mail-preview-tabs" role="tablist" aria-label="プレビューの種類">
        <button type="button" role="tab" aria-selected={value === 'email'} className={value === 'email' ? 'active' : ''} onClick={() => onChange('email')}>
          メール本文
        </button>
        <button type="button" role="tab" aria-selected={value === 'attachment'} className={value === 'attachment' ? 'active' : ''} onClick={() => onChange('attachment')}>
          PDFプレビュー
        </button>
      </div>
    )
  }

  function PdfAttachmentPreview({ preview, onRetry, title }) {
    if (preview.status === 'loading') {
      return (
        <div className="mail-pdf-state" role="status">
          <span className="mail-pdf-spinner" aria-hidden="true" />
          <strong>実際に送るPDFを作成しています</strong>
          <p>このPDFの作成が終わるまで送信できません。</p>
        </div>
      )
    }
    if (preview.status === 'error') {
      return (
        <div className="mail-pdf-state is-error" role="alert">
          <strong>PDFを作成できませんでした</strong>
          <p>{preview.error || 'もう一度作成してください。'}</p>
          <button type="button" className="ghost-btn" onClick={onRetry}>PDFを再作成</button>
        </div>
      )
    }
    if (preview.status !== 'ready' || !preview.url) {
      return (
        <div className="mail-pdf-state">
          <strong>PDFはまだありません</strong>
          <button type="button" className="ghost-btn" onClick={onRetry}>PDFを作成</button>
        </div>
      )
    }
    const sizeLabel = preview.bytes >= 1_000_000
      ? `${(preview.bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.max(1, Math.round(preview.bytes / 1000))} KB`
    return (
      <div className="mail-pdf-preview">
        <div className="mail-pdf-toolbar">
          <div><span>送信する実ファイル（{preview.pages.length}ページ・{sizeLabel}）</span><strong>{preview.filename}</strong></div>
          <a className="ghost-btn" href={preview.url} target="_blank" rel="noreferrer">別画面で確認</a>
        </div>
        <div className="mail-pdf-pages" aria-label={title}>
          {preview.pages.map((page, index) => (
            <figure key={`${preview.filename}-${index}`}>
              <img src={page} alt={`${title} ${index + 1}ページ目`} />
              <figcaption>{index + 1} / {preview.pages.length}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    )
  }

  function scheduleMailPreviewData() {
    const rows = [{
      id: 'special',
      label: '特別連絡',
      cells: schedule.map((session) => session.special || ''),
    }]
    if (schedule.some((session) => session.unassignedClasses?.length > 0)) {
      rows.push({
        id: 'unassigned',
        label: '未担当',
        cells: schedule.map((session) => session.unassignedClasses?.join('、') || ''),
      })
    }
    for (const teacher of teachers) {
      rows.push({
        id: `teacher-${teacher.name}`,
        label: teacher.name,
        cells: schedule.map((session) => scheduleCellText(teacher, session, attendance, statusOptions)),
      })
    }
    return {
      headers: sessions.map((session) => session.label),
      rows,
      notes: sessions
        .map((session) => memos[session.key] ? `${session.label}: ${memos[session.key]}` : '')
        .filter(Boolean),
    }
  }

  function ScheduleMailTablePreview() {
    const preview = scheduleMailPreviewData()
    return (
      <div className="mail-table-scroll">
        <table className="mail-schedule-table">
          <thead>
            <tr>
              <th>名前</th>
              {preview.headers.map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.id} className={row.id === 'unassigned' ? 'is-unassigned' : ''}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, index) => {
                  const tone = cell === '○' ? 'is-yes' : cell === '△' ? 'is-maybe' : cell === '×' ? 'is-no' : cell === '会議' ? 'is-meeting' : ''
                  return <td key={`${row.id}-${index}`} className={tone}>{cell || '\u00a0'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  function ScheduleMailDocumentPreview() {
    const preview = scheduleMailPreviewData()
    return (
      <article className="mail-document-preview is-email">
        <span className="mail-document-brand">Wawon Rotation</span>
        <h3>{year}年{month}月 担当表</h3>
        <p className="mail-document-lead">{year}年{month}月の確定担当表をお送りします。PDF版とWord版を添付しています。</p>
        <ScheduleMailTablePreview />
        {preview.notes.length > 0 ? (
          <section className="mail-document-notes">
            <strong>メモ</strong>
            {preview.notes.map((note) => <p key={note}>{note}</p>)}
          </section>
        ) : null}
        <footer>内容をご確認ください。<br />連絡者：{identity}</footer>
      </article>
    )
  }

  function ScheduleMailPanel() {
    if (!identity || !mailPanelOpen) return null
    const draft = scheduleMailDraft()
    const recipientNames = teachers.filter((teacher) => teacher.name !== identity).map((teacher) => teacher.name)
    return (
      <div className="mail-preview-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeScheduleMailPanel()
      }}>
        <section className="mail-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-mail-title">
          <div className="schedule-mail-head">
            <div><span>担当表メール</span><strong id="schedule-mail-title">送信前プレビュー</strong></div>
            <button type="button" className="icon-close-btn" title="閉じる" aria-label="閉じる" onClick={closeScheduleMailPanel} disabled={mailDispatchStatus === 'sending'}>×</button>
          </div>
          <div className="mail-preview-layout">
            <aside className="mail-preview-summary">
              <dl className="schedule-mail-meta">
                <div><dt>送信元</dt><dd>Wawon管理用Gmail</dd></div>
                <div><dt>連絡者</dt><dd>{identity}</dd></div>
                <div><dt>配信先</dt><dd>{recipientNames.join('、')}（{recipientNames.length}名）</dd></div>
                <div><dt>件名</dt><dd>{draft.subject}</dd></div>
              </dl>
              <div className="lesson-mail-attachment">
                <span>添付（2件）</span>
                <div className="lesson-mail-attachment-files">
                  <strong>{mailPdfPreview.filename || `${year}年${month}月_担当表.pdf`}</strong>
                  <strong>{year}年{month}月_担当表.docx</strong>
                  <small>画面では、実際に送るPDFをプレビューしています。</small>
                </div>
              </div>
              <button type="button" className="ghost-btn" onClick={copyScheduleMailDraft}>下書きをコピー</button>
            </aside>
            <main className="mail-preview-main">
              <MailPreviewTabs value={mailPreviewTab} onChange={setMailPreviewTab} />
              <div className="mail-preview-canvas" role="tabpanel">
                {mailPreviewTab === 'email'
                  ? <ScheduleMailDocumentPreview />
                  : <PdfAttachmentPreview preview={mailPdfPreview} onRetry={prepareScheduleMailPdf} title={`${year}年${month}月 担当表PDF`} />}
              </div>
            </main>
          </div>
          <div className="mail-preview-footer">
            <label className="mail-preview-confirm">
              <input type="checkbox" checked={mailPreviewConfirmed} onChange={(event) => setMailPreviewConfirmed(event.target.checked)} disabled={mailDispatchStatus === 'sending' || mailPdfPreview.status !== 'ready'} />
              <span><strong>送信内容を確認しました</strong><small>宛先、表、特別連絡、状態記号と実際のPDFを確認しました。送信時は同じ内容のWordも添付されます。</small></span>
            </label>
            {!isMonthLocked ? <p className="inline-message is-warning">月を確定すると送信できます。</p> : null}
            {mailPdfPreview.status === 'loading' ? <p className="inline-message">PDFを作成しています...</p> : null}
            {mailDispatchMessage ? <p className={`inline-message ${mailDispatchStatus === 'error' ? 'is-warning' : ''}`}>{mailDispatchMessage}</p> : null}
            <div className="schedule-mail-actions">
              <button type="button" className="ghost-btn" onClick={closeScheduleMailPanel} disabled={mailDispatchStatus === 'sending'}>戻る</button>
              <button type="button" className="primary-btn" onClick={sendScheduleEmail} disabled={!isMonthLocked || !mailPreviewConfirmed || mailPdfPreview.status !== 'ready' || ['sending', 'sent'].includes(mailDispatchStatus)}>
                {mailDispatchStatus === 'sending' ? '送信中...' : mailDispatchStatus === 'sent' ? '送信済み' : 'この内容で送信'}
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  function HomeView() {
    return (
      <section id="home" className="screen-view">
        <AppHeader
          title={`${year}年${MONTH_JP[month - 1]} 月概要`}
          subtitle="出席状況と担当表の状態を確認します。"
          actions={<button type="button" className="ghost-btn" onClick={switchIdentity}>名前を選び直す</button>}
        />
        <MonthControls />
        <div className="metric-grid">
          <div className="metric-card"><span>開催日</span><strong>{editableSessions.length}回</strong></div>
          <div className="metric-card"><span>出席入力</span><strong>{teachers.filter(t => editableSessions.some(s => attendance[t.name]?.[s.key] !== undefined)).length}/{teachers.length}人</strong></div>
          <div className={`metric-card ${unassignedCount > 0 ? 'metric-warn' : 'metric-ok'}`}><span>未担当</span><strong>{unassignedCount}</strong></div>
          <div className="metric-card"><span>例会</span><strong>{meetingCount}</strong></div>
        </div>

        <div className="dashboard-grid">
          <section className="panel span-2">
            <div className="panel-header">
              <div>
                <h2>今月の流れ</h2>
                <p>各回の種類、出席、未担当を俯瞰します。</p>
              </div>
            </div>
            <div className="session-summary-list">
              {schedule.map((session) => (
                <article key={session.key} className={`session-summary-card ${session.closed ? 'is-muted' : session.meeting ? 'is-info' : ''}`}>
                  <div>
                    <strong>{session.label}</strong>
                    <span>{session.closed ? 'やすみ' : session.meeting ? '例会' : `${session.weekIndex}週目${session.weekIndex % 2 === 1 ? ' 王週' : ''}`}</span>
                  </div>
                  <div className="summary-kpis">
                    <span>出席 {session.selectedTeachers.length}</span>
                    <span>追加 {session.selectedMaybeTeachers.length}</span>
                    <span className={session.unassignedClasses?.length ? 'text-danger' : ''}>未担当 {session.unassignedClasses?.length ?? 0}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="panel">
            <div className="panel-header">
              <div>
                <h2>{isAdmin ? '管理者アクション' : '担当表の共有'}</h2>
                <p>{isAdmin ? '共有、保存、確定をここから行います。' : '担当表を送信したり、Word・PDF・画像で保存できます。'}</p>
              </div>
            </div>
            <ExportActions />
            {isAdmin && (
              <div className="teacher-link-stack">
                <h3>先生別リンク</h3>
                {teachers.map((teacher) => (
                  <button key={teacher.name} type="button" className="ghost-btn" onClick={() => copyTeacherLink(teacher.name)}>
                    {copiedLink === teacher.name ? `${teacher.name} コピー済み` : teacher.name}
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>運用メモ</h2>
              <p>自動計算が参照する重要なルールです。</p>
            </div>
          </div>
          <div className="rule-grid">
            <div className="rule-card">王週は入門を `入門(denji)` と `入門(王)` に分割できます。</div>
            <div className="rule-card">人数不足時だけ `△` と `△・会議○` が担当候補に入ります。</div>
            <div className="rule-card">担当可能クラスに反する割当は自動では行いません。</div>
          </div>
        </section>
      </section>
    )
  }

  function AttendanceView() {
    const attendanceRows = teachers.map((teacher) => {
      const entered = editableSessions.filter((session) => attendance[teacher.name]?.[session.key] !== undefined).length
      return { teacher, entered }
    })
    return (
      <section id="attendance" className="screen-view">
        <AppHeader title="出席入力" subtitle="先生ごとの出席状態を入力します。△は人数不足時だけ担当に入ります。" />
        <ContextTabs items={[{ id: 'attendance', label: '出席入力' }, { id: 'attendanceStats', label: '出席統計' }]} />
        <div className="dashboard-grid">
          <section className="panel span-2">
            {isAdmin && (
              <>
                <div className="chip-row">
                  {teachers.map((teacher) => (
                    <button key={teacher.name} type="button" className={teacher.name === effectiveTeacher ? 'chip active' : 'chip'} onClick={() => handleSelectTeacher(teacher.name)}>
                      {teacher.name}
                    </button>
                  ))}
                </div>
                <div className="teacher-links-row">
                  <span className="teacher-links-hint">先生別リンク</span>
                  {teachers.map((teacher) => (
                    <button key={teacher.name} type="button" className="teacher-link-btn" onClick={() => copyTeacherLink(teacher.name)}>
                      {copiedLink === teacher.name ? `${teacher.name} コピー済み` : teacher.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="panel-header">
              <div>
                <h2>{effectiveTeacher} さんの出席</h2>
                <p>{isMonthLocked ? 'この月の担当表は確定済みです。' : '日付ごとに状態を選んでください。'}</p>
              </div>
            </div>
            <MonthlyLimitControl teacherName={effectiveTeacher} />
            <div className="attendance-card-grid">
              {sessions.map((session) => {
                const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'
                const effectiveStatus = getEffectiveStatus(effectiveTeacher, session.key)
                const isExplicit = attendance[effectiveTeacher]?.[session.key] !== undefined
                const disabled = session.closed || isMonthLocked
                return (
                  <article key={session.key} className={`attendance-card attendance-card-${type} ${disabled ? 'is-disabled' : ''}`}>
                    <div className="attendance-card-head">
                      <div>
                        <strong>{session.label}</strong>
                        <span>{session.closed ? 'やすみ' : session.meeting ? '例会' : `${session.weekIndex}週目`}</span>
                      </div>
                      {!isExplicit && !session.closed ? <span className="status-badge">デフォルト</span> : null}
                    </div>
                    <div className="status-segments">
                      {statusOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={effectiveStatus === option.id ? 'status-segment active' : 'status-segment'}
                          disabled={disabled}
                          onClick={() => handleStatusChange(session.key, option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <aside className="panel">
            <h2>状態の意味</h2>
            <div className="meaning-list">
              {statusOptions.map((option) => (
                <div key={option.id} className="meaning-item">
                  <strong>{option.label}</strong>
                  <span>{BEHAVIORS.find((b) => b.value === option.behavior)?.label ?? option.behavior}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>入力状況</h2>
              <p>誰の出席入力が残っているか確認します。</p>
            </div>
          </div>
          <div className="compact-table-wrap">
            <table className="compact-table">
              <thead><tr><th>先生</th><th>入力済み</th><th>不足</th><th>既定出欠</th></tr></thead>
              <tbody>
                {attendanceRows.map(({ teacher, entered }) => (
                  <tr key={teacher.name} className={entered === 0 ? 'row-warn' : ''}>
                    <td>{teacher.name}</td>
                    <td>{entered}/{editableSessions.length}</td>
                    <td>{Math.max(0, editableSessions.length - entered)}</td>
                    <td>{statusOptions.find((o) => o.id === teacher.defaultStatus)?.label ?? teacher.defaultStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    )
  }

  function AttendanceStatsView() {
    return (
      <section id="attendanceStats" className="screen-view">
        <AppHeader title="出席統計" subtitle="各回の学習者・ボランティア人数を確認・入力します。" />
        <ContextTabs items={[{ id: 'attendance', label: '出席入力' }, { id: 'attendanceStats', label: '出席統計' }]} />
        <div className="dashboard-grid">
          {schedule.filter((s) => !s.closed).map((session) => {
            const counts = getAttendanceCounts(session.key)
            const classes = getSessionClasses(session)
            return (
              <section key={session.key} className="panel">
                <div className="panel-header">
                  <div><h2>{session.label}</h2><p>{sessionTypeLabel(session)}</p></div>
                  <span>計{counts.total}名</span>
                </div>
                <div className="mobile-stats-editor">
                  {classes.map((cls) => (
                    <div key={cls} className="mobile-counter-row">
                      <span>{cls}</span>
                      <div>
                        <button type="button" onClick={() => setStudentCount(session.key, cls, Math.max(0, getStudentCount(session.key, cls) - 1))} disabled={!identity}>−</button>
                        <strong>{getStudentCount(session.key, cls)}</strong>
                        <button type="button" onClick={() => setStudentCount(session.key, cls, getStudentCount(session.key, cls) + 1)} disabled={!identity}>+</button>
                      </div>
                    </div>
                  ))}
                  <div className="mobile-counter-row">
                    <span>ボランティア</span>
                    <div>
                      <button type="button" onClick={() => setVolunteerOverride(session.key, Math.max(0, counts.volunteer - 1))} disabled={!identity}>−</button>
                      <strong>{counts.volunteer}</strong>
                      <button type="button" onClick={() => setVolunteerOverride(session.key, counts.volunteer + 1)} disabled={!identity}>+</button>
                    </div>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </section>
    )
  }

  function ScheduleView() {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    function isPast(skey) {
      if (!isThisMonth || !skey) return false
      const sdate = new Date(year, month - 1, parseInt(skey.split('/')[1], 10))
      return sdate < t
    }
    function isToday(skey) { return isThisMonth && skey === todayKey }
    return (
      <section id="schedule" className="screen-view">
        <AppHeader
          title={`${year}年${MONTH_JP[month - 1]} 担当表`}
          subtitle={isThisMonth ? `今日は${todayKey}` : '出席と担当可能クラスから自動で決まった結果です。'}
          actions={<ExportActions />}
        />
        <ContextTabs items={[{ id: 'schedule', label: '担当表' }, { id: 'sessions', label: '各回設定', adminOnly: true }]} />
        <ScheduleMailPanel />
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>自動で決まった担当</h2>
              <p>会議だけ参加する人は `会議`、不足時に追加された人は特別連絡に表示されます。</p>
            </div>
          </div>
          <div className="table-wrap schedule-table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="col-sticky col-head">名前</th>
                  {sessions.map((session) => {
                    const td = isToday(session.key)
                    const past = isPast(session.key)
                    const cls = td ? 'th-today' : past ? 'th-past' : ''
                    return <th key={session.key} className={cls}>{session.label}{session.meeting ? ' 例会' : ''}{td ? ' ★' : past ? ' ✓' : ''}</th>
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="col-sticky td-label">特別連絡</td>
                  {schedule.map((session) => <td key={session.key} className={session.closed ? 'td-holiday' : ''}>{session.special || ''}</td>)}
                </tr>
                <tr>
                  <td className="col-sticky td-label td-unassigned-label">未担当</td>
                  {schedule.map((session) => <td key={session.key} className={session.unassignedClasses?.length > 0 ? 'td-unassigned' : session.closed ? 'td-holiday' : ''}>{session.unassignedClasses?.join('、') || ''}</td>)}
                </tr>
                {teachers.map((teacher) => (
                  <tr key={teacher.name}>
                    <td className="col-sticky td-label">{teacher.name}</td>
                    {schedule.map((session) => {
                      const assigned = Object.entries(session.assignments).filter(([, assignedTeacher]) => assignedTeacher === teacher.name).map(([className]) => className).join(' / ')
                      const atMeeting = session.meetingOnlyTeachers?.includes(teacher.name) || session.maybeMeetingTeachers?.includes(teacher.name)

                      let cellClass = session.closed ? 'td-holiday' : ''
                      let content = ''

                      if (assigned) {
                        content = assigned
                      } else if (atMeeting) {
                        content = <span className="table-pill info">会議</span>
                      } else if (!session.closed) {
                        const statusId = getEffectiveStatus(teacher.name, session.key)
                        const statusOpt = statusOptions.find(o => o.id === statusId)
                        const behavior = statusOpt?.behavior ?? 'no'
                        if (behavior === 'yes') {
                          content = '○'
                          cellClass += ' td-status td-status-yes'
                        } else if (behavior === 'maybe' || behavior === 'maybe_meeting') {
                          content = '△'
                          cellClass += ' td-status td-status-maybe'
                        } else {
                          content = '×'
                          cellClass += ' td-status td-status-no'
                        }
                      }

                      return <td key={session.key} className={cellClass.trim()}>{content}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="schedule-totals">
            <div className="schedule-totals-header">人数集計</div>
            <div className="schedule-totals-grid">
              <div className="totals-row">
                <div className="totals-label">学習者</div>
                {schedule.map((s) => {
                  const c = s.closed ? 0 : getAttendanceCounts(s.key).studentTotal
                  return <div key={s.key} className="totals-cell">{s.closed ? '' : c}</div>
                })}
              </div>
              <div className="totals-row">
                <div className="totals-label">ボランティア</div>
                {schedule.map((s) => {
                  const c = s.closed ? 0 : getAttendanceCounts(s.key).volunteer
                  return <div key={s.key} className="totals-cell">{s.closed ? '' : c}</div>
                })}
              </div>
              <div className="totals-row totals-row-em">
                <div className="totals-label">合計</div>
                {schedule.map((s) => {
                  const c = s.closed ? 0 : getAttendanceCounts(s.key).total
                  return <div key={s.key} className="totals-cell">{s.closed ? '' : c}</div>
                })}
              </div>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>計算メモ</h2>
          <div className="meaning-list horizontal">
            <div className="meaning-item"><strong>未担当</strong><span>{unassignedCount > 0 ? `${unassignedCount} クラスあります` : '現在ありません'}</span></div>
            <div className="meaning-item"><strong>△追加</strong><span>{schedule.flatMap((s) => s.selectedMaybeTeachers).join('、') || 'なし'}</span></div>
            <div className="meaning-item"><strong>王週</strong><span>奇数週は入門分割候補です。</span></div>
            <div className="meaning-item"><strong>安全</strong><span>担当可能クラスに反する割当はしません。</span></div>
          </div>
        </section>
      </section>
    )
  }

  function SessionsView() {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    function isPast(skey) {
      if (!isThisMonth || !skey) return false
      const sdate = new Date(year, month - 1, parseInt(skey.split('/')[1], 10))
      return sdate < t
    }
    function isToday(skey) {
      return isThisMonth && skey === todayKey
    }
    return (
      <section id="sessions" className="screen-view">
        <AppHeader title="各回設定" subtitle="開催日ごとに種類、開講クラス、手動担当、特別連絡を設定します。" />
        <ContextTabs items={[{ id: 'schedule', label: '担当表' }, { id: 'sessions', label: '各回設定', adminOnly: true }]} />
        <div className="dashboard-grid">
          <section className="panel span-2">
            <MonthControls />
            <div className="session-list expanded">
              {sessions.map((session, i) => {
                const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'
                const classes = getSessionClasses(session)
                const isOverridden = !!sessionClassesByMonth[monthKey]?.[session.key]
                  || !!sessionManualByMonth[monthKey]?.[session.key]
                  || !!attendanceCountsByMonth[monthKey]?.[session.key]?.students
                const isWangWeek = session.weekIndex % 2 === 1
                const past = isPast(session.key)
                const td = isToday(session.key)
                const counts = getAttendanceCounts(session.key)
                return (
                  <article key={session.key} className={`session-row session-row-${type}${past ? ' session-row-past' : ''}${td ? ' session-row-today' : ''}`}>
                    <div className="session-row-top">
                      <div className="session-date-info">
                        <strong className="session-date">{session.label}{td ? <span className="today-badge">今日</span> : ''}{past ? <span className="past-badge">済</span> : ''}</strong>
                        <span className="session-week">{session.closed ? 'やすみ' : `${i + 1}週目${isWangWeek ? '（王週）' : ''}`}</span>
                      </div>
                      <select className="session-type-select" value={type} onChange={(e) => setSessionType(session.key, e.target.value)} disabled={!canEditAdmin}>
                        {sessionTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    {!session.closed && counts.total > 0 && (
                      <div className="session-counts-bar">
                        <span>学習者 {counts.studentTotal} ＋ ボランティア {counts.volunteer} ＝ <strong>{counts.total}人</strong></span>
                      </div>
                    )}
                    {!session.closed && (
                      <>
                        <div className="session-special-note-row">
                          <span className="session-special-note-label">特別連絡</span>
                          <input className="session-special-note-input" value={session.specialNote || ''} placeholder="特別連絡を入力..." onChange={(e) => setSessionSpecialNote(session.key, e.target.value)} disabled={!canEditAdmin} />
                        </div>
                        <div className="session-class-area">
                          <div className="session-class-header">
                            <span className="session-class-label">開講クラス</span>
                            {isOverridden && canEditAdmin ? <button type="button" className="ghost-btn" onClick={() => resetSessionClasses(session.key)}>自動に戻す</button> : null}
                          </div>
                          <div className="session-class-chips">
                            {allClasses.map((cls) => (
                              <div key={cls} className="session-class-chip-row">
                                <ClassChip label={cls} checked={classes.includes(cls)} onChange={(e) => toggleSessionClass(session, cls, e.target.checked)} disabled={!canEditAdmin} />
                                <select className="manual-teacher-select" value={getManualAssignment(session, cls) ?? ''} onChange={(e) => e.target.value ? setManualAssignment(session.key, cls, e.target.value) : resetManualAssignment(session.key, cls)} disabled={!canEditAdmin}>
                                  <option value="">auto</option>
                                  {teachers.map((teacher) => <option key={teacher.name} value={teacher.name}>{teacher.name}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                        {canEditAdmin && getSessionClasses(session).length > 0 && <div className="session-student-row">{getSessionClasses(session).map((cls) => <div key={cls} className="student-chip"><span>{cls}</span><button type="button" className="mini-counter-btn" onClick={() => setStudentCount(session.key, cls, Math.max(0, getStudentCount(session.key, cls) - 1))}>−</button><span className="mini-counter-value">{getStudentCount(session.key, cls)}</span><button type="button" className="mini-counter-btn" onClick={() => setStudentCount(session.key, cls, getStudentCount(session.key, cls) + 1)}>+</button></div>)}{getAttendanceCounts(session.key).studentTotal > 0 ? <span className="student-total">小計 {getAttendanceCounts(session.key).studentTotal}人</span> : null}</div>}
                      </>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
          <aside className="panel">
            <h2>特殊ルール</h2>
            <div className="special-rules-list">
              <div className="special-rule-row compact">
                <div><strong>王さんルール</strong><p>奇数週に入門を2クラスへ分割できます。</p></div>
                <label className="toggle-label"><input type="checkbox" checked={specialRules.wangSplit !== false} onChange={(e) => setSpecialRule('wangSplit', e.target.checked)} disabled={!canEditAdmin} /><span className="toggle-track"><span className="toggle-thumb" /></span></label>
              </div>
              <div className="special-rule-row compact">
                <div><strong>ランダム</strong><p>複数候補からランダムに選びます。</p></div>
                <div className="special-rule-actions">
                  <button type="button" className="ghost-btn" onClick={rerollRandomAssignments} disabled={!canEditAdmin}>再抽選</button>
                  <label className="toggle-label"><input type="checkbox" checked={specialRules.random === true} onChange={(e) => setSpecialRule('random', e.target.checked)} disabled={!canEditAdmin} /><span className="toggle-track"><span className="toggle-thumb" /></span></label>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    )
  }

  function formatBackupDate(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '日時不明' : date.toLocaleString('ja-JP')
  }

  function backupSummaryText(summary) {
    if (!summary) return '内容を確認できません'
    return `授業記録 ${summary.lessonReports}件・伝言 ${summary.bulletinPosts}件・確定表 ${summary.archivedSchedules}件`
  }

  function exportStateBackup() {
    const envelope = createBackupEnvelope(state, '手動バックアップ')
    const stamp = envelope.createdAt.replace(/[:.]/g, '-').slice(0, 19)
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json;charset=utf-8' })
    downloadBlob(blob, `wawon-backup-${stamp}.json`)
    setBackupHistory(saveLocalSnapshot(state, '手動バックアップ', { force: true }))
    setBackupMessage('現在の共有データをJSONで保存しました。')
  }

  async function readBackupFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const candidate = parseBackupText(await file.text())
      setRestoreCandidate({ ...candidate, fileName: file.name })
      setBackupMessage('復元前の内容を確認してください。まだ共有データは変更していません。')
    } catch (error) {
      setRestoreCandidate(null)
      setBackupMessage(error instanceof Error ? error.message : 'バックアップを読み取れませんでした。')
    }
  }

  function restoreStateFromBackup(candidate) {
    if (!isAdmin || !candidate?.state) return
    const summary = candidate.summary ?? summarizeState(candidate.state)
    const confirmed = window.confirm(
      `${backupSummaryText(summary)}を復元します。\n復元後はSupabaseに保存され、ほかの端末にも反映されます。続けますか？`,
    )
    if (!confirmed) return

    setBackupHistory(saveLocalSnapshot(state, '復元直前', { force: true }))
    setState(mergeState(candidate.state))
    setRestoreCandidate(null)
    setBackupMessage('バックアップを復元しました。Supabaseへの保存を待っています。')
  }

  function DataSafetyPanel({ mobile = false }) {
    const currentSummary = summarizeState(state)
    const visibleHistory = backupHistory.slice(0, mobile ? 3 : 5)
    return (
      <section className={mobile ? 'mobile-card-list data-safety-panel' : 'panel data-safety-panel'}>
        <div className="data-safety-header">
          <div>
            <h2>バックアップ・復元</h2>
            <p>授業記録やメモをJSONで保存し、誤操作の前の状態へ戻せます。</p>
          </div>
          <span className={`data-safety-cloud data-safety-cloud-${cloudStatus}`}>{cloudStatus === 'ready' ? '共有済み' : cloudStatus === 'saving' ? '保存中' : cloudStatus === 'error' ? '要確認' : '接続中'}</span>
        </div>

        <div className="data-safety-current">
          <strong>現在のデータ</strong>
          <span>{backupSummaryText(currentSummary)}</span>
        </div>

        <div className="data-safety-actions">
          <button type="button" className="primary-btn" onClick={exportStateBackup}>JSONバックアップ</button>
          <button type="button" className="ghost-btn" onClick={() => backupFileRef.current?.click()}>復元ファイルを選ぶ</button>
          <input ref={backupFileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={readBackupFile} />
        </div>

        {restoreCandidate ? (
          <div className="restore-preview" role="status">
            <div>
              <strong>復元プレビュー</strong>
              <span>{restoreCandidate.fileName || restoreCandidate.source}</span>
              <span>{backupSummaryText(restoreCandidate.summary)}</span>
            </div>
            <div className="data-safety-actions">
              <button type="button" className="danger-btn" onClick={() => restoreStateFromBackup(restoreCandidate)}>この内容を復元</button>
              <button type="button" className="ghost-btn" onClick={() => setRestoreCandidate(null)}>キャンセル</button>
            </div>
          </div>
        ) : null}

        {backupMessage ? <p className="data-safety-message" role="status">{backupMessage}</p> : null}

        <details className="backup-history-details">
          <summary>この端末の履歴 <strong>{backupHistory.length}件</strong></summary>
          {visibleHistory.length === 0 ? <p className="empty-msg">まだ履歴はありません。</p> : (
            <div className="backup-history-list">
              {visibleHistory.map((snapshot) => (
                <div key={snapshot.id} className="backup-history-row">
                  <div>
                    <strong>{snapshot.source}</strong>
                    <span>{formatBackupDate(snapshot.createdAt)}</span>
                    <span>{backupSummaryText(snapshot.summary)}</span>
                  </div>
                  <button type="button" className="ghost-btn" onClick={() => restoreStateFromBackup(snapshot)}>戻す</button>
                </div>
              ))}
            </div>
          )}
        </details>
      </section>
    )
  }

  function SettingsView() {
    return (
      <section id="settings" className="screen-view">
        <AppHeader title="先生・クラス設定" subtitle="割当ルールの中心。先生ごとの担当可能クラスとデフォルト出欠を管理します。" actions={isAdmin ? <button type="button" className="primary-btn" onClick={addTeacher}>先生を追加</button> : null} />
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>先生の担当可能クラス</h2>
              <p className="text-danger">担当可能でないクラスには自動割当しません。</p>
            </div>
          </div>
          <div className="capability-table-wrap">
            <table className="capability-table">
              <thead>
                <tr>
                  <th>先生</th>
                  <th>遠方</th>
                  <th>例会配慮</th>
                  <th>既定出欠</th>
                  <th>月上限</th>
                  {allClasses.map((cls) => <th key={cls}>{cls}</th>)}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher, idx) => (
                  <tr key={`${teacher.name}-${idx}`}>
                    <td><input value={teacher.name} ref={idx === teachers.length - 1 ? newTeacherRef : null} onChange={(e) => updateTeacher(idx, 'name', e.target.value)} disabled={!canEditAdmin} /></td>
                    <td><input type="checkbox" checked={!!teacher.remote} onChange={(e) => updateTeacher(idx, 'remote', e.target.checked)} disabled={!canEditAdmin} /></td>
                    <td><input type="checkbox" checked={!!teacher.skipMeeting} onChange={(e) => updateTeacher(idx, 'skipMeeting', e.target.checked)} disabled={!canEditAdmin} /></td>
                    <td>
                      <select value={teacher.defaultStatus ?? 'no'} onChange={(e) => updateTeacher(idx, 'defaultStatus', e.target.value)} disabled={!canEditAdmin}>
                        {statusOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="31"
                        inputMode="numeric"
                        placeholder="なし"
                        value={teacher.maxMonthlyAssignments ?? ''}
                        onChange={(e) => setTeacherMonthlyLimit(teacher.name, e.target.value)}
                        disabled={!canEditAdmin}
                      />
                    </td>
                    {allClasses.map((cls) => (
                      <td key={cls}><input type="checkbox" checked={teacher.classes.includes(cls)} onChange={(e) => toggleTeacherClass(idx, cls, e.target.checked)} disabled={!canEditAdmin} /></td>
                    ))}
                    <td>
                      <div className="mini-actions">
                        <button type="button" className="icon-btn" disabled={!canEditAdmin || idx === 0} onClick={() => moveTeacher(idx, -1)}>↑</button>
                        <button type="button" className="icon-btn" disabled={!canEditAdmin || idx === teachers.length - 1} onClick={() => moveTeacher(idx, 1)}>↓</button>
                        <button type="button" className="icon-btn danger" disabled={!canEditAdmin} onClick={() => deleteTeacher(idx)}>×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="dashboard-grid">
          <section className="panel">
            <h2>クラス一覧</h2>
            <p className="panel-desc">クラス名、デフォルト開講クラスを管理します。</p>
            <div className="settings-sub-label">デフォルト開講クラス</div>
            <div className="class-chip-row">{allClasses.map((cls) => <ClassChip key={cls} label={cls} checked={defaultClasses.includes(cls)} onChange={(e) => toggleDefaultClass(cls, e.target.checked)} disabled={!canEditAdmin} />)}</div>
            <div className="edit-list">
              {allClasses.map((cls, idx) => (
                <div key={idx} className="edit-row">
                  <input value={cls} ref={idx === allClasses.length - 1 ? newClassRef : null} onChange={(e) => renameGlobalClass(idx, e.target.value)} disabled={!canEditAdmin} />
                  <button type="button" className="icon-btn danger" onClick={() => deleteGlobalClass(idx)} disabled={!canEditAdmin}>×</button>
                </div>
              ))}
            </div>
            <button type="button" className="primary-btn" onClick={addGlobalClass} disabled={!canEditAdmin}>クラスを追加</button>
          </section>
          <section className="panel">
            <h2>学習者のデフォルト人数</h2>
            <p className="panel-desc">各回の学習者数算出の基準値です。クラスごとに設定してください。</p>
            <div className="student-default-list">
              {allClasses.map((cls) => (
                <div key={cls} className="student-default-row">
                  <span className="student-default-label">{cls}</span>
                  <div className="mini-counter">
                    <button type="button" className="mini-counter-btn" onClick={() => setStudentDefault(cls, Math.max(0, getStudentDefault(cls) - 1))} disabled={!canEditAdmin}>−</button>
                    <span className="mini-counter-value">{getStudentDefault(cls)}</span>
                    <button type="button" className="mini-counter-btn" onClick={() => setStudentDefault(cls, getStudentDefault(cls) + 1)} disabled={!canEditAdmin}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <DataSafetyPanel />
      </section>
    )
  }

  function CollabView() {
    return (
      <section id="collab" className="screen-view">
        <AppHeader title="伝言板・メモ・保存" subtitle="全員への連絡、個人メモ、会議記録、確定済み月の保存をまとめます。" />
        <div className="collab-grid">
          <section className="panel">
            <div className="panel-header">
              <div><h2>伝言板</h2><p>固定、重要、確認済みを管理できます。</p></div>
              <button type="button" className="primary-btn" onClick={() => { setShowNewBulletin(true); setEditingBulletinId(null) }}>新規作成</button>
            </div>
            {showNewBulletin && (
              <div className="bulletin-compose">
                <div className="bulletin-compose-author"><span className="bulletin-author-dot" /><strong>{identity}</strong></div>
                <textarea value={newBulletinText} onChange={(e) => setNewBulletinText(e.target.value)} placeholder="連絡事項・お知らせ・メモなど..." rows={4} autoFocus />
                <div className="bulletin-compose-actions">
                  <button type="button" className="ghost-btn" onClick={() => { setShowNewBulletin(false); setNewBulletinText('') }}>キャンセル</button>
                  <button type="button" className="primary-btn" onClick={createBulletin} disabled={!newBulletinText.trim()}>確定</button>
                </div>
              </div>
            )}
            {bulletinBoard.length === 0 && !showNewBulletin ? <div className="bulletin-empty"><p>まだ伝言はありません。</p></div> : (
              <div className="bulletin-list">
                {sortedBulletin.map((post) => {
                  const canEdit = isAdmin || identity === post.author
                  const isEditing = editingBulletinId === post.id
                  const confirmedBy = Array.isArray(post.confirmedBy) ? post.confirmedBy : []
                  const isConfirmed = confirmedBy.includes(identity)
                  const tier = sortedBulletin.filter((p) => !!p.pinned === !!post.pinned)
                  const tierPos = tier.findIndex((p) => p.id === post.id)
                  return (
                    <article key={post.id} className={['bulletin-post', post.pinned ? 'bulletin-post-pinned' : '', post.important ? 'bulletin-post-important' : ''].filter(Boolean).join(' ')}>
                      <div className="bulletin-post-header">
                        <div className="bulletin-post-meta">
                          <strong>{post.author}</strong>
                          {post.pinned ? <span className="bulletin-badge-pin">固定</span> : null}
                          {post.important ? <span className="bulletin-badge-important">重要</span> : null}
                          <span className="bulletin-post-date">{new Date(post.updatedAt).toLocaleDateString('ja-JP')}</span>
                        </div>
                        <div className="bulletin-post-btns">
                          <button type="button" className="icon-btn" disabled={tierPos === 0} onClick={() => moveBulletin(post.id, -1)}>↑</button>
                          <button type="button" className="icon-btn" disabled={tierPos === tier.length - 1} onClick={() => moveBulletin(post.id, 1)}>↓</button>
                          <button type="button" className={isConfirmed ? 'success-btn' : 'ghost-btn'} onClick={() => toggleConfirmBulletin(post.id)}>確認 {confirmedBy.length}</button>
                          <button type="button" className="ghost-btn" onClick={() => toggleImportantBulletin(post.id)}>重要</button>
                          <button type="button" className="ghost-btn" onClick={() => togglePinBulletin(post.id)}>固定</button>
                          {canEdit ? <button type="button" className="ghost-btn" onClick={() => startEditBulletin(post)}>編集</button> : null}
                          {canEdit ? <button type="button" className="danger-btn" onClick={() => deleteBulletin(post.id)}>削除</button> : null}
                        </div>
                      </div>
                      {isEditing ? (
                        <div className="bulletin-edit-area">
                          <textarea value={editingBulletinText} onChange={(e) => setEditingBulletinText(e.target.value)} rows={4} autoFocus />
                          <div className="bulletin-compose-actions">
                            <button type="button" className="ghost-btn" onClick={cancelEditBulletin}>キャンセル</button>
                            <button type="button" className="primary-btn" onClick={saveEditBulletin} disabled={!editingBulletinText.trim()}>確定</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="bulletin-post-body">{post.message}</p>
                          <div className="bulletin-confirmed-row"><span className="bulletin-confirmed-label">確認済み</span><span>{confirmedBy.length > 0 ? confirmedBy.join('、') : 'まだありません'}</span></div>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>メモ</h2>
            {isMonthLocked ? <p className="lesson-edit-note">この月は確定済みですが、メモと会議記録は編集できます。</p> : null}
            <div className="my-memo-card">
              <div className="my-memo-header"><div><h3>My Memo</h3><p>{identity} さん用の個人メモです。</p></div></div>
              <AutoTextarea value={myMemo} onChange={(e) => setMyMemo(e.target.value)} placeholder="自分だけのメモを書けます..." rows={5} />
            </div>
            {schedule.filter((s) => s.meeting && !s.closed).map((session) => (
              <div key={session.key} className="meeting-note-card">
                <strong>{session.label} 会議記録</strong>
                <AutoTextarea value={meetingNotes[session.key] ?? ''} onChange={(e) => setMeetingNote(session.key, e.target.value)} placeholder="議事録・決定事項・次回への伝達事項" rows={5} />
              </div>
            ))}
            <div className="memo-list compact">
              {schedule.map((session) => (
                <article key={session.key} className={`memo-card ${session.closed ? 'memo-holiday' : session.meeting ? 'memo-meeting' : ''}`}>
                  <h3>{session.label}</h3>
                  {session.closed ? <p className="memo-auto">わをん休み</p> : (
                    <>
                      <p className="memo-auto">来る人: {session.selectedTeachers.join('、') || 'なし'}</p>
                      <p className="memo-auto">例会のみ: {session.meetingOnlyTeachers.join('、') || 'なし'}</p>
                      {session.selectedMaybeTeachers.length > 0 ? <p className="memo-auto">△から追加: {session.selectedMaybeTeachers.join('、')}</p> : null}
                      {session.unassignedClasses?.length > 0 ? <p className="memo-warn">未担当: {session.unassignedClasses.join('、')}</p> : null}
                    </>
                  )}
                  <AutoTextarea value={memos[session.key] ?? ''} onChange={(e) => setMemo(session.key, e.target.value)} placeholder="自由に書き込めます..." rows={3} />
                </article>
              ))}
            </div>
          </section>

          <aside className="panel">
            <h2>保存済み</h2>
            <ExportActions />
            <div className="archive-list">
              {archiveEntries.length === 0 ? <p className="empty-msg">まだ確定済みの月はありません。</p> : archiveEntries.map(([key, arc]) => (
                <div key={key} className="archive-row">
                  <div className="archive-row-info"><strong>{arc.label}</strong><span>確定日: {new Date(arc.savedAt).toLocaleDateString('ja-JP')}</span></div>
                  <div className="archive-actions">
                    <button type="button" className="ghost-btn" onClick={() => downloadArchive(key, arc)}>ダウンロード</button>
                    <button type="button" className="danger-btn" onClick={() => deleteArchive(key)}>削除</button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    )
  }

  function LessonReportFields({ report, compact = false }) {
    if (!report) return <p className="empty-msg">担当がある授業がまだありません。</p>
    const canEditReport = !!identity
    const autoCountValue = countLessonAttendees(report.attendees)
    const countValue = lessonAttendeeCountValue(report)
    return (
      <div className={compact ? 'lesson-form lesson-form-compact' : 'lesson-form'}>
        <section className="lesson-form-card">
          <h2>{report.dateText} {report.className}</h2>
          {isMonthLocked ? <p className="lesson-edit-note">この月は確定済みですが、授業記録は編集できます。</p> : null}
          <div className="lesson-basic-grid">
            <label><span>日付</span><input value={report.dateText} onChange={(e) => setLessonReportField(report.id, 'dateText', e.target.value)} disabled={!canEditReport} /></label>
            <label><span>クラス</span><input value={report.className} onChange={(e) => setLessonReportField(report.id, 'className', e.target.value)} disabled={!canEditReport} /></label>
            <label><span>担当</span><input value={report.teacherName} onChange={(e) => setLessonReportField(report.id, 'teacherName', e.target.value)} disabled={!canEditReport} /></label>
          </div>
        </section>

        <section className="lesson-form-card">
          <div className="lesson-card-title"><h3>出席者</h3><span>計{countValue || 0}名</span></div>
          <textarea value={report.attendees || ''} onChange={(e) => setLessonReportField(report.id, 'attendees', e.target.value)} placeholder="孟莉（中）伊藤（中）鈴木（中）..." rows={compact ? 4 : 3} disabled={!canEditReport} />
          <label className="lesson-count-field"><span>人数</span><input value={report.attendeeCount ?? ''} onChange={(e) => setLessonReportField(report.id, 'attendeeCount', e.target.value)} placeholder={autoCountValue || '5'} disabled={!canEditReport} /></label>
        </section>

        <section className="lesson-form-card">
          <h3>単元</h3>
          <textarea value={report.unit || ''} onChange={(e) => setLessonReportField(report.id, 'unit', e.target.value)} placeholder="いろどり初級2 11課 / 中級から学ぶ日本語 p32..." rows={compact ? 4 : 3} disabled={!canEditReport} />
        </section>

        <section className="lesson-form-card">
          <h3>授業内容</h3>
          <textarea className="lesson-long-textarea" value={report.content || ''} onChange={(e) => setLessonReportField(report.id, 'content', e.target.value)} placeholder="本日扱った内容、練習した文型、活動内容など..." rows={compact ? 9 : 10} disabled={!canEditReport} />
        </section>

        <section className="lesson-form-card">
          <h3>申し送り及び感想</h3>
          <textarea value={report.handoff || ''} onChange={(e) => setLessonReportField(report.id, 'handoff', e.target.value)} placeholder="次回進めるページ、コピー状況、注意点など..." rows={compact ? 6 : 5} disabled={!canEditReport} />
        </section>
      </div>
    )
  }

  function LessonReportPreview({ report }) {
    if (!report) return null
    const contentLines = formatLessonContentLines(report.content)
    const handoffLines = formatLessonHandoffLines(report.handoff)
    return (
      <div className="lesson-word-preview">
        <table aria-label={`${report.dateText} ${report.className} 授業記録`}>
          <tbody>
            <tr>
              <td>{report.dateText}</td>
              <td>クラス　　{report.className}</td>
              <td>担当　　{report.teacherName}</td>
            </tr>
            <tr>
              <td colSpan="3">出席者　　{report.attendees || '未入力'}　計({lessonAttendeeCountValue(report) || '0'})名</td>
            </tr>
            <tr>
              <td colSpan="3" className="lesson-preview-unit">
                {String(report.unit || '未入力').split(/\r?\n/).map((line, index) => <p key={`${line}-${index}`}>単元　{line}</p>)}
              </td>
            </tr>
            <tr>
              <td colSpan="3" className="lesson-preview-content">
                {contentLines.length > 0
                  ? contentLines.map((line, index) => <p className="lesson-preview-line" key={`${line.display}-${index}`}>{line.display}</p>)
                  : <p>授業内容を入力するとここに表示されます。</p>}
              </td>
            </tr>
            <tr>
              <td colSpan="3" className="lesson-preview-handoff">
                <strong>申し送り及び感想：</strong>
                {handoffLines.length > 0
                  ? handoffLines.map((line, index) => <p className="lesson-preview-line" key={`${line.display}-${index}`}>{line.display}</p>)
                  : <p>未入力</p>}
              </td>
            </tr>
          </tbody>
        </table>
        <footer>日本語ボランティアグループ　　わをん</footer>
      </div>
    )
  }

  function openLessonReportOption(option) {
    if (!option) return
    setYear(option.calendarYear)
    setMonth(option.calendarMonth)
    setActiveLessonReportId(option.id)
  }

  function moveLessonReportMonth(delta) {
    const targetDate = new Date(year, month - 1 + delta, 1)
    const targetYear = targetDate.getFullYear()
    const targetMonth = targetDate.getMonth() + 1
    const targetOptions = buildLessonReportOptionsForMonth(targetYear, targetMonth)
    const preferred = targetOptions.find((item) => item.className === selectedLessonOption?.className)
      ?? targetOptions[0]
    setYear(targetYear)
    setMonth(targetMonth)
    setActiveLessonReportId(preferred?.id ?? '')
  }

  function LessonReportTimelineControls({ compact = false }) {
    return (
      <div className={`lesson-timeline-toolbar ${compact ? 'compact' : ''}`}>
        <div className="lesson-month-nav" aria-label="授業記録の月を移動">
          <button type="button" className="ghost-btn" onClick={() => moveLessonReportMonth(-1)} aria-label="前の月">‹</button>
          <strong>{year}年{month}月</strong>
          <button type="button" className="ghost-btn" onClick={() => moveLessonReportMonth(1)} aria-label="次の月">›</button>
        </div>
        <div className="lesson-step-nav" aria-label="同じクラスの記録を移動">
          <button type="button" className="ghost-btn" onClick={() => openLessonReportOption(previousLessonOption)} disabled={!previousLessonOption}>
            <span>前回</span>
            <small>{previousLessonOption ? `${previousLessonOption.sessionLabel} ${previousLessonOption.className}` : '記録なし'}</small>
          </button>
          <button type="button" className="ghost-btn" onClick={() => openLessonReportOption(nextLessonOption)} disabled={!nextLessonOption}>
            <span>次回</span>
            <small>{nextLessonOption ? `${nextLessonOption.sessionLabel} ${nextLessonOption.className}` : '記録なし'}</small>
          </button>
        </div>
      </div>
    )
  }

  function LessonReportReference({ compact = false }) {
    if (!previousLessonReference) {
      return (
        <section className={`lesson-reference ${compact ? 'compact' : ''}`}>
          <div className="lesson-reference-head">
            <div><span>前回の同じクラス</span><strong>保存済みの記録はありません</strong></div>
          </div>
        </section>
      )
    }
    return (
      <section className={`lesson-reference ${compact ? 'compact' : ''}`}>
        <div className="lesson-reference-head">
          <div>
            <span>前回の同じクラス</span>
            <strong>{previousLessonReference.sessionLabel} {previousLessonReference.className}</strong>
          </div>
          <button type="button" className="ghost-btn" onClick={() => openLessonReportOption(previousLessonReferenceOption)}>開く</button>
        </div>
        <dl>
          <div><dt>単元</dt><dd>{previousLessonReference.unit || '未入力'}</dd></div>
          <div><dt>授業内容</dt><dd>{previousLessonReference.content || '未入力'}</dd></div>
          <div><dt>申し送り</dt><dd>{previousLessonReference.handoff || '未入力'}</dd></div>
        </dl>
      </section>
    )
  }

  function LessonReportMailDialog({ report }) {
    if (!lessonMailPanelOpen || !report) return null
    const draft = lessonReportMailDraft(report)
    const recipientNames = teachers.filter((teacher) => teacher.name !== identity).map((teacher) => teacher.name)
    const reportComplete = report.status === '完了' && !!report.updatedAt
    const senderMatches = report.teacherName === identity
    const readyToSend = reportComplete && senderMatches && cloudStatus === 'ready' && lessonMailPreviewConfirmed && lessonMailPdfPreview.status === 'ready'
    const canSend = readyToSend && !(lessonMailDispatchStatus === 'sent' && lessonMailDispatchMode === 'broadcast')
    const canTestToSelf = isAdmin && readyToSend && !(lessonMailDispatchStatus === 'sent' && lessonMailDispatchMode === 'sender_test')
    return (
      <div className="mail-preview-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLessonReportMail()
      }}>
        <section className="mail-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="lesson-mail-title">
          <div className="schedule-mail-head">
            <div><span>授業報告メール</span><strong id="lesson-mail-title">送信前プレビュー</strong></div>
            <button type="button" className="icon-close-btn" title="閉じる" aria-label="閉じる" onClick={closeLessonReportMail} disabled={lessonMailDispatchStatus === 'sending'}>×</button>
          </div>
          <div className="mail-preview-layout">
            <aside className="mail-preview-summary">
              <dl className="schedule-mail-meta">
                <div><dt>授業</dt><dd>{draft.mailDateText}　{report.className}クラス</dd></div>
                <div><dt>送信元</dt><dd>Wawon管理用Gmail</dd></div>
                <div><dt>担当者</dt><dd>{identity}</dd></div>
                <div><dt>配信先</dt><dd>{recipientNames.join('、')}（{recipientNames.length}名）</dd></div>
                <div><dt>件名</dt><dd>{draft.subject}</dd></div>
              </dl>
              <div className="lesson-mail-attachment">
                <span>添付（2件）</span>
                <div className="lesson-mail-attachment-files">
                  <strong>{lessonMailPdfPreview.filename || draft.attachmentName}</strong>
                  <strong>{draft.wordAttachmentName}</strong>
                  <small>画面では、実際に送るPDFをプレビューしています。</small>
                </div>
              </div>
              <p className="schedule-mail-format-note">同じ保存内容は重複送信されません。記録を変更して保存すると、修正版を再送できます。</p>
            </aside>
            <main className="mail-preview-main">
              <MailPreviewTabs value={lessonMailPreviewTab} onChange={setLessonMailPreviewTab} />
              <div className="mail-preview-canvas" role="tabpanel">
                {lessonMailPreviewTab === 'email'
                  ? <pre className="lesson-mail-body-preview">{draft.body}</pre>
                  : <PdfAttachmentPreview preview={lessonMailPdfPreview} onRetry={() => prepareLessonMailPdf(report)} title={`${draft.mailDateText} ${report.className} 授業記録PDF`} />}
              </div>
            </main>
          </div>
          <div className="mail-preview-footer">
            <label className="mail-preview-confirm">
              <input type="checkbox" checked={lessonMailPreviewConfirmed} onChange={(event) => setLessonMailPreviewConfirmed(event.target.checked)} disabled={lessonMailDispatchStatus === 'sending' || lessonMailPdfPreview.status !== 'ready'} />
              <span><strong>送信内容を確認しました</strong><small>宛先、本文、日付、クラス、担当者と実際のPDFを確認しました。送信時は同じ内容のWordも添付されます。</small></span>
            </label>
            {!senderMatches ? <p className="inline-message is-warning">担当者「{report.teacherName}」本人の名前で開いている時だけ送信できます。</p> : null}
            {!reportComplete ? <p className="inline-message is-warning">単元・授業内容・申し送りを入力し、保存が完了すると送信できます。</p> : null}
            {cloudStatus !== 'ready' ? <p className="inline-message is-warning">共有データを保存しています。完了までお待ちください。</p> : null}
            {lessonMailPdfPreview.status === 'loading' ? <p className="inline-message">PDFを作成しています...</p> : null}
            {lessonMailDispatchMessage ? <p className={`inline-message ${lessonMailDispatchStatus === 'error' ? 'is-warning' : ''}`}>{lessonMailDispatchMessage}</p> : null}
            <div className="schedule-mail-actions">
              <button type="button" className="ghost-btn" onClick={closeLessonReportMail} disabled={lessonMailDispatchStatus === 'sending'}>戻る</button>
              <div className="schedule-mail-send-actions">
                {isAdmin ? (
                  <button type="button" className="ghost-btn" onClick={() => sendLessonReportEmail(report, 'sender_test')} disabled={!canTestToSelf || lessonMailDispatchStatus === 'sending'}>
                    {lessonMailDispatchStatus === 'sending' && lessonMailDispatchMode === 'sender_test'
                      ? 'テスト送信中...'
                      : lessonMailDispatchStatus === 'sent' && lessonMailDispatchMode === 'sender_test'
                        ? '本人へ送信済み'
                        : '本人だけにテスト送信'}
                  </button>
                ) : null}
                <button type="button" className="primary-btn" onClick={() => sendLessonReportEmail(report)} disabled={!canSend || lessonMailDispatchStatus === 'sending'}>
                  {lessonMailDispatchStatus === 'sending' && lessonMailDispatchMode === 'broadcast'
                    ? '送信中...'
                    : lessonMailDispatchStatus === 'sent' && lessonMailDispatchMode === 'broadcast'
                      ? '送信済み'
                      : 'この内容で送信'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  function LessonReportsView() {
    return (
      <section id="lessonReports" className="screen-view">
        <AppHeader
          title="授業記録"
          subtitle="授業後の報告書を作成し、PDFまたはWord形式で保存します。"
          actions={<div className="action-row"><button type="button" className="primary-btn" onClick={openLessonReportMail} disabled={!selectedLessonReport}>メール送信</button><button type="button" className="ghost-btn" onClick={() => exportLessonReportDocx(selectedLessonReport)} disabled={!selectedLessonReport}>DOCX出力</button><button type="button" className="ghost-btn" onClick={() => exportLessonReportPdf(selectedLessonReport)} disabled={!selectedLessonReport}>PDF出力</button><button type="button" className="ghost-btn" disabled={!selectedLessonReport}>保存済み</button></div>}
        />
        {LessonReportMailDialog({ report: selectedLessonReport })}
        {LessonReportTimelineControls({ compact: false })}
        <div className="lesson-layout">
          <main>
            <div className="lesson-selector-row">
              <label className="field-block">
                <span>日付</span>
                <select value={selectedLessonGroup?.sessionKey ?? ''} onChange={(e) => {
                  const group = lessonReportGroups.find((item) => item.sessionKey === e.target.value)
                  setActiveLessonReportId(group?.items[0]?.id ?? '')
                }}>
                  {lessonReportGroups.map((group) => <option key={group.sessionKey} value={group.sessionKey}>{group.label}</option>)}
                </select>
              </label>
              <label className="field-block">
                <span>授業</span>
                <select value={selectedLessonReportId} onChange={(e) => setActiveLessonReportId(e.target.value)}>
                  {(selectedLessonGroup?.items ?? []).map((option) => <option key={option.id} value={option.id}>{option.className} / {option.teacherName}</option>)}
                </select>
              </label>
            </div>
            {LessonReportReference({ compact: false })}
            {LessonReportFields({ report: selectedLessonReport })}
          </main>
          <aside className="lesson-side">
            <section className="panel">
              <h2>今月の授業記録</h2>
              <div className="lesson-report-list">
                {lessonReportGroups.map((group) => {
                  const isOpen = group.sessionKey === selectedLessonGroup?.sessionKey
                  return (
                    <div key={group.sessionKey} className={`lesson-report-group ${isOpen ? 'open' : ''}`}>
                      <button type="button" className="lesson-report-date-btn" onClick={() => setActiveLessonReportId(group.items[0]?.id ?? '')}>
                        <span>{group.label}</span>
                        <strong>{group.doneCount}/{group.items.length}</strong>
                      </button>
                      {isOpen ? (
                        <div className="lesson-report-sublist">
                          {group.items.map((option) => (
                            <button key={option.id} type="button" className={option.id === selectedLessonReportId ? 'active' : ''} onClick={() => setActiveLessonReportId(option.id)}>
                              <span>{option.className}</span>
                              <strong>{option.status}</strong>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
            <section className="panel">
              <h2>Wordプレビュー</h2>
              {LessonReportPreview({ report: selectedLessonReport })}
            </section>
          </aside>
        </div>
      </section>
    )
  }

  function getStatusInfo(teacherName, sessionKey) {
    return getStatusInfoFromAttendance(teacherName, sessionKey, attendance)
  }

  function getStatusInfoFromAttendance(teacherName, sessionKey, sourceAttendance) {
    const teacher = teachers.find((t) => t.name === teacherName)
    const statusId = sourceAttendance[teacherName]?.[sessionKey] ?? teacher?.defaultStatus ?? 'no'
    const option = statusOptions.find((item) => item.id === statusId)
    return {
      id: statusId,
      label: option?.label ?? statusId,
      behavior: option?.behavior ?? 'no',
    }
  }

  function statusTone(behavior) {
    if (behavior === 'yes') return 'yes'
    if (behavior === 'maybe' || behavior === 'maybe_meeting') return 'maybe'
    if (behavior === 'meeting_only') return 'meeting'
    return 'no'
  }

  function MobileMonthControls() {
    return (
      <div className="mobile-month-controls" aria-label="月を選ぶ">
        <label>
          <span>年</span>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {Array.from({ length: 21 }, (_, i) => 2020 + i).map((value) => (
              <option key={value} value={value}>{value}年</option>
            ))}
          </select>
        </label>
        <label>
          <span>月</span>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {MONTH_JP.map((label, i) => <option key={i + 1} value={i + 1}>{label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { const now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }}>
          今月
        </button>
      </div>
    )
  }

  function sessionTypeLabel(session) {
    if (session.closed) return '休み'
    if (session.meeting) return '例会'
    return '通常'
  }

  function assignedClassesFor(session, teacherName) {
    return Object.entries(session.assignments || {})
      .filter(([, assignedTeacher]) => assignedTeacher === teacherName)
      .map(([className]) => className)
  }

  function dateForSession(session, targetYear = year, targetMonth = month) {
    const [, dayPart] = String(session.key).split('/')
    const day = Number(dayPart)
    return Number.isFinite(day) ? new Date(targetYear, targetMonth - 1, day) : null
  }

  function buildScheduleForMonth(targetYear, targetMonth) {
    if (targetYear === year && targetMonth === month) {
      return { year, month, schedule, attendance }
    }
    const targetMonthKey = `${targetYear}-${targetMonth}`
    const targetSpecialRules = specialRulesForMonthKey(targetMonthKey)
    const targetSessions = generateSessions(
      targetYear,
      targetMonth,
      sessionTypesByMonth,
      sessionClassesByMonth,
      manualAssignmentsForMonthKey(targetMonthKey),
      sessionSpecialNotesByMonth,
      defaultClasses,
      allClasses,
      targetSpecialRules,
    )
    const targetAttendance = attendanceByMonth[targetMonthKey] ?? {}
    let targetSchedule = []
    try {
      targetSchedule = buildSchedule(targetAttendance, targetSessions, teachers, statusOptions, targetSpecialRules)
    } catch (error) {
      console.error(error)
    }
    return { year: targetYear, month: targetMonth, schedule: targetSchedule, attendance: targetAttendance }
  }

  function buildLessonReportOptionsForMonth(targetYear, targetMonth) {
    const targetMonthKey = `${targetYear}-${targetMonth}`
    const target = buildScheduleForMonth(targetYear, targetMonth)
    const reports = lessonReportsByMonth?.[targetMonthKey] ?? {}
    const options = new Map()

    target.schedule.forEach((session) => {
      if (session.closed) return
      Object.entries(session.assignments || {}).forEach(([className, teacherName]) => {
        const id = `${session.key}__${className}`
        const report = reports[id]
        const sessionDate = dateForSession(session, targetYear, targetMonth)
        options.set(id, {
          id,
          monthKey: targetMonthKey,
          calendarYear: targetYear,
          calendarMonth: targetMonth,
          sessionKey: session.key,
          sessionLabel: session.label,
          dateText: `${session.label}（土）`,
          dateTimestamp: sessionDate?.getTime() ?? 0,
          label: `${session.label} ${className}`,
          className,
          teacherName,
          status: !report ? '未入力' : (report.unit && report.content && report.handoff ? '完了' : '下書き'),
        })
      })
    })

    Object.entries(reports).forEach(([id, report]) => {
      if (options.has(id)) return
      const separatorIndex = id.indexOf('__')
      const idSessionKey = separatorIndex >= 0 ? id.slice(0, separatorIndex) : ''
      const idClassName = separatorIndex >= 0 ? id.slice(separatorIndex + 2) : ''
      const sessionKey = report.sessionKey || idSessionKey || report.dateText?.replace(/（.*$/, '') || ''
      const sessionLabel = report.sessionLabel || sessionKey
      const className = report.className || idClassName || 'クラス未設定'
      const sessionDate = dateForSession({ key: sessionKey }, targetYear, targetMonth)
      options.set(id, {
        id,
        monthKey: targetMonthKey,
        calendarYear: targetYear,
        calendarMonth: targetMonth,
        sessionKey,
        sessionLabel,
        dateText: report.dateText || `${sessionLabel}（土）`,
        dateTimestamp: sessionDate?.getTime() ?? 0,
        label: report.label || `${sessionLabel} ${className}`,
        className,
        teacherName: report.teacherName || '担当未設定',
        status: report.unit && report.content && report.handoff ? '完了' : '下書き',
      })
    })

    return [...options.values()].sort((a, b) => (
      a.dateTimestamp - b.dateTimestamp || a.className.localeCompare(b.className, 'ja')
    ))
  }

  function findNextSession() {
    const startYear = todayDate.getFullYear()
    const startMonth = todayDate.getMonth() + 1
    for (let offset = 0; offset < 12; offset += 1) {
      const date = new Date(startYear, startMonth - 1 + offset, 1)
      const targetYear = date.getFullYear()
      const targetMonth = date.getMonth() + 1
      const target = buildScheduleForMonth(targetYear, targetMonth)
      const found = target.schedule.find((session) => {
        if (session.closed) return false
        const sessionDate = dateForSession(session, targetYear, targetMonth)
        return sessionDate && sessionDate >= todayDate
      })
      if (found) return { ...found, calendarYear: targetYear, calendarMonth: targetMonth, calendarAttendance: target.attendance }
    }
    return schedule.find((session) => !session.closed) ?? schedule[0]
  }

  function MobileHeader({ title, subtitle, showMonth = false }) {
    return (
      <header className="mobile-header">
        <div className="mobile-title-row">
          <BrandMark iconId={activeBrandIconId} size="small" />
          <div>
          <p className="mobile-kicker">Wawon Rotation</p>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        <button type="button" className="mobile-user-chip" onClick={switchIdentity}>
          <strong>{identity}</strong>
          <span>{isAdmin ? '管理者' : '本人'}</span>
        </button>
        {showMonth ? <MobileMonthControls /> : null}
      </header>
    )
  }

  function MobileMoreBack() {
    return <button type="button" className="mobile-subpage-back" onClick={() => setActiveView('mobileMore')}>‹ その他へ戻る</button>
  }

  function MobileHomeView() {
    const nextSession = findNextSession()
    const nextAttendance = nextSession?.calendarAttendance ?? attendance
    const substituteCount = nextSession
      ? teachers.filter((teacher) => {
          const assigned = assignedClassesFor(nextSession, teacher.name).length > 0
          const tone = statusTone(getStatusInfoFromAttendance(teacher.name, nextSession.key, nextAttendance).behavior)
          return !assigned && (tone === 'yes' || tone === 'maybe')
        }).length
      : 0
    return (
      <section className="mobile-screen">
        <MobileHeader title={`${year}年${MONTH_JP[month - 1]}`} subtitle="担当表と出席の確認" showMonth />
        <div className="mobile-metrics">
          <div><span>次回</span><strong>{nextSession ? `${nextSession.label} ${sessionTypeLabel(nextSession)}` : 'なし'}</strong></div>
          <div><span>出席入力</span><strong>{mobileAttendanceDoneCount}/{teachers.length}</strong></div>
          <div className={unassignedCount > 0 ? 'is-warn' : 'is-ok'}><span>未担当</span><strong>{unassignedCount}</strong></div>
          <div><span>代替候補</span><strong>{substituteCount}</strong></div>
        </div>
        <div className="mobile-quick-actions">
          <button type="button" onClick={copyLineText}>LINEコピー</button>
          <button type="button" onClick={() => setActiveView('schedule')}>担当表を見る</button>
          <button type="button" onClick={() => setActiveView('attendance')}>出席入力</button>
        </div>
        <section className="mobile-card-list">
          <h2>今月の回</h2>
          {schedule.map((session) => {
            const counts = teachers.reduce((acc, teacher) => {
              const tone = statusTone(getStatusInfo(teacher.name, session.key).behavior)
              acc[tone] = (acc[tone] ?? 0) + 1
              return acc
            }, {})
            return (
              <article key={session.key} className="mobile-session-row">
                <div>
                  <strong>{session.label}</strong>
                  <span>{sessionTypeLabel(session)}</span>
                </div>
                <div className="mobile-mini-statuses">
                  <span className="status-dot yes">○{counts.yes ?? 0}</span>
                  <span className="status-dot maybe">△{counts.maybe ?? 0}</span>
                  <span className="status-dot no">×{counts.no ?? 0}</span>
                </div>
              </article>
            )
          })}
        </section>
      </section>
    )
  }

  function MobileAttendanceView() {
    return (
      <section className="mobile-screen">
        <MobileHeader title="出席入力" subtitle={isAdmin ? '先生を切り替えて入力できます' : '自分の出席だけ入力できます'} showMonth />
        {isAdmin ? (
          <div className="mobile-chip-scroll">
            {teachers.map((teacher) => (
              <button key={teacher.name} type="button" className={teacher.name === effectiveTeacher ? 'active' : ''} onClick={() => handleSelectTeacher(teacher.name)}>
                {teacher.name}
              </button>
            ))}
          </div>
        ) : null}
        <MonthlyLimitControl teacherName={effectiveTeacher} compact />
        <div className="mobile-card-list">
          {sessions.map((session) => {
            const status = getStatusInfo(effectiveTeacher, session.key)
            const disabled = session.closed || isMonthLocked
            return (
              <article key={session.key} className={`mobile-attendance-card ${disabled ? 'is-disabled' : ''}`}>
                <div className="mobile-card-head">
                  <div>
                    <strong>{session.label}</strong>
                    <span>{sessionTypeLabel(session)}</span>
                  </div>
                  <span className={`mobile-status-pill ${statusTone(status.behavior)}`}>{status.label}</span>
                </div>
                {memos[session.key] ? <p className="mobile-card-note">{memos[session.key]}</p> : null}
                <div className="mobile-status-grid">
                  {statusOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={status.id === option.id ? 'active' : ''}
                      disabled={disabled}
                      onClick={() => handleStatusChange(session.key, option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {statusTone(status.behavior) === 'maybe' ? <p className="mobile-help-text">代替候補として担当表に表示されます。</p> : null}
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  function MobileAttendanceStatsView() {
    return (
      <section className="mobile-screen">
        <MobileHeader title="出席統計" subtitle="各回の学習者・ボランティア人数を確認できます" showMonth />
        <MobileMoreBack />
        <div className="mobile-card-list">
          {schedule.map((session) => {
            const counts = getAttendanceCounts(session.key)
            const classes = getSessionClasses(session)
            return (
              <article key={session.key} className={`mobile-stats-card ${session.closed ? 'is-disabled' : ''}`}>
                <div className="mobile-card-head">
                  <div>
                    <strong>{session.label}</strong>
                    <span>{sessionTypeLabel(session)}</span>
                  </div>
                  <span className="mobile-status-pill yes">計{counts.total}名</span>
                </div>
                {session.closed ? (
                  <p className="mobile-card-note">わおん休み</p>
                ) : (
                  <>
                    <div className="mobile-stats-total">
                      <div><span>学習者</span><strong>{counts.studentTotal}</strong></div>
                      <div><span>ボランティア</span><strong>{counts.volunteer}</strong></div>
                      <div><span>合計</span><strong>{counts.total}</strong></div>
                    </div>
                    <div className="mobile-stats-editor">
                      {classes.map((cls) => (
                        <div key={`${session.key}-${cls}`} className="mobile-counter-row">
                          <span>{cls}</span>
                          <div>
                            <button type="button" onClick={() => setStudentCount(session.key, cls, Math.max(0, getStudentCount(session.key, cls) - 1))} disabled={!identity}>−</button>
                            <strong>{getStudentCount(session.key, cls)}</strong>
                            <button type="button" onClick={() => setStudentCount(session.key, cls, getStudentCount(session.key, cls) + 1)} disabled={!identity}>+</button>
                          </div>
                        </div>
                      ))}
                      <div className="mobile-counter-row">
                        <span>ボランティア</span>
                        <div>
                          <button type="button" onClick={() => setVolunteerOverride(session.key, Math.max(0, counts.volunteer - 1))} disabled={!identity}>−</button>
                          <strong>{counts.volunteer}</strong>
                          <button type="button" onClick={() => setVolunteerOverride(session.key, counts.volunteer + 1)} disabled={!identity}>+</button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  function MobileScheduleView() {
    return (
      <section className="mobile-screen">
        <MobileHeader title="担当表" subtitle="担当なしの先生も状態を表示します" showMonth />
        <div className="mobile-quick-actions">
          <button type="button" className="mobile-primary-action" onClick={openScheduleMailPanel}>担当表送信</button>
          <button type="button" onClick={copyLineText}>LINEコピー</button>
          <button type="button" onClick={exportHtmlTable}>HTML出力</button>
        </div>
        <ScheduleDownloadActions mobile />
        {exportMessage ? <p className="mobile-export-message" role="status">{exportMessage}</p> : null}
        <ScheduleMailPanel />
        <div className="mobile-card-list">
          {schedule.map((session) => (
            <article key={session.key} className={`mobile-schedule-card ${session.closed ? 'is-disabled' : ''}`}>
              <div className="mobile-card-head">
                <div>
                  <strong>{session.label}</strong>
                  <span>{sessionTypeLabel(session)}</span>
                </div>
                {session.unassignedClasses?.length > 0 ? <span className="mobile-status-pill maybe">未担当</span> : <span className="mobile-status-pill yes">OK</span>}
              </div>
              {session.closed ? (
                <p className="mobile-card-note">わをん休み</p>
              ) : (
                <>
                  <div className="mobile-assignment-list">
                    {Object.entries(session.assignments || {}).map(([className, teacherName]) => (
                      <div key={`${session.key}-${className}`}>
                        <span>{className}</span>
                        <strong>{teacherName}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="mobile-teacher-status-table">
                    <h3>出席状態・代替候補</h3>
                    {teachers.map((teacher) => {
                      const classes = assignedClassesFor(session, teacher.name)
                      const status = getStatusInfo(teacher.name, session.key)
                      const tone = statusTone(status.behavior)
                      const canSubstitute = classes.length === 0 && (tone === 'yes' || tone === 'maybe')
                      return (
                        <div key={`${session.key}-${teacher.name}`} className={canSubstitute ? 'is-candidate' : ''}>
                          <strong>{teacher.name}</strong>
                          <span className={`mobile-status-pill ${tone}`}>{status.label}</span>
                          <span>{classes.length > 0 ? classes.join(' / ') : '担当なし'}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    )
  }

  function MobileAdminView() {
    const adminPanels = [
      { id: 'sessions', title: '各回設定', desc: '休み・例会・開講クラス・手動担当' },
      { id: 'settings', title: '先生・クラス設定', desc: '担当可能クラスと既定出欠' },
      { id: 'statuses', title: '状態マスタ', desc: '○ △ △・会議○ × 例会のみ' },
      { id: 'archive', title: 'アーカイブ', desc: '確定済み担当表' },
      { id: 'backup', title: 'バックアップ', desc: '共有データの保存と復元' },
    ]
    return (
      <section className="mobile-screen">
        <MobileHeader title="管理" subtitle="各回設定と先生設定の入口" showMonth />
        <MobileMoreBack />
        <div className="mobile-admin-grid">
          {adminPanels.map((panel) => (
            <button key={panel.id} type="button" className={mobileAdminPanel === panel.id ? 'active' : ''} onClick={() => setMobileAdminPanel(panel.id)}>
              <strong>{panel.title}</strong>
              <span>{panel.desc}</span>
            </button>
          ))}
        </div>
        {mobileAdminPanel === 'sessions' ? (
          <section className="mobile-card-list">
            <h2>各回設定</h2>
            {sessions.map((session) => {
              const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'
              const classes = getSessionClasses(session)
              return (
                <article key={session.key} className="mobile-admin-card">
                  <div className="mobile-card-head">
                    <div><strong>{session.label}</strong><span>{sessionTypeLabel(session)}</span></div>
                    <select value={type} onChange={(e) => setSessionType(session.key, e.target.value)} disabled={!canEditAdmin}>
                      {sessionTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  {!session.closed ? (
                    <>
                      <input value={session.specialNote || ''} placeholder="特別連絡" onChange={(e) => setSessionSpecialNote(session.key, e.target.value)} disabled={!canEditAdmin} />
                      <div className="mobile-class-chip-wrap">
                        {allClasses.map((cls) => (
                          <ClassChip key={cls} label={cls} checked={classes.includes(cls)} onChange={(e) => toggleSessionClass(session, cls, e.target.checked)} disabled={!canEditAdmin} />
                        ))}
                      </div>
                    </>
                  ) : null}
                </article>
              )
            })}
          </section>
        ) : null}
        {mobileAdminPanel === 'settings' ? (
          <section className="mobile-card-list">
            <h2>先生・クラス設定</h2>
            {teachers.map((teacher, idx) => (
              <article key={`${teacher.name}-mobile`} className="mobile-admin-card">
                <input value={teacher.name} onChange={(e) => updateTeacher(idx, 'name', e.target.value)} disabled={!canEditAdmin} />
                <select value={teacher.defaultStatus ?? 'no'} onChange={(e) => updateTeacher(idx, 'defaultStatus', e.target.value)} disabled={!canEditAdmin}>
                  {statusOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <label className="mobile-field-label">
                  <span>月上限</span>
                  <input
                    type="number"
                    min="0"
                    max="31"
                    inputMode="numeric"
                    placeholder="なし"
                    value={teacher.maxMonthlyAssignments ?? ''}
                    onChange={(e) => setTeacherMonthlyLimit(teacher.name, e.target.value)}
                    disabled={!canEditAdmin}
                  />
                </label>
                <div className="mobile-class-chip-wrap">
                  {allClasses.map((cls) => (
                    <ClassChip key={cls} label={cls} checked={teacher.classes.includes(cls)} onChange={(e) => toggleTeacherClass(idx, cls, e.target.checked)} disabled={!canEditAdmin} />
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : null}
        {mobileAdminPanel === 'statuses' ? (
          <section className="mobile-card-list">
            <h2>状態マスタ</h2>
            {statusOptions.map((option, idx) => {
              const isBuiltIn = ['yes', 'maybe', 'no', 'meeting_only'].includes(option.id)
              return (
                <article key={option.id} className="mobile-admin-card">
                  {isBuiltIn ? <strong>{option.label}</strong> : <input value={option.label} onChange={(e) => updateStatusOption(idx, 'label', e.target.value)} disabled={!canEditAdmin} />}
                  <select value={option.behavior} onChange={(e) => updateStatusOption(idx, 'behavior', e.target.value)} disabled={!canEditAdmin || isBuiltIn}>
                    {BEHAVIORS.map((behavior) => <option key={behavior.value} value={behavior.value}>{behavior.label}</option>)}
                  </select>
                </article>
              )
            })}
          </section>
        ) : null}
        {mobileAdminPanel === 'archive' ? (
          <section className="mobile-card-list">
            <h2>アーカイブ</h2>
            <div className="mobile-quick-actions">
              <button type="button" onClick={finalizeMonth}>今月を確定</button>
              <button type="button" onClick={exportMonthTable}>月表を保存</button>
              <button type="button" onClick={exportHtmlTable}>HTML出力</button>
            </div>
            {archiveEntries.length === 0 ? <p className="mobile-empty">まだ確定済みの月はありません。</p> : archiveEntries.map(([key, arc]) => (
              <article key={key} className="mobile-bulletin-card">
                <div className="mobile-card-head"><div><strong>{arc.label}</strong><span>{new Date(arc.savedAt).toLocaleDateString('ja-JP')}</span></div></div>
                <div className="mobile-quick-actions">
                  <button type="button" onClick={() => downloadArchive(key, arc)}>保存</button>
                  <button type="button" onClick={() => deleteArchive(key)}>削除</button>
                </div>
              </article>
            ))}
          </section>
        ) : null}
        {mobileAdminPanel === 'backup' ? <DataSafetyPanel mobile /> : null}
        <section className="mobile-card-list">
          <h2>担当可能クラス</h2>
          <div className="mobile-capability-preview">
            {teachers.slice(0, 6).map((teacher) => (
              <div key={teacher.name}>
                <strong>{teacher.name}</strong>
                <span>{allClasses.map((cls) => `${teacher.classes.includes(cls) ? '○' : '-'} ${cls}`).join('  ')}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    )
  }

  function MobileMemoView() {
    return (
      <section className="mobile-screen">
        <MobileHeader title="メモ・連絡板" subtitle="連絡、個人メモ、例会メモ" showMonth />
        <MobileMoreBack />
        <section className="mobile-card-list">
          <div className="mobile-section-title">
            <h2>連絡板</h2>
            <button type="button" onClick={() => setShowNewBulletin(true)}>追加</button>
          </div>
          {showNewBulletin ? (
            <article className="mobile-memo-compose">
              <textarea value={newBulletinText} onChange={(e) => setNewBulletinText(e.target.value)} placeholder="連絡事項を書く..." rows={4} />
              <div>
                <button type="button" onClick={() => { setShowNewBulletin(false); setNewBulletinText('') }}>キャンセル</button>
                <button type="button" onClick={createBulletin} disabled={!newBulletinText.trim()}>投稿</button>
              </div>
            </article>
          ) : null}
          {sortedBulletin.length === 0 ? <p className="mobile-empty">まだ連絡はありません。</p> : sortedBulletin.map((post) => (
            <article key={post.id} className="mobile-bulletin-card">
              <div className="mobile-card-head">
                <div><strong>{post.author}</strong><span>{new Date(post.updatedAt).toLocaleDateString('ja-JP')}</span></div>
                <span className={`mobile-status-pill ${post.important ? 'maybe' : 'yes'}`}>{post.important ? '重要' : '通常'}</span>
              </div>
              <p>{post.message}</p>
              <button type="button" className="mobile-confirm-btn" onClick={() => toggleConfirmBulletin(post.id)}>
                確認 {Array.isArray(post.confirmedBy) ? post.confirmedBy.length : 0}
              </button>
            </article>
          ))}
        </section>
        <section className="mobile-card-list">
          <h2>自分メモ</h2>
          {isMonthLocked ? <p className="mobile-help-text">確定済みの月でもメモは編集できます。</p> : null}
          <AutoTextarea className="mobile-textarea" value={myMemo} onChange={(e) => setMyMemo(e.target.value)} placeholder="自分だけのメモ..." rows={5} />
        </section>
        {schedule.filter((session) => session.meeting && !session.closed).length > 0 ? (
          <section className="mobile-card-list">
            <h2>例会記録</h2>
            {schedule.filter((session) => session.meeting && !session.closed).map((session) => (
              <article key={`meeting-${session.key}`} className="mobile-memo-session-card">
                <div className="mobile-card-head">
                  <div><strong>{session.label}</strong><span>例会</span></div>
                </div>
                <AutoTextarea className="mobile-textarea" value={meetingNotes[session.key] ?? ''} onChange={(e) => setMeetingNote(session.key, e.target.value)} placeholder="議事録・決定事項・次回への連絡..." rows={5} />
              </article>
            ))}
          </section>
        ) : null}
        <section className="mobile-card-list">
          <h2>各回メモ</h2>
          {schedule.map((session) => (
            <article key={`memo-${session.key}`} className={`mobile-memo-session-card ${session.closed ? 'is-disabled' : ''}`}>
              <div className="mobile-card-head">
                <div><strong>{session.label}</strong><span>{sessionTypeLabel(session)}</span></div>
                {session.unassignedClasses?.length > 0 ? <span className="mobile-status-pill maybe">未担当</span> : null}
              </div>
              {!session.closed ? (
                <div className="mobile-memo-facts">
                  <span>来る人: {session.selectedTeachers.join('、') || 'なし'}</span>
                  <span>例会のみ: {session.meetingOnlyTeachers.join('、') || 'なし'}</span>
                  {session.selectedMaybeTeachers.length > 0 ? <span>△から追加: {session.selectedMaybeTeachers.join('、')}</span> : null}
                </div>
              ) : <p className="mobile-card-note">わをん休み</p>}
              <AutoTextarea className="mobile-textarea" value={memos[session.key] ?? ''} onChange={(e) => setMemo(session.key, e.target.value)} placeholder="この回の連絡・記録を書く..." rows={4} />
            </article>
          ))}
        </section>
      </section>
    )
  }

  function MobileMoreView() {
    const items = [
      { id: 'attendanceStats', title: '出席統計', desc: '学習者・ボランティア人数を確認' },
      { id: 'collab', title: '伝言板・メモ', desc: '全員連絡、個人メモ、例会記録' },
      ...(isAdmin ? [{ id: 'settings', title: '管理設定', desc: '各回、先生、クラス、バックアップ' }] : []),
    ]
    return (
      <section className="mobile-screen">
        <MobileHeader title="その他" subtitle="統計、連絡、設定" />
        <nav className="mobile-more-list" aria-label="その他の機能">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => setActiveView(item.id)}>
              <span><strong>{item.title}</strong><small>{item.desc}</small></span>
              <b aria-hidden="true">›</b>
            </button>
          ))}
        </nav>
        <section className="mobile-display-settings">
          <div className="mobile-section-title"><h2>表示設定</h2></div>
          <div className="sidebar-theme">
            {[
              { id: 'clay', label: '明るい' },
              { id: 'night', label: '夜' },
              { id: 'sakura', label: 'さくら' },
            ].map((item) => (
              <button key={item.id} type="button" className={`theme-pill${theme === item.id ? ' theme-pill-active' : ''}`} onClick={() => setTheme(item.id)}>{item.label}</button>
            ))}
          </div>
          <UiModeSwitch compact />
          <BrandIconPicker value={activeBrandIconId} onChange={setBrandIcon} compact />
          <button type="button" className="mobile-switch-user" onClick={switchIdentity}>利用者を選び直す</button>
        </section>
      </section>
    )
  }

  function MobileLessonReportsView() {
    return (
      <section className="mobile-screen">
        <MobileHeader title="授業記録" subtitle="授業後の報告書" />
        {LessonReportTimelineControls({ compact: true })}
        <section className="mobile-card-list">
          <div className="mobile-section-title">
            <h2>記録を選ぶ</h2>
          </div>
          <select aria-label="授業日を選ぶ" value={selectedLessonGroup?.sessionKey ?? ''} onChange={(e) => {
            const group = lessonReportGroups.find((item) => item.sessionKey === e.target.value)
            setActiveLessonReportId(group?.items[0]?.id ?? '')
          }}>
            {lessonReportGroups.map((group) => <option key={group.sessionKey} value={group.sessionKey}>{group.label}</option>)}
          </select>
          <div className="mobile-lesson-sublist">
            {(selectedLessonGroup?.items ?? []).map((option) => (
              <button key={option.id} type="button" className={option.id === selectedLessonReportId ? 'active' : ''} onClick={() => setActiveLessonReportId(option.id)}>
                <span>{option.className}</span>
                <strong>{option.status}</strong>
              </button>
            ))}
          </div>
          {selectedLessonReport ? <span className={`mobile-status-pill ${selectedLessonReport.updatedAt ? 'yes' : 'maybe'}`}>{selectedLessonReport.updatedAt ? '保存済み' : '未入力'}</span> : null}
        </section>
        <details className="mobile-lesson-reference">
          <summary>前回の同じクラスを参照</summary>
          {LessonReportReference({ compact: true })}
        </details>
        {LessonReportFields({ report: selectedLessonReport, compact: true })}
        <section className="mobile-card-list">
          <h2>Wordプレビュー</h2>
          {LessonReportPreview({ report: selectedLessonReport })}
        </section>
        <div className="mobile-lesson-actions">
          <button type="button" className="mobile-primary-action" onClick={openLessonReportMail} disabled={!selectedLessonReport}>メール送信</button>
          <details className="mobile-lesson-output-menu">
            <summary>ファイル出力</summary>
            <div>
              <button type="button" onClick={() => exportLessonReportDocx(selectedLessonReport)} disabled={!selectedLessonReport}>DOCX</button>
              <button type="button" onClick={() => exportLessonReportPdf(selectedLessonReport)} disabled={!selectedLessonReport}>PDF</button>
            </div>
          </details>
        </div>
        {LessonReportMailDialog({ report: selectedLessonReport })}
      </section>
    )
  }

  const views = {
    home: HomeView(),
    attendance: AttendanceView(),
    attendanceStats: AttendanceStatsView(),
    schedule: ScheduleView(),
    sessions: SessionsView(),
    settings: SettingsView(),
    lessonReports: LessonReportsView(),
    collab: CollabView(),
  }
  const mobileViews = {
    home: MobileHomeView(),
    attendance: MobileAttendanceView(),
    attendanceStats: MobileAttendanceStatsView(),
    schedule: MobileScheduleView(),
    settings: MobileAdminView(),
    collab: MobileMemoView(),
    lessonReports: MobileLessonReportsView(),
    mobileMore: MobileMoreView(),
  }

  return (
    <div className={`page ui-${effectiveUiMode}`} style={{ '--font-scale': textScale / 100 }}>
      <aside className="app-sidebar desktop-only" aria-label="メインナビゲーション">
        <div className="sidebar-brand">
          <BrandMark iconId={activeBrandIconId} />
          <div>
            <strong>Wawon</strong>
            <span>Rotation</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navSections.filter((s) => !s.hidden && (!s.adminOnly || isAdmin)).map((section, index) => (
            <button
              key={section.id}
              type="button"
              className={`sidebar-link ${currentDesktopMainView === section.id ? 'sidebar-link-active' : ''}`}
              onClick={() => setActiveView(section.id)}
            >
              <span className="sidebar-index">{String(index + 1).padStart(2, '0')}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-theme">
          {[
            { id: 'clay', label: '☀️' },
            { id: 'night', label: '🌙' },
            { id: 'sakura', label: '🌸' },
          ].map((t) => (
            <button key={t.id} type="button" className={`theme-pill${theme === t.id ? ' theme-pill-active' : ''}`} onClick={() => setTheme(t.id)}>{t.label}</button>
          ))}
        </div>
        <UiModeSwitch />
        <BrandIconPicker value={activeBrandIconId} onChange={setBrandIcon} compact />
        <div className="sidebar-footer">
          <span>{year}年 {MONTH_JP[month - 1]}</span>
          <strong>{identity}</strong>
        </div>
      </aside>

      <main className="app-main desktop-only">
        {isMonthLocked && (
          <section className="panel lock-banner">
            <div className="lock-banner-inner">
              <p>{year}年{MONTH_JP[month - 1]}の担当表は確定済みです。編集するには管理者がロックを解除してください。</p>
            </div>
            {isAdmin ? <button type="button" className="ghost-btn" onClick={unlockMonth}>ロック解除</button> : null}
          </section>
        )}
        {views[currentDesktopView]}
      </main>

      <main className="mobile-app-shell">
        {isMonthLocked && (
          <section className="mobile-lock-banner">
            <span>確定済み</span>
            {isAdmin ? <button type="button" onClick={unlockMonth}>解除</button> : null}
          </section>
        )}
        {mobileViews[currentMobileView]}
        <nav className="mobile-bottom-nav" aria-label="モバイルナビゲーション">
          {mobileNavSections.filter((s) => !s.hidden && (!s.adminOnly || isAdmin)).map((section) => (
            <button
              key={section.id}
              type="button"
              className={currentMobileMainView === section.id ? 'active' : ''}
              onClick={() => setActiveView(section.id)}
            >
              <span>{section.shortLabel}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  )
}
