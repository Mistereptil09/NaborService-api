const { Client } = require('pg');

async function createDatabase() {
  const client = new Client({
    user: 'nabor',
    password: 'nabor_secret',
    host: 'localhost',
    port: 5432,
    database: 'nabor_db', // Use the existing nabor_db to connect
  });
  
  await client.connect();
  
  try {
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'nabor_db_test'`);
    if (res.rowCount === 0) {
      console.log('Creating nabor_db_test...');
      await client.query(`CREATE DATABASE nabor_db_test`);
    } else {
      console.log('nabor_db_test already exists.');
    }
  } catch (err) {
    console.error('Error creating test db:', err);
  } finally {
    await client.end();
  }
}
createDatabase();
