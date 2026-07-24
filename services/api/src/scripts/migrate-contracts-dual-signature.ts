import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import mongoose from 'mongoose';

async function main() {
  const host = process.env.MONGO_HOST ?? 'localhost';
  const port = process.env.MONGO_PORT ?? '27017';
  const username = process.env.MONGO_INITDB_ROOT_USERNAME;
  const password = process.env.MONGO_INITDB_ROOT_PASSWORD;
  const database = process.env.MONGO_DB ?? 'nabor_db';

  if (!username || !password) {
    console.error(
      'MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD manquants dans .env',
    );
    process.exit(1);
  }

  const uri = `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=admin`;
  const conn = await mongoose.createConnection(uri).asPromise();
  const contracts = conn.collection('contracts');

  try {
    await contracts.dropIndex('pg_transaction_id_1');
    console.log('Index pg_transaction_id_1 supprimé.');
  } catch (err: any) {
    if (err?.codeName === 'IndexNotFound' || err?.code === 27) {
      console.log('Index pg_transaction_id_1 absent — rien à faire.');
    } else {
      throw err;
    }
  }

  const result = await contracts.updateMany(
    {},
    {
      $unset: { signature: '' },
      $set: {
        signatures: { provider: null, requester: null },
        signed_pdf: null,
        signed_pdf_sha256: null,
        signed_at: null,
      },
    },
  );
  console.log(`${result.modifiedCount} document(s) migré(s).`);

  await conn.close();
  console.log('Migration terminée.');
}

main().catch((err) => {
  console.error('Échec de la migration :', err);
  process.exit(1);
});
