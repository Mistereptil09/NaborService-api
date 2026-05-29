import { EmailJobPayload } from '../interfaces/job-payloads';

export function validateEmailPayload(payload: any): payload is EmailJobPayload {
  if (!payload || typeof payload !== 'object') return false;

  const { recipient, subject, templateName, templateVariables } = payload;

  if (typeof recipient !== 'string' || recipient.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return false;
  }

  if (typeof subject !== 'string' || subject.trim() === '' || subject.length > 200) {
    return false;
  }

  if (typeof templateName !== 'string' || templateName.trim() === '') {
    return false;
  }

  if (templateVariables !== undefined) {
    if (typeof templateVariables !== 'object' || templateVariables === null) {
      return false;
    }
    try {
      const serialized = JSON.stringify(templateVariables);
      if (Buffer.byteLength(serialized, 'utf8') > 10 * 1024) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}
