import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Ensure data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'studyflow.db');
export const db = new DatabaseSync(dbPath);

export function runTransaction<T>(callback: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const res = callback();
    db.exec('COMMIT');
    return res;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Initialize Tables and Indexes
export function initDatabase() {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA cache_size = -64000;'); // 64 MB page cache
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA mmap_size = 268435456;'); // 256 MB memory-mapped I/O
  db.exec('PRAGMA busy_timeout = 10000;'); // 10s wait for concurrent transactions

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      exam_target TEXT,
      daily_hours REAL DEFAULT 3,
      study_style TEXT DEFAULT 'balanced',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      exam_name TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      target_finish_date TEXT,
      description TEXT,
      planning_mode TEXT DEFAULT 'smart', -- 'smart', 'manual', 'hybrid'
      schedule_version INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      priority TEXT DEFAULT 'medium', -- 'high', 'medium', 'low'
      difficulty TEXT DEFAULT 'medium', -- 'easy', 'medium', 'hard'
      color TEXT DEFAULT '#3b82f6',
      target_date TEXT, -- YYYY-MM-DD subject-specific deadline
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      parent_topic_id TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      youtube_playlist_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_name TEXT,
      resource_type TEXT DEFAULT 'Main Lectures',
      video_count INTEGER DEFAULT 0,
      total_duration_seconds INTEGER DEFAULT 0,
      thumbnail_url TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      playlist_id TEXT,
      user_id TEXT NOT NULL,
      youtube_video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      duration_seconds INTEGER DEFAULT 0,
      thumbnail_url TEXT,
      channel_name TEXT,
      original_position INTEGER DEFAULT 0,
      topic_id TEXT,
      content_type TEXT DEFAULT 'Lecture', -- 'Lecture', 'Concept', 'Problem Solving', 'Revision', 'PYQ', 'Practice'
      difficulty TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed', 'skipped'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_preferences (
      id TEXT PRIMARY KEY,
      course_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      daily_study_minutes INTEGER DEFAULT 180,
      study_days_json TEXT NOT NULL, -- '["monday","tuesday","wednesday","thursday","friday","saturday"]'
      rest_days_json TEXT NOT NULL,  -- '["sunday"]'
      strategy TEXT DEFAULT 'balanced', -- 'balanced', 'one_by_one', 'priority', 'smart_interleaved'
      difficulty_level TEXT DEFAULT 'normal',
      revision_mode TEXT DEFAULT 'full', -- 'none', 'light', 'full'
      prep_mode TEXT DEFAULT 'full',     -- 'lectures_only', 'lectures_revision', 'lectures_revision_pyq', 'full'
      buffer_days INTEGER DEFAULT 3,
      revision_days INTEGER DEFAULT 10,
      pyq_days INTEGER DEFAULT 5,
      mock_days INTEGER DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_tasks (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL, -- YYYY-MM-DD
      task_type TEXT DEFAULT 'video', -- 'video', 'custom', 'revision', 'pyq', 'mock'
      subject_id TEXT,
      video_id TEXT,
      custom_title TEXT,
      planned_duration_seconds INTEGER DEFAULT 0,
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      order_index INTEGER DEFAULT 0,
      phase TEXT DEFAULT 'learning', -- 'learning', 'revision', 'pyq', 'mock'
      schedule_source TEXT DEFAULT 'automatic', -- 'automatic', 'manual', 'hybrid', 'rescheduled'
      is_locked INTEGER DEFAULT 0, -- 0 or 1
      start_time TEXT,
      task_category TEXT DEFAULT 'Watch Lecture',
      status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'missed', 'skipped'
      schedule_explanation TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS custom_resources (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      subject_id TEXT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      resource_type TEXT DEFAULT 'link', -- 'pdf', 'link', 'book', 'notes'
      url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      log_date TEXT NOT NULL,
      study_seconds INTEGER DEFAULT 0,
      videos_completed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, course_id, log_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    -- Caching, Queue & Observability Tables for 10k-100k scale
    CREATE TABLE IF NOT EXISTS youtube_metadata_cache (
      cache_key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      source TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_analysis_cache (
      cache_key TEXT PRIMARY KEY,
      cache_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_usage_metrics (
      id TEXT PRIMARY KEY,
      feature TEXT NOT NULL,
      user_id TEXT,
      course_id TEXT,
      tokens_used INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      was_cached INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT,
      job_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT DEFAULT 'queued',
      progress INTEGER DEFAULT 0,
      result_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Indexes for high-speed lookups, joins & multi-tenant isolation
    CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_course ON subjects(course_id);
    CREATE INDEX IF NOT EXISTS idx_videos_course ON videos(course_id);
    CREATE INDEX IF NOT EXISTS idx_videos_subject ON videos(subject_id);
    CREATE INDEX IF NOT EXISTS idx_videos_playlist ON videos(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_videos_course_user ON videos(course_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
    CREATE INDEX IF NOT EXISTS idx_playlists_course ON playlists(course_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_study_tasks_date ON study_tasks(course_id, scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_study_tasks_user_date ON study_tasks(user_id, scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_study_tasks_video ON study_tasks(video_id);
    CREATE INDEX IF NOT EXISTS idx_study_tasks_subject ON study_tasks(subject_id);
    CREATE INDEX IF NOT EXISTS idx_study_tasks_completed ON study_tasks(course_id, user_id, is_completed);
    CREATE INDEX IF NOT EXISTS idx_study_tasks_locked ON study_tasks(course_id, user_id, is_locked);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_daily_logs_lookup ON daily_logs(user_id, course_id, log_date);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON background_jobs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_cache_type ON ai_analysis_cache(cache_type);
    CREATE INDEX IF NOT EXISTS idx_ai_metrics_feature ON ai_usage_metrics(feature, created_at);
    CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token_hash, used);
    CREATE INDEX IF NOT EXISTS idx_verify_token ON email_verification_tokens(token_hash, used);
  `);

  try {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE playlists ADD COLUMN resource_type TEXT DEFAULT 'Main Lectures';");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE videos ADD COLUMN content_type TEXT DEFAULT 'Lecture';");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE courses ADD COLUMN planning_mode TEXT DEFAULT 'smart';");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE subjects ADD COLUMN target_date TEXT;");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN schedule_source TEXT DEFAULT 'automatic';");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN is_locked INTEGER DEFAULT 0;");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN start_time TEXT;");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN task_category TEXT DEFAULT 'Watch Lecture';");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN status TEXT DEFAULT 'pending';");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN schedule_explanation TEXT;");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN youtube_video_id TEXT;");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN thumbnail_url TEXT;");
  } catch {
    // Column already exists
  }

  try {
    db.exec("ALTER TABLE study_tasks ADD COLUMN channel_name TEXT;");
  } catch {
    // Column already exists
  }
}

// Password helpers with PBKDF2
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

  try {
    db.exec("ALTER TABLE users ADD COLUMN last_active_course_id TEXT;");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN last_active_subject_id TEXT;");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN last_active_video_id TEXT;");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN last_active_at TEXT;");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT;");
  } catch {
    // Column already exists
  }
