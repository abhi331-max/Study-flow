import { db } from '../db.js';

interface RequestMetric {
  path: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

class ObservabilityService {
  private recentRequests: RequestMetric[] = [];
  private maxHistory = 1000;
  private totalRequests = 0;
  private totalErrors = 0;
  private startTime = Date.now();
  private slowRequestsCount = 0; // > 300ms

  recordRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.totalRequests++;
    if (statusCode >= 400) {
      this.totalErrors++;
    }
    if (durationMs > 300) {
      this.slowRequestsCount++;
    }

    this.recentRequests.push({
      method,
      path: path.split('?')[0],
      statusCode,
      durationMs,
      timestamp: Date.now(),
    });

    if (this.recentRequests.length > this.maxHistory) {
      this.recentRequests.shift();
    }
  }

  recordAIMetric(params: {
    feature: string;
    userId?: string;
    courseId?: string;
    tokensUsed?: number;
    latencyMs: number;
    wasCached: boolean;
  }): void {
    try {
      db.prepare(`
        INSERT INTO ai_usage_metrics (id, feature, user_id, course_id, tokens_used, latency_ms, was_cached, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        params.feature,
        params.userId || null,
        params.courseId || null,
        params.tokensUsed || 0,
        params.latencyMs,
        params.wasCached ? 1 : 0,
        new Date().toISOString()
      );
    } catch (err) {
      console.warn('Failed to record AI metric:', err);
    }
  }

  getSnapshot(): any {
    const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);
    const rps = uptimeSeconds > 0 ? (this.totalRequests / uptimeSeconds).toFixed(2) : '0.00';

    const recentDurations = this.recentRequests.map(r => r.durationMs).sort((a, b) => a - b);
    const count = recentDurations.length;

    const p50 = count > 0 ? recentDurations[Math.floor(count * 0.50)] : 0;
    const p95 = count > 0 ? recentDurations[Math.floor(count * 0.95)] : 0;
    const p99 = count > 0 ? recentDurations[Math.floor(count * 0.99)] : 0;
    const avgLatency = count > 0 ? Math.round(recentDurations.reduce((a, b) => a + b, 0) / count) : 0;

    // Memory usage
    const mem = process.memoryUsage();

    // Database row counts
    let totalUsers = 0;
    let totalCourses = 0;
    let totalVideos = 0;
    let totalTasks = 0;
    try {
      totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
      totalCourses = (db.prepare('SELECT COUNT(*) as c FROM courses').get() as any)?.c || 0;
      totalVideos = (db.prepare('SELECT COUNT(*) as c FROM videos').get() as any)?.c || 0;
      totalTasks = (db.prepare('SELECT COUNT(*) as c FROM study_tasks').get() as any)?.c || 0;
    } catch {
      // Ignored during early setup
    }

    // AI Metrics summary
    let aiMetrics = { totalCalls: 0, cachedRatio: 0, avgAiLatencyMs: 0 };
    try {
      const aiRow = db.prepare(`
        SELECT COUNT(*) as total, 
               COALESCE(SUM(was_cached), 0) as cached,
               COALESCE(AVG(latency_ms), 0) as avgLatency
        FROM ai_usage_metrics
      `).get() as any;
      if (aiRow && aiRow.total > 0) {
        aiMetrics = {
          totalCalls: aiRow.total,
          cachedRatio: Math.round((aiRow.cached / aiRow.total) * 100),
          avgAiLatencyMs: Math.round(aiRow.avgLatency),
        };
      }
    } catch {
      // Ignored
    }

    return {
      status: 'healthy',
      version: '2.0.0-scale',
      uptimeSeconds,
      system: {
        memory: {
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024),
        },
        nodeVersion: process.version,
      },
      traffic: {
        totalRequests: this.totalRequests,
        totalErrors: this.totalErrors,
        errorRatePct: this.totalRequests > 0 ? ((this.totalErrors / this.totalRequests) * 100).toFixed(2) : '0.00',
        requestsPerSecond: rps,
        slowRequestsCount: this.slowRequestsCount,
      },
      latencyMs: {
        avg: avgLatency,
        p50,
        p95,
        p99,
      },
      databaseStats: {
        totalUsers,
        totalCourses,
        totalVideos,
        totalTasks,
        walMode: true,
      },
      aiMetrics,
      timestamp: new Date().toISOString(),
    };
  }
}

export const observability = new ObservabilityService();
