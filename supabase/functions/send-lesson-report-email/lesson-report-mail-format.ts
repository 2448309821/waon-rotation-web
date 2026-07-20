const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type LessonReportState = {
  teachers?: Array<{ name?: string }>
  lessonReportsByMonth?: Record<string, Record<string, Record<string, unknown>>>
  archivedSchedules?: Record<string, { markdown?: string }>
}

export type LessonReport = {
  id: string
  monthKey: string
  sessionKey: string
  dateText: string
  mailDateText: string
  className: string
  teacherName: string
  attendees: string
  attendeeCount: string
  unit: string
  content: string
  handoff: string
  updatedAt: string
}

export type LessonReportMailPackage = {
  subject: string
  text: string
  html: string
  attachment: { filename: string; mimeType: string; base64: string }
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseMarkdownRow(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function findAssignedTeacher(markdown: string, sessionKey: string, className: string) {
  const rows = String(markdown || '').split(/\r?\n/)
    .filter((line) => /^\s*\|.*\|\s*$/.test(line))
    .map(parseMarkdownRow)
    .filter((cells) => !isSeparatorRow(cells))
  const dateColumn = rows[0]?.findIndex((cell) => cell === sessionKey) ?? -1
  if (dateColumn < 1) return ''
  for (const row of rows.slice(1)) {
    if (!row[0] || ['特別連絡', '未担当', '区分'].includes(row[0])) continue
    const assigned = row[dateColumn] || ''
    if (assigned === className || assigned.split(/[\s/、・]+/).includes(className)) return row[0]
  }
  return ''
}

function countLessonAttendees(value: unknown) {
  const text = String(value ?? '').trim()
  const explicit = text.match(/計\s*[（(]?\s*(\d+)\s*[）)]?\s*名?/)
  if (explicit) return explicit[1]
  const cleaned = text.replace(/出席者/g, '').replace(/計\s*[（(]?\s*\d+\s*[）)]?\s*名?/g, '').trim()
  return cleaned ? String(cleaned.split(/[、,\s　]+/).filter(Boolean).length) : ''
}

function canonicalDate(year: number, month: number, sessionKey: string) {
  const day = Number(sessionKey.split('/')[1])
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('invalid_report_id')
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('invalid_report_id')
  }
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
  return { dateText: `${month}/${day}（${weekday}）`, mailDateText: `${month}月${day}日`, day }
}

export function resolveLessonReport(state: LessonReportState, monthKey: string, reportId: string): LessonReport {
  const monthMatch = /^(\d{4})-(\d{1,2})$/.exec(monthKey)
  const separator = reportId.indexOf('__')
  if (!monthMatch || separator < 1) throw new Error('invalid_report_id')
  const year = Number(monthMatch[1])
  const month = Number(monthMatch[2])
  const sessionKey = reportId.slice(0, separator)
  const idClassName = reportId.slice(separator + 2).trim()
  if (!/^\d{1,2}\/\d{1,2}$/.test(sessionKey) || !idClassName || idClassName.length > 40) throw new Error('invalid_report_id')
  const raw = state.lessonReportsByMonth?.[monthKey]?.[reportId]
  if (!raw || typeof raw !== 'object') throw new Error('report_not_saved')
  const className = String(raw.className || idClassName).trim()
  const archive = String(state.archivedSchedules?.[monthKey]?.markdown || '')
  const teacherName = String(raw.teacherName || findAssignedTeacher(archive, sessionKey, className)).trim()
  const teacherNames = new Set((Array.isArray(state.teachers) ? state.teachers : []).map((teacher) => String(teacher?.name || '')))
  if (!teacherName || !teacherNames.has(teacherName)) throw new Error('report_teacher_unavailable')
  const content = String(raw.content || '').trim()
  const unit = String(raw.unit || '').trim()
  const handoff = String(raw.handoff || '').trim()
  const updatedAt = String(raw.updatedAt || '').trim()
  if (!updatedAt || !Number.isFinite(new Date(updatedAt).getTime()) || !content || !unit || !handoff) throw new Error('report_incomplete')
  const attendees = String(raw.attendees || '').trim()
  const attendeeCount = String(raw.attendeeCount || '').trim() || countLessonAttendees(attendees)
  const { dateText, mailDateText } = canonicalDate(year, month, sessionKey)
  return {
    id: reportId,
    monthKey,
    sessionKey,
    dateText,
    mailDateText,
    className,
    teacherName,
    attendees,
    attendeeCount,
    unit,
    content,
    handoff,
    updatedAt,
  }
}

function wordRun(text: string, { bold = false, size = 24 } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Meiryo" w:hAnsi="Meiryo" w:eastAsia="Meiryo" w:cs="Meiryo"/><w:sz w:val="${size}"/>${bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
}

function wordParagraph(text: string, { bold = false, size = 24, align = 'left', after = 0, line = 240 } = {}) {
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="${after}" w:line="${line}" w:lineRule="auto"/></w:pPr>${wordRun(text, { bold, size })}</w:p>`
}

function contentParagraphs(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.map((line, index) => wordParagraph(`${index + 1}.  ${line.replace(/^\d+[.)．、]\s*/, '').replace(/\*\*/g, '')}`, {
    bold: true,
    size: 24,
  })).join('')
}

function handoffParagraphs(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => wordParagraph(`●  ${line.replace(/^●\s*/, '').replace(/\*\*/g, '')}`, { bold: true, size: 24 }))
    .join('')
}

const TABLE_WIDTH = 10092
const COL_WIDTHS = [2665, 3458, 3969]

function wordCell(content: string, { span = 1, width = TABLE_WIDTH, padTop = 80, padBottom = 80, padLeft = 100, padRight = 100 } = {}) {
  const gridSpan = span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan}<w:tcMar><w:top w:w="${padTop}" w:type="dxa"/><w:left w:w="${padLeft}" w:type="dxa"/><w:bottom w:w="${padBottom}" w:type="dxa"/><w:right w:w="${padRight}" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`
}

