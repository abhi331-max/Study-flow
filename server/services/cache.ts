import { db } from '../db.js';
import crypto from 'node:crypto';

// In-Memory Multi-Tenant LRU Cache
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxEntries: number;

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds = 60): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest 10%
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxEntries * 0.1));
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  deletePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; maxEntries: number } {
    return { size: this.cache.size, maxEntries: this.maxEntries };
  }
}

export const memoryCache = new MemoryCache(5000);

// In-Flight Request Deduplicator (Single-Flight Pattern)
// Prevents thundering herd when multiple concurrent requests ask for the same YouTube or AI resource
class InFlightDeduplicator {
  private inFlight = new Map<string, Promise<any>>();

  async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}

export const inFlightDeduplicator = new InFlightDeduplicator();

// YouTube Metadata Database Cache (7 days TTL)
export function getCachedYouTubeMetadata(cacheKey: string): any | null {
  try {
    const row = db.prepare('SELECT data_json, expires_at FROM youtube_metadata_cache WHERE cache_key = ?').get(cacheKey) as any;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM youtube_metadata_cache WHERE cache_key = ?').run(cacheKey);
      return null;
    }
    return JSON.parse(row.data_json);
  } catch (err) {
    console.warn('Error reading youtube_metadata_cache:', err);
    return null;
  }
}

export function setCachedYouTubeMetadata(cacheKey: string, data: any, source: string, ttlDays = 7): void {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO youtube_metadata_cache (cache_key, data_json, source, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        data_json = excluded.data_json,
        source = excluded.source,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
    `).run(cacheKey, JSON.stringify(data), source, expiresAt, now.toISOString());
  } catch (err) {
    console.warn('Error saving youtube_metadata_cache:', err);
  }
}

// AI Analysis Database Cache (Persisted indefinitely until invalidation or content hash changes)
export function getCachedAIAnalysis(cacheKey: string): any | null {
  try {
    const row = db.prepare('SELECT data_json FROM ai_analysis_cache WHERE cache_key = ?').get(cacheKey) as any;
    if (!row) return null;
    return JSON.parse(row.data_json);
  } catch (err) {
    console.warn('Error reading ai_analysis_cache:', err);
    return null;
  }
}

export function setCachedAIAnalysis(cacheKey: string, cacheType: string, data: any): void {
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ai_analysis_cache (cache_key, cache_type, data_json, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        cache_type = excluded.cache_type,
        data_json = excluded.data_json,
        created_at = excluded.created_at
    `).run(cacheKey, cacheType, JSON.stringify(data), now);
  } catch (err) {
    console.warn('Error saving ai_analysis_cache:', err);
  }
}

// Compute Deterministic SHA-256 Hash for Cache Keys
export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Invalidate Course Caches when tasks, videos, subjects, or preferences are updated
export function invalidateCourseCache(userId: string, courseId: string): void {
  memoryCache.deletePattern(`user:${userId}:course:${courseId}`);
  memoryCache.deletePattern(`course:${courseId}`);
}
