const EXPLICIT_LESSON_MARKER = /^(?:(?:\d{1,3}|[０-９]{1,3})\s*(?:[.)．、:：]|\s)|(?:\(\s*(?:\d{1,3}|[０-９]{1,3})\s*\)|（\s*(?:\d{1,3}|[０-９]{1,3})\s*）)|[①-⑳㉑-㉟㊱-㊿]|[一二三四五六七八九十百]+\s*[.)．、]|[・●◯○◎◇◆□■△▲▽▼※＊*•‣⁃]\s*|[-－—–]\s+)/

function cleanLessonLine(value) {
  return String(value ?? '').replace(/\*\*/g, '').trim()
}

export function hasExplicitLessonMarker(value) {
  return EXPLICIT_LESSON_MARKER.test(cleanLessonLine(value))
}

function lessonLines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map(cleanLessonLine)
    .filter(Boolean)
}

export function formatLessonContentLines(value) {
  return lessonLines(value).map((text, index) => ({
    text,
    explicit: hasExplicitLessonMarker(text),
    display: hasExplicitLessonMarker(text) ? text : `${index + 1}.  ${text}`,
  }))
}

export function formatLessonHandoffLines(value) {
  return lessonLines(value).map((text) => ({
    text,
    explicit: hasExplicitLessonMarker(text),
    display: hasExplicitLessonMarker(text) ? text : `●  ${text}`,
  }))
}
