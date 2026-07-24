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

  return res;
}

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

export async function createModeratorUser(
  app: INestApplication,
  emailPrefix = 'moderator',
) {
  const { email, password, user } = await createTestUser(app, emailPrefix);

  const userRepository = app.get('UserRepository');
  await userRepository.update({ id: user.id }, { role: 'moderator' });

  const { token, secret } = await loginAndGetToken(app, email, password);

  return {
    email,
    password,
    user: { ...user, role: 'moderator' },
    token,
    secret,
  };
}

export async function createListing(
  app: INestApplication,
  token: string,
  overrides?: Partial<{
    title: string;
    listing_type: string;
    description: string;
    price_cents: number;
    neighbourhood_id: string;
    category_id: number;
  }>,
) {
  const dto = {
    title: overrides?.title ?? 'Test Listing',
    listing_type: overrides?.listing_type ?? 'offer',
    description: overrides?.description ?? 'A test listing',
    price_cents: overrides?.price_cents ?? 1000,
    neighbourhood_id: overrides?.neighbourhood_id,
    category_id: overrides?.category_id,
  };

  const res = await request(app.getHttpServer())
    .post('/v1/listings')
    .set('Authorization', `Bearer ${token}`)
    .send(dto)
    .expect(201);

  return res.body;
}

export async function createEvent(
  app: INestApplication,
  token: string,
  overrides?: Partial<{
    title: string;
    description: string;
    cost_cents: number;
    max_participants: number;
    neighbourhood_id: string;
    category_id: number;
    starts_at: string;
  }>,
) {
  const dto = {
    title: overrides?.title ?? 'Test Event',
    description: overrides?.description ?? 'A test event',
    cost_cents: overrides?.cost_cents ?? 500,
    max_participants: overrides?.max_participants ?? 50,
    neighbourhood_id: overrides?.neighbourhood_id,
    category_id: overrides?.category_id,
    starts_at:
      overrides?.starts_at ?? new Date(Date.now() + 86400000).toISOString(),
  };

  const res = await request(app.getHttpServer())
    .post('/v1/events')
    .set('Authorization', `Bearer ${token}`)
    .send(dto)
    .expect(201);

  return res.body;
}
