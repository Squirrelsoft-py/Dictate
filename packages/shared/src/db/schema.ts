import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const uploads = sqliteTable(
  'uploads',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mime: text('mime').notNull(),
    durationSec: integer('duration_sec'),
    storagePath: text('storage_path').notNull(),
    status: text('status').notNull().default('queued'),
    progressJson: text('progress_json'),
    asrProvider: text('asr_provider').notNull(),
    asrModel: text('asr_model'),
    diarizationProvider: text('diarization_provider').notNull(),
    llmProvider: text('llm_provider').notNull(),
    llmModel: text('llm_model'),
    error: text('error'),
    starred: integer('starred', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    userIdx: index('uploads_user_idx').on(table.userId),
    statusIdx: index('uploads_status_idx').on(table.status),
  }),
);

export const transcripts = sqliteTable('transcripts', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id')
    .notNull()
    .references(() => uploads.id, { onDelete: 'cascade' })
    .unique(),
  language: text('language').notNull(),
  fullText: text('full_text').notNull(),
  segmentsJson: text('segments_json').notNull(),
  speakersJson: text('speakers_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id')
    .notNull()
    .references(() => uploads.id, { onDelete: 'cascade' })
    .unique(),
  summary: text('summary').notNull(),
  keyPointsJson: text('key_points_json').notNull(),
  actionItemsJson: text('action_items_json').notNull(),
  decisionsJson: text('decisions_json').notNull(),
  chaptersJson: text('chapters_json').notNull(),
  highlightsJson: text('highlights_json').notNull(),
  llmModel: text('llm_model'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#FF6B35'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    userNameIdx: index('tags_user_name_idx').on(table.userId, table.name),
  }),
);

export const uploadTags = sqliteTable(
  'upload_tags',
  {
    uploadId: text('upload_id')
      .notNull()
      .references(() => uploads.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.uploadId, table.tagId] }),
  }),
);

export const speakerLabels = sqliteTable(
  'speaker_labels',
  {
    id: text('id').primaryKey(),
    uploadId: text('upload_id')
      .notNull()
      .references(() => uploads.id, { onDelete: 'cascade' }),
    originalLabel: text('original_label').notNull(),
    customName: text('custom_name'),
    suggestedName: text('suggested_name'),
    confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    uploadLabelIdx: index('speaker_labels_upload_label_idx').on(
      table.uploadId,
      table.originalLabel,
    ),
  }),
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});