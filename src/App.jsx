import { useEffect, useState } from 'react'
import { buildSchedule, sessions, statusOptions, teacherOrder } from './schedule'

const STORAGE_KEY = 'rotation-web-state-v1'

function createEmptyAttendance() {
  return Object.fromEntries(
    teacherOrder.map((teacher) => [
      teacher,
      Object.fromEntries(sessions.map((session) => [session.key, session.closed ? 'no' : 'no'])),
    ]),
  )
}

function loadState() {
  const fallback = {
    currentTeacher: teacherOrder[0],
    attendance: createEmptyAttendance(),
  }
  if (typeof window === 'undefined' || !window.localStorage) return fallback
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return {
      currentTeacher: parsed.currentTeacher ?? fallback.currentTeacher,
      attendance: { ...fallback.attendance, ...(parsed.attendance ?? {}) },
    }
  } catch {
    return fallback
  }
}

export default function App() {
  const [state, setState] = useState(() => ({
    currentTeacher: teacherOrder[0],
    attendance: createEmptyAttendance(),
  }))
  const [nameInput, setNameInput] = useState(teacherOrder[0])
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    try {
      const loaded = loadState()
      setState(loaded)
      setNameInput(loaded.currentTeacher)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'データの読み込みに失敗しました。')
    }
  }, [])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : '保存に失敗しました。')
    }
  }, [state])

  let schedule = []
  try {
    schedule = buildSchedule(state.attendance)
  } catch (error) {
    schedule = []
    console.error(error)
  }

  function handleSelectTeacher(name) {
    if (!teacherOrder.includes(name)) return
    setNameInput(name)
    setState((current) => ({ ...current, currentTeacher: name }))
  }

  function handleStatusChange(sessionKey, value) {
    setState((current) => ({
      ...current,
      attendance: {
        ...current.attendance,
        [current.currentTeacher]: {
          ...current.attendance[current.currentTeacher],
          [sessionKey]: value,
        },
      },
    }))
  }

  const currentAttendance = state.attendance[state.currentTeacher] ?? {}

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Waon Rotation</p>
          <h1>出席を入れると自動で担当を決めるサイト</h1>
          <p className="lead">
            先に名前を選んで、自分の `○ / △ / × / 総会のみ` を入れてください。保存は自動です。
          </p>
        </div>
      </section>

      {pageError ? (
        <section className="panel error-panel">
          <strong>エラー</strong>
          <p>{pageError}</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>1. 名前を入力</h2>
            <p>全員分を順番に入力できます。</p>
          </div>
          <div className="teacher-picker">
            <input
              list="teachers"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="名前を入力"
            />
            <datalist id="teachers">
              {teacherOrder.map((teacher) => (
                <option key={teacher} value={teacher} />
              ))}
            </datalist>
            <button type="button" onClick={() => handleSelectTeacher(nameInput)}>
              開く
            </button>
          </div>
        </div>

        <div className="chip-row">
          {teacherOrder.map((teacher) => (
            <button
              key={teacher}
              type="button"
              className={teacher === state.currentTeacher ? 'chip active' : 'chip'}
              onClick={() => handleSelectTeacher(teacher)}
            >
              {teacher}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>2. {state.currentTeacher} さんの出席</h2>
            <p>各回ごとの状態を選んでください。</p>
          </div>
        </div>
        <div className="attendance-grid">
          {sessions.map((session) => (
            <div key={session.key} className="attendance-card">
              <div>
                <strong>{session.label}</strong>
                <p>
                  {session.closed ? '休み' : session.meeting ? '総会あり' : `${session.weekIndex}週目`}
                </p>
              </div>
              <select
                value={currentAttendance[session.key] ?? 'no'}
                onChange={(event) => handleStatusChange(session.key, event.target.value)}
                disabled={session.closed}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>3. 自動で決まった担当</h2>
            <p>△ は人数不足のときだけ追加されます。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名前</th>
                {sessions.map((session) => (
                  <th key={session.key}>{session.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>特別連絡</td>
                {schedule.map((session) => (
                  <td key={session.key}>{session.special || ''}</td>
                ))}
              </tr>
              {teacherOrder.map((teacher) => (
                <tr key={teacher}>
                  <td>{teacher}</td>
                  {schedule.map((session) => {
                    const assigned = Object.entries(session.assignments)
                      .filter(([, assignedTeacher]) => assignedTeacher === teacher)
                      .map(([className]) => className)
                      .join(' / ')
                    return <td key={session.key}>{assigned}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>4. 当日メモ</h2>
            <p>各日の自動判断理由です。</p>
          </div>
        </div>
        <div className="memo-list">
          {schedule.map((session) => (
            <article key={session.key} className="memo-card">
              <h3>{session.label}</h3>
              <p>来る人: {session.selectedTeachers.join('、') || 'なし'}</p>
              <p>総会のみ: {session.meetingOnlyTeachers.join('、') || 'なし'}</p>
              <p>△から追加: {session.selectedMaybeTeachers.join('、') || 'なし'}</p>
              {session.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