function wordRow(cells: string) {
  return `<w:tr>${cells}</w:tr>`
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
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let outputOffset = 0
  for (const chunk of chunks) {
    output.set(chunk, outputOffset)
    outputOffset += chunk.length
  }
  return output
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function buildLessonReportDocx(report: LessonReport) {
  const pageMargin = 907
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
<w:tbl><w:tblPr><w:tblW w:w="${TABLE_WIDTH}" w:type="dxa"/><w:jc w:val="left"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="555555"/><w:left w:val="single" w:sz="4" w:color="555555"/><w:bottom w:val="single" w:sz="4" w:color="555555"/><w:right w:val="single" w:sz="4" w:color="555555"/><w:insideH w:val="single" w:sz="4" w:color="555555"/><w:insideV w:val="single" w:sz="4" w:color="555555"/></w:tblBorders></w:tblPr>
<w:tblGrid>${COL_WIDTHS.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>
${wordRow(`${wordCell(wordParagraph(report.dateText), { width: COL_WIDTHS[0] })}${wordCell(wordParagraph(`クラス　　${report.className}`), { width: COL_WIDTHS[1] })}${wordCell(wordParagraph(`担当　　${report.teacherName}`), { width: COL_WIDTHS[2] })}`)}
${wordRow(wordCell(wordParagraph(`出席者　　${report.attendees}　計(${report.attendeeCount})名`), { span: 3, width: TABLE_WIDTH }))}
${wordRow(wordCell(report.unit.split(/\r?\n/).map((line) => wordParagraph(`単元　${line}`)).join(''), { span: 3, width: TABLE_WIDTH }))}
${wordRow(wordCell(contentParagraphs(report.content), { span: 3, width: TABLE_WIDTH }))}
${wordRow(wordCell(`${wordParagraph('申し送り及び感想：', { bold: true })}${handoffParagraphs(report.handoff)}`, { span: 3, width: TABLE_WIDTH }))}
</w:tbl>
<w:sectPr><w:footerReference w:type="default" r:id="rId1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${pageMargin}" w:right="${pageMargin}" w:bottom="${pageMargin}" w:left="${pageMargin}" w:header="720" w:footer="720"/></w:sectPr>
</w:body></w:document>`
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${wordParagraph('日本語ボランティアグループ　　わをん', { align: 'right' })}</w:ftr>`
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>' },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/footer1.xml', data: footerXml },
  ])
}

function mailBody(report: LessonReport) {
  return [
    'わをんの皆さま',
    '',
    'お疲れさまです。',
    `${report.mailDateText}の${report.className}クラスの授業報告をお送りします。`,
    `担当は${report.teacherName}です。`,
    '添付のWordファイルをご確認ください。',
    '',
    'よろしくお願いいたします。',
    report.teacherName,
  ].join('\n')
}

function mailHtml(report: LessonReport) {
  return `<!doctype html><html lang="ja"><body style="margin:0;padding:24px;font-family:Meiryo,'Yu Gothic',sans-serif;color:#142826;font-size:15px;line-height:1.8;">` +
    `<p style="margin:0 0 18px;">わをんの皆さま</p>` +
    `<p style="margin:0 0 18px;">お疲れさまです。<br>${escapeHtml(report.mailDateText)}の${escapeHtml(report.className)}クラスの授業報告をお送りします。<br>担当は${escapeHtml(report.teacherName)}です。<br>添付のWordファイルをご確認ください。</p>` +
    `<p style="margin:0;">よろしくお願いいたします。<br>${escapeHtml(report.teacherName)}</p>` +
    `</body></html>`
}

export function buildLessonReportMailPackage(report: LessonReport): LessonReportMailPackage {
  const safeClassName = report.className.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
  const docx = buildLessonReportDocx(report)
  return {
    subject: `【授業報告】${report.mailDateText} ${report.className}クラス`,
    text: mailBody(report),
    html: mailHtml(report),
    attachment: {
      filename: `${report.mailDateText}_${safeClassName}_授業記録.docx`,
      mimeType: DOCX_MIME,
      base64: bytesToBase64(docx),
    },
  }
}
