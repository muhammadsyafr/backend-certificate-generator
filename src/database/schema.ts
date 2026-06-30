import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(), // bcrypt hash
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  layout: text('layout').notNull(), // JSON string
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const assets = sqliteTable('assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  filepath: text('filepath').notNull(), // relative from public/
  type: text('type').notNull(), // 'logo' | 'background' | 'free-image'
  metadata: text('metadata'), // JSON: {width, height, size}
  uploadedAt: integer('uploaded_at').notNull(),
});

export const fonts = sqliteTable('fonts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filename: text('filename').notNull(),
  filepath: text('filepath').notNull(),
  fontFamily: text('font_family').notNull(),
  fontWeight: text('font_weight'), // '100'-'900'
  fontStyle: text('font_style'), // 'normal' | 'italic'
  uploadedAt: integer('uploaded_at').notNull(),
});
