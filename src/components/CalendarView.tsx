import { YouTubeThumbnail } from "./YouTubeThumbnail";
import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, 
  Circle, Clock, Play, BookOpen, Layers, Check, ExternalLink,
  Lock, Unlock, Plus, MoveRight, AlertTriangle, ArrowRight,
  Sparkles, RefreshCw, X, Tag, ListPlus, Video as VideoIcon,
  CalendarCheck, MoreVertical
} from 'lucide-react';
import { CalendarDay, Course, StudyTask, Subject, Video } from '../types';
import { formatDuration, formatDateReadable, formatDayName, apiRequest } from '../utils';

interface CalendarViewProps {
  course: Course;
  onRefresh: () => Promise<void>;
}

// ----------------------------------------------------
// THUMBNAIL RESOLVER HELPER
// ----------------------------------------------------
function getInitialThumbnailUrl(task: StudyTask): string | null {
  // If stored thumbnail_url is a real YouTube thumbnail URL, use it directly
  if (
    task.thumbnail_url &&
    (task.thumbnail_url.includes('ytimg.com') ||
      task.thumbnail_url.includes('youtube.com') ||
      task.thumbnail_url.includes('ggpht.com'))
  ) {
    return task.thumbnail_url;
  }
  // If youtube_video_id is available, derive standard high-quality YouTube thumbnail
  if (task.youtube_video_id && task.youtube_video_id.trim().length > 0) {
    return `https://i.ytimg.com/vi/${task.youtube_video_id.trim()}/hqdefault.jpg`;
  }
  // Stored non-placeholder image
  if (task.thumbnail_url && task.thumbnail_url.trim().length > 0 && !task.thumbnail_url.includes('placeholder')) {
    return task.thumbnail_url;
  }
  return null;
}

// ----------------------------------------------------
// DEDICATED SCHEDULED TASK / VIDEO CARD
// ----------------------------------------------------
interface TaskCardProps {
  task: StudyTask;
  selectedDate: string;
  onToggleTask: (task: StudyTask) => Promise<void>;
  onToggleLock: (task: StudyTask) => Promise<void>;
  onOpenReschedule: (task: StudyTask) => void;
  onWatchVideo: (task: StudyTask) => void;
  onMissedAction: (task: StudyTask, action: 'reschedule' | 'skip', customDate?: string) => Promise<void>;
}

