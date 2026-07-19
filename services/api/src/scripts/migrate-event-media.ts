/**
 * Migration ponctuelle — médias d'événements vers le stockage unifié MediaService.
 *
 * Avant : les images/pièces jointes étaient stockées en binaire dans le
 * document Mongo `event_documents` (champs `cover` et `attachments`).
 * Après : elles sont stockées en GridFS + métadonnées dans `media_files`
 * (owner_type `event_cover` / `event_attachment`), comme les annonces.
 *
 * Le script vide ensuite les champs binaires d'`event_documents` pour éviter
 * toute double source de vérité.
 *
 * Usage:
 *   npm run db:migrate:event-media
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import mongoose, { mongo } from 'mongoose';

interface LegacyBinary {
  data?: { buffer?: Buffer } | Buffer;
  name?: string;
  mimetype?: string;
  size_bytes?: number;
  uploaded_at?: Date;
}

function toBuffer(data: LegacyBinary['data']): Buffer {
  if (!data) return Buffer.alloc(0);
  if (Buffer.isBuffer(data)) return data;
  if (data.buffer) return Buffer.from(data.buffer);
  return Buffer.alloc(0);
}

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
  const db = conn.db!;
  const eventDocuments = db.collection('event_documents');
  const mediaFiles = db.collection('media_files');
  const bucket = new mongo.GridFSBucket(db, { bucketName: 'fs' });

  const docs = await eventDocuments
    .find({
      $or: [{ cover: { $ne: null } }, { attachments: { $ne: [] } }],
    })
    .toArray();

  let migrated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const eventId = doc.pg_event_id as string;
    if (!eventId) {
      skipped++;
      continue;
    }

    const uploads: Array<{
      ownerType: 'event_cover' | 'event_attachment';
      buffer: Buffer;
      filename: string;
      mimetype: string;
      uploadedAt: Date;
    }> = [];

    if (doc.cover) {
      const cover = doc.cover as LegacyBinary;
      const buffer = toBuffer(cover.data);
      if (buffer.length > 0) {
        uploads.push({
          ownerType: 'event_cover',
          buffer,
          filename: cover.name || 'cover.webp',
          mimetype: cover.mimetype || 'image/webp',
          uploadedAt: cover.uploaded_at || doc.created_at || new Date(),
        });
      }
    }

    if (Array.isArray(doc.attachments)) {
      for (const attachment of doc.attachments as LegacyBinary[]) {
        const buffer = toBuffer(attachment.data);
        if (buffer.length === 0) continue;
        uploads.push({
          ownerType: 'event_attachment',
          buffer,
          filename: attachment.name || 'attachment.bin',
          mimetype: attachment.mimetype || 'application/octet-stream',
          uploadedAt: attachment.uploaded_at || doc.created_at || new Date(),
        });
      }
    }

    if (uploads.length === 0) {
      skipped++;
      continue;
    }

    for (const upload of uploads) {
      const existing = await mediaFiles.findOne({
        owner_type: upload.ownerType,
        owner_id: eventId,
        original_filename: upload.filename,
      });
      if (existing) continue;

      const gridfsId = await new Promise<mongo.ObjectId>((resolve, reject) => {
        const stream = bucket.openUploadStream(upload.filename, {
          metadata: { contentType: upload.mimetype },
        });
        stream.on('finish', () => resolve(stream.id as mongo.ObjectId));
        stream.on('error', reject);
        stream.end(upload.buffer);
      });

      await mediaFiles.insertOne({
        owner_type: upload.ownerType,
        owner_id: eventId,
        gridfs_file_id: gridfsId,
        mimetype: upload.mimetype,
        size_bytes: upload.buffer.length,
        original_filename: upload.filename,
        uploaded_at: upload.uploadedAt,
        width_px: null,
        height_px: null,
        duration_seconds: null,
        order: null,
        caption: null,
        sha256_hash: null,
        contract_type: null,
        taken_at: null,
        synced_at: null,
      });
    }

    await eventDocuments.updateOne(
      { _id: doc._id },
      { $unset: { cover: '' }, $set: { attachments: [] } },
    );
    migrated++;
  }

  console.log(
    `${migrated} événement(s) migré(s), ${skipped} ignoré(s) (sans média binaire).`,
  );

  await conn.close();
  console.log('Migration terminée.');
}

main().catch((err) => {
  console.error('Échec de la migration :', err);
  process.exit(1);
});
