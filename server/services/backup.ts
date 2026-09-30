// Automated Database Backup & Disaster Recovery Service
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';

export interface BackupResult {
  success: boolean;
  backupPath: string;
  bytes: number;
  createdAt: string;
  integrityCheck: string;
}

export class BackupService {
  private backupDir: string;
  private maxRetainedBackups = 7;

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    this.backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  // Check database integrity
  checkIntegrity(): string {
    try {
      const result = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
      return result?.integrity_check || 'ok';
    } catch (err: any) {
      return `Failed: ${err.message}`;
    }
  }

  // Perform point-in-time snapshot backup
  createBackup(): BackupResult {
    const integrity = this.checkIntegrity();
    if (integrity !== 'ok') {
      throw new Error(`Cannot backup corrupt database: ${integrity}`);
    }

    // Force checkpoint to flush WAL into main database file before copying
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (checkpointErr) {
      console.warn('WAL checkpoint warning prior to backup:', checkpointErr);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `studyflow-backup-${timestamp}.db`;
    const targetPath = path.join(this.backupDir, backupFileName);

    const sourceDbPath = path.join(process.cwd(), 'data', 'studyflow.db');
    fs.copyFileSync(sourceDbPath, targetPath);

    const stats = fs.statSync(targetPath);

    this.pruneOldBackups();

    return {
      success: true,
      backupPath: targetPath,
      bytes: stats.size,
      createdAt: new Date().toISOString(),
      integrityCheck: integrity
    };
  }

  // Retain only the most recent N backups
  private pruneOldBackups(): void {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('studyflow-backup-') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.statSync(path.join(this.backupDir, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > this.maxRetainedBackups) {
        const toDelete = files.slice(this.maxRetainedBackups);
        for (const file of toDelete) {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            console.warn(`Failed to prune backup file ${file.name}:`, e);
          }
        }
      }
    } catch (err) {
      console.warn('Error during backup rotation:', err);
    }
  }

  listBackups(): Array<{ name: string; sizeBytes: number; createdAt: string }> {
    try {
      return fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('studyflow-backup-') && f.endsWith('.db'))
        .map(f => {
          const full = path.join(this.backupDir, f);
          const stat = fs.statSync(full);
          return {
            name: f,
            sizeBytes: stat.size,
            createdAt: stat.mtime.toISOString()
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }
}

export const backupService = new BackupService();