const ScheduledTaskCard: React.FC<TaskCardProps> = ({
  task,
  selectedDate,
  onToggleTask,
  onToggleLock,
  onOpenReschedule,
  onWatchVideo,
  onMissedAction
}) => {
  const isVideo = Boolean(task.youtube_video_id || task.task_type === 'video' || task.video_id);
  const initialThumb = getInitialThumbnailUrl(task);
  const [thumbSrc, setThumbSrc] = useState<string | null>(initialThumb);
  const [imgFailed, setImgFailed] = useState(false);

  // Sync if task changes
  useEffect(() => {
    setThumbSrc(getInitialThumbnailUrl(task));
    setImgFailed(false);
  }, [task.id, task.youtube_video_id, task.thumbnail_url]);

  const handleImageError = () => {
    // Try fallback standard YouTube resolution (mqdefault -> default) before displaying clean SVG fallback
    if (task.youtube_video_id && thumbSrc && thumbSrc.includes('hqdefault')) {
      setThumbSrc(`https://i.ytimg.com/vi/${task.youtube_video_id}/mqdefault.jpg`);
    } else if (task.youtube_video_id && thumbSrc && thumbSrc.includes('mqdefault')) {
      setThumbSrc(`https://i.ytimg.com/vi/${task.youtube_video_id}/default.jpg`);
    } else if (task.thumbnail_url && thumbSrc !== task.thumbnail_url && !task.thumbnail_url.includes('placeholder')) {
      setThumbSrc(task.thumbnail_url);
    } else {
      setImgFailed(true);
    }
  };

  const isDone = task.is_completed === 1;
  const isLocked = task.is_locked === 1;
  const todayStr = new Date().toISOString().split('T')[0];
  const isPast = new Date(selectedDate) < new Date(new Date().setHours(0, 0, 0, 0));
  const isMissed = isPast && !isDone;

  return (
    <div
      className={`rounded-2xl border transition-all overflow-hidden flex flex-col ${
        isDone
          ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-90'
          : isMissed
            ? 'bg-amber-50/20 dark:bg-amber-950/15 border-amber-200/90 dark:border-amber-800/80 shadow-xs'
            : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs hover:shadow-md'
      }`}
    >
      {/* ----------------- UPPER THUMBNAIL (16:9 Aspect Ratio) ----------------- */}
      {isVideo ? (
        <YouTubeThumbnail
          videoId={task.youtube_video_id}
          thumbnailUrl={task.thumbnail_url}
          title={task.custom_title}
          subjectName={task.subject_name}
          subjectColor={task.subject_color}
          aspectRatioClass="aspect-video"
          roundedClass="rounded-t-2xl rounded-b-none"
          showPlayOverlay={true}
          onClick={() => onWatchVideo(task)}
        >
          {/* Overlay Chips */}
          {/* Top-Right: Video Duration */}
          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/85 backdrop-blur-xs text-white text-[11px] font-mono font-semibold flex items-center gap-1 shadow-sm z-10">
            <Clock className="w-3 h-3 text-slate-300" />
            {formatDuration(task.planned_duration_seconds)}
          </div>

          {/* Top-Left: Subject Badge */}
          {task.subject_name && (
            <div 
              className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold text-white shadow-sm backdrop-blur-xs truncate max-w-[160px] z-10"
              style={{ backgroundColor: task.subject_color || "#2563eb" }}
            >
              {task.subject_name}
            </div>
          )}

          {/* Bottom-Right: Completed Status Badge */}
          {isDone && (
            <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-emerald-600/95 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-xs z-10">
              <Check className="w-3 h-3 stroke-[3]" />
              Completed
            </div>
          )}
        </YouTubeThumbnail>
      ) : (
        /* Non-video / Custom Task Header Banner */
        <div 
          className="p-3.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800"
          style={{
            backgroundColor: `${task.subject_color || '#2563eb'}10`
          }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="w-2.5 h-2.5 rounded-full" 
              style={{ backgroundColor: task.subject_color || '#2563eb' }} 
            />
            <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {task.subject_name || 'Study Task'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            {formatDuration(task.planned_duration_seconds)}
          </div>
        </div>
      )}

      {/* ----------------- CARD CONTENT BODY ----------------- */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          {/* Metadata Row: Subject badge (if not already shown or for custom tasks) + Category / Lock Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {!isVideo && task.subject_name && (
              <span 
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                style={{ 
                  backgroundColor: `${task.subject_color || '#2563eb'}15`, 
                  color: task.subject_color || '#2563eb' 
                }}
              >
                {task.subject_name}
              </span>
            )}

            {task.task_category && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                {task.task_category}
              </span>
            )}

            {isLocked && (
              <span 
                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center gap-1"
                title="Locked: Won't move during schedule rebalancing"
              >
                <Lock className="w-2.5 h-2.5" /> Locked
              </span>
            )}

            {task.schedule_source === 'manual' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Manual
              </span>
            )}
          </div>

          {/* Video Title */}
          <h4 
            onClick={() => isVideo && onWatchVideo(task)}
            className={`text-sm font-semibold leading-snug line-clamp-2 transition-colors ${
              isVideo ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : ''
            } ${
              isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
            }`}
            title={task.custom_title}
          >
            {task.custom_title}
          </h4>

          {/* Channel Name */}
          {task.channel_name && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate font-medium flex items-center gap-1">
              <span className="truncate">{task.channel_name}</span>
            </p>
          )}
        </div>

        {/* Missed Task Warning Banner */}
        {isMissed && (
          <div className="p-2.5 rounded-xl bg-amber-100/70 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 text-xs space-y-1.5">
            <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Missed Study Task
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                onClick={() => onMissedAction(task, 'reschedule', todayStr)}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold hover:bg-amber-50 text-[11px] shadow-2xs"
              >
                Move to Today
              </button>
              <button
                onClick={() => {
                  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                  onMissedAction(task, 'reschedule', tomorrow);
                }}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold hover:bg-amber-50 text-[11px] shadow-2xs"
              >
                Push to Tomorrow
              </button>
              <button
                onClick={() => onMissedAction(task, 'skip')}
                className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* ----------------- CARD FOOTER ACTIONS ----------------- */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
          {/* Watch Video Button */}
          {isVideo ? (
            <button
              onClick={() => onWatchVideo(task)}
              className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Watch Video
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <BookOpen className="w-3.5 h-3.5" /> Self Study
            </span>
          )}

          {/* Right Action Group: Mark Done, Lock, Move */}
          <div className="flex items-center gap-1.5">
            {/* Mark Done Toggle Button */}
            <button
              onClick={() => onToggleTask(task)}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-2xs ${
                isDone
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
              title={isDone ? 'Mark task as incomplete' : 'Mark task as completed'}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              {isDone ? 'Done' : 'Mark Done'}
            </button>

            {/* Lock Toggle */}
            <button
              onClick={() => onToggleLock(task)}
              className={`p-1.5 rounded-xl transition-colors ${
                isLocked
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={isLocked ? 'Locked (click to unlock)' : 'Click to lock (keep fixed on this date during rebalance)'}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>

            {/* Reschedule / Move Button */}
            <button
              onClick={() => onOpenReschedule(task)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Reschedule / Move to another day"
            >
              <MoveRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// MAIN CALENDAR VIEW COMPONENT
// ----------------------------------------------------
export const CalendarView: React.FC<CalendarViewProps> = ({ course, onRefresh }) => {
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [activeTaskForModal, setActiveTaskForModal] = useState<StudyTask | null>(null);
  
  // Unscheduled Content Drawer State
  const [unscheduledDrawerOpen, setUnscheduledDrawerOpen] = useState(false);
  const [unscheduledData, setUnscheduledData] = useState<any[]>([]);
  const [totalUnscheduledCount, setTotalUnscheduledCount] = useState(0);

  // Manual Add Task Modal
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [taskSubjectId, setTaskSubjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState('Watch Lecture');
  const [taskDurationMinutes, setTaskDurationMinutes] = useState(45);
  const [taskStartTime, setTaskStartTime] = useState('10:00');
  const [selectedVideoToSchedule, setSelectedVideoToSchedule] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [addingTask, setAddingTask] = useState(false);

  // Reschedule Task Modal
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [taskToReschedule, setTaskToReschedule] = useState<StudyTask | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  // Mode Switcher State
  const [modeSwitching, setModeSwitching] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      const [calRes, unscheduledRes, subsRes] = await Promise.all([
        apiRequest(`/courses/${course.id}/calendar`),
        apiRequest(`/courses/${course.id}/unscheduled`),
        apiRequest(`/courses/${course.id}/subjects`)
      ]);
      const fetchedDays: CalendarDay[] = calRes.days || [];
      setDays(fetchedDays);
      setUnscheduledData(unscheduledRes.grouped || []);
      setTotalUnscheduledCount(unscheduledRes.totalUnscheduledCount || 0);
      setSubjects(subsRes.subjects || []);
      if (subsRes.subjects?.length > 0 && !taskSubjectId) {
        setTaskSubjectId(subsRes.subjects[0].id);
      }

      // Default selected day: keep currently selected date if exists, or match today, or first day
      const todayStr = new Date().toISOString().split('T')[0];
      setSelectedDay((prev) => {
        if (prev) {
          const matchExisting = fetchedDays.find((d) => d.date === prev.date);
          if (matchExisting) return matchExisting;
        }
        const foundToday = fetchedDays.find((d) => d.date === todayStr);
        if (foundToday) return foundToday;
        return fetchedDays.length > 0 ? fetchedDays[0] : null;
      });
    } catch (err) {
      console.error('Failed to load calendar:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [course.id]);

  // Toggle Task Completion
  const handleToggleTask = async (task: StudyTask) => {
    try {
      await apiRequest(`/tasks/${task.id}/toggle`, { method: 'PUT' });
      await fetchCalendar();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update task');
    }
  };

  // Toggle Task Lock (Hybrid / Smart Mode)
  const handleToggleLock = async (task: StudyTask) => {
    try {
      const res = await apiRequest(`/tasks/${task.id}/lock`, { method: 'PUT' });
      setSuccessToast(res.isLocked ? 'Task locked! It will not be moved during auto-rescheduling.' : 'Task unlocked.');
      await fetchCalendar();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle task lock');
    }
  };

  // Handle Missed Task Action
  const handleMissedTaskAction = async (task: StudyTask, action: 'reschedule' | 'skip', customDate?: string) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const targetDate = customDate || (action === 'reschedule' ? todayStr : undefined);

      await apiRequest(`/tasks/${task.id}/missed-action`, {
        method: 'PUT',
        body: JSON.stringify({
          action,
          newDate: targetDate
        })
      });

      setSuccessToast(action === 'reschedule' ? `Rescheduled to ${formatDateReadable(targetDate!)}` : 'Marked task as skipped');
      await fetchCalendar();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update missed task');
    }
  };

  // Open Reschedule Modal
  const openRescheduleModal = (task: StudyTask) => {
    setTaskToReschedule(task);
    setRescheduleDate(task.scheduled_date || new Date().toISOString().split('T')[0]);
    setRescheduleModalOpen(true);
  };

  // Submit Reschedule
  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToReschedule || !rescheduleDate) return;
    setRescheduling(true);
    try {
      await apiRequest(`/tasks/${taskToReschedule.id}/reschedule`, {
        method: 'PUT',
        body: JSON.stringify({ newDate: rescheduleDate })
      });
      setRescheduleModalOpen(false);
      setTaskToReschedule(null);
      setSuccessToast(`Moved to ${formatDateReadable(rescheduleDate)}`);
      await fetchCalendar();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to reschedule task');
    } finally {
      setRescheduling(false);
    }
  };

  // Submit Manual Task Add
  const handleCreateManualTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;
    setAddingTask(true);
    try {
      await apiRequest(`/courses/${course.id}/tasks/manual`, {
        method: 'POST',
        body: JSON.stringify({
          customTitle: taskTitle,
          subjectId: taskSubjectId || null,
          videoId: selectedVideoToSchedule || null,
          scheduledDate: selectedDay.date,
          startTime: taskStartTime || null,
          durationMinutes: taskDurationMinutes,
          taskCategory,
          taskType: selectedVideoToSchedule ? 'video' : 'custom',
          isLocked: 1 // Manual tasks are locked by default
        })
      });

      setAddTaskModalOpen(false);
      setTaskTitle('');
      setSelectedVideoToSchedule('');
      setSuccessToast(`Added manual task to ${formatDateReadable(selectedDay.date)}!`);
      await fetchCalendar();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to create manual task');
    } finally {
      setAddingTask(false);
    }
  };

  // Instant Schedule Unscheduled Video to Selected Day
  const handleScheduleUnscheduledVideoToSelectedDay = async (videoId: string, videoTitle: string) => {
    if (!selectedDay) return;
    try {
      await apiRequest(`/courses/${course.id}/videos/${videoId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          scheduledDate: selectedDay.date
        })
      });
      setSuccessToast(`Scheduled "${videoTitle}" for ${formatDateReadable(selectedDay.date)}.`);
      await fetchCalendar();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to schedule video');
    }
  };

  // Switch Course Planning Mode
  const handleSwitchPlanningMode = async (newMode: 'smart' | 'manual' | 'hybrid') => {
    setModeSwitching(true);
    try {
      await apiRequest(`/courses/${course.id}/planning-mode`, {
        method: 'PUT',
        body: JSON.stringify({ planningMode: newMode })
      });
      setSuccessToast(`Switched planning mode to ${newMode.toUpperCase()}!`);
      await onRefresh();
      await fetchCalendar();
    } catch (err: any) {
      alert(err.message || 'Failed to update planning mode');
    } finally {
      setModeSwitching(false);
    }
  };

  // Regenerate Schedule
  const handleRegenerate = async () => {
    if (!confirm('Rebalance schedule? All your completed tasks and locked tasks will remain untouched.')) return;
    setRegenerating(true);
    try {
      await apiRequest(`/courses/${course.id}/schedule/generate`, {
        method: 'POST',
        body: JSON.stringify({ preserveCompleted: true })
      });
      setSuccessToast('Schedule successfully rebalanced with your preferences!');
      await fetchCalendar();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate schedule');
    } finally {
      setRegenerating(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successToast}</span>
          </div>
          <button 
            onClick={() => setSuccessToast(null)} 
            className="font-bold text-sm px-2 text-emerald-700 dark:text-emerald-300 hover:opacity-80"
          >
            ✕
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 4. PAGE HEADER: Title, Exam Target, Version & Controls */}
      {/* ---------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <CalendarIcon className="w-7 h-7 text-blue-600" />
            Study Schedule & Calendar
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Exam Target: <strong className="text-slate-800 dark:text-slate-200">{formatDateReadable(course.exam_date)}</strong> · Schedule Version: <strong className="text-slate-800 dark:text-slate-200">v{course.schedule_version}</strong>
          </p>
        </div>

        {/* Planning Mode Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Smart / Hybrid / Manual Segmented Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => handleSwitchPlanningMode('smart')}
              disabled={modeSwitching}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                course.planning_mode === 'smart'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Smart Mode: Automatically distributes workload"
            >
              <Sparkles className="w-3.5 h-3.5" /> Smart
            </button>

            <button
              onClick={() => handleSwitchPlanningMode('hybrid')}
              disabled={modeSwitching}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                course.planning_mode === 'hybrid'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Hybrid Mode: Locks your fixed tasks and auto-fills rest"
            >
              <Lock className="w-3.5 h-3.5" /> Hybrid
            </button>

            <button
              onClick={() => handleSwitchPlanningMode('manual')}
              disabled={modeSwitching}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                course.planning_mode === 'manual'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Manual Mode: Full control, you assign all tasks"
            >
              ✋ Manual
            </button>
          </div>

          {/* Rebalance Schedule Button */}
          {course.planning_mode !== 'manual' && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-3.5 py-2 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 shadow-xs transition-colors"
              title="Rebalance future unlocked tasks"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${regenerating ? 'animate-spin' : ''}`} />
              Rebalance
            </button>
          )}

          {/* Unscheduled Content Toggle Button */}
          <button
            onClick={() => setUnscheduledDrawerOpen(!unscheduledDrawerOpen)}
            className={`px-3.5 py-2 rounded-2xl border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
              unscheduledDrawerOpen
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <ListPlus className="w-3.5 h-3.5" />
            Unscheduled ({totalUnscheduledCount})
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* UNSCHEDULED CONTENT ACCORDION / DRAWER */}
      {/* ---------------------------------------------------- */}
      {unscheduledDrawerOpen && (
        <div className="p-5 rounded-3xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListPlus className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider">
                Unscheduled Lectures Library ({totalUnscheduledCount} videos)
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Click &quot;+ Assign&quot; to schedule directly onto {selectedDay ? formatDateReadable(selectedDay.date).split(',')[0] : 'selected day'}
            </span>
          </div>

          {totalUnscheduledCount === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              ✓ All video lectures in your subjects are currently scheduled or completed!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-72 overflow-y-auto pr-1">
              {unscheduledData.map(group => (
                <div key={group.subject.id} className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.subject.color || '#2563eb' }} />
                      <span className="truncate">{group.subject.name}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">{group.count} left</span>
                  </div>

                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {group.videos.map((v: any) => (
                      <div key={v.id} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center gap-2.5 text-xs">
                        <div className="w-16 h-10 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                          <YouTubeThumbnail
                            videoId={v.youtube_video_id}
                            thumbnailUrl={v.thumbnail_url}
                            title={v.title}
                            aspectRatioClass="aspect-video"
                            roundedClass="rounded-lg"
                            className="w-full h-full"
                          />
                        </div>
                        <span className="truncate text-slate-800 dark:text-slate-200 font-medium text-[11px] flex-1 min-w-0" title={v.title}>
                          {v.title}
                        </span>
                        <button
                          onClick={() => handleScheduleUnscheduledVideoToSelectedDay(v.id, v.title)}
                          disabled={!selectedDay}
                          className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold shrink-0 shadow-2xs transition-colors"
                          title={`Schedule to ${selectedDay?.date}`}
                        >
                          + Assign
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. MAIN TWO-COLUMN LAYOUT */}
      {/* LEFT: Calendar Overview (~65-70%) */}
      {/* RIGHT: Selected Day Video Schedule (~30-35%) */}
      {/* ---------------------------------------------------- */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 text-sm font-medium bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800">
          Loading your calendar schedule...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ==================================================== */}
          {/* 6. LEFT COLUMN: Calendar Day Overview Cards (lg:col-span-7 xl:col-span-8) */}
          {/* ==================================================== */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-600" />
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Study Calendar Overview
                  </h2>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {days.length} scheduled study day{days.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Grid of Calendar Date Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[700px] overflow-y-auto pr-1">
                {days.map((d) => {
                  const isSelected = selectedDay?.date === d.date;
                  const isPast = new Date(d.date) < new Date(new Date().setHours(0, 0, 0, 0));
                  const isFullComplete = d.completionRate === 100 && d.totalPlannedSeconds > 0;
                  const hasMissed = isPast && d.completionRate < 100 && d.tasks.some(t => t.is_completed === 0);

                  return (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDay(d)}
                      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between min-h-[120px] group ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 ring-2 ring-blue-500/30 shadow-xs'
                          : isFullComplete
                            ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 hover:border-emerald-300'
                            : hasMissed
                              ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50/25 dark:bg-amber-950/20 hover:border-amber-400'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
                      }`}
                    >
                      <div>
                        {/* DAY and STATUS */}
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${
                            isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'
                          }`}>
                            {formatDayName(d.date)}
                          </span>

                          {isFullComplete ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : hasMissed ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-bold border border-amber-300/60">
                              Missed
                            </span>
                          ) : d.completionRate > 0 ? (
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                              {d.completionRate}%
                            </span>
                          ) : null}
                        </div>

                        {/* DATE */}
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {formatDateReadable(d.date).split(',')[0]}
                        </div>

                        {/* TOTAL STUDY TIME */}
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 font-mono font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatDuration(d.totalPlannedSeconds)}
                        </div>
                      </div>

                      {/* SUBJECT TAGS */}
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {d.subjects.slice(0, 2).map((sub, i) => (
                          <span 
                            key={i} 
                            className="text-[9px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium truncate max-w-[85px]"
                          >
                            {sub}
                          </span>
                        ))}
                        {d.subjects.length > 2 && (
                          <span className="text-[9px] px-1 py-0.5 rounded-md text-slate-400 font-semibold">
                            +{d.subjects.length - 2}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ==================================================== */}
          {/* 7. RIGHT COLUMN: Selected Day Detailed Video Schedule (lg:col-span-5 xl:col-span-4) */}
          {/* ==================================================== */}
          <div className="lg:col-span-5 xl:col-span-4 rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden flex flex-col">
            {selectedDay ? (
              <div className="p-5 sm:p-6 space-y-4">
                {/* ----------------- STICKY PANEL HEADER ----------------- */}
                <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs z-10 pb-3.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      {formatDayName(selectedDay.date)} SCHEDULE
                    </span>
                    <button
                      onClick={() => setAddTaskModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </button>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {formatDateReadable(selectedDay.date)}
                  </h3>

                  {/* Metrics Row: Target | Tasks | Done */}
                  <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
                    <span>Target: <strong className="text-slate-800 dark:text-slate-200">{formatDuration(selectedDay.totalPlannedSeconds)}</strong></span>
                    <span>·</span>
                    <span>Tasks: <strong className="text-slate-800 dark:text-slate-200">{selectedDay.tasks.length}</strong></span>
                    <span>·</span>
                    <span>Done: <strong className="text-slate-800 dark:text-slate-200">{selectedDay.completionRate}%</strong></span>
                  </div>

                  {/* Mini Progress Bar */}
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                    <div 
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${selectedDay.completionRate}%` }}
                    />
                  </div>
                </div>

                {/* ----------------- SCROLLABLE VIDEO CARD LIST ----------------- */}
                <div className="space-y-4 max-h-[660px] overflow-y-auto pr-1 pb-2">
                  {selectedDay.tasks.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
                      <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto" />
                      <div>
                        <p className="font-semibold text-slate-600 dark:text-slate-300">No study tasks on this day.</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Use Add Task or assign lectures from Unscheduled.</p>
                      </div>
                      <button
                        onClick={() => setAddTaskModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Task or Video
                      </button>
                    </div>
                  ) : (
                    selectedDay.tasks.map((task) => (
                      <ScheduledTaskCard
                        key={task.id}
                        task={task}
                        selectedDate={selectedDay.date}
                        onToggleTask={handleToggleTask}
                        onToggleLock={handleToggleLock}
                        onOpenReschedule={openRescheduleModal}
                        onWatchVideo={(t) => setActiveTaskForModal(t)}
                        onMissedAction={handleMissedTaskAction}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs">
                Select any date from the calendar to view its detailed schedule.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MANUAL TASK ADD MODAL */}
      {/* ---------------------------------------------------- */}
      {addTaskModalOpen && selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Add Study Task to {formatDateReadable(selectedDay.date)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manually scheduled tasks are locked to this day.
                </p>
              </div>
              <button 
                onClick={() => setAddTaskModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subject
                </label>
                <select
                  value={taskSubjectId}
                  onChange={(e) => setTaskSubjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Task Category
                </label>
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="Watch Lecture">Watch Lecture</option>
                  <option value="Solve PYQs">Solve PYQs / Past Papers</option>
                  <option value="Rapid Revision">Rapid Revision Session</option>
                  <option value="Formula Practice">Formula & Short Notes Practice</option>
                  <option value="Mock Test">Mock Test / Assessment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 4 Practice or Lecture 12"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="360"
                    value={taskDurationMinutes}
                    onChange={(e) => setTaskDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Start Time (Optional)
                  </label>
                  <input
                    type="time"
                    value={taskStartTime}
                    onChange={(e) => setTaskStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddTaskModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingTask || !taskTitle.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 shadow-xs"
                >
                  {addingTask ? 'Adding...' : 'Add Task to Day'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* RESCHEDULE TASK MODAL */}
      {/* ---------------------------------------------------- */}
      {rescheduleModalOpen && taskToReschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Reschedule Task
              </h3>
              <p className="text-xs text-slate-500 truncate mt-1">
                {taskToReschedule.custom_title}
              </p>
            </div>

            <form onSubmit={handleConfirmReschedule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Date
                </label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRescheduleModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduling}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 shadow-xs"
                >
                  {rescheduling ? 'Moving...' : 'Move Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 10. WATCH VIDEO MODAL (Existing Embedded Player) */}
      {/* ---------------------------------------------------- */}
      {activeTaskForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                {activeTaskForModal.subject_name && (
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-0.5">
                    {activeTaskForModal.subject_name}
                  </span>
                )}
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate" title={activeTaskForModal.custom_title}>
                  {activeTaskForModal.custom_title}
                </h3>
              </div>
              <button
                onClick={() => setActiveTaskForModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold shrink-0 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-video w-full bg-black">
              {activeTaskForModal.youtube_video_id ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${activeTaskForModal.youtube_video_id}?autoplay=1`}
                  title={activeTaskForModal.custom_title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
                  <BookOpen className="w-8 h-8 text-slate-500" />
                  <span>Self-study or custom revision task</span>
                </div>
              )}
            </div>

            <div className="p-4 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>Duration: <strong>{formatDuration(activeTaskForModal.planned_duration_seconds)}</strong></span>
                {activeTaskForModal.channel_name && (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-[200px]">{activeTaskForModal.channel_name}</span>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  handleToggleTask(activeTaskForModal);
                  setActiveTaskForModal(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors ${
                  activeTaskForModal.is_completed === 1 
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {activeTaskForModal.is_completed === 1 ? 'Mark Incomplete' : '✓ Mark as Completed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
