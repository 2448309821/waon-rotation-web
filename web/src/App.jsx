import React, { useEffect, useRef, useState } from 'react'
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
const SEEDED_MONTH_KEY = '2026-5'
const SEEDED_SESSION_TYPES = {
  [SEEDED_MONTH_KEY]: {
    '5/2': 'holiday',
    '5/9': 'meeting',
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
    specialRules: { wangSplit: true, randomSeed: Math.random().toString(36).slice(2) },
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
    bulletinBoard: [],
  }
}

function mergeState(saved) {
  const fallback = buildFallbackState()
  if (!saved) return fallback
  const builtInStatusOptions = Object.fromEntries(DEFAULT_STATUS_OPTIONS.map((opt) => [opt.id, opt]))
  const mergedStatusOptions = (saved.statusOptions ?? DEFAULT_STATUS_OPTIONS).map((opt) => (
    builtInStatusOptions[opt.id] ? { ...opt, ...builtInStatusOptions[opt.id] } : opt
  ))
  return {
    year: saved.year ?? fallback.year,
    month: saved.month ?? fallback.month,
    allClasses: saved.allClasses ?? ALL_CLASSES,
    defaultClasses: saved.defaultClasses ?? DEFAULT_CLASSES,
    statusOptions: mergedStatusOptions,
    specialRules: saved.specialRules ?? { wangSplit: true, randomSeed: Math.random().toString(36).slice(2) },
    teachers: saved.teachers ?? DEFAULT_TEACHERS,
    currentTeacher: saved.currentTeacher ?? fallback.currentTeacher,
    sessionTypesByMonth: { ...SEEDED_SESSION_TYPES, ...(saved.sessionTypesByMonth ?? {}) },
    sessionClassesByMonth: saved.sessionClassesByMonth ?? {},
    sessionManualByMonth: saved.sessionManualByMonth ?? {},
    sessionSpecialNotesByMonth: saved.sessionSpecialNotesByMonth ?? {},
    attendanceByMonth: { ...SEEDED_ATTENDANCE, ...(saved.attendanceByMonth ?? {}) },
    memosByMonth: { ...SEEDED_MEMOS, ...(saved.memosByMonth ?? {}) },
    lockedMonths: saved.lockedMonths ?? {},
    archivedSchedules: saved.archivedSchedules ?? {},
    meetingNotesByMonth: saved.meetingNotesByMonth ?? {},
    myMemosByTeacher: saved.myMemosByTeacher ?? {},
    bulletinBoard: Array.isArray(saved.bulletinBoard) ? saved.bulletinBoard : [],
  }
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

function buildHtmlExport(year, month, teachers, sessions, schedule) {
  const rows = []
  rows.push('<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-size:14px}td,th{border:1px solid #000;padding:6px 10px;text-align:center}th{background:#f3f4f6}</style></head><body>')
  rows.push(`<h1>${year}年${month}月 担当表</h1>`)
  rows.push('<p>☆　当番は当てませんので、当日の担当者が協力して教室の準備をお願いします。</p>')
  rows.push('<table>')
  rows.push('<tr><th></th>' + sessions.map((s) => `<th>${s.label}</th>`).join('') + '</tr>')
  rows.push('<tr><td>区分</td>' + schedule.map((s) => `<td>${s.closed ? '休み' : s.meeting ? '例会' : '通常'}</td>`).join('') + '</tr>')
  rows.push('<tr><td>特別連絡</td>' + schedule.map((s) => `<td>${s.special || ''}</td>`).join('') + '</tr>')
  for (const teacher of teachers) {
    const row = schedule.map((s) => {
      const classes = Object.entries(s.assignments || {}).filter(([, t]) => t === teacher.name).map(([cls]) => cls).join('<br>')
      return `<td>${classes}</td>`
    })
    rows.push(`<tr><td><b>${teacher.name}</b></td>${row.join('')}</tr>`)
  }
rows.push('</table>')
  rows.push('<p>＊事務業務はその日の担当者が助け合って行い、最後に全員で確認してください。</p>')
  rows.push('</body></html>')
  return rows.join('\n')
}

function buildMarkdownExport(year, month, teachers, sessions, schedule, memos) {
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
    const row = schedule.map((s) => Object.entries(s.assignments).filter(([, t]) => t === teacher.name).map(([cls]) => cls).join(' / '))
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
        { id: 'desktop', label: '桌面' },
        { id: 'mobile', label: '手机' },
      ].map((mode) => (
        <button key={mode.id} type="button" className={uiMode === mode.id ? 'active' : ''} onClick={() => onChange(mode.id)}>
          {mode.label}
        </button>
      ))}
    </div>
  )
}

