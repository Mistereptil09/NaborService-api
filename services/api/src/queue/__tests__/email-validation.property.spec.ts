import fc from 'fast-check';
import { validateEmailPayload } from '../validators/email-payload.validator';

// Feature: bullmq-integration, Property 3: Email payload validation accepts valid payloads and rejects invalid ones
describe('Email Payload Validation', () => {
  it('should accept valid payloads', () => {
    const validEmailArb = fc.emailAddress().filter((e) => e.length <= 254);
    const validSubjectArb = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0);
    const validTemplateArb = fc
      .string({ minLength: 1 })
      .filter((s) => s.trim().length > 0);
    const validVarsArb = fc
      .dictionary(fc.string(), fc.string())
      .filter((d) => Buffer.byteLength(JSON.stringify(d), 'utf8') <= 10240);

    fc.assert(
      fc.property(
        validEmailArb,
        validSubjectArb,
        validTemplateArb,
        fc.option(validVarsArb, { nil: undefined }),
        (recipient, subject, templateName, templateVariables) => {
          const payload = {
            recipient,
            subject,
            templateName,
            templateVariables,
          };
          return validateEmailPayload(payload) === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject if recipient is invalid', () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter(
            (s) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) || s.length > 254,
          ),
        (invalidRecipient) => {
          return (
            validateEmailPayload({
              recipient: invalidRecipient,
              subject: 'valid',
              templateName: 'valid',
            }) === false
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
