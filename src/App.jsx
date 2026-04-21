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
  const newTeacherRef = useRef(null)
  const newClassRef = useRef(null)
  const newStatusRef = useRef(null)
  const cloudReadyRef = useRef(false)
  const saveTimerRef = useRef(null)
  const lastSyncedStateRef = useRef('')

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
  } = state

  const monthKey = `${year}-${month}`
  const sessions = generateSessions(year, month, sessionTypesByMonth, sessionClassesByMonth, defaultClasses, allClasses, specialRules)
  const attendance = attendanceByMonth[monthKey] ?? {}
  const memos = memosByMonth[monthKey] ?? {}
  const isAdmin = identity === ADMIN_NAME
  const effectiveTeacher = isAdmin ? currentTeacher : identity
  const canEditAdmin = isAdmin

  let schedule = []
  try {
    schedule = buildSchedule(attendance, sessions, teachers, statusOptions, specialRules)
  } catch (error) {
    console.error(error)
  }

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

  function selectIdentity(name) {
    setIdentity(name)
    if (name !== ADMIN_NAME) setState((s) => ({ ...s, currentTeacher: name }))
  }

  function switchIdentity() {
    setIdentity('')
    setExportMessage('')
  }

  function setYear(y) { setState((s) => ({ ...s, year: y })) }
  function setMonth(m) { setState((s) => ({ ...s, month: m })) }

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
    if (!canEditAdmin) return
    setState((s) => ({
      ...s,
      memosByMonth: {
        ...s.memosByMonth,
        [monthKey]: { ...(s.memosByMonth[monthKey] ?? {}), [sessionKey]: value },
      },
    }))
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

  if (!identity || !teachers.some((t) => t.name === identity)) {
    return <IdentityGate teachers={teachers} onSelect={selectIdentity} />
  }

  return (
    <div className="page">
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

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>0. 月を選ぶ</h2>
            <p>表示したい月を切り替えられます。</p>
          </div>
          {isAdmin && (
            <div className="export-actions">
              <button type="button" className="export-btn" onClick={exportMonthTable}>月表をエクスポート</button>
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

      {isAdmin && <section className="panel"><button type="button" className="collapse-header" onClick={() => setSessionOpen((o) => !o)} aria-expanded={sessionOpen}><span>1. 各回の設定</span><span className="collapse-icon">{sessionOpen ? '▲' : '▼'}</span></button>{!sessionOpen ? <p className="collapse-hint">{sessions.length === 0 ? 'この月に土曜日がありません' : sessions.map((s) => { const type = sessionTypesByMonth[monthKey]?.[s.key] ?? 'normal'; const icon = type === 'holiday' ? 'やすみ' : type === 'meeting' ? '例会' : '通常'; return `${s.label}(${icon})` }).join(' · ')}</p> : sessions.length === 0 ? <p className="empty-msg">この月に土曜日がありません。</p> : <div className="session-list">{sessions.map((session, i) => { const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'; const classes = getSessionClasses(session); const isOverridden = !!sessionClassesByMonth[monthKey]?.[session.key]; const isWangWeek = session.weekIndex % 2 === 1; return <div key={session.key} className={`session-row session-row-${type}`}><div className="session-row-top"><div className="session-date-info"><strong className="session-date">{session.label}</strong><span className="session-week">{session.closed ? 'やすみ' : `${i + 1}週目${isWangWeek ? '（王週）' : ''}`}</span></div><select className="session-type-select" value={type} onChange={(e) => setSessionType(session.key, e.target.value)}>{sessionTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>{!session.closed && <div className="session-class-area"><div className="session-class-header"><span className="session-class-label">開講クラス</span>{isOverridden && <button type="button" className="reset-btn" onClick={() => resetSessionClasses(session.key)}>自動に戻す</button>}</div><div className="session-class-chips">{allClasses.map((cls) => <ClassChip key={cls} label={cls} checked={classes.includes(cls)} onChange={(e) => toggleSessionClass(session, cls, e.target.checked)} />)}</div></div>}</div> })}</div>}</section>}

      {isAdmin && <section className="panel"><button type="button" className="collapse-header" onClick={() => setSpecialOpen((o) => !o)} aria-expanded={specialOpen}><span>2. 特殊設定</span><span className="collapse-icon">{specialOpen ? '▲' : '▼'}</span></button>{!specialOpen ? <p className="collapse-hint">王さん: {specialRules.wangSplit !== false ? 'ON' : 'OFF'} · ランダム: {specialRules.random === true ? 'ON' : 'OFF'}</p> : <div className="special-rules-list"><div className="special-rule-row"><div className="special-rule-info"><strong>王さんルール（入門自動分割）</strong><p>奇数週に「入門(denji)」と「入門(王)」が両方存在するとき、デフォルトで入門を2クラスに分けます。</p></div><label className="toggle-label"><input type="checkbox" checked={specialRules.wangSplit !== false} onChange={(e) => setSpecialRule('wangSplit', e.target.checked)} /><span className="toggle-track"><span className="toggle-thumb" /></span><span className="toggle-text">{specialRules.wangSplit !== false ? 'ON' : 'OFF'}</span></label></div><div className="special-rule-row"><div className="special-rule-info"><strong>ランダム配車</strong><p>複数の先生が同じクラスを担当できる場合、ランダムに先生を選びます。</p></div><label className="toggle-label"><input type="checkbox" checked={specialRules.random === true} onChange={(e) => setSpecialRule('random', e.target.checked)} /><span className="toggle-track"><span className="toggle-thumb" /></span><span className="toggle-text">{specialRules.random === true ? 'ON' : 'OFF'}</span></label></div></div>}</section>}

      {isAdmin && <section className="panel"><button type="button" className="collapse-header" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}><span>3. クラス・ステータスの設定</span><span className="collapse-icon">{settingsOpen ? '▲' : '▼'}</span></button>{!settingsOpen ? <p className="collapse-hint">クラス: {allClasses.join(' · ')} ／ ステータス: {statusOptions.map((o) => o.label).join(' · ')}</p> : <div className="settings-sections"><div className="settings-section"><h3 className="settings-section-title">クラス一覧</h3><p className="panel-desc">クラス名の追加・削除・リネームができます。</p><div className="settings-sub-label">デフォルト開講クラス</div><div className="class-chip-row">{allClasses.map((cls) => <ClassChip key={cls} label={cls} checked={defaultClasses.includes(cls)} onChange={(e) => toggleDefaultClass(cls, e.target.checked)} />)}</div><div className="settings-sub-label" style={{ marginTop: 14 }}>クラス名の編集</div><div className="edit-list">{allClasses.map((cls, idx) => <div key={idx} className="edit-row"><input className="edit-input" value={cls} ref={idx === allClasses.length - 1 ? newClassRef : null} onChange={(e) => renameGlobalClass(idx, e.target.value)} /><button type="button" className="icon-btn danger" onClick={() => deleteGlobalClass(idx)}>×</button></div>)}</div><button type="button" className="add-item-btn" style={{ marginTop: 10 }} onClick={addGlobalClass}>+ クラスを追加</button></div><div className="settings-divider" /><div className="settings-section"><h3 className="settings-section-title">出欠ステータス</h3><p className="panel-desc">ステータス表示名は増減できます。動作ルールは計算に使われます。</p><div className="status-edit-list">{statusOptions.map((opt, idx) => { const isBuiltIn = ['yes', 'maybe', 'no', 'meeting_only'].includes(opt.id); return <div key={opt.id} className="status-edit-row">{isBuiltIn ? <span className="status-label-fixed">{opt.label}</span> : <input className="edit-input status-label-input" value={opt.label} ref={idx === statusOptions.length - 1 ? newStatusRef : null} onChange={(e) => updateStatusOption(idx, 'label', e.target.value)} placeholder="表示名" />}<select className="status-behavior-select" value={opt.behavior} onChange={(e) => updateStatusOption(idx, 'behavior', e.target.value)} disabled={isBuiltIn}>{BEHAVIORS.map((behavior) => <option key={behavior.value} value={behavior.value}>{behavior.label}</option>)}</select>{!isBuiltIn && <button type="button" className="icon-btn danger" onClick={() => deleteStatusOption(idx)}>×</button>}</div> })}</div><button type="button" className="add-item-btn" style={{ marginTop: 10 }} onClick={addStatusOption}>+ ステータスを追加</button></div></div>}</section>}

      {isAdmin && <section className="panel"><button type="button" className="collapse-header" onClick={() => setTeacherOpen((o) => !o)} aria-expanded={teacherOpen}><span>4. 先生の設定</span><span className="collapse-icon">{teacherOpen ? '▲' : '▼'}</span></button>{!teacherOpen ? <p className="collapse-hint">{teachers.map((t) => t.name).join(' · ')}</p> : <><p className="panel-desc">先生の追加・削除・担当クラス・デフォルト出欠を編集できます。</p><div className="teacher-list">{teachers.map((teacher, idx) => <div key={idx} className="teacher-card"><div className="teacher-card-header"><input className="teacher-name-input" value={teacher.name} ref={idx === teachers.length - 1 ? newTeacherRef : null} onChange={(e) => updateTeacher(idx, 'name', e.target.value)} /><div className="teacher-card-actions"><button type="button" className="icon-btn" disabled={idx === 0} onClick={() => moveTeacher(idx, -1)}>↑</button><button type="button" className="icon-btn" disabled={idx === teachers.length - 1} onClick={() => moveTeacher(idx, 1)}>↓</button><button type="button" className="icon-btn danger" onClick={() => deleteTeacher(idx)}>×</button></div></div><div className="teacher-meta-row"><label className="flag-label"><input type="checkbox" checked={!!teacher.remote} onChange={(e) => updateTeacher(idx, 'remote', e.target.checked)} /><span>遠方</span></label><label className="flag-label"><input type="checkbox" checked={!!teacher.skipMeeting} onChange={(e) => updateTeacher(idx, 'skipMeeting', e.target.checked)} /><span>総会のみ</span></label><label className="default-status-label"><span>デフォルト出欠</span><select className="default-status-select" value={teacher.defaultStatus ?? 'no'} onChange={(e) => updateTeacher(idx, 'defaultStatus', e.target.value)}>{statusOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}</select></label></div><div className="teacher-classes">{allClasses.map((cls) => <ClassChip key={cls} label={cls} checked={teacher.classes.includes(cls)} onChange={(e) => toggleTeacherClass(idx, cls, e.target.checked)} />)}</div></div>)}</div><button type="button" className="add-item-btn" onClick={addTeacher}>+ 先生を追加</button></>}</section>}

      <section className="panel"><div className="panel-header"><div><h2>{isAdmin ? '5. 出席を入力' : '1. 自分の出席を入力'}</h2><p>{isAdmin ? '管理者は対象の先生を選んで編集できます。' : 'あなたが編集できるのは自分の出席だけです。'}</p></div></div>{isAdmin && <div className="chip-row">{teachers.map((teacher) => <button key={teacher.name} type="button" className={teacher.name === effectiveTeacher ? 'chip active' : 'chip'} onClick={() => handleSelectTeacher(teacher.name)}>{teacher.name}</button>)}</div>}<p className="selected-label">{effectiveTeacher} さんの出席</p><div className="session-grid">{sessions.map((session) => { const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'; const effectiveStatus = getEffectiveStatus(effectiveTeacher, session.key); const isExplicit = attendance[effectiveTeacher]?.[session.key] !== undefined; return <div key={session.key} className={`session-card session-card-${type}`}><div className="session-card-info"><strong>{session.label}</strong><span className="session-week">{session.closed ? 'やすみ' : session.meeting ? '例会' : `${session.weekIndex}週目`}</span>{!isExplicit && !session.closed && <span className="default-badge">デフォルト</span>}</div><select value={effectiveStatus} onChange={(e) => handleStatusChange(session.key, e.target.value)} disabled={session.closed} className={!isExplicit ? 'select-default' : ''}>{statusOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}</select></div> })}</div></section>

      <section className="panel"><div className="panel-header"><div><h2>{isAdmin ? '6. 自動で決まった担当' : '2. 自動で決まった担当'}</h2><p>△ は人数不足のときだけ追加。赤は未担当クラスです。</p></div></div><div className="table-wrap"><table><thead><tr><th className="col-sticky col-head">名前</th>{sessions.map((s) => <th key={s.key} className={s.closed ? 'th-holiday' : s.meeting ? 'th-meeting' : ''}>{s.label}</th>)}</tr></thead><tbody><tr><td className="col-sticky td-label">特別連絡</td>{schedule.map((s) => <td key={s.key} className={s.closed ? 'td-holiday' : ''}>{s.special || ''}</td>)}</tr>{schedule.some((s) => s.unassignedClasses?.length > 0) && <tr><td className="col-sticky td-label td-unassigned-label">未担当</td>{schedule.map((s) => <td key={s.key} className={s.unassignedClasses?.length > 0 ? 'td-unassigned' : s.closed ? 'td-holiday' : ''}>{s.unassignedClasses?.join('、') || ''}</td>)}</tr>}{teachers.map((teacher) => <tr key={teacher.name}><td className="col-sticky td-label">{teacher.name}</td>{schedule.map((s) => { const assigned = Object.entries(s.assignments).filter(([, assignedTeacher]) => assignedTeacher === teacher.name).map(([className]) => className).join(' / '); return <td key={s.key} className={s.closed ? 'td-holiday' : ''}>{assigned}</td> })}</tr>)}</tbody></table></div></section>

      <section className="panel"><div className="panel-header"><div><h2>{isAdmin ? '7. メモ' : '3. メモ'}</h2><p>{isAdmin ? '管理者はメモを編集できます。' : 'メモは閲覧のみです。'}</p></div></div><div className="memo-list">{schedule.map((session) => <article key={session.key} className={`memo-card ${session.closed ? 'memo-holiday' : session.meeting ? 'memo-meeting' : ''}`}><h3>{session.label}</h3>{session.closed ? <p className="memo-auto">わをん休み</p> : <><p className="memo-auto">来る人: {session.selectedTeachers.join('、') || 'なし'}</p><p className="memo-auto">総会のみ: {session.meetingOnlyTeachers.join('、') || 'なし'}</p>{session.selectedMaybeTeachers.length > 0 && <p className="memo-auto">△から追加: {session.selectedMaybeTeachers.join('、')}</p>}{session.unassignedClasses?.length > 0 && <p className="memo-warn">⚠ 未担当: {session.unassignedClasses.join('、')}</p>}{session.notes.map((note) => <p key={note} className="memo-auto">{note}</p>)}</>}<label className="memo-label">メモ<textarea className="memo-textarea" value={memos[session.key] ?? ''} onChange={(e) => setMemo(session.key, e.target.value)} placeholder={isAdmin ? '自由に書き込めます…' : ''} rows={3} readOnly={!isAdmin} /></label></article>)}</div></section>
    </div>
  )
}