function IdentityGate({ teachers, onSelect, uiMode = 'auto', onUiModeChange = () => {} }) {
  const previewSections = ['ホーム', '出席入力', '担当表', '伝言板・メモ']
  return (
    <div className="page">
      <aside className="app-sidebar" aria-label="メインナビゲーション">
        <div className="sidebar-brand">
          <span className="brand-mark">W</span>
          <div>
            <strong>Waon</strong>
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
        <ModeSwitch uiMode={uiMode} onChange={onUiModeChange} />
      </aside>

      <main className="app-main">
      <section className="hero identity-hero">
        <div>
          <p className="eyebrow">Waon Rotation</p>
          <h1>新しい担当表ワークスペースへ</h1>
          <p className="lead">左の目次で6つの画面に分け、出席、担当表、各回設定、先生ごとの担当可能クラスを見やすく整理します。</p>
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
  const [cloudMessage, setCloudMessage] = useState('Connecting to Supabase...')
  const [exportMessage, setExportMessage] = useState('')
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
  const urlTeacherRef = useRef(null)
  const bulletinDragRef = useRef(null)
  const teacherDragRef = useRef(null)

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
    bulletinBoard,
  } = state

  const monthKey = `${year}-${month}`
  const sessions = generateSessions(year, month, sessionTypesByMonth, sessionClassesByMonth, sessionManualByMonth, sessionSpecialNotesByMonth, defaultClasses, allClasses, specialRules)
  const attendance = attendanceByMonth[monthKey] ?? {}
  const memos = memosByMonth[monthKey] ?? {}
  const meetingNotes = meetingNotesByMonth[monthKey] ?? {}
  const myMemo = identity ? (myMemosByTeacher[identity]?.[monthKey] ?? '') : ''
  const isAdmin = identity === ADMIN_NAME
  const effectiveTeacher = isAdmin ? currentTeacher : identity
  const isMonthLocked = !!(lockedMonths?.[monthKey])
  const canEditAdmin = isAdmin && !isMonthLocked

  let schedule = []
  try {
    schedule = buildSchedule(attendance, sessions, teachers, statusOptions, specialRules)
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
      setCloudMessage('Loading shared data from Supabase...')

      const { data, error } = await supabase
        .from('rotation_states')
        .select('state, updated_at')
        .eq('id', ROTATION_STATE_ID)
        .maybeSingle()

      if (!alive) return

      if (error) {
        console.error(error)
        setCloudStatus('error')
        setCloudMessage('Supabase load failed. Check README and schema setup.')
        return
      }

      if (data?.state) {
        const merged = mergeState(data.state)
        const snapshot = JSON.stringify(merged)
        lastSyncedStateRef.current = snapshot
        setState(merged)
        setCloudStatus('ready')
        setCloudMessage('Shared data loaded. Other devices will see the same data.')
      } else {
        setCloudStatus('ready')
        setCloudMessage('Shared storage is empty. Your next change will create it.')
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
        const merged = mergeState(remoteState)
        const snapshot = JSON.stringify(merged)
        if (snapshot === lastSyncedStateRef.current) return
        lastSyncedStateRef.current = snapshot
        setState(merged)
        setCloudStatus('ready')
        setCloudMessage('Received latest shared data from Supabase.')
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
    setCloudMessage('Saving to Supabase...')

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const payload = { id: ROTATION_STATE_ID, state, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('rotation_states').upsert(payload)

      if (error) {
        console.error(error)
        setCloudStatus('error')
        setCloudMessage('Supabase save failed.')
        return
      }

      lastSyncedStateRef.current = snapshot
      setCloudStatus('ready')
      setCloudMessage('Saved to Supabase. Other devices are synced.')
    }, 700)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [state])

  // ── Identity ─────────────────────────────────────────────────────────────────
  function selectIdentity(name) {
    setIdentity(name)
    if (name !== ADMIN_NAME) setState((s) => ({ ...s, currentTeacher: name }))
  }

  function switchIdentity() {
    setIdentity('')
    setExportMessage('')
  }

  // ── Month ────────────────────────────────────────────────────────────────────
  function setYear(y) { setState((s) => ({ ...s, year: y })) }
  function setMonth(m) { setState((s) => ({ ...s, month: m })) }

  // ── Lock / Finalize ───────────────────────────────────────────────────────────
  function finalizeMonth() {
    if (!isAdmin) return
    const markdown = buildMarkdownExport(year, month, teachers, sessions, schedule, memos)
    setState((s) => ({
      ...s,
      lockedMonths: { ...(s.lockedMonths ?? {}), [monthKey]: true },
      archivedSchedules: {
        ...(s.archivedSchedules ?? {}),
        [monthKey]: {
          savedAt: new Date().toISOString(),
          markdown,
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
    const markdown = buildMarkdownExport(year, month, teachers, sessions, schedule, memos)
    const fileName = `${year}-${String(month).padStart(2, '0')}-rotation.md`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown)
        setExportMessage('Markdown copied to clipboard.')
      } else {
        setExportMessage('Clipboard unavailable. Download started instead.')
      }
    } catch {
      setExportMessage('Clipboard unavailable. Download started instead.')
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
    const html = buildHtmlExport(year, month, teachers, sessions, schedule)
    const fileName = `${year}-${String(month).padStart(2, '0')}-rotation.html`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
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
      const byMonth = { ...(s.sessionClassesByMonth[monthKey] ?? {}) }
      delete byMonth[sessionKey]
      return { ...s, sessionClassesByMonth: { ...s.sessionClassesByMonth, [monthKey]: byMonth } }
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

  function setSpecialRule(key, value) {
    if (!canEditAdmin) return
    setState((s) => ({ ...s, specialRules: { ...s.specialRules, [key]: value } }))
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
    // Non-admin cannot edit when month is locked
    if (!isAdmin && isMonthLocked) return
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
    setState((s) => ({ ...s, teachers: [...s.teachers, { name: '新しい先生', remote: false, skipMeeting: false, defaultStatus: 'no', classes: [] }] }))
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
    { id: 'attendance', label: '出席入力', adminOnly: false },
    { id: 'schedule', label: '担当表', adminOnly: false },
    { id: 'sessions', label: '各回設定', adminOnly: true },
    { id: 'settings', label: '先生・クラス設定', adminOnly: true },
    { id: 'collab', label: '伝言板・メモ', adminOnly: false },
  ]
  const mobileNavSections = [
    { id: 'home', label: 'ホーム', shortLabel: 'ホーム', adminOnly: false },
    { id: 'attendance', label: '出席', shortLabel: '出席', adminOnly: false },
    { id: 'schedule', label: '担当表', shortLabel: '担当', adminOnly: false },
    { id: 'mobileAdmin', label: '管理', shortLabel: '管理', adminOnly: true },
    { id: 'mobileMemo', label: 'メモ・連絡板', shortLabel: 'メモ', adminOnly: false },
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
    return <IdentityGate teachers={teachers} onSelect={selectIdentity} uiMode={uiMode} onUiModeChange={setUiMode} />
  }

  const archiveEntries = Object.entries(archivedSchedules ?? {}).sort(([a], [b]) => b.localeCompare(a))
  const sortedBulletin = [...bulletinBoard.filter((p) => p.pinned), ...bulletinBoard.filter((p) => !p.pinned)]
  const unassignedCount = schedule.reduce((sum, session) => sum + (session.unassignedClasses?.length ?? 0), 0)
  const editableSessions = sessions.filter((session) => !session.closed)
  const explicitAttendanceCount = teachers.reduce((sum, teacher) => (
    sum + editableSessions.filter((session) => attendance[teacher.name]?.[session.key] !== undefined).length
  ), 0)
  const totalAttendanceSlots = teachers.length * editableSessions.length
  const meetingCount = sessions.filter((session) => session.meeting && !session.closed).length
  const effectiveUiMode = uiMode === 'auto' ? (isMobileViewport ? 'mobile' : 'desktop') : uiMode
  const canUseView = (sections, id) => sections.some((item) => item.id === id && (!item.adminOnly || isAdmin))
  const currentDesktopView = canUseView(navSections, activeView) ? activeView : 'home'
  const currentMobileView = canUseView(mobileNavSections, activeView) ? activeView : 'home'

  function UiModeSwitch({ compact = false }) {
    return <ModeSwitch uiMode={uiMode} onChange={setUiMode} compact={compact} />
  }

  function AppHeader({ title, subtitle, actions }) {
    return (
      <header className="screen-header">
        <div>
          <p className="eyebrow">Waon Rotation</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="screen-header-side">
          <div className={`identity-badge ${isAdmin ? 'identity-badge-admin' : ''}`}>
            <strong>{identity}</strong>
            <span>{isAdmin ? '管理者' : '本人入力'}</span>
          </div>
          <div className={`cloud-status cloud-status-${cloudStatus}`}>
            <strong>Cloud Sync</strong>
            <span>{cloudMessage}</span>
          </div>
          {actions}
        </div>
      </header>
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
    if (!isAdmin) return null
    return (
      <div className="action-row">
        <button type="button" className="ghost-btn" onClick={copyLineText}>LINE用テキスト</button>
        <button type="button" className="ghost-btn" onClick={exportMonthTable}>月表を保存</button>
        <button type="button" className="ghost-btn" onClick={exportHtmlTable}>HTML表</button>
        <button type="button" className={isMonthLocked ? 'success-btn' : 'primary-btn'} onClick={isMonthLocked ? unlockMonth : finalizeMonth}>
          {isMonthLocked ? '確定済み' : '今月を確定'}
        </button>
        {exportMessage ? <span className="inline-message">{exportMessage}</span> : null}
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
                <h2>管理者アクション</h2>
                <p>共有、保存、確定をここから行います。</p>
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

  function ScheduleView() {
    return (
      <section id="schedule" className="screen-view">
        <AppHeader
          title={`${year}年${MONTH_JP[month - 1]} 担当表`}
          subtitle="出席と担当可能クラスから自動で決まった結果です。"
          actions={<ExportActions />}
        />
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
                  {sessions.map((session) => <th key={session.key}>{session.label}{session.meeting ? ' 例会' : ''}</th>)}
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
    return (
      <section id="sessions" className="screen-view">
        <AppHeader title="各回設定" subtitle="開催日ごとに種類、開講クラス、手動担当、特別連絡を設定します。" />
        <div className="dashboard-grid">
          <section className="panel span-2">
            <MonthControls />
            <div className="session-list expanded">
              {sessions.map((session, i) => {
                const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'
                const classes = getSessionClasses(session)
                const isOverridden = !!sessionClassesByMonth[monthKey]?.[session.key]
                const isWangWeek = session.weekIndex % 2 === 1
                return (
                  <article key={session.key} className={`session-row session-row-${type}`}>
                    <div className="session-row-top">
                      <div className="session-date-info">
                        <strong className="session-date">{session.label}</strong>
                        <span className="session-week">{session.closed ? 'やすみ' : `${i + 1}週目${isWangWeek ? '（王週）' : ''}`}</span>
                      </div>
                      <select className="session-type-select" value={type} onChange={(e) => setSessionType(session.key, e.target.value)} disabled={!canEditAdmin}>
                        {sessionTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
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
                <label className="toggle-label"><input type="checkbox" checked={specialRules.random === true} onChange={(e) => setSpecialRule('random', e.target.checked)} disabled={!canEditAdmin} /><span className="toggle-track"><span className="toggle-thumb" /></span></label>
              </div>
            </div>
          </aside>
        </div>
      </section>
    )
  }

  function SettingsView() {
    return (
      <section id="settings" className="screen-view">
        <AppHeader title="先生・クラス設定" subtitle="排班ルールの中心。先生ごとの担当可能クラスとデフォルト出欠を管理します。" actions={isAdmin ? <button type="button" className="primary-btn" onClick={addTeacher}>先生を追加</button> : null} />
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
            <h2>出欠ステータス</h2>
            <p className="panel-desc">表示名と計算上の動作を管理します。</p>
            <div className="status-edit-list">
              {statusOptions.map((option, idx) => {
                const isBuiltIn = ['yes', 'maybe', 'no', 'meeting_only'].includes(option.id)
                return (
                  <div key={option.id} className="status-edit-row">
                    {isBuiltIn ? <span className="status-label-fixed">{option.label}</span> : <input value={option.label} ref={idx === statusOptions.length - 1 ? newStatusRef : null} onChange={(e) => updateStatusOption(idx, 'label', e.target.value)} disabled={!canEditAdmin} />}
                    <select value={option.behavior} onChange={(e) => updateStatusOption(idx, 'behavior', e.target.value)} disabled={!canEditAdmin || isBuiltIn}>
                      {BEHAVIORS.map((behavior) => <option key={behavior.value} value={behavior.value}>{behavior.label}</option>)}
                    </select>
                    {!isBuiltIn ? <button type="button" className="icon-btn danger" onClick={() => deleteStatusOption(idx)} disabled={!canEditAdmin}>×</button> : null}
                  </div>
                )
              })}
            </div>
            <button type="button" className="primary-btn" onClick={addStatusOption} disabled={!canEditAdmin}>ステータスを追加</button>
          </section>
        </div>
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
            <div className="my-memo-card">
              <div className="my-memo-header"><div><h3>My Memo</h3><p>{identity} さん用の個人メモです。</p></div></div>
              <textarea value={myMemo} onChange={(e) => setMyMemo(e.target.value)} placeholder="自分だけのメモを書けます..." rows={5} />
            </div>
            {schedule.filter((s) => s.meeting && !s.closed).map((session) => (
              <div key={session.key} className="meeting-note-card">
                <strong>{session.label} 会議記録</strong>
                <textarea value={meetingNotes[session.key] ?? ''} onChange={(e) => setMeetingNote(session.key, e.target.value)} placeholder="議事録・決定事項・次回への伝達事項" rows={5} />
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
                  <textarea value={memos[session.key] ?? ''} onChange={(e) => setMemo(session.key, e.target.value)} placeholder="自由に書き込めます..." rows={3} />
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

  function getStatusInfo(teacherName, sessionKey) {
    const statusId = getEffectiveStatus(teacherName, sessionKey)
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

  function MobileHeader({ title, subtitle }) {
    return (
      <header className="mobile-header">
        <div>
          <p className="mobile-kicker">Waon Rotation</p>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button type="button" className="mobile-user-chip" onClick={switchIdentity}>
          <strong>{identity}</strong>
          <span>{isAdmin ? '管理者' : '本人'}</span>
        </button>
        <UiModeSwitch compact />
      </header>
    )
  }

  function MobileHomeView() {
    const nextSession = schedule.find((session) => !session.closed) ?? schedule[0]
    const substituteCount = nextSession
      ? teachers.filter((teacher) => {
          const assigned = assignedClassesFor(nextSession, teacher.name).length > 0
          const tone = statusTone(getStatusInfo(teacher.name, nextSession.key).behavior)
          return !assigned && (tone === 'yes' || tone === 'maybe')
        }).length
      : 0
    return (
      <section className="mobile-screen">
        <MobileHeader title={`${year}年${MONTH_JP[month - 1]}`} subtitle="担当表と出席の確認" />
        <div className="mobile-metrics">
          <div><span>次回</span><strong>{nextSession ? `${nextSession.label} ${sessionTypeLabel(nextSession)}` : 'なし'}</strong></div>
          <div><span>出席入力</span><strong>{explicitAttendanceCount}/{totalAttendanceSlots}</strong></div>
          <div className={unassignedCount > 0 ? 'is-warn' : 'is-ok'}><span>未分配</span><strong>{unassignedCount}</strong></div>
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
        <MobileHeader title="出席入力" subtitle={isAdmin ? '先生を切り替えて入力できます' : '自分の出席だけ入力できます'} />
        {isAdmin ? (
          <div className="mobile-chip-scroll">
            {teachers.map((teacher) => (
              <button key={teacher.name} type="button" className={teacher.name === effectiveTeacher ? 'active' : ''} onClick={() => handleSelectTeacher(teacher.name)}>
                {teacher.name}
              </button>
            ))}
          </div>
        ) : null}
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

  function MobileScheduleView() {
    return (
      <section className="mobile-screen">
        <MobileHeader title="担当表" subtitle="担当なしの先生も状態を表示します" />
        <div className="mobile-quick-actions">
          <button type="button" onClick={copyLineText}>LINEコピー</button>
          <button type="button" onClick={exportHtmlTable}>HTML出力</button>
        </div>
        <div className="mobile-card-list">
          {schedule.map((session) => (
            <article key={session.key} className={`mobile-schedule-card ${session.closed ? 'is-disabled' : ''}`}>
              <div className="mobile-card-head">
                <div>
                  <strong>{session.label}</strong>
                  <span>{sessionTypeLabel(session)}</span>
                </div>
                {session.unassignedClasses?.length > 0 ? <span className="mobile-status-pill maybe">未分配</span> : <span className="mobile-status-pill yes">OK</span>}
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
    ]
    return (
      <section className="mobile-screen">
        <MobileHeader title="管理" subtitle="各回設定と先生設定の入口" />
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
              <button type="button" onClick={exportMonthTable}>月表保存</button>
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
        <MobileHeader title="メモ・連絡板" subtitle="連絡、個人メモ、例会メモ" />
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
          <textarea className="mobile-textarea" value={myMemo} onChange={(e) => setMyMemo(e.target.value)} placeholder="自分だけのメモ..." rows={5} />
        </section>
      </section>
    )
  }

  const views = {
    home: <HomeView />,
    attendance: <AttendanceView />,
    schedule: <ScheduleView />,
    sessions: <SessionsView />,
    settings: <SettingsView />,
    collab: <CollabView />,
  }
  const mobileViews = {
    home: <MobileHomeView />,
    attendance: <MobileAttendanceView />,
    schedule: <MobileScheduleView />,
    mobileAdmin: <MobileAdminView />,
    mobileMemo: <MobileMemoView />,
  }

  return (
    <div className={`page ui-${effectiveUiMode}`} style={{ '--font-scale': textScale / 100 }}>
      <aside className="app-sidebar desktop-only" aria-label="メインナビゲーション">
        <div className="sidebar-brand">
          <span className="brand-mark">W</span>
          <div>
            <strong>Waon</strong>
            <span>Rotation</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navSections.filter((s) => !s.adminOnly || isAdmin).map((section, index) => (
            <button
              key={section.id}
              type="button"
              className={`sidebar-link ${currentDesktopView === section.id ? 'sidebar-link-active' : ''}`}
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
          {mobileNavSections.filter((s) => !s.adminOnly || isAdmin).map((section) => (
            <button
              key={section.id}
              type="button"
              className={currentMobileView === section.id ? 'active' : ''}
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
