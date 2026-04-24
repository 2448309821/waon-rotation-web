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
  return {
    year: saved.year ?? fallback.year,
    month: saved.month ?? fallback.month,
    allClasses: saved.allClasses ?? ALL_CLASSES,
    defaultClasses: saved.defaultClasses ?? DEFAULT_CLASSES,
    statusOptions: saved.statusOptions ?? DEFAULT_STATUS_OPTIONS,
    specialRules: saved.specialRules ?? { wangSplit: true, randomSeed: Math.random().toString(36).slice(2) },
    teachers: saved.teachers ?? DEFAULT_TEACHERS,
    currentTeacher: saved.currentTeacher ?? fallback.currentTeacher,
    sessionTypesByMonth: { ...SEEDED_SESSION_TYPES, ...(saved.sessionTypesByMonth ?? {}) },
    sessionClassesByMonth: saved.sessionClassesByMonth ?? {},
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

function ClassChip({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`class-chip ${checked ? 'class-chip-on' : ''} ${disabled ? 'class-chip-disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  )
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

function ScrollNav({ sections, activeSection }) {
  function scrollTo(id) {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <nav className="scroll-nav" aria-label="セクションナビ">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`scroll-nav-item ${activeSection === s.id ? 'scroll-nav-item-active' : ''}`}
          onClick={() => scrollTo(s.id)}
          title={s.label}
        >
          {s.label}
        </button>
      ))}
    </nav>
  )
}

function IdentityGate({ teachers, onSelect }) {
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Waon Rotation</p>
        <h1>まず自分の名前を選んでください</h1>
        <p className="lead">先生本人は自分の出席だけ編集できます。裴さんは管理者として全体を編集できます。</p>
      </section>

      <section className="panel">
        <h2 className="panel-title">あなたは誰ですか？</h2>
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
    </div>
  )
}

export default function App() {
  const [state, setState] = useState(loadLocalState)
  const [identity, setIdentity] = useState(loadIdentity)
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
    attendanceByMonth,
    memosByMonth,
    lockedMonths,
    archivedSchedules,
    meetingNotesByMonth,
    myMemosByTeacher,
    bulletinBoard,
  } = state

  const monthKey = `${year}-${month}`
  const sessions = generateSessions(year, month, sessionTypesByMonth, sessionClassesByMonth, defaultClasses, allClasses, specialRules)
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

  // ── Persist local state ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (identity) localStorage.setItem(IDENTITY_KEY, identity)
    else localStorage.removeItem(IDENTITY_KEY)
  }, [identity])

  useEffect(() => {
    if (!identity || isAdmin) return
    if (currentTeacher !== identity) {
      setState((s) => ({ ...s, currentTeacher: identity }))
    }
  }, [identity, isAdmin, currentTeacher])

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

  // ── Nav sections (computed before gate so hook below can reference it) ────────
  const navSections = isAdmin
    ? [
        { id: 'sec-month',      label: '月' },
        { id: 'sec-sessions',   label: '各回' },
        { id: 'sec-special',    label: '特殊' },
        { id: 'sec-settings',   label: '設定' },
        { id: 'sec-teachers',   label: '先生' },
        { id: 'sec-attendance', label: '出席' },
        { id: 'sec-schedule',   label: '担当' },
        { id: 'sec-memos',      label: 'メモ' },
        { id: 'sec-bulletin',   label: '伝言' },
        { id: 'sec-archive',    label: '保存' },
      ]
    : [
        { id: 'sec-attendance', label: '出席' },
        { id: 'sec-schedule',   label: '担当' },
        { id: 'sec-memos',      label: 'メモ' },
        { id: 'sec-bulletin',   label: '伝言' },
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
    return <IdentityGate teachers={teachers} onSelect={selectIdentity} />
  }

  const archiveEntries = Object.entries(archivedSchedules ?? {}).sort(([a], [b]) => b.localeCompare(a))
  const sortedBulletin = [...bulletinBoard.filter((p) => p.pinned), ...bulletinBoard.filter((p) => !p.pinned)]

  return (
    <div className="page">
      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-topline">
          <div>
            <p className="eyebrow">Waon Rotation</p>
            <h1>出席を入れると自動で担当を決めるサイト</h1>
            <p className="lead">{isAdmin ? '裴さんは全体設定・全員の出席・メモ・導出ができます。' : '先生本人は自分の出席だけ編集できます。全体表は閲覧できます。'}</p>
          </div>
          <div className="identity-badge-wrap">
            <div className={`identity-badge ${isAdmin ? 'identity-badge-admin' : ''}`}>
              <strong>{identity}</strong>
              <span>{isAdmin ? '管理者' : '本人入力'}</span>
            </div>
            <button type="button" className="hero-switch-btn" onClick={switchIdentity}>名前を選び直す</button>
          </div>
        </div>
        <div className={`cloud-status cloud-status-${cloudStatus}`}>
          <strong>Cloud Sync</strong>
          <span>{cloudMessage}</span>
        </div>
      </section>

      {/* ── Lock banner ── */}
      {isMonthLocked && (
        <section className="panel lock-banner">
          <div className="lock-banner-inner">
            <span className="lock-banner-icon">🔒</span>
            <p>{year}年{MONTH_JP[month - 1]}の担当表は確定済みです。編集するには管理者がロックを解除してください。</p>
          </div>
          {isAdmin && (
            <button type="button" className="unlock-btn" onClick={unlockMonth}>ロック解除</button>
          )}
        </section>
      )}

      {/* ── Month picker ── */}
      <section id="sec-month" className="panel">
        <div className="panel-header">
          <div>
            <h2>0. 月を選ぶ</h2>
            <p>表示したい月を切り替えられます。</p>
          </div>
          {isAdmin && (
            <div className="export-actions">
              <button type="button" className="export-btn export-btn-line" onClick={copyLineText}>📋 LINE用テキスト</button>
              <button type="button" className="export-btn" onClick={exportMonthTable}>月表を保存</button>
              <button
                type="button"
                className={`export-btn ${isMonthLocked ? 'export-btn-locked' : 'export-btn-finalize'}`}
                onClick={isMonthLocked ? unlockMonth : finalizeMonth}
              >
                {isMonthLocked ? '🔒 確定済み' : '✅ 今月を確定'}
              </button>
              {exportMessage ? <span className="export-message">{exportMessage}</span> : null}
            </div>
          )}
        </div>
        <div className="month-nav">
          <div className="month-field"><label className="month-field-label">年</label><input type="number" className="year-input" value={year} min={2020} max={2040} onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 2020 && v <= 2040) setYear(v) }} /></div>
          <div className="month-field"><label className="month-field-label">月</label><select className="month-select" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>{MONTH_JP.map((label, i) => <option key={i + 1} value={i + 1}>{label}</option>)}</select></div>
          <span className="month-display-text">{year}年 {MONTH_JP[month - 1]}</span>
        </div>
      </section>

      {isAdmin && <section className="panel admin-note"><p>管理者モードでは、月設定・各回設定・先生設定・メモ編集・エクスポートができます。</p></section>}

      {/* ── Session settings (admin) ── */}
      {isAdmin && <section id="sec-sessions" className="panel"><button type="button" className="collapse-header" onClick={() => setSessionOpen((o) => !o)} aria-expanded={sessionOpen}><span>1. 各回の設定</span><span className="collapse-icon">{sessionOpen ? '▲' : '▼'}</span></button>{!sessionOpen ? <p className="collapse-hint">{sessions.length === 0 ? 'この月に土曜日がありません' : sessions.map((s) => { const type = sessionTypesByMonth[monthKey]?.[s.key] ?? 'normal'; const icon = type === 'holiday' ? 'やすみ' : type === 'meeting' ? '例会' : '通常'; return `${s.label}(${icon})` }).join(' · ')}</p> : sessions.length === 0 ? <p className="empty-msg">この月に土曜日がありません。</p> : <div className="session-list">{sessions.map((session, i) => { const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'; const classes = getSessionClasses(session); const isOverridden = !!sessionClassesByMonth[monthKey]?.[session.key]; const isWangWeek = session.weekIndex % 2 === 1; return <div key={session.key} className={`session-row session-row-${type}`}><div className="session-row-top"><div className="session-date-info"><strong className="session-date">{session.label}</strong><span className="session-week">{session.closed ? 'やすみ' : `${i + 1}週目${isWangWeek ? '（王週）' : ''}`}</span></div><select className="session-type-select" value={type} onChange={(e) => setSessionType(session.key, e.target.value)} disabled={!canEditAdmin}>{sessionTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>{!session.closed && <div className="session-class-area"><div className="session-class-header"><span className="session-class-label">開講クラス</span>{isOverridden && canEditAdmin && <button type="button" className="reset-btn" onClick={() => resetSessionClasses(session.key)}>自動に戻す</button>}</div><div className="session-class-chips">{allClasses.map((cls) => <ClassChip key={cls} label={cls} checked={classes.includes(cls)} onChange={(e) => toggleSessionClass(session, cls, e.target.checked)} disabled={!canEditAdmin} />)}</div></div>}</div> })}</div>}</section>}

      {/* ── Special rules (admin) ── */}
      {isAdmin && <section id="sec-special" className="panel"><button type="button" className="collapse-header" onClick={() => setSpecialOpen((o) => !o)} aria-expanded={specialOpen}><span>2. 特殊設定</span><span className="collapse-icon">{specialOpen ? '▲' : '▼'}</span></button>{!specialOpen ? <p className="collapse-hint">王さん: {specialRules.wangSplit !== false ? 'ON' : 'OFF'} · ランダム: {specialRules.random === true ? 'ON' : 'OFF'}</p> : <div className="special-rules-list"><div className="special-rule-row"><div className="special-rule-info"><strong>王さんルール（入門自動分割）</strong><p>奇数週に「入門(denji)」と「入門(王)」が両方存在するとき、デフォルトで入門を2クラスに分けます。</p></div><label className="toggle-label"><input type="checkbox" checked={specialRules.wangSplit !== false} onChange={(e) => setSpecialRule('wangSplit', e.target.checked)} disabled={!canEditAdmin} /><span className="toggle-track"><span className="toggle-thumb" /></span><span className="toggle-text">{specialRules.wangSplit !== false ? 'ON' : 'OFF'}</span></label></div><div className="special-rule-row"><div className="special-rule-info"><strong>ランダム配車</strong><p>複数の先生が同じクラスを担当できる場合、ランダムに先生を選びます。</p></div><label className="toggle-label"><input type="checkbox" checked={specialRules.random === true} onChange={(e) => setSpecialRule('random', e.target.checked)} disabled={!canEditAdmin} /><span className="toggle-track"><span className="toggle-thumb" /></span><span className="toggle-text">{specialRules.random === true ? 'ON' : 'OFF'}</span></label></div></div>}</section>}

      {/* ── Class / status settings (admin) ── */}
      {isAdmin && <section id="sec-settings" className="panel"><button type="button" className="collapse-header" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}><span>3. クラス・ステータスの設定</span><span className="collapse-icon">{settingsOpen ? '▲' : '▼'}</span></button>{!settingsOpen ? <p className="collapse-hint">クラス: {allClasses.join(' · ')} ／ ステータス: {statusOptions.map((o) => o.label).join(' · ')}</p> : <div className="settings-sections"><div className="settings-section"><h3 className="settings-section-title">クラス一覧</h3><p className="panel-desc">クラス名の追加・削除・リネームができます。</p><div className="settings-sub-label">デフォルト開講クラス</div><div className="class-chip-row">{allClasses.map((cls) => <ClassChip key={cls} label={cls} checked={defaultClasses.includes(cls)} onChange={(e) => toggleDefaultClass(cls, e.target.checked)} />)}</div><div className="settings-sub-label" style={{ marginTop: 14 }}>クラス名の編集</div><div className="edit-list">{allClasses.map((cls, idx) => <div key={idx} className="edit-row"><input className="edit-input" value={cls} ref={idx === allClasses.length - 1 ? newClassRef : null} onChange={(e) => renameGlobalClass(idx, e.target.value)} /><button type="button" className="icon-btn danger" onClick={() => deleteGlobalClass(idx)}>×</button></div>)}</div><button type="button" className="add-item-btn" style={{ marginTop: 10 }} onClick={addGlobalClass}>+ クラスを追加</button></div><div className="settings-divider" /><div className="settings-section"><h3 className="settings-section-title">出欠ステータス</h3><p className="panel-desc">ステータス表示名は増減できます。動作ルールは計算に使われます。</p><div className="status-edit-list">{statusOptions.map((opt, idx) => { const isBuiltIn = ['yes', 'maybe', 'no', 'meeting_only'].includes(opt.id); return <div key={opt.id} className="status-edit-row">{isBuiltIn ? <span className="status-label-fixed">{opt.label}</span> : <input className="edit-input status-label-input" value={opt.label} ref={idx === statusOptions.length - 1 ? newStatusRef : null} onChange={(e) => updateStatusOption(idx, 'label', e.target.value)} placeholder="表示名" />}<select className="status-behavior-select" value={opt.behavior} onChange={(e) => updateStatusOption(idx, 'behavior', e.target.value)} disabled={isBuiltIn}>{BEHAVIORS.map((behavior) => <option key={behavior.value} value={behavior.value}>{behavior.label}</option>)}</select>{!isBuiltIn && <button type="button" className="icon-btn danger" onClick={() => deleteStatusOption(idx)}>×</button>}</div> })}</div><button type="button" className="add-item-btn" style={{ marginTop: 10 }} onClick={addStatusOption}>+ ステータスを追加</button></div></div>}</section>}

      {/* ── Teacher settings (admin) ── */}
      {isAdmin && <section id="sec-teachers" className="panel"><button type="button" className="collapse-header" onClick={() => setTeacherOpen((o) => !o)} aria-expanded={teacherOpen}><span>4. 先生の設定</span><span className="collapse-icon">{teacherOpen ? '▲' : '▼'}</span></button>{!teacherOpen ? <p className="collapse-hint">{teachers.map((t) => t.name).join(' · ')}</p> : <><p className="panel-desc">先生の追加・削除・担当クラス・デフォルト出欠を編集できます。</p><div className="teacher-list">{teachers.map((teacher, idx) => <div key={idx} draggable onDragStart={(e) => { teacherDragRef.current = idx; e.dataTransfer.effectAllowed = 'move' }} onDragOver={(e) => { e.preventDefault(); if (teacherDragRef.current !== idx) setTeacherDragOverIdx(idx) }} onDragLeave={() => setTeacherDragOverIdx(null)} onDrop={(e) => { e.preventDefault(); reorderTeacher(teacherDragRef.current, idx); setTeacherDragOverIdx(null) }} onDragEnd={() => { teacherDragRef.current = null; setTeacherDragOverIdx(null) }} className={`teacher-card${teacherDragOverIdx === idx && teacherDragRef.current !== idx ? ' teacher-drag-over' : ''}`}><div className="teacher-card-header"><span className="drag-handle" title="ドラッグして並び替え">⠿</span><input className="teacher-name-input" value={teacher.name} ref={idx === teachers.length - 1 ? newTeacherRef : null} onChange={(e) => updateTeacher(idx, 'name', e.target.value)} /><div className="teacher-card-actions"><button type="button" className="icon-btn" disabled={idx === 0} onClick={() => moveTeacher(idx, -1)}>↑</button><button type="button" className="icon-btn" disabled={idx === teachers.length - 1} onClick={() => moveTeacher(idx, 1)}>↓</button><button type="button" className="icon-btn danger" onClick={() => deleteTeacher(idx)}>×</button></div></div><div className="teacher-meta-row"><label className="flag-label"><input type="checkbox" checked={!!teacher.remote} onChange={(e) => updateTeacher(idx, 'remote', e.target.checked)} /><span>遠方</span></label><label className="flag-label"><input type="checkbox" checked={!!teacher.skipMeeting} onChange={(e) => updateTeacher(idx, 'skipMeeting', e.target.checked)} /><span>総会のみ</span></label><label className="default-status-label"><span>デフォルト出欠</span><select className="default-status-select" value={teacher.defaultStatus ?? 'no'} onChange={(e) => updateTeacher(idx, 'defaultStatus', e.target.value)}>{statusOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}</select></label></div><div className="teacher-classes">{allClasses.map((cls) => <ClassChip key={cls} label={cls} checked={teacher.classes.includes(cls)} onChange={(e) => toggleTeacherClass(idx, cls, e.target.checked)} />)}</div></div>)}</div><button type="button" className="add-item-btn" onClick={addTeacher}>+ 先生を追加</button></>}</section>}

      {/* ── Attendance input ── */}
      <section id="sec-attendance" className="panel">
        <div className="panel-header">
          <div>
            <h2>{isAdmin ? '5. 出席を入力' : '1. 自分の出席を入力'}</h2>
            <p>{isAdmin ? '管理者は対象の先生を選んで編集できます。' : isMonthLocked ? 'この月の担当表は確定済みです。' : 'あなたが編集できるのは自分の出席だけです。'}</p>
          </div>
        </div>

        {/* Teacher selector chips */}
        {isAdmin && (
          <div className="chip-row">
            {teachers.map((teacher) => (
              <button key={teacher.name} type="button" className={teacher.name === effectiveTeacher ? 'chip active' : 'chip'} onClick={() => handleSelectTeacher(teacher.name)}>
                {teacher.name}
              </button>
            ))}
          </div>
        )}

        {/* Teacher shareable links (admin only) */}
        {isAdmin && (
          <div className="teacher-links-row">
            <span className="teacher-links-hint">🔗 先生別リンク：</span>
            {teachers.map((t) => (
              <button
                key={t.name}
                type="button"
                className={`teacher-link-btn ${copiedLink === t.name ? 'teacher-link-btn-done' : ''}`}
                onClick={() => copyTeacherLink(t.name)}
                title={`${t.name}さん専用リンクをコピー`}
              >
                {copiedLink === t.name ? `✓ ${t.name}` : t.name}
              </button>
            ))}
          </div>
        )}

        <p className="selected-label">{effectiveTeacher} さんの出席</p>
        <div className="session-grid">
          {sessions.map((session) => {
            const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'
            const effectiveStatus = getEffectiveStatus(effectiveTeacher, session.key)
            const isExplicit = attendance[effectiveTeacher]?.[session.key] !== undefined
            const disabled = session.closed || isMonthLocked
            return (
              <div key={session.key} className={`session-card session-card-${type}`}>
                <div className="session-card-info">
                  <strong>{session.label}</strong>
                  <span className="session-week">{session.closed ? 'やすみ' : session.meeting ? '例会' : `${session.weekIndex}週目`}</span>
                  {!isExplicit && !session.closed && <span className="default-badge">デフォルト</span>}
                </div>
                <select value={effectiveStatus} onChange={(e) => handleStatusChange(session.key, e.target.value)} disabled={disabled} className={!isExplicit ? 'select-default' : ''}>
                  {statusOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Schedule table ── */}
      <section id="sec-schedule" className="panel">
        <div className="panel-header">
          <div>
            <h2>{isAdmin ? '6. 自動で決まった担当' : '2. 自動で決まった担当'}</h2>
            <p>△ は人数不足のときだけ追加。赤は未担当クラスです。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="col-sticky col-head">名前</th>
                {sessions.map((s) => <th key={s.key} className={s.closed ? 'th-holiday' : s.meeting ? 'th-meeting' : ''}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="col-sticky td-label">特別連絡</td>
                {schedule.map((s) => <td key={s.key} className={s.closed ? 'td-holiday' : ''}>{s.special || ''}</td>)}
              </tr>
              {schedule.some((s) => s.unassignedClasses?.length > 0) && (
                <tr>
                  <td className="col-sticky td-label td-unassigned-label">未担当</td>
                  {schedule.map((s) => <td key={s.key} className={s.unassignedClasses?.length > 0 ? 'td-unassigned' : s.closed ? 'td-holiday' : ''}>{s.unassignedClasses?.join('、') || ''}</td>)}
                </tr>
              )}
              {teachers.map((teacher) => (
                <tr key={teacher.name}>
                  <td className="col-sticky td-label">{teacher.name}</td>
                  {schedule.map((s) => {
                    const assigned = Object.entries(s.assignments).filter(([, assignedTeacher]) => assignedTeacher === teacher.name).map(([className]) => className).join(' / ')
                    return <td key={s.key} className={s.closed ? 'td-holiday' : ''}>{assigned}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Memos ── */}
      <section id="sec-memos" className="panel">
        <div className="panel-header">
          <div>
            <h2>{isAdmin ? '7. メモ' : '3. メモ'}</h2>
            <p>全員がメモと会議記録を編集できます。</p>
          </div>
        </div>

        <div className="my-memo-card">
          <div className="my-memo-header">
            <div>
              <h3>My Memo</h3>
              <p>{identity} さん用の個人メモです。他の人でログインすると表示されません。</p>
            </div>
          </div>
          <textarea
            className="my-memo-textarea"
            value={myMemo}
            onChange={(e) => setMyMemo(e.target.value)}
            placeholder="自分だけのメモを書けます…"
            rows={8}
          />
        </div>

        {/* Meeting notes — full-width cards, one per meeting session */}
        {schedule.filter((s) => s.meeting && !s.closed).map((session) => (
          <div key={`mn-${session.key}`} className="meeting-note-card">
            <div className="meeting-note-header">
              <span className="meeting-note-icon">📋</span>
              <div>
                <strong>{session.label} 会議記録</strong>
                <span className="meeting-note-sub">例会の議事録・決定事項・連絡事項</span>
              </div>
            </div>
            <textarea
              className="meeting-note-textarea"
              value={meetingNotes[session.key] ?? ''}
              onChange={(e) => setMeetingNote(session.key, e.target.value)}
              placeholder="会議内容を記録…（議事録・決定事項・次回への伝達事項など）"
              rows={8}
            />
          </div>
        ))}

        {/* Regular memo grid */}
        <div className="memo-list" style={{ marginTop: schedule.some((s) => s.meeting && !s.closed) ? 16 : 0 }}>
          {schedule.map((session) => (
            <article key={session.key} className={`memo-card ${session.closed ? 'memo-holiday' : session.meeting ? 'memo-meeting' : ''}`}>
              <h3>{session.label}</h3>
              {session.closed ? (
                <p className="memo-auto">わをん休み</p>
              ) : (
                <>
                  <p className="memo-auto">来る人: {session.selectedTeachers.join('、') || 'なし'}</p>
                  <p className="memo-auto">総会のみ: {session.meetingOnlyTeachers.join('、') || 'なし'}</p>
                  {session.selectedMaybeTeachers.length > 0 && <p className="memo-auto">△から追加: {session.selectedMaybeTeachers.join('、')}</p>}
                  {session.unassignedClasses?.length > 0 && <p className="memo-warn">⚠ 未担当: {session.unassignedClasses.join('、')}</p>}
                  {session.notes.map((note) => <p key={note} className="memo-auto">{note}</p>)}
                </>
              )}
              <label className="memo-label">
                メモ
                <textarea
                  className="memo-textarea"
                  value={memos[session.key] ?? ''}
                  onChange={(e) => setMemo(session.key, e.target.value)}
                  placeholder="自由に書き込めます…"
                  rows={3}
                />
              </label>
            </article>
          ))}
        </div>
      </section>

      {/* ── 伝言板 ── */}
      <section id="sec-bulletin" className="panel">
        <div className="panel-header">
          <div>
            <h2>{isAdmin ? '8. 伝言板' : '4. 伝言板'}</h2>
            <p>全員が投稿・編集・削除・固定・重要・並び替えをできます。月をまたいでも残ります。</p>
          </div>
          <button
            type="button"
            className="bulletin-new-btn"
            onClick={() => { setShowNewBulletin(true); setEditingBulletinId(null) }}
          >
            ＋ 新規作成
          </button>
        </div>

        {/* New post form */}
        {showNewBulletin && (
          <div className="bulletin-compose">
            <div className="bulletin-compose-author">
              <span className="bulletin-author-dot" />
              <strong>{identity}</strong>
            </div>
            <textarea
              className="bulletin-compose-textarea"
              value={newBulletinText}
              onChange={(e) => setNewBulletinText(e.target.value)}
              placeholder="連絡事項・お知らせ・メモなど…"
              rows={4}
              autoFocus
            />
            <div className="bulletin-compose-actions">
              <button type="button" className="bulletin-cancel-btn" onClick={() => { setShowNewBulletin(false); setNewBulletinText('') }}>キャンセル</button>
              <button type="button" className="bulletin-submit-btn" onClick={createBulletin} disabled={!newBulletinText.trim()}>確定</button>
            </div>
          </div>
        )}

        {/* Post list */}
        {bulletinBoard.length === 0 && !showNewBulletin ? (
          <div className="bulletin-empty">
            <p>まだ伝言はありません。「＋ 新規作成」から投稿できます。</p>
          </div>
        ) : (
          <div className="bulletin-list">
            {sortedBulletin.map((post) => {
              const canEdit = isAdmin || identity === post.author
              const isEditing = editingBulletinId === post.id
              const isPinned = !!post.pinned
              const isImportant = !!post.important
              const canMarkImportant = isAdmin || identity === post.author
              const tier = sortedBulletin.filter((p) => !!p.pinned === isPinned)
              const tierPos = tier.findIndex((p) => p.id === post.id)
              const isDragOver = bulletinDragOverId === post.id && bulletinDragRef.current !== post.id
              return (
                <div
                  key={post.id}
                  draggable
                  onDragStart={(e) => { bulletinDragRef.current = post.id; e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={(e) => { e.preventDefault(); if (bulletinDragRef.current !== post.id) setBulletinDragOverId(post.id) }}
                  onDragLeave={() => setBulletinDragOverId(null)}
                  onDrop={(e) => { e.preventDefault(); reorderBulletin(bulletinDragRef.current, post.id); setBulletinDragOverId(null) }}
                  onDragEnd={() => { bulletinDragRef.current = null; setBulletinDragOverId(null) }}
                  className={[
                    'bulletin-post',
                    identity === post.author ? 'bulletin-post-own' : '',
                    isPinned ? 'bulletin-post-pinned' : '',
                    isImportant ? 'bulletin-post-important' : '',
                    'bulletin-post-draggable',
                    isDragOver ? 'bulletin-drag-over' : '',
                  ].filter(Boolean).join(' ')}>
                  <div className="bulletin-post-header">
                    <div className="bulletin-post-meta">
                      <span className="bulletin-author-dot" />
                      <strong className="bulletin-post-author">{post.author}</strong>
                      {isPinned && <span className="bulletin-badge-pin">📌 固定</span>}
                      {isImportant && <span className="bulletin-badge-important">⭐ 重要</span>}
                      <span className="bulletin-post-date">
                        {new Date(post.updatedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {post.updatedAt !== post.createdAt && ' (編集済)'}
                      </span>
                    </div>
                    <div className="bulletin-post-btns">
                      <div className="bulletin-move-btns">
                        <button type="button" className="bulletin-move-btn" disabled={tierPos === 0} onClick={() => moveBulletin(post.id, -1)} title="上へ">↑</button>
                        <button type="button" className="bulletin-move-btn" disabled={tierPos === tier.length - 1} onClick={() => moveBulletin(post.id, 1)} title="下へ">↓</button>
                      </div>
                      {!isEditing && (
                        <button type="button" className={`bulletin-important-btn ${isImportant ? 'active' : ''}`} onClick={() => toggleImportantBulletin(post.id)} title={isImportant ? '重要解除' : '重要にする'}>⭐</button>
                      )}
                      {!isEditing && (
                        <button type="button" className={`bulletin-pin-btn ${isPinned ? 'active' : ''}`} onClick={() => togglePinBulletin(post.id)} title={isPinned ? '固定解除' : '固定する'}>📌</button>
                      )}
                      {canEdit && !isEditing && (
                        <>
                          <button type="button" className="bulletin-edit-btn" onClick={() => startEditBulletin(post)}>編集</button>
                          <button type="button" className="bulletin-del-btn" onClick={() => deleteBulletin(post.id)}>削除</button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="bulletin-edit-area">
                      <textarea
                        className="bulletin-compose-textarea"
                        value={editingBulletinText}
                        onChange={(e) => setEditingBulletinText(e.target.value)}
                        rows={4}
                        autoFocus
                      />
                      <div className="bulletin-compose-actions">
                        <button type="button" className="bulletin-cancel-btn" onClick={cancelEditBulletin}>キャンセル</button>
                        <button type="button" className="bulletin-submit-btn" onClick={saveEditBulletin} disabled={!editingBulletinText.trim()}>確定</button>
                      </div>
                    </div>
                  ) : (
                    <p className="bulletin-post-body">{post.message}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Archive (admin only) ── */}
      {isAdmin && (
        <section id="sec-archive" className="panel">
          <button
            type="button"
            className="collapse-header"
            onClick={() => setArchiveOpen((o) => !o)}
            aria-expanded={archiveOpen}
          >
            <span>9. アーカイブ</span>
            <span className="collapse-icon">{archiveOpen ? '▲' : '▼'}</span>
          </button>
          {!archiveOpen ? (
            <p className="collapse-hint">
              {archiveEntries.length === 0
                ? '「今月を確定」すると、ここに保存されます。'
                : archiveEntries.map(([, a]) => a.label).join(' · ')}
            </p>
          ) : archiveEntries.length === 0 ? (
            <p className="empty-msg">まだ確定済みの月はありません。「今月を確定」ボタンで保存できます。</p>
          ) : (
            <div className="archive-list">
              {archiveEntries.map(([key, arc]) => (
                <div key={key} className="archive-row">
                  <div className="archive-row-info">
                    <strong>{arc.label}</strong>
                    <span>確定日：{new Date(arc.savedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <div className="archive-actions">
                    <button type="button" className="archive-dl-btn" onClick={() => downloadArchive(key, arc)}>↓ ダウンロード</button>
                    <button type="button" className="archive-del-btn" onClick={() => deleteArchive(key)}>削除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Scroll nav ── */}
      <ScrollNav sections={navSections} activeSection={activeSection} />
    </div>
  )
}
