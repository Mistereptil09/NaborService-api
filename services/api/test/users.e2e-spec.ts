import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import { createTestUser, loginUser } from './utils/test-factories';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const otp = require('otplib');

describe('Users & Social Modules (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestingApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
  });

  async function loginAndGetToken(email: string, password: string): Promise<{ token: string, secret: string }> {
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

  describe('Users Controller - Preferences and Security', () => {
    it('should get and update locale', async () => {
      const { email, password } = await createTestUser(app);
      const { token, secret } = await loginAndGetToken(email, password);

      // GET locale
      const getRes = await request(app.getHttpServer())
        .get('/v1/users/me/locale')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(getRes.body.locale).toBe('fr'); // Default is 'fr' according to entity

      // PATCH locale
      const patchRes = await request(app.getHttpServer())
        .patch('/v1/users/me/locale')
        .set('Authorization', `Bearer ${token}`)
        .send({ locale: 'en' })
        .expect(200);

      expect(patchRes.body.locale).toBe('en');
    });

    it('should change email', async () => {
      const { email, password } = await createTestUser(app);
      const { token, secret } = await loginAndGetToken(email, password);
      
      const code = otp.generateSync({ secret });

      // PATCH email
      await request(app.getHttpServer())
        .patch('/v1/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ newEmail: 'new_email@example.com', totpCode: code })
        .expect(204);
    });
  });

  describe('Social Module - Follow & Block', () => {
    it('should follow and unfollow a user', async () => {
      const user1 = await createTestUser(app, 'user1');
      const user2 = await createTestUser(app, 'user2');

      const { token: token1 } = await loginAndGetToken(user1.email, user1.password);
      const targetId = user2.user.id;

      // Follow
      await request(app.getHttpServer())
        .post(`/v1/users/${targetId}/follow`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Verify followers list
      const getFollowers = await request(app.getHttpServer())
        .get(`/v1/users/${targetId}/followers`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      
      expect(getFollowers.body.data.some((item: any) => item.id === user1.user.id)).toBe(true);

      // Unfollow
      await request(app.getHttpServer())
        .delete(`/v1/users/${targetId}/follow`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);
    });

    it('should block and unblock a user', async () => {
      const user1 = await createTestUser(app, 'user1');
      const user2 = await createTestUser(app, 'user2');

      const { token: token1 } = await loginAndGetToken(user1.email, user1.password);
      const targetId = user2.user.id;

      // Block
      await request(app.getHttpServer())
        .post(`/v1/users/${targetId}/block`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Verify block list
      const getBlocks = await request(app.getHttpServer())
        .get(`/v1/users/me/blocks`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      
      expect(getBlocks.body.data.some((item: any) => item.id === targetId)).toBe(true);

      // Unblock
      await request(app.getHttpServer())
        .delete(`/v1/users/${targetId}/block`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);
    });
  });
});
