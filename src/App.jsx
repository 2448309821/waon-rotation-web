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

const STORAGE_KEY = 'rotation-web-state-v5'
const MONTH_JP = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

function getDefaultYearMonth() {
  const d = new Date()
  let year = d.getFullYear(), month = d.getMonth() + 2
  if (month > 12) { month = 1; year++ }
  return { year, month }
}

function loadState() {
  const { year, month } = getDefaultYearMonth()
  const fallback = {
    year, month,
    allClasses: ALL_CLASSES,
    defaultClasses: DEFAULT_CLASSES,
    statusOptions: DEFAULT_STATUS_OPTIONS,
    specialRules: { wangSplit: true },
    teachers: DEFAULT_TEACHERS,
    currentTeacher: DEFAULT_TEACHERS[0].name,
    sessionTypesByMonth: {},
    sessionClassesByMonth: {},
    attendanceByMonth: {},
    memosByMonth: {},
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw)
    return {
      year:                  p.year                 ?? year,
      month:                 p.month                ?? month,
      allClasses:            p.allClasses           ?? ALL_CLASSES,
      defaultClasses:        p.defaultClasses       ?? DEFAULT_CLASSES,
      statusOptions:         p.statusOptions        ?? DEFAULT_STATUS_OPTIONS,
      specialRules:          p.specialRules         ?? { wangSplit: true },
      teachers:              p.teachers             ?? DEFAULT_TEACHERS,
      currentTeacher:        p.currentTeacher       ?? fallback.currentTeacher,
      sessionTypesByMonth:   p.sessionTypesByMonth  ?? {},
      sessionClassesByMonth: p.sessionClassesByMonth ?? {},
      attendanceByMonth:     p.attendanceByMonth    ?? {},
      memosByMonth:          p.memosByMonth         ?? {},
    }
  } catch { return fallback }
}

