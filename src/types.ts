// Core TypeScript Types and Interfaces for StudyFlow

export interface User {
  id: string;
  email: string;
  name: string;
  examTarget?: string;
  dailyHours?: number;
  studyStyle?: string;
  emailVerified?: number;
  lastActiveCourseId?: string;
  lastActiveSubjectId?: string;
  lastActiveVideoId?: string;
  lastActiveAt?: string;
}

export interface Course {
  id: string;
  user_id: string;
  title: string;
  exam_name: string;
  exam_date: string; // YYYY-MM-DD
  target_finish_date?: string;
  description?: string;
  planning_mode?: 'smart' | 'manual' | 'hybrid';
  schedule_version: number;
  subject_count?: number;
  video_count?: number;
  completed_video_count?: number;
  total_duration_seconds?: number;
  completed_duration_seconds?: number;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  course_id: string;
  name: string;
  priority: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  color: string;
  target_date?: string | null; // Subject-specific deadline YYYY-MM-DD
  video_count?: number;
  completed_video_count?: number;
  playlist_count?: number;
  total_duration_seconds?: number;
  completed_duration_seconds?: number;
  remaining_duration_seconds?: number;
  status?: 'On Track' | 'At Risk' | 'Behind' | 'Completed' | 'No Deadline';
  days_remaining?: number | null;
  available_study_days?: number | null;
  required_daily_minutes?: number;
  current_pace_minutes?: number;
  has_conflict?: boolean;
  conflict_message?: string;
  conflict_shortfall_hours?: number;
  adjustment_options?: string[];
  progressPct?: number;
}

export interface Video {
  id: string;
  course_id: string;
  subject_id: string;
  playlist_id?: string;
  youtube_video_id: string;
  title: string;
  description?: string;
  duration_seconds: number;
  thumbnail_url?: string;
  channel_name?: string;
  original_position: number;
  content_type?: string;
  difficulty?: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  subject_name?: string;
  subject_color?: string;
  scheduled_date?: string;
  is_locked?: number;
  schedule_source?: string;
}

export interface StudyTask {
  id: string;
  course_id: string;
  scheduled_date: string; // YYYY-MM-DD
  task_type: 'video' | 'revision' | 'pyq' | 'mock' | 'buffer' | 'custom';
  subject_id?: string;
  video_id?: string;
  custom_title: string;
  planned_duration_seconds: number;
  phase: 'learning' | 'revision' | 'pyq' | 'mock';
  order_index: number;
  is_completed: number; // 0 or 1
  completed_at?: string;
  subject_name?: string;
  subject_color?: string;
  youtube_video_id?: string;
  thumbnail_url?: string;
  channel_name?: string;
  schedule_source?: 'automatic' | 'manual' | 'hybrid' | 'rescheduled';
  is_locked?: number; // 0 or 1
  start_time?: string;
  task_category?: string;
  status?: 'pending' | 'completed' | 'missed' | 'skipped';
  schedule_explanation?: string;
}

export interface StudyPreferences {
  daily_study_minutes: number;
  studyDays: string[];
  restDays: string[];
  strategy: 'balanced' | 'one_by_one' | 'priority' | 'smart_interleaved';
  difficulty_level: string;
  revision_mode: string;
  prep_mode: 'lectures_only' | 'lectures_revision' | 'lectures_revision_pyq' | 'full';
  buffer_days: number;
  revision_days: number;
  pyq_days: number;
  mock_days: number;
}

export interface SubjectFeasibilityReport {
  subjectId: string;
  subjectName: string;
  targetDate?: string | null;
  hasDeadline: boolean;
  totalVideos: number;
  completedVideos: number;
  remainingVideos: number;
  totalSeconds: number;
  completedSeconds: number;
  remainingSeconds: number;
  progressPct: number;
  daysRemaining: number;
  availableStudyDays: number;
  requiredDailyMinutes: number;
  currentPaceMinutes: number;
  status: 'On Track' | 'At Risk' | 'Behind' | 'Completed' | 'No Deadline';
  hasConflict: boolean;
  conflictMessage?: string;
  conflictShortfallHours?: number;
  adjustmentOptions?: string[];
}

export interface FeasibilityReport {
  isFeasible: boolean;
  totalRemainingSeconds: number;
  availableStudyDays: number;
  totalAvailableSeconds: number;
  requiredDailyMinutes: number;
  availableDailyMinutes: number;
  shortfallMinutes: number;
  projectedFinishDate: string;
  suggestedDailyMinutes: number;
  warningMessage?: string;
  subjectReports?: SubjectFeasibilityReport[];
  deadlineConflicts?: SubjectFeasibilityReport[];
}

export interface DashboardData {
  course: Course;
  planningMode?: 'smart' | 'manual' | 'hybrid';
  todayStr: string;
  daysLeft: number;
  todayTasks: StudyTask[];
  missedTasks?: StudyTask[];
  todayPlannedSec: number;
  todayCompletedSec: number;
  todayProgressPct: number;
  nextTask?: StudyTask;
  overallPercentage: number;
  totalVideoDuration: number;
  completedVideoDuration: number;
  streak: number;
  aheadBehindText: string;
  upcomingSubjectDeadlines?: Subject[];
  deadlineConflicts?: SubjectFeasibilityReport[];
}

export interface CalendarDay {
  date: string;
  totalPlannedSeconds: number;
  completedSeconds: number;
  tasks: StudyTask[];
  subjects: string[];
  completionRate: number;
}

export interface CustomResource {
  id: string;
  course_id: string;
  subject_id?: string;
  subject_name?: string;
  title: string;
  resource_type: 'pdf' | 'link' | 'book' | 'notes';
  url?: string;
  notes?: string;
  created_at: string;
}

export interface Playlist {
  id: string;
  course_id: string;
  subject_id: string;
  subject_name?: string;
  subject_color?: string;
  youtube_playlist_id: string;
  title: string;
  channel_name?: string;
  resource_type?: string;
  video_count: number;
  completed_video_count?: number;
  actual_video_count?: number;
  total_duration_seconds: number;
  actual_duration_seconds?: number;
  thumbnail_url?: string;
  created_at: string;
}

export interface AIInsights {
  summary: string;
  keyObservation: string;
  actionableRecommendations: string[];
}
