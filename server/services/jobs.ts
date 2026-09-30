import { db, runTransaction } from '../db.js';
import crypto from 'node:crypto';
import { fetchPlaylistData } from '../youtube.js';
import { generateSchedule } from '../scheduler.js';
import { analyzeVideosWithAI } from '../gemini.js';
import { invalidateCourseCache } from './cache.js';

export interface BackgroundJob {
  id: string;
  user_id: string;
  course_id: string | null;
  job_type: 'import_playlist' | 'generate_schedule' | 'classify_videos';
  payload_json: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class JobQueueService {
  private isProcessing = false;

  createJob(userId: string, courseId: string | null, jobType: BackgroundJob['job_type'], payload: any): string {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO background_jobs (id, user_id, course_id, job_type, payload_json, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?)
    `).run(jobId, userId, courseId, jobType, JSON.stringify(payload), now, now);

    // Trigger asynchronous worker run without blocking caller
    setImmediate(() => this.processNext());

    return jobId;
  }

  getJob(jobId: string, userId: string): BackgroundJob | null {
    const job = db.prepare('SELECT * FROM background_jobs WHERE id = ? AND user_id = ?').get(jobId, userId) as unknown as BackgroundJob | undefined;
    return job || null;
  }

  listJobs(userId: string): BackgroundJob[] {
    return db.prepare('SELECT * FROM background_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId) as unknown as BackgroundJob[];
  }

  updateProgress(jobId: string, progress: number, status: BackgroundJob['status'] = 'processing'): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE background_jobs SET progress = ?, status = ?, updated_at = ? WHERE id = ?').run(progress, status, now, jobId);
  }

  markCompleted(jobId: string, result: any): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE background_jobs SET status = ?, progress = 100, result_json = ?, updated_at = ? WHERE id = ?').run(
      'completed',
      JSON.stringify(result),
      now,
      jobId
    );
  }

  markFailed(jobId: string, error: string): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE background_jobs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?').run(
      'failed',
      error,
      now,
      jobId
    );
  }

  async processNext(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Pick oldest queued job
      const job = db.prepare("SELECT * FROM background_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1").get() as unknown as BackgroundJob | undefined;
      if (!job) {
        this.isProcessing = false;
        return;
      }

      const now = new Date().toISOString();
      db.prepare("UPDATE background_jobs SET status = 'processing', progress = 10, updated_at = ? WHERE id = ?").run(now, job.id);

      const payload = JSON.parse(job.payload_json);

      if (job.job_type === 'import_playlist') {
        await this.handleImportPlaylist(job, payload);
      } else if (job.job_type === 'generate_schedule') {
        await this.handleGenerateSchedule(job, payload);
      } else if (job.job_type === 'classify_videos') {
        await this.handleClassifyVideos(job, payload);
      } else {
        this.markFailed(job.id, `Unknown job type: ${job.job_type}`);
      }
    } catch (err: any) {
      console.error('Job Queue execution error:', err);
    } finally {
      this.isProcessing = false;
      // If there are more queued jobs, trigger next
      const remaining = db.prepare("SELECT COUNT(*) as c FROM background_jobs WHERE status = 'queued'").get() as any;
      if (remaining && remaining.c > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }

  private async handleImportPlaylist(job: BackgroundJob, payload: any): Promise<void> {
    try {
      this.updateProgress(job.id, 25);
      const { playlistUrl, subjectId, contentType, resourceType } = payload;
      const courseId = job.course_id!;
      const userId = job.user_id;

      const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
      if (!course) throw new Error('Course not found or unauthorized');

      const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND course_id = ? AND user_id = ?').get(subjectId, courseId, userId);
      if (!subject) throw new Error('Subject not found or unauthorized');

      const data = await fetchPlaylistData(playlistUrl);
      this.updateProgress(job.id, 60);

      const playlistId = crypto.randomUUID();
      const now = new Date().toISOString();

      runTransaction(() => {
        const existing = db.prepare('SELECT youtube_video_id FROM videos WHERE course_id = ?').all(courseId) as any[];
        const existingSet = new Set(existing.map(e => e.youtube_video_id));

        db.prepare(`
          INSERT INTO playlists (id, course_id, subject_id, user_id, title, channel_name, youtube_playlist_id, video_count, total_duration_seconds, thumbnail_url, resource_type, source_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          playlistId,
          courseId,
          subjectId,
          userId,
          data.title,
          data.channelName,
          data.playlistId,
          data.videoCount,
          data.totalDurationSeconds,
          data.thumbnailUrl,
          resourceType || 'Main Lectures',
          data.source,
          now,
          now
        );

        const insertVideoStmt = db.prepare(`
          INSERT INTO videos (id, course_id, subject_id, playlist_id, user_id, youtube_video_id, title, description, duration_seconds, thumbnail_url, channel_name, original_position, content_type, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?)
        `);

        let addedCount = 0;
        for (const v of data.videos) {
          if (existingSet.has(v.youtubeVideoId)) continue;
          insertVideoStmt.run(
            crypto.randomUUID(),
            courseId,
            subjectId,
            playlistId,
            userId,
            v.youtubeVideoId,
            v.title,
            v.description,
            v.durationSeconds,
            v.thumbnailUrl,
            v.channelName,
            v.originalPosition,
            contentType || 'Lecture',
            now,
            now
          );
          existingSet.add(v.youtubeVideoId);
          addedCount++;
        }
      });

