export type PdfAttachment = {
  filename: string
  mimeType: 'application/pdf'
  base64: string
}

const MAX_PDF_BYTES = 8_000_000
const MAX_PDF_BASE64_LENGTH = 10_700_000

function decodeBase64(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('invalid_pdf_attachment')
  }
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    throw new Error('invalid_pdf_attachment')
  }
}

export function validatePdfAttachment(base64Value: unknown, filenameValue: unknown, expectedFilename: string): PdfAttachment {
  const base64 = String(base64Value || '').trim()
  const filename = String(filenameValue || '').trim()
  if (filename !== expectedFilename || !base64 || base64.length > MAX_PDF_BASE64_LENGTH) {
    throw new Error('invalid_pdf_attachment')
  }
  const bytes = decodeBase64(base64)
  if (bytes.length < 500 || bytes.length > MAX_PDF_BYTES) throw new Error('invalid_pdf_attachment')
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 5))
  const tail = new TextDecoder('ascii').decode(bytes.subarray(Math.max(0, bytes.length - 2048)))
  if (header !== '%PDF-' || !tail.includes('%%EOF')) throw new Error('invalid_pdf_attachment')
  return { filename, mimeType: 'application/pdf', base64 }
}
