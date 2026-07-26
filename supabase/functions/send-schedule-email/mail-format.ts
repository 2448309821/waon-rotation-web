type ParsedSchedule = {
  title: string
  headers: string[]
  rows: string[][]
  notes: string[]
}

type MailAttachment = {
  filename: string
  mimeType: string
  base64: string
}

export type ScheduleMailPackage = {
  text: string
  html: string
  attachments: MailAttachment[]
}

type ScheduleStateForMail = {
  teachers?: Array<{ name?: string; defaultStatus?: string }>
  statusOptions?: Array<{ id?: string; behavior?: string }>
  attendanceByMonth?: Record<string, Record<string, Record<string, string>>>
  sessionTypesByMonth?: Record<string, Record<string, string>>
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function parseMarkdownRow(line: string) {
  const content = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return content.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

export function parseScheduleMarkdown(markdown: string): ParsedSchedule {
  const lines = String(markdown || '').split(/\r?\n/)
  const title = lines.find((line) => /^#\s+/.test(line.trim()))?.trim().replace(/^#\s+/, '') || '担当表'
  const tableRows = lines
    .filter((line) => /^\s*\|.*\|\s*$/.test(line))
    .map(parseMarkdownRow)
    .filter((cells) => !isSeparatorRow(cells))
  if (tableRows.length < 2 || tableRows[0].length < 2) throw new Error('invalid_schedule_archive')

  const width = tableRows[0].length
  const normalize = (cells: string[]) => Array.from({ length: width }, (_, index) => cells[index] || '')
  const noteStart = lines.findIndex((line) => /^##\s+メモ/.test(line.trim()))
  const notes = noteStart >= 0
    ? lines.slice(noteStart + 1)
      .map((line) => line.trim().replace(/^[-*]\s*/, ''))
      .filter((note) => note && !/^\d{1,2}\/\d{1,2}:\s*$/.test(note))
    : []
  return {
    title,
    headers: normalize(tableRows[0]),
    rows: tableRows.slice(1).map(normalize),
    notes,
  }
}

function renderScheduleMarkdown(schedule: ParsedSchedule) {
  const lines = [
    `# ${schedule.title}`,
    '',
    `| ${schedule.headers.join(' | ')} |`,
    `| ${schedule.headers.map(() => '---').join(' | ')} |`,
    ...schedule.rows.map((row) => `| ${row.join(' | ')} |`),
  ]
  if (schedule.notes.length > 0) lines.push('', '## メモ', '', ...schedule.notes.map((note) => `- ${note}`))
  return lines.join('\n')
}

export function enrichScheduleMarkdown(markdown: string, state: ScheduleStateForMail, monthKey: string) {
  const schedule = parseScheduleMarkdown(markdown)
  const teachers = Array.isArray(state.teachers) ? state.teachers : []
  const teacherByName = new Map(teachers.map((teacher) => [String(teacher?.name || ''), teacher]))
  const behaviorByStatus = new Map([
    ['yes', 'yes'],
    ['maybe', 'maybe'],
    ['maybe_meeting', 'maybe_meeting'],
    ['no', 'no'],
    ['meeting_only', 'meeting_only'],
    ...(Array.isArray(state.statusOptions) ? state.statusOptions : []).map((option) => [String(option?.id || ''), String(option?.behavior || 'no')]),
  ])
  const attendance = state.attendanceByMonth?.[monthKey] || {}
  const sessionTypes = state.sessionTypesByMonth?.[monthKey] || {}
  const specialRow = schedule.rows.find((row) => row[0] === '特別連絡')

  const rows = schedule.rows.map((row) => {
    const teacher = teacherByName.get(row[0])
    if (!teacher) return row
    return row.map((cell, column) => {
      if (column === 0 || cell) return cell
      const sessionKey = schedule.headers[column]
      const closed = sessionTypes[sessionKey] === 'holiday' || /休み/.test(specialRow?.[column] || '')
      if (closed) return ''
      const statusId = attendance[row[0]]?.[sessionKey] ?? teacher.defaultStatus ?? 'no'
      const behavior = behaviorByStatus.get(statusId) || 'no'
      if (behavior === 'meeting_only' || behavior === 'maybe_meeting') return '会議'
      if (behavior === 'yes') return '○'
      if (behavior === 'maybe') return '△'
      return '×'
    })
  })
  return renderScheduleMarkdown({ ...schedule, rows })
}

function buildHtmlTable(schedule: ParsedSchedule) {
  const dateWidth = schedule.headers.length > 1 ? (82 / (schedule.headers.length - 1)).toFixed(3) : '82'
  const columns = schedule.headers.map((_, index) => `<col style="width:${index === 0 ? '18' : dateWidth}%;">`).join('')
  const headerCells = schedule.headers.map((cell, index) => (
    `<th style="border:1px solid #9eb7b3;padding:10px 7px;background:#236f69;color:#ffffff;font-size:14px;line-height:1.35;text-align:${index === 0 ? 'left' : 'center'};font-weight:700;">${escapeHtml(cell || (index === 0 ? '名前' : ''))}</th>`
  )).join('')
  const bodyRows = schedule.rows.map((row, rowIndex) => {
    const cells = row.map((cell, cellIndex) => {
      const first = cellIndex === 0
      const background = first ? '#edf5f3' : rowIndex % 2 === 0 ? '#ffffff' : '#f8faf9'
      return `<td style="border:1px solid #c7d6d3;padding:10px 7px;background:${background};color:#142826;font-size:14px;line-height:1.35;text-align:${first ? 'left' : 'center'};font-weight:${first ? '700' : '400'};vertical-align:middle;">${cell ? escapeHtml(cell) : '&nbsp;'}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `<table cellpadding="0" cellspacing="0" aria-label="${escapeHtml(schedule.title)}" style="width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;font-family:Meiryo,'Yu Gothic',sans-serif;">` +
    `<colgroup>${columns}</colgroup><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`
}

function buildPlainText(schedule: ParsedSchedule, year: number, month: number, senderName: string) {
  const lines = [
    `${year}年${month}月の確定担当表をお送りします。`,
    'PDF版とWord版を添付しています。',
    '',
  ]
  for (let column = 1; column < schedule.headers.length; column += 1) {
    lines.push(`【${schedule.headers[column]}】`)
    for (const row of schedule.rows) {
      if (row[column]) lines.push(`${row[0] || '連絡'}：${row[column]}`)
    }
    lines.push('')
  }
  if (schedule.notes.length > 0) {
    lines.push('【メモ】', ...schedule.notes, '')
  }
  lines.push('内容をご確認ください。', '', `連絡者：${senderName}`)
  return lines.join('\n')
}

function buildEmailHtml(schedule: ParsedSchedule, year: number, month: number, senderName: string) {
  const notes = schedule.notes.length > 0
    ? `<div style="margin-top:18px;padding:14px 16px;background:#f5f7f6;border-left:4px solid #79a9a3;"><strong style="display:block;margin-bottom:6px;">メモ</strong>${schedule.notes.map((note) => `<div style="margin-top:4px;">${escapeHtml(note)}</div>`).join('')}</div>`
    : ''
  return `<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f6f5;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${year}年${month}月の確定担当表です。</div>` +
    `<div style="box-sizing:border-box;width:100%;max-width:760px;margin:0 auto;padding:24px 12px;font-family:Meiryo,'Yu Gothic',sans-serif;color:#142826;">` +
    `<div style="box-sizing:border-box;width:100%;background:#ffffff;border:1px solid #d7e1df;border-radius:6px;padding:22px 18px;">` +
    `<div style="font-size:13px;color:#55706c;margin-bottom:6px;">Wawon Rotation</div>` +
    `<h1 style="margin:0 0 8px;font-size:23px;line-height:1.35;">${year}年${month}月 担当表</h1>` +
    `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;">${year}年${month}月の確定担当表をお送りします。PDF版とWord版を添付しています。</p>` +
    `<div style="width:100%;overflow-x:auto;">${buildHtmlTable(schedule)}</div>${notes}` +
    `<p style="margin:20px 0 0;font-size:13px;line-height:1.65;color:#55706c;">内容をご確認ください。<br>連絡者：${escapeHtml(senderName)}</p>` +
    `</div></div></body></html>`
}

function wordRun(text: string, { bold = false, size = 24, color = '172B29' } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Meiryo" w:hAnsi="Meiryo" w:eastAsia="Meiryo" w:cs="Meiryo"/><w:sz w:val="${size}"/><w:color w:val="${color}"/>${bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
}

function wordParagraph(text: string, { bold = false, size = 24, align = 'left', after = 0, color = '172B29' } = {}) {
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="${after}" w:line="280" w:lineRule="auto"/></w:pPr>${wordRun(text, { bold, size, color })}</w:p>`
}

function wordCell(text: string, width: number, { bold = false, align = 'center', fill = 'FFFFFF', color = '172B29' } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:vAlign w:val="center"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>${wordParagraph(text, { bold, size: 24, align, color })}</w:tc>`
}

function crc32(bytes: Uint8Array) {
  let crc = -1
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ -1) >>> 0
}

function u16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff]
}

function u32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function concatBytes(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function makeZip(files: Array<{ name: string; data: string | Uint8Array }>) {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Array<{ nameBytes: Uint8Array; data: Uint8Array; crc: number; offset: number }> = []
  const { time, day } = dosDateTime()
  let offset = 0
  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(data)
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(time), ...u16(day),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ])
    chunks.push(local, nameBytes, data)
    central.push({ nameBytes, data, crc, offset })
    offset += local.length + nameBytes.length + data.length
  }
  let centralSize = 0
  for (const entry of central) {
    const header = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(time), ...u16(day),
      ...u32(entry.crc), ...u32(entry.data.length), ...u32(entry.data.length), ...u16(entry.nameBytes.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(entry.offset),
    ])
    chunks.push(header, entry.nameBytes)
    centralSize += header.length + entry.nameBytes.length
  }
  chunks.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]))
  return concatBytes(chunks)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function buildScheduleDocx(schedule: ParsedSchedule, year: number, month: number) {
  const tableWidth = 9000
  const nameWidth = 1500
  const dayWidth = Math.floor((tableWidth - nameWidth) / Math.max(1, schedule.headers.length - 1))
  const widths = [nameWidth, ...schedule.headers.slice(1).map(() => dayWidth)]
  const tableRows = [schedule.headers, ...schedule.rows].map((row, rowIndex) => {
    const cells = row.map((cell, cellIndex) => wordCell(cell || (rowIndex === 0 && cellIndex === 0 ? '名前' : ''), widths[cellIndex], {
      bold: rowIndex === 0 || cellIndex === 0,
      align: cellIndex === 0 ? 'left' : 'center',
      fill: rowIndex === 0 ? '236F69' : cellIndex === 0 ? 'EDF5F3' : rowIndex % 2 === 0 ? 'F8FAF9' : 'FFFFFF',
      color: rowIndex === 0 ? 'FFFFFF' : '172B29',
    })).join('')
    return `<w:tr><w:trPr><w:cantSplit/>${rowIndex === 0 ? '<w:tblHeader/>' : ''}<w:trHeight w:val="480" w:hRule="atLeast"/></w:trPr>${cells}</w:tr>`
  }).join('')
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${wordParagraph(`${year}年${month}月 担当表`, { align: 'center', bold: true, size: 40, after: 240 })}
${wordParagraph('確定済みの担当表', { align: 'center', size: 22, after: 240, color: '55706C' })}
<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="9EB7B3"/><w:left w:val="single" w:sz="8" w:color="9EB7B3"/><w:bottom w:val="single" w:sz="8" w:color="9EB7B3"/><w:right w:val="single" w:sz="8" w:color="9EB7B3"/><w:insideH w:val="single" w:sz="8" w:color="C7D6D3"/><w:insideV w:val="single" w:sz="8" w:color="C7D6D3"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${tableRows}</w:tbl>
${wordParagraph('日本語ボランティアグループ　わをん', { align: 'right', size: 20, after: 0, color: '55706C' })}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1100" w:right="900" w:bottom="1100" w:left="900"/></w:sectPr>
</w:body></w:document>`
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: documentXml },
  ])
}

export function buildScheduleMailPackage(
  markdown: string,
  year: number,
  month: number,
  senderName: string,
  pdfBase64: string,
): ScheduleMailPackage {
  const schedule = parseScheduleMarkdown(markdown)
  return {
    text: buildPlainText(schedule, year, month, senderName),
    html: buildEmailHtml(schedule, year, month, senderName),
    attachments: [
      {
        filename: `${year}年${month}月_担当表.pdf`,
        mimeType: 'application/pdf',
        base64: pdfBase64,
      },
      {
        filename: `${year}年${month}月_担当表.docx`,
        mimeType: DOCX_MIME,
        base64: bytesToBase64(buildScheduleDocx(schedule, year, month)),
      },
    ],
  }
}