      invalidateCourseCache(userId, courseId);
      this.markCompleted(job.id, {
        playlistId,
        title: data.title,
        videoCount: data.videos.length,
        channelName: data.channelName,
      });
    } catch (err: any) {
      this.markFailed(job.id, err.message || 'Failed to import playlist');
    }
  }

  private async handleGenerateSchedule(job: BackgroundJob, payload: any): Promise<void> {
    try {
      this.updateProgress(job.id, 30);
      const courseId = job.course_id!;
      const userId = job.user_id;

      const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
      if (!course) throw new Error('Course not found');

      const planningMode = course.planning_mode || 'smart';
      const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
      const subjects = db.prepare('SELECT id, name, priority, color, target_date as targetDate FROM subjects WHERE course_id = ?').all(courseId) as any;
      const videos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any;

      const studyDays = prefs ? JSON.parse(prefs.study_days_json) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const restDays = prefs ? JSON.parse(prefs.rest_days_json) : ['sunday'];

      this.updateProgress(job.id, 50);

      const existingLockedTasks = db.prepare(`
        SELECT id, scheduled_date as scheduledDate, task_type as taskType, subject_id as subjectId, video_id as videoId, 
               custom_title as customTitle, planned_duration_seconds as plannedDurationSeconds, 
               phase, order_index as orderIndex, schedule_source as scheduleSource, is_locked as isLocked, task_category as taskCategory
        FROM study_tasks
        WHERE course_id = ? AND user_id = ? AND (is_locked = 1 OR schedule_source = 'manual' OR is_completed = 1)
      `).all(courseId, userId) as any[];

      const { tasks, feasibility } = generateSchedule({
        courseId,
        userId,
        startDate: payload.startDate || new Date().toISOString().split('T')[0],
        examDate: course.exam_date,
        targetFinishDate: course.target_finish_date,
        planningMode,
        dailyStudyMinutes: prefs?.daily_study_minutes || 180,
        studyDays,
        restDays,
        strategy: prefs?.strategy || 'smart_interleaved',
        bufferDays: prefs?.buffer_days || 5,
        revisionDays: prefs?.revision_days || 10,
        pyqDays: prefs?.pyq_days || 5,
        mockDays: prefs?.mock_days || 3,
        prepMode: prefs?.prep_mode || 'full',
        subjects,
        videos,
        lockedTasks: existingLockedTasks,
      });

      this.updateProgress(job.id, 80);
      const now = new Date().toISOString();

      runTransaction(() => {
        db.prepare(`
          DELETE FROM study_tasks 
          WHERE course_id = ? AND user_id = ? AND is_completed = 0 AND is_locked = 0 AND schedule_source != 'manual'
        `).run(courseId, userId);

        const preservedIds = new Set(existingLockedTasks.map(t => t.id).filter(Boolean));
        const insertTaskStmt = db.prepare(`
          INSERT INTO study_tasks (
            id, course_id, user_id, scheduled_date, task_type, subject_id, video_id, 
            custom_title, planned_duration_seconds, phase, order_index, is_completed, 
            schedule_source, is_locked, task_category, schedule_explanation, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
        `);

        for (const t of tasks) {
          if (t.id && preservedIds.has(t.id)) continue;
          insertTaskStmt.run(
            crypto.randomUUID(),
            courseId,
            userId,
            t.scheduledDate,
            t.taskType,
            t.subjectId || null,
            t.videoId || null,
            t.customTitle,
            t.plannedDurationSeconds,
            t.phase,
            t.orderIndex,
            t.scheduleSource || (planningMode === 'hybrid' ? 'hybrid' : 'automatic'),
            t.isLocked ? 1 : 0,
            t.taskCategory || 'Watch Lecture',
            t.scheduleExplanation || null,
            now,
            now
          );
        }

        db.prepare('UPDATE courses SET schedule_version = schedule_version + 1, updated_at = ? WHERE id = ? AND user_id = ?').run(now, courseId, userId);
      });

      invalidateCourseCache(userId, courseId);
      this.markCompleted(job.id, {
        tasksCount: tasks.length,
        feasibility,
      });
    } catch (err: any) {
      this.markFailed(job.id, err.message || 'Schedule generation failed');
    }
  }

  private async handleClassifyVideos(job: BackgroundJob, payload: any): Promise<void> {
    try {
      this.updateProgress(job.id, 20);
      const courseId = job.course_id!;
      const userId = job.user_id;
      const { subjectId } = payload;

      let subjectName = 'Course Syllabus';
      let videosToClassify: any[] = [];

      if (subjectId) {
        const subject = db.prepare('SELECT name FROM subjects WHERE id = ? AND course_id = ?').get(subjectId, courseId) as any;
        if (subject) subjectName = subject.name;
        videosToClassify = db.prepare('SELECT id, title, description FROM videos WHERE subject_id = ? AND course_id = ?').all(subjectId, courseId) as any[];
      } else {
        videosToClassify = db.prepare('SELECT id, title, description FROM videos WHERE course_id = ? LIMIT 60').all(courseId) as any[];
      }

      this.updateProgress(job.id, 50);
      const classifications = await analyzeVideosWithAI(subjectName, videosToClassify);

      this.updateProgress(job.id, 80);
      const updateStmt = db.prepare('UPDATE videos SET content_type = ?, difficulty = ? WHERE id = ? AND user_id = ?');
      for (const c of classifications) {
        updateStmt.run(c.contentType || 'Lecture', c.difficulty || 'normal', c.videoId, userId);
      }

      invalidateCourseCache(userId, courseId);
      this.markCompleted(job.id, {
        classifiedCount: classifications.length,
        classifications,
      });
    } catch (err: any) {
      this.markFailed(job.id, err.message || 'Video classification failed');
    }
  }
}

export const jobQueue = new JobQueueService();
