import * as fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from '../../dto/register.dto';

describe('Property 12: Registration input validation', () => {
  it('should reject invalid fields and accept valid ones according to CDC constraints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          firstName: fc
            .string({ minLength: 1, maxLength: 100 })
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
          lastName: fc
            .string({ minLength: 1, maxLength: 100 })
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
          password: fc.string({ minLength: 8, maxLength: 128 }),

          emailMutator: fc.constantFrom('valid', 'invalid-format', 'too-long'),
          firstNameMutator: fc.constantFrom('valid', 'empty', 'too-long'),
          lastNameMutator: fc.constantFrom('valid', 'empty', 'too-long'),
          passwordMutator: fc.constantFrom('valid', 'too-short', 'too-long'),
        }),
        async (data) => {
          let email = data.email;
          if (data.emailMutator === 'invalid-format') email = 'not-an-email';
          if (data.emailMutator === 'too-long')
            email = 'a'.repeat(256) + '@test.com';

          let firstName = data.firstName;
          if (data.firstNameMutator === 'empty') firstName = '';
          if (data.firstNameMutator === 'too-long') firstName = 'a'.repeat(101);

          let lastName = data.lastName;
          if (data.lastNameMutator === 'empty') lastName = '';
          if (data.lastNameMutator === 'too-long') lastName = 'a'.repeat(101);

          let password = data.password;
          if (data.passwordMutator === 'too-short') password = '123';
          if (data.passwordMutator === 'too-long') password = 'a'.repeat(129);

          const dto = plainToInstance(RegisterDto, {
            email,
            firstName,
            lastName,
            password,
          });

          const errors = await validate(dto);
          const errorFields = errors.map((e) => e.property);

          if (data.emailMutator !== 'valid') {
            expect(errorFields).toContain('email');
          }
          if (data.firstNameMutator !== 'valid') {
            expect(errorFields).toContain('firstName');
          }
          if (data.lastNameMutator !== 'valid') {
            expect(errorFields).toContain('lastName');
          }
          if (data.passwordMutator !== 'valid') {
            expect(errorFields).toContain('password');
          }

          if (
            data.emailMutator === 'valid' &&
            data.firstNameMutator === 'valid' &&
            data.lastNameMutator === 'valid' &&
            data.passwordMutator === 'valid'
          ) {
            expect(errors).toHaveLength(0);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
