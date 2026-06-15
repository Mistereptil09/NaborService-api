import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const otp = require('otplib');

export async function createTestUser(
  app: INestApplication,
  emailPrefix = 'test',
) {
  const email = `${emailPrefix}_${uuidv4()}@example.com`;
  const password = 'Password123!';
  const dto = {
    email,
    password,
    firstName: 'Test',
    lastName: 'User',
  };

  await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send(dto)
    .expect(201);
  const userRepository = app.get('UserRepository');
  const dbUser = await userRepository.findOne({ where: { email } });

  // Register endpoint returns only { message: '...' }, so we use DB fields directly
  return {
    email,
    password,
    user: {
      id: dbUser?.id,
      email: dbUser?.email,
      firstName: dbUser?.firstName,
      lastName: dbUser?.lastName,
    },
  };
}

export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
) {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    console.error('LOGIN ERROR:', res.status, res.body);
  }
  expect(res.status).toBe(200);

  // Note: if TOTP is mandatory, this will return { challenge_token } instead of { access_token }
  // We handle that dynamically if needed.
  return res;
}

/**
 * Logs in a user and automatically handles TOTP setup if required.
 * Returns a JWT token and TOTP secret (empty string if no TOTP).
 */
export async function loginAndGetToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ token: string; secret: string }> {
  const loginRes = await loginUser(app, email, password);
  let token = loginRes.body.access_token;
  let secret = '';

  if (!token && loginRes.body.challenge === 'totp_setup_required') {
    const otpauthUrl = loginRes.body.otpauthUrl;
    secret = otpauthUrl.match(/secret=([^&]+)/)[1];
    const code = otp.generateSync({ secret });

    const setupRes = await request(app.getHttpServer())
      .post('/v1/auth/totp/confirm-setup')
      .send({ challenge_token: loginRes.body.challenge_token, code })
      .expect(200);

    token = setupRes.body.access_token;
  }
  return { token, secret };
}

/**
 * Creates a user with the admin role.
 * Uses the UserRepository to directly set the role after registration.
 */
export async function createAdminUser(
  app: INestApplication,
  emailPrefix = 'admin',
) {
  const { email, password, user } = await createTestUser(app, emailPrefix);

  const userRepository = app.get('UserRepository');
  await userRepository.update({ id: user.id }, { role: 'admin' });

  const { token, secret } = await loginAndGetToken(app, email, password);

  return { email, password, user: { ...user, role: 'admin' }, token, secret };
}
