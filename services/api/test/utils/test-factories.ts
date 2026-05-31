import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

export async function createTestUser(app: INestApplication, emailPrefix = 'test') {
  const email = `${emailPrefix}_${uuidv4()}@example.com`;
  const password = 'Password123!';
  const dto = {
    email,
    password,
    firstName: 'Test',
    lastName: 'User',
  };

  const res = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send(dto)
    .expect(201);
  const userRepository = app.get('UserRepository');
  const dbUser = await userRepository.findOne({ where: { email } });
  
  return { email, password, user: { id: dbUser?.id, ...res.body } };
}

export async function loginUser(app: INestApplication, email: string, password: string) {
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