// ── Chip component ────────────────────────────────────────────────────────────
function ClassChip({ label, checked, onChange }) {
  return (
    <label className={`class-chip ${checked ? 'class-chip-on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState]               = useState(loadState)
  const [sessionOpen, setSessionOpen]   = useState(true)
  const [specialOpen, setSpecialOpen]   = useState(false)
  const [teacherOpen, setTeacherOpen]   = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const newTeacherRef = useRef(null)
  const newClassRef   = useRef(null)
  const newStatusRef  = useRef(null)

  const {
    year, month, allClasses, defaultClasses, statusOptions, specialRules,
    teachers, currentTeacher,
    sessionTypesByMonth, sessionClassesByMonth,
    attendanceByMonth, memosByMonth,
  } = state

  const monthKey = `${year}-${month}`
  const sessions = generateSessions(year, month, sessionTypesByMonth, sessionClassesByMonth, defaultClasses, allClasses, specialRules)
  const attendance = attendanceByMonth[monthKey] ?? {}
  const memos      = memosByMonth[monthKey] ?? {}

  let schedule = []
  try { schedule = buildSchedule(attendance, sessions, teachers, statusOptions) } catch (e) { console.error(e) }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  // ── Month ────────────────────────────────────────────────────────────────
  function setYear(y)  { setState(s => ({ ...s, year: y })) }
  function setMonth(m) { setState(s => ({ ...s, month: m })) }

  // ── Session type ─────────────────────────────────────────────────────────
  function setSessionType(sessionKey, type) {
    setState(s => ({
      ...s,
      sessionTypesByMonth: {
        ...s.sessionTypesByMonth,
        [monthKey]: { ...(s.sessionTypesByMonth[monthKey] ?? {}), [sessionKey]: type },
      },
    }))
  }

  // ── Session classes ──────────────────────────────────────────────────────
  function getSessionClasses(session) {
    return sessionClassesByMonth[monthKey]?.[session.key] ?? session.requiredClasses
  }

  function setSessionClasses(sessionKey, classes) {
    const ordered = allClasses.filter(c => classes.includes(c))
    setState(s => ({
      ...s,
      sessionClassesByMonth: {
        ...s.sessionClassesByMonth,
        [monthKey]: { ...(s.sessionClassesByMonth[monthKey] ?? {}), [sessionKey]: ordered },
      },
    }))
  }

  function toggleSessionClass(session, cls, enabled) {
    const current = getSessionClasses(session)
    const next = enabled ? [...current, cls] : current.filter(c => c !== cls)
    setSessionClasses(session.key, next)
  }

  function resetSessionClasses(sessionKey) {
    setState(s => {
      const byMonth = { ...(s.sessionClassesByMonth[monthKey] ?? {}) }
      delete byMonth[sessionKey]
      return { ...s, sessionClassesByMonth: { ...s.sessionClassesByMonth, [monthKey]: byMonth } }
    })
  }

  // ── Special rules ────────────────────────────────────────────────────────
  function setSpecialRule(key, value) {
    setState(s => ({ ...s, specialRules: { ...s.specialRules, [key]: value } }))
  }

  // ── Global class management ──────────────────────────────────────────────
  function addGlobalClass() {
    setState(s => ({ ...s, allClasses: [...s.allClasses, '新しいクラス'] }))
    setTimeout(() => newClassRef.current?.focus(), 50)
  }

  function renameGlobalClass(idx, newName) {
    const oldName = allClasses[idx]
    setState(s => ({
      ...s,
      allClasses:     s.allClasses.map((c, i) => i === idx ? newName : c),
      defaultClasses: s.defaultClasses.map(c => c === oldName ? newName : c),
      teachers:       s.teachers.map(t => ({ ...t, classes: t.classes.map(c => c === oldName ? newName : c) })),
      sessionClassesByMonth: Object.fromEntries(
        Object.entries(s.sessionClassesByMonth).map(([mk, sess]) => [
          mk, Object.fromEntries(Object.entries(sess).map(([sk, cls]) => [sk, cls.map(c => c === oldName ? newName : c)])),
        ])
      ),
    }))
  }

  function deleteGlobalClass(idx) {
    const name = allClasses[idx]
    setState(s => ({
      ...s,
      allClasses:     s.allClasses.filter((_, i) => i !== idx),
      defaultClasses: s.defaultClasses.filter(c => c !== name),
      teachers:       s.teachers.map(t => ({ ...t, classes: t.classes.filter(c => c !== name) })),
      sessionClassesByMonth: Object.fromEntries(
        Object.entries(s.sessionClassesByMonth).map(([mk, sess]) => [
          mk, Object.fromEntries(Object.entries(sess).map(([sk, cls]) => [sk, cls.filter(c => c !== name)])),
        ])
      ),
    }))
  }

  function toggleDefaultClass(cls, enabled) {
    setState(s => ({
      ...s,
      defaultClasses: enabled
        ? s.allClasses.filter(c => [...s.defaultClasses, cls].includes(c))
        : s.defaultClasses.filter(c => c !== cls),
    }))
  }

  // ── Status options management ────────────────────────────────────────────
  function addStatusOption() {
    setState(s => ({
      ...s,
      statusOptions: [...s.statusOptions, { id: `custom_${Date.now()}`, label: '新しい状態', behavior: 'no' }],
    }))
    setTimeout(() => newStatusRef.current?.focus(), 50)
  }

  function updateStatusOption(idx, field, value) {
    setState(s => ({
      ...s,
      statusOptions: s.statusOptions.map((o, i) => i === idx ? { ...o, [field]: value } : o),
    }))
  }

  function deleteStatusOption(idx) {
    setState(s => ({ ...s, statusOptions: s.statusOptions.filter((_, i) => i !== idx) }))
  }

  // ── Attendance ───────────────────────────────────────────────────────────
  function handleSelectTeacher(name) {
    if (!teachers.find(t => t.name === name)) return
    setState(s => ({ ...s, currentTeacher: name }))
  }

  function getEffectiveStatus(teacherName, sessionKey) {
    const teacher = teachers.find(t => t.name === teacherName)
    return attendance[teacherName]?.[sessionKey] ?? teacher?.defaultStatus ?? 'no'
  }

  function handleStatusChange(sessionKey, value) {
    setState(s => {
      const cur = s.attendanceByMonth[monthKey] ?? {}
      return {
        ...s,
        attendanceByMonth: {
          ...s.attendanceByMonth,
          [monthKey]: {
            ...cur,
            [s.currentTeacher]: { ...(cur[s.currentTeacher] ?? {}), [sessionKey]: value },
          },
        },
      }
    })
  }

  // ── Memo ─────────────────────────────────────────────────────────────────
  function setMemo(sessionKey, value) {
    setState(s => ({
      ...s,
      memosByMonth: {
        ...s.memosByMonth,
        [monthKey]: { ...(s.memosByMonth[monthKey] ?? {}), [sessionKey]: value },
      },
    }))
  }

  // ── Teacher management ───────────────────────────────────────────────────
  function updateTeacher(idx, field, value) {
    setState(s => ({
      ...s,
      teachers: s.teachers.map((t, i) => i === idx ? { ...t, [field]: value } : t),
    }))
  }

  function toggleTeacherClass(idx, cls, enabled) {
    setState(s => ({
      ...s,
      teachers: s.teachers.map((t, i) => {
        if (i !== idx) return t
        const set = new Set(enabled ? [...t.classes, cls] : t.classes.filter(c => c !== cls))
        return { ...t, classes: s.allClasses.filter(c => set.has(c)) }
      }),
    }))
  }

  function addTeacher() {
    setState(s => ({
      ...s,
      teachers: [...s.teachers, { name: '新しい先生', remote: false, skipMeeting: false, defaultStatus: 'no', classes: [] }],
    }))
    setTimeout(() => newTeacherRef.current?.focus(), 50)
  }

  function deleteTeacher(idx) {
    setState(s => ({ ...s, teachers: s.teachers.filter((_, i) => i !== idx) }))
  }

  function moveTeacher(idx, dir) {
    setState(s => {
      const arr = [...s.teachers]
      const swap = idx + dir
      if (swap < 0 || swap >= arr.length) return s
      ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
      return { ...s, teachers: arr }
    })
  }

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Waon Rotation</p>
        <h1>出席を入れると自動で担当を決めるサイト</h1>
        <p className="lead">月を選んで各回のタイプを設定し、出欠を入力してください。保存は自動です。</p>
      </section>

      {/* ── 0. 月を選ぶ ──────────────────────────────────────────────────── */}
      <section className="panel">
        <h2 className="panel-title">0. 月を選ぶ</h2>
        <div className="month-nav">
          <div className="month-field">
            <label className="month-field-label">年</label>
            <input
              type="number"
              className="year-input"
              value={year}
              min={2020}
              max={2040}
              onChange={e => { const v = parseInt(e.target.value); if (v >= 2020 && v <= 2040) setYear(v) }}
            />
          </div>
          <div className="month-field">
            <label className="month-field-label">月</label>
            <select className="month-select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTH_JP.map((label, i) => (
                <option key={i} value={i + 1}>{label}</option>
              ))}
            </select>
          </div>
          <span className="month-display-text">{year}年 {MONTH_JP[month - 1]}</span>
        </div>
      </section>

      {/* ── 1. 各回の設定 ─────────────────────────────────────────────────── */}
      <section className="panel">
        <button
          type="button"
          className="collapse-header"
          onClick={() => setSessionOpen(o => !o)}
          aria-expanded={sessionOpen}
        >
          <span>1. 各回の設定</span>
          <span className="collapse-icon">{sessionOpen ? '▲' : '▼'}</span>
        </button>
        {!sessionOpen && (
          <p className="collapse-hint">
            {sessions.length === 0
              ? 'この月に土曜日がありません'
              : sessions.map(s => {
                  const type = sessionTypesByMonth[monthKey]?.[s.key] ?? 'normal'
                  const icon = type === 'holiday' ? 'やすみ' : type === 'meeting' ? '総会' : '正常'
                  return `${s.label}(${icon})`
                }).join(' · ')}
          </p>
        )}
        {sessionOpen && (sessions.length === 0 ? (
          <p className="empty-msg">この月に土曜日がありません。</p>
        ) : (
          <div className="session-list">
            {sessions.map((session, i) => {
              const type    = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'
              const classes = getSessionClasses(session)
              const isOverridden = !!sessionClassesByMonth[monthKey]?.[session.key]
              const isWangWeek   = session.weekIndex % 2 === 1

              return (
                <div key={session.key} className={`session-row session-row-${type}`}>
                  <div className="session-row-top">
                    <div className="session-date-info">
                      <strong className="session-date">{session.label}</strong>
                      <span className="session-week">
                        {session.closed ? 'やすみ' : `${i + 1}週目${isWangWeek ? '（王週）' : ''}`}
                      </span>
                    </div>
                    <select
                      className="session-type-select"
                      value={type}
                      onChange={e => setSessionType(session.key, e.target.value)}
                    >
                      {sessionTypeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {!session.closed && (
                    <div className="session-class-area">
                      <div className="session-class-header">
                        <span className="session-class-label">開講クラス</span>
                        {isOverridden && (
                          <button type="button" className="reset-btn" onClick={() => resetSessionClasses(session.key)}>
                            自動に戻す
                          </button>
                        )}
                      </div>
                      <div className="session-class-chips">
                        {allClasses.map(cls => (
                          <ClassChip
                            key={cls}
                            label={cls}
                            checked={classes.includes(cls)}
                            onChange={e => toggleSessionClass(session, cls, e.target.checked)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </section>

      {/* ── 2. 特殊設定 ───────────────────────────────────────────────────── */}
      <section className="panel">
        <button
          type="button"
          className="collapse-header"
          onClick={() => setSpecialOpen(o => !o)}
          aria-expanded={specialOpen}
        >
          <span>2. 特殊設定</span>
          <span className="collapse-icon">{specialOpen ? '▲' : '▼'}</span>
        </button>
        {!specialOpen && (
          <p className="collapse-hint">
            王さんルール: {specialRules.wangSplit !== false ? 'ON' : 'OFF'}
          </p>
        )}
        {specialOpen && (
          <div className="special-rules-list">
            <div className="special-rule-row">
              <div className="special-rule-info">
                <strong>王さんルール（入門自動分割）</strong>
                <p>
                  奇数週（1・3・5週目）に「入門(denji)」と「入門(王)」の両方がクラス一覧に存在する場合、
                  各回のデフォルトクラスで自動的に入門を2クラスに分割します。
                  各回の設定で手動上書きも可能です。
                </p>
              </div>
              <label className="toggle-label" title="王さんルールのON/OFF">
                <input
                  type="checkbox"
                  checked={specialRules.wangSplit !== false}
                  onChange={e => setSpecialRule('wangSplit', e.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-text">
                  {specialRules.wangSplit !== false ? 'ON' : 'OFF'}
                </span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. クラス・ステータスの設定 ───────────────────────────────────── */}
      <section className="panel">
        <button
          type="button"
          className="collapse-header"
          onClick={() => setSettingsOpen(o => !o)}
          aria-expanded={settingsOpen}
        >
          <span>3. クラス・ステータスの設定</span>
          <span className="collapse-icon">{settingsOpen ? '▲' : '▼'}</span>
        </button>
        {!settingsOpen && (
          <p className="collapse-hint">
            クラス: {allClasses.join(' · ')}　／　ステータス: {statusOptions.map(o => o.label).join(' · ')}
          </p>
        )}

        {settingsOpen && (
          <div className="settings-sections">

            {/* ── クラス設定 ── */}
            <div className="settings-section">
              <h3 className="settings-section-title">クラス一覧</h3>
              <p className="panel-desc">クラス名の追加・削除・リネームができます。先生の担当設定や各回のクラス設定に自動反映されます。</p>

              <div className="settings-sub-label">デフォルト開講クラス（各回の初期状態）</div>
              <div className="class-chip-row">
                {allClasses.map(cls => (
                  <ClassChip
                    key={cls}
                    label={cls}
                    checked={defaultClasses.includes(cls)}
                    onChange={e => toggleDefaultClass(cls, e.target.checked)}
                  />
                ))}
              </div>

              <div className="settings-sub-label" style={{ marginTop: 14 }}>クラス名の編集</div>
              <div className="edit-list">
                {allClasses.map((cls, idx) => (
                  <div key={idx} className="edit-row">
                    <input
                      className="edit-input"
                      value={cls}
                      ref={idx === allClasses.length - 1 ? newClassRef : null}
                      onChange={e => renameGlobalClass(idx, e.target.value)}
                    />
                    <button type="button" className="icon-btn danger" onClick={() => deleteGlobalClass(idx)}>×</button>
                  </div>
                ))}
              </div>
              <button type="button" className="add-item-btn" style={{ marginTop: 10 }} onClick={addGlobalClass}>
                + クラスを追加
              </button>
            </div>

            <div className="settings-divider" />

            {/* ── ステータス設定 ── */}
            <div className="settings-section">
              <h3 className="settings-section-title">出欠ステータス</h3>
              <p className="panel-desc">
                各先生が選べる出欠ステータスを管理します。「動作」はスケジュール計算に使われるルールです。ラベルは自由に変更できます。
              </p>

              <div className="status-edit-list">
                {statusOptions.map((opt, idx) => {
                  const isBuiltIn = ['yes', 'maybe', 'no', 'meeting_only'].includes(opt.id)
                  return (
                    <div key={opt.id} className="status-edit-row">
                      {isBuiltIn ? (
                        <span className="status-label-fixed">{opt.label}</span>
                      ) : (
                        <input
                          className="edit-input status-label-input"
                          value={opt.label}
                          ref={idx === statusOptions.length - 1 ? newStatusRef : null}
                          onChange={e => updateStatusOption(idx, 'label', e.target.value)}
                          placeholder="表示名"
                        />
                      )}
                      <select
                        className="status-behavior-select"
                        value={opt.behavior}
                        onChange={e => updateStatusOption(idx, 'behavior', e.target.value)}
                        disabled={isBuiltIn}
                      >
                        {BEHAVIORS.map(b => (
                          <option key={b.value} value={b.value}>{b.label}</option>
                        ))}
                      </select>
                      {!isBuiltIn && (
                        <button type="button" className="icon-btn danger" onClick={() => deleteStatusOption(idx)}>×</button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button type="button" className="add-item-btn" style={{ marginTop: 10 }} onClick={addStatusOption}>
                + ステータスを追加
              </button>
            </div>

          </div>
        )}
      </section>

      {/* ── 3. 先生の設定 ─────────────────────────────────────────────────── */}
      <section className="panel">
        <button
          type="button"
          className="collapse-header"
          onClick={() => setTeacherOpen(o => !o)}
          aria-expanded={teacherOpen}
        >
          <span>4. 先生の設定</span>
          <span className="collapse-icon">{teacherOpen ? '▲' : '▼'}</span>
        </button>
        {!teacherOpen && (
          <p className="collapse-hint">{teachers.map(t => t.name).join(' · ')}</p>
        )}

        {teacherOpen && (
          <>
            <p className="panel-desc">先生の追加・削除・担当クラス・デフォルト出欠を編集できます。</p>
            <div className="teacher-list">
              {teachers.map((teacher, idx) => (
                <div key={idx} className="teacher-card">
                  {/* Name + actions */}
                  <div className="teacher-card-header">
                    <input
                      className="teacher-name-input"
                      value={teacher.name}
                      ref={idx === teachers.length - 1 ? newTeacherRef : null}
                      onChange={e => updateTeacher(idx, 'name', e.target.value)}
                    />
                    <div className="teacher-card-actions">
                      <button type="button" className="icon-btn" disabled={idx === 0} onClick={() => moveTeacher(idx, -1)}>↑</button>
                      <button type="button" className="icon-btn" disabled={idx === teachers.length - 1} onClick={() => moveTeacher(idx, 1)}>↓</button>
                      <button type="button" className="icon-btn danger" onClick={() => deleteTeacher(idx)}>×</button>
                    </div>
                  </div>

                  {/* Flags + default status */}
                  <div className="teacher-meta-row">
                    <label className="flag-label">
                      <input type="checkbox" checked={!!teacher.remote} onChange={e => updateTeacher(idx, 'remote', e.target.checked)} />
                      <span>遠方</span>
                    </label>
                    <label className="flag-label">
                      <input type="checkbox" checked={!!teacher.skipMeeting} onChange={e => updateTeacher(idx, 'skipMeeting', e.target.checked)} />
                      <span>総会のみ</span>
                    </label>
                    <label className="default-status-label">
                      <span>デフォルト出欠</span>
                      <select
                        className="default-status-select"
                        value={teacher.defaultStatus ?? 'no'}
                        onChange={e => updateTeacher(idx, 'defaultStatus', e.target.value)}
                      >
                        {statusOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Class chips */}
                  <div className="teacher-classes">
                    {allClasses.map(cls => (
                      <ClassChip
                        key={cls}
                        label={cls}
                        checked={teacher.classes.includes(cls)}
                        onChange={e => toggleTeacherClass(idx, cls, e.target.checked)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="add-item-btn" onClick={addTeacher}>
              + 先生を追加
            </button>
          </>
        )}
      </section>

      {/* ── 4. 出席を入力 ─────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>5. 出席を入力</h2>
            <p>名前を選んで各回の状態を設定してください。未設定の回はデフォルト出欠が適用されます。</p>
          </div>
        </div>
        <div className="chip-row">
          {teachers.map(t => (
            <button
              key={t.name}
              type="button"
              className={t.name === currentTeacher ? 'chip active' : 'chip'}
              onClick={() => handleSelectTeacher(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <p className="selected-label">{currentTeacher} さんの出席</p>
        <div className="session-grid">
          {sessions.map(session => {
            const type = sessionTypesByMonth[monthKey]?.[session.key] ?? 'normal'
            const effectiveStatus = getEffectiveStatus(currentTeacher, session.key)
            const isExplicit = attendance[currentTeacher]?.[session.key] !== undefined

            return (
              <div key={session.key} className={`session-card session-card-${type}`}>
                <div className="session-card-info">
                  <strong>{session.label}</strong>
                  <span className="session-week">
                    {session.closed ? 'やすみ' : session.meeting ? '総会' : `${session.weekIndex}週目`}
                  </span>
                  {!isExplicit && !session.closed && (
                    <span className="default-badge">デフォルト</span>
                  )}
                </div>
                <select
                  value={effectiveStatus}
                  onChange={e => handleStatusChange(session.key, e.target.value)}
                  disabled={session.closed}
                  className={!isExplicit ? 'select-default' : ''}
                >
                  {statusOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 5. 自動担当表 ─────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>6. 自動で決まった担当</h2>
            <p>△ は人数不足のときだけ追加。赤は未担当クラスです。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="col-sticky col-head">名前</th>
                {sessions.map(s => (
                  <th key={s.key} className={s.closed ? 'th-holiday' : s.meeting ? 'th-meeting' : ''}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="col-sticky td-label">特別連絡</td>
                {schedule.map(s => (
                  <td key={s.key} className={s.closed ? 'td-holiday' : ''}>{s.special || ''}</td>
                ))}
              </tr>
              {schedule.some(s => s.unassignedClasses?.length > 0) && (
                <tr>
                  <td className="col-sticky td-label td-unassigned-label">未担当</td>
                  {schedule.map(s => (
                    <td key={s.key} className={s.unassignedClasses?.length > 0 ? 'td-unassigned' : s.closed ? 'td-holiday' : ''}>
                      {s.unassignedClasses?.join('、') || ''}
                    </td>
                  ))}
                </tr>
              )}
              {teachers.map(teacher => (
                <tr key={teacher.name}>
                  <td className="col-sticky td-label">{teacher.name}</td>
                  {schedule.map(s => {
                    const assigned = Object.entries(s.assignments)
                      .filter(([, t]) => t === teacher.name)
                      .map(([cls]) => cls).join(' / ')
                    return <td key={s.key} className={s.closed ? 'td-holiday' : ''}>{assigned}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 6. メモ ───────────────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>7. メモ</h2>
            <p>自動判断の理由と自由メモを確認・編集できます。</p>
          </div>
        </div>
        <div className="memo-list">
          {schedule.map(s => (
            <article key={s.key} className={`memo-card ${s.closed ? 'memo-holiday' : s.meeting ? 'memo-meeting' : ''}`}>
              <h3>{s.label}</h3>
              {s.closed ? <p className="memo-auto">わをん休み</p> : (
                <>
                  <p className="memo-auto">来る人: {s.selectedTeachers.join('、') || 'なし'}</p>
                  <p className="memo-auto">総会のみ: {s.meetingOnlyTeachers.join('、') || 'なし'}</p>
                  {s.selectedMaybeTeachers.length > 0 && (
                    <p className="memo-auto">△から追加: {s.selectedMaybeTeachers.join('、')}</p>
                  )}
                  {s.unassignedClasses?.length > 0 && (
                    <p className="memo-warn">⚠ 未担当: {s.unassignedClasses.join('、')}</p>
                  )}
                  {s.notes.map(note => <p key={note} className="memo-auto">{note}</p>)}
                </>
              )}
              <label className="memo-label">
                メモ
                <textarea
                  className="memo-textarea"
                  value={memos[s.key] ?? ''}
                  onChange={e => setMemo(s.key, e.target.value)}
                  placeholder="自由に書き込めます…"
                  rows={3}
                />
              </label>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
