import fs from 'fs';
import path from 'path';
import { db } from './client';

const dataDir = process.env.DATA_DIR || './data';

export async function initializeDatabase() {
  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Create tables if they don't exist
  const sqlite = (db as any).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      plan TEXT NOT NULL DEFAULT 'free',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      email TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      details TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      layout TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      type TEXT NOT NULL,
      metadata TEXT,
      uploaded_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fonts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      font_family TEXT NOT NULL,
      font_weight TEXT,
      font_style TEXT,
      uploaded_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrate existing tables: add columns if missing
  const tableInfo = sqlite.pragma('table_info(users)');
  const hasLockout = tableInfo.some((col: any) => col.name === 'failed_login_attempts');
  if (!hasLockout) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
    sqlite.exec(`ALTER TABLE users ADD COLUMN locked_until INTEGER`);
  }

  // Add UUID columns if missing and populate them
  const hasUserUuid = tableInfo.some((col: any) => col.name === 'uuid');
  if (!hasUserUuid) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN uuid TEXT`);
    // Populate UUIDs for existing users
    const users = sqlite.prepare('SELECT id FROM users WHERE uuid IS NULL').all();
    const updateStmt = sqlite.prepare('UPDATE users SET uuid = ? WHERE id = ?');
    for (const user of users) {
      const uuid = crypto.randomUUID();
      updateStmt.run(uuid, user.id);
    }
    // Make uuid unique and not null after population
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)`);
  }

  // Add isAdmin column if missing
  const hasIsAdmin = tableInfo.some((col: any) => col.name === 'is_admin');
  if (!hasIsAdmin) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
  }

  // Add plan column if missing
  const hasPlan = tableInfo.some((col: any) => col.name === 'plan');
  if (!hasPlan) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'`);
  }

  const templateInfo = sqlite.pragma('table_info(templates)');
  const hasTemplateUuid = templateInfo.some((col: any) => col.name === 'uuid');
  if (!hasTemplateUuid) {
    sqlite.exec(`ALTER TABLE templates ADD COLUMN uuid TEXT`);
    // Populate UUIDs for existing templates
    const templates = sqlite.prepare('SELECT id FROM templates WHERE uuid IS NULL').all();
    const updateStmt = sqlite.prepare('UPDATE templates SET uuid = ? WHERE id = ?');
    for (const template of templates) {
      const uuid = crypto.randomUUID();
      updateStmt.run(uuid, template.id);
    }
    // Make uuid unique and not null after population
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_uuid ON templates(uuid)`);
  }

  const assetInfo = sqlite.pragma('table_info(assets)');
  const hasAssetUuid = assetInfo.some((col: any) => col.name === 'uuid');
  if (!hasAssetUuid) {
    sqlite.exec(`ALTER TABLE assets ADD COLUMN uuid TEXT`);
    // Populate UUIDs for existing assets
    const assets = sqlite.prepare('SELECT id FROM assets WHERE uuid IS NULL').all();
    const updateStmt = sqlite.prepare('UPDATE assets SET uuid = ? WHERE id = ?');
    for (const asset of assets) {
      const uuid = crypto.randomUUID();
      updateStmt.run(uuid, asset.id);
    }
    // Make uuid unique and not null after population
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_uuid ON assets(uuid)`);
  }

  const fontInfo = sqlite.pragma('table_info(fonts)');
  const hasFontUuid = fontInfo.some((col: any) => col.name === 'uuid');
  if (!hasFontUuid) {
    sqlite.exec(`ALTER TABLE fonts ADD COLUMN uuid TEXT`);
    // Populate UUIDs for existing fonts
    const fonts = sqlite.prepare('SELECT id FROM fonts WHERE uuid IS NULL').all();
    const updateStmt = sqlite.prepare('UPDATE fonts SET uuid = ? WHERE id = ?');
    for (const font of fonts) {
      const uuid = crypto.randomUUID();
      updateStmt.run(uuid, font.id);
    }
    // Make uuid unique and not null after population
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fonts_uuid ON fonts(uuid)`);
  }

  // Create upload directories
  const uploadDirs = ['assets', 'assets/logo', 'assets/background', 'assets/free-image', 'fonts'];
  for (const dir of uploadDirs) {
    const dirPath = path.join(dataDir, 'uploads', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  console.log('Database initialized successfully');
}
