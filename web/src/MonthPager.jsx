import React from 'react'
import { stepMonth } from './plannerView'

export default function MonthPager({ year, month, onChange }) {
  const value = year + '-' + String(month).padStart(2, '0')
  return <div className="month-pager" role="group" aria-label="表示する年月">
    <button type="button" aria-label="前の月" disabled={value === '2020-01'} onClick={() => onChange(stepMonth(year, month, -1))}>‹</button>
    <details>
      <summary aria-label={year + '年' + month + '月、年月を選択'}>{year}年{month}月</summary>
      <div className="month-pop">
        <input type="month" aria-label="年月を指定" min="2020-01" max="2040-12" value={value} onChange={e => {
          if (!e.target.value || !e.target.validity.valid) return
          const [y, m] = e.target.value.split('-').map(Number)
          e.target.closest('details').open = false
          onChange({ year: y, month: m })
        }} />
        <button type="button" onClick={e => {
          e.currentTarget.closest('details').open = false
          const now = new Date()
          onChange({ year: now.getFullYear(), month: now.getMonth() + 1 })
        }}>今月</button>
      </div>
    </details>
    <button type="button" aria-label="次の月" disabled={value === '2040-12'} onClick={() => onChange(stepMonth(year, month, 1))}>›</button>
  </div>
}
