const WEBHOOK_TOKEN_PROPERTY = 'WAWON_WEBHOOK_TOKEN';
const ALLOWED_RECIPIENTS_PROPERTY = 'WAWON_ALLOWED_RECIPIENTS';
const SENT_DISPATCH_KEYS_PROPERTY = 'WAWON_SENT_DISPATCH_KEYS';
const MAX_STORED_DISPATCH_KEYS = 60;

function doGet() {
  return json_({
    success: true,
    service: 'wawon-schedule-mail-webhook',
    tokenConfigured: !!getProperty_(WEBHOOK_TOKEN_PROPERTY),
    recipientCount: getAllowedRecipients_().length
  });
}

function doPost(e) {
  const payload = parsePayload_(e);
  const token = getProperty_(WEBHOOK_TOKEN_PROPERTY);
  const allowedRecipients = getAllowedRecipients_();
  if (!token || allowedRecipients.length < 2) return json_({ success: false, sent: false, error: 'webhook_not_configured' });
  if (!payload || payload.token !== token) return json_({ success: false, sent: false, error: 'invalid_token' });

  const recipients = normalizeEmailList_(payload.to);
  const excludedEmail = normalizeEmail_(payload.excludedEmail || payload.replyTo);
  const subject = String(payload.subject || '').trim().slice(0, 120);
  const text = String(payload.text || '').trim();
  const html = String(payload.html || '').trim();
  const attachments = buildAttachments_(payload.attachments);
  const dispatchKey = String(payload.dispatchKey || '').trim().toLowerCase();
  const expectedRecipients = allowedRecipients.filter(function (email) { return email !== excludedEmail; }).sort();
  const sortedRecipients = recipients.slice().sort();
  if (!excludedEmail || allowedRecipients.indexOf(excludedEmail) === -1) return json_({ success: false, sent: false, error: 'invalid_sender' });
  if (JSON.stringify(sortedRecipients) !== JSON.stringify(expectedRecipients)) return json_({ success: false, sent: false, error: 'invalid_recipients' });
  if (!subject || !text || !html) return json_({ success: false, sent: false, error: 'empty_mail' });
  if (text.length > 100000 || html.length > 250000) return json_({ success: false, sent: false, error: 'mail_too_large' });
  if (!attachments) return json_({ success: false, sent: false, error: 'invalid_attachments' });
  if (!/^[a-f0-9]{64}$/.test(dispatchKey)) return json_({ success: false, sent: false, error: 'invalid_dispatch_key' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sentKeys = getSentDispatchKeys_();
    if (sentKeys.some(function (entry) { return entry.key === dispatchKey; })) {
      return json_({ success: true, sent: true, duplicate: true });
    }

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: subject,
      body: text,
      htmlBody: html,
      attachments: attachments,
      name: 'Wawon Rotation'
    });
    sentKeys.unshift({ key: dispatchKey, sentAt: new Date().toISOString() });
    PropertiesService.getScriptProperties().setProperty(
      SENT_DISPATCH_KEYS_PROPERTY,
      JSON.stringify(sentKeys.slice(0, MAX_STORED_DISPATCH_KEYS))
    );
    return json_({ success: true, sent: true, duplicate: false });
  } finally {
    lock.releaseLock();
  }
}

function buildAttachments_(value) {
  if (!Array.isArray(value) || value.length !== 1) return null;
  try {
    const attachment = value[0] || {};
    const filename = String(attachment.filename || '').trim();
    const mimeType = String(attachment.mimeType || '').trim();
    const base64 = String(attachment.base64 || '').trim();
    const scheduleDocument = /^\d{4}年\d{1,2}月_担当表\.docx$/.test(filename);
    const lessonReportDocument = /^\d{1,2}月\d{1,2}日_[^\\/:*?"<>|]{1,40}_授業記録\.docx$/.test(filename);
    if (!scheduleDocument && !lessonReportDocument) return null;
    if (mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return null;
    if (!base64 || base64.length > 1500000) return null;
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length < 1000 || bytes.length > 1000000) return null;
    return [Utilities.newBlob(bytes, mimeType, filename)];
  } catch (error) {
    return null;
  }
}

function setupWawonMailWebhook(recipients) {
  const normalizedRecipients = normalizeEmailList_(recipients);
  if (normalizedRecipients.length < 2) throw new Error('at least two recipients are required');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperties({
    [WEBHOOK_TOKEN_PROPERTY]: token,
    [ALLOWED_RECIPIENTS_PROPERTY]: JSON.stringify(normalizedRecipients)
  });
  Logger.log('WAWON_WEBHOOK_TOKEN: ' + token);
  Logger.log('WAWON_ALLOWED_RECIPIENTS: ' + JSON.stringify(normalizedRecipients));
}

function parsePayload_(e) {
  try {
    return JSON.parse(e && e.postData && e.postData.contents || '{}');
  } catch (error) {
    return null;
  }
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmailList_(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return values.map(normalizeEmail_).filter(function (email, index, all) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && all.indexOf(email) === index;
  });
}

function getProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function getAllowedRecipients_() {
  try {
    return normalizeEmailList_(JSON.parse(getProperty_(ALLOWED_RECIPIENTS_PROPERTY) || '[]'));
  } catch (error) {
    return [];
  }
}

function getSentDispatchKeys_() {
  try {
    const value = JSON.parse(getProperty_(SENT_DISPATCH_KEYS_PROPERTY) || '[]');
    return Array.isArray(value) ? value.filter(function (entry) {
      return entry && /^[a-f0-9]{64}$/.test(String(entry.key || ''));
    }) : [];
  } catch (error) {
    return [];
  }
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
