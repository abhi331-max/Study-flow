import { YouTubeThumbnail } from "./YouTubeThumbnail";
import React, { useState, useEffect } from 'react';
import { 
  Play, CheckCircle2, Circle, Clock, Flame, Calendar, 
  ExternalLink, Sparkles, AlertCircle, ArrowRight, RotateCcw, 
  X, Check, BookOpen, Layers, Lock, Unlock, Target,
  Compass, Sliders, ChevronRight, Maximize2, Minimize2,
  SkipForward, ListVideo
} from 'lucide-react';
import { DashboardData, StudyTask, User } from '../types';
import { formatDuration, getGreeting, apiRequest, formatDateReadable } from '../utils';

interface TodayViewProps {
  user: User;
  dashboard: DashboardData;
  onRefresh: () => Promise<void>;
  onNavigateTab: (tab: string) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  user,
  dashboard,
  onRefresh,
  onNavigateTab
}) => {
  const [activeVideoTask, setActiveVideoTask] = useState<StudyTask | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [catchUpModalOpen, setCatchUpModalOpen] = useState(false);
  const [catchUpAdvice, setCatchUpAdvice] = useState<any>(null);
  const [catchUpLoading, setCatchUpLoading] = useState(false);

  // Focus Mode state: collapses non-essential UI for watching lecture videos
  const [isFocusMode, setIsFocusMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('studyflow_focus_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  // Subject Deadlines list
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(false);

  // Scheduling mode state
  const [planningMode, setPlanningMode] = useState<'smart' | 'manual' | 'hybrid'>(
    dashboard.course.planning_mode || 'smart'
  );
  const [modeSaving, setModeSaving] = useState(false);

  // Fetch subject deadlines
  useEffect(() => {
    const fetchDeadlines = async () => {
      setDeadlinesLoading(true);
      try {
        const data = await apiRequest(`/courses/${dashboard.course.id}/deadlines`);
        setDeadlines(data.deadlines || []);
      } catch (err) {
        console.warn('Could not load subject deadlines:', err);
      } finally {
        setDeadlinesLoading(false);
      }
    };

    fetchDeadlines();
  }, [dashboard.course.id]);

  // Toggle task completion
  const handleToggleTask = async (task: StudyTask) => {
    setActionLoading(true);
    try {
      await apiRequest(`/tasks/${task.id}/toggle`, { method: 'PUT' });
      await onRefresh();
      if (activeVideoTask && activeVideoTask.id === task.id) {
        setActiveVideoTask(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update task');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle task lock
  const handleToggleLock = async (task: StudyTask) => {
    try {
      await apiRequest(`/tasks/${task.id}/lock`, { method: 'PUT' });
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle lock');
    }
  };

  // Switch planning mode (Smart, Manual, Hybrid)
  const handleSwitchMode = async (mode: 'smart' | 'manual' | 'hybrid') => {
    setModeSaving(true);
    try {
      await apiRequest(`/courses/${dashboard.course.id}/preferences`, {
        method: 'PUT',
        body: JSON.stringify({ planningMode: mode })
      });
      setPlanningMode(mode);
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update scheduling mode');
    } finally {
      setModeSaving(false);
    }
  };

  // Trigger Catch-Up Advice
  const handleOpenCatchUp = async () => {
    setCatchUpLoading(true);
    setCatchUpModalOpen(true);
    try {
      const data = await apiRequest(`/courses/${dashboard.course.id}/ai/catchup-advice`, {
        method: 'POST',
        body: JSON.stringify({ missedMinutes: 120 })
      });
      setCatchUpAdvice(data.advice);
    } catch (err) {
      console.warn('Could not load catch-up advice:', err);
    } finally {
      setCatchUpLoading(false);
    }
  };

  // Apply Catch-Up Recovery
  const handleApplyCatchUp = async () => {
    setActionLoading(true);
    try {
      await apiRequest(`/courses/${dashboard.course.id}/schedule/generate`, {
        method: 'POST',
        body: JSON.stringify({ preserveCompleted: true })
      });
      setCatchUpModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust schedule');
    } finally {
      setActionLoading(false);
    }
  };

  // Focus Mode toggle handler
  const handleToggleFocusMode = (initialTaskId?: string) => {
    setIsFocusMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('studyflow_focus_mode', String(next));
      } catch {}
      return next;
    });
    if (initialTaskId) {
      setFocusTaskId(initialTaskId);
    }
  };

  // Keyboard shortcut: Escape to exit Focus Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) {
        setIsFocusMode(false);
        try {
          localStorage.setItem('studyflow_focus_mode', 'false');
        } catch {}
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode]);

  const remainingTasks = dashboard.todayTasks.filter(t => t.is_completed === 0);
  const completedTasks = dashboard.todayTasks.filter(t => t.is_completed === 1);
  const nextUp = dashboard.nextTask || remainingTasks[0];

  // Currently focused task in Focus Mode
  const currentFocusTask: StudyTask | null = (() => {
    if (focusTaskId) {
      const found = dashboard.todayTasks.find(t => t.id === focusTaskId);
      if (found) return found;
    }
    return nextUp || dashboard.todayTasks[0] || null;
  })();

  // Skip to next lecture in queue
  const handleNextLecture = () => {
    if (!currentFocusTask) return;
    const currentIndex = dashboard.todayTasks.findIndex(t => t.id === currentFocusTask.id);
    if (currentIndex !== -1) {
      const nextUncompleted = dashboard.todayTasks.slice(currentIndex + 1).find(t => t.is_completed === 0)
        || dashboard.todayTasks[currentIndex + 1]
        || dashboard.todayTasks.find(t => t.is_completed === 0 && t.id !== currentFocusTask.id);
      if (nextUncompleted) {
        setFocusTaskId(nextUncompleted.id);
        return;
      }
    }
    const anyRemaining = dashboard.todayTasks.find(t => t.is_completed === 0 && t.id !== currentFocusTask.id);
    if (anyRemaining) {
      setFocusTaskId(anyRemaining.id);
    }
  };

  // Today date formatted
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // FOCUS MODE RENDER: Collapses all non-essential UI elements to create a minimalist environment for watching lecture videos
  if (isFocusMode) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Minimalist Focus Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Focus Mode
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Minimalist
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-md">
                {dashboard.course.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Progress indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span className="font-semibold text-slate-900 dark:text-white font-mono">
                {completedTasks.length} / {dashboard.todayTasks.length}
              </span>
              <span>done today</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden ml-1">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${dashboard.todayTasks.length ? (completedTasks.length / dashboard.todayTasks.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Exit Focus Mode button */}
            <button
              onClick={() => handleToggleFocusMode()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer"
              title="Exit Focus Mode (or press Esc)"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Exit Focus Mode</span>
            </button>
          </div>
        </div>

        {/* Minimalist Lecture Environment */}
        {dashboard.todayTasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white dark:bg-slate-900 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              You're all caught up for today!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              No pending lecture videos scheduled for today. You can exit focus mode or view your syllabus and calendar.
            </p>
            <button
              onClick={() => handleToggleFocusMode()}
              className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              Exit Focus Mode
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Theater Lecture Player */}
            <div className="lg:col-span-8 space-y-4">
              {currentFocusTask ? (
                <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                  {/* Video Screen */}
                  <div className="relative aspect-video w-full bg-black">
                    {currentFocusTask.youtube_video_id && currentFocusTask.youtube_video_id.length === 11 && !currentFocusTask.youtube_video_id.startsWith('yt_') ? (
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${currentFocusTask.youtube_video_id}?autoplay=1&rel=0`}
                        title={currentFocusTask.custom_title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                        <Play className="w-12 h-12 text-blue-500 mb-2 opacity-80" />
                        <p className="text-base font-semibold text-white">{currentFocusTask.custom_title || 'Lecture Session'}</p>
                        <p className="text-xs text-slate-400 mt-1">Planned study duration: {formatDuration(currentFocusTask.planned_duration_seconds)}</p>
                        <p className="text-[11px] text-slate-500 mt-2 max-w-sm">
                          Focus on studying this topic now. Click "Mark Done" once you complete this lecture.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Lecture Details & Direct Controls */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {currentFocusTask.subject_name && (
                          <span 
                            className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
                            style={{ 
                              backgroundColor: `${currentFocusTask.subject_color || "#2563eb"}18`,
                              color: currentFocusTask.subject_color || "#2563eb"
                            }}
                          >
                            {currentFocusTask.subject_name}
                          </span>
                        )}
                        <span className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium font-mono flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatDuration(currentFocusTask.planned_duration_seconds)}
                        </span>
                        {currentFocusTask.is_locked === 1 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Locked
                          </span>
                        )}
                      </div>

                      {currentFocusTask.channel_name && (
                        <span className="text-xs text-slate-400">
                          {currentFocusTask.channel_name}
                        </span>
                      )}
                    </div>

                    <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
                      {currentFocusTask.custom_title}
                    </h2>

                    {/* Action Toolbar */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleTask(currentFocusTask)}
                          disabled={actionLoading}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer ${
                            currentFocusTask.is_completed === 1
                              ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                        >
                          {currentFocusTask.is_completed === 1 ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Completed</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Mark Done</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={handleNextLecture}
                          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Skip to next lecture in today's queue"
                        >
                          <span>Next Lecture</span>
                          <SkipForward className="w-3.5 h-3.5 text-slate-500" />
                        </button>

                        <button
                          onClick={() => handleToggleLock(currentFocusTask)}
                          className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                            currentFocusTask.is_locked === 1
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                              : "border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          }`}
                          title={currentFocusTask.is_locked === 1 ? "Locked to today" : "Lock to today"}
                        >
                          {currentFocusTask.is_locked === 1 ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {currentFocusTask.youtube_video_id && (
                        <a
                          href={`https://www.youtube.com/watch?v=${currentFocusTask.youtube_video_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <span>Open in YouTube</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center bg-white dark:bg-slate-900">
                  <p className="text-xs text-slate-400">Select a lecture from the queue to start watching.</p>
                </div>
              )}
            </div>

            {/* Right: Minimalist Today's Lecture Queue */}
            <div className="lg:col-span-4 space-y-3">
              <div className="p-4 rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <ListVideo className="w-4 h-4 text-blue-600" />
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Today's Lectures
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-400">
                    {remainingTasks.length} remaining
                  </span>
                </div>

                {/* Playlist items */}
                <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
                  {dashboard.todayTasks.map((task, idx) => {
                    const isCurrent = currentFocusTask?.id === task.id;
                    const isCompleted = task.is_completed === 1;

                    return (
                      <div
                        key={task.id}
                        onClick={() => setFocusTaskId(task.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                          isCurrent
                            ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-1 ring-blue-500/30"
                            : isCompleted
                              ? "border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30 opacity-70 hover:opacity-100"
                              : "border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400/50"
                        }`}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTask(task);
                          }}
                          className="shrink-0 text-slate-300 dark:text-slate-600 hover:text-blue-600 transition-colors p-0.5 cursor-pointer"
                          title={isCompleted ? "Mark uncompleted" : "Mark completed"}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100 dark:fill-emerald-950" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                        </button>

                        {/* Title and info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-mono text-slate-400">
                              #{idx + 1}
                            </span>
                            {task.subject_name && (
                              <span
                                className="text-[10px] px-1.5 py-0.2 rounded font-semibold truncate max-w-[100px]"
                                style={{
                                  backgroundColor: `${task.subject_color || "#2563eb"}18`,
                                  color: task.subject_color || "#2563eb"
                                }}
                              >
                                {task.subject_name}
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-blue-600 text-white">
                                Playing
                              </span>
                            )}
                          </div>
                          <p className={`text-xs font-semibold line-clamp-1 leading-snug ${
                            isCompleted ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-200"
                          }`}>
                            {task.custom_title}
                          </p>
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(task.planned_duration_seconds)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* 9. Greeting & Dashboard Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              {getGreeting()}, {user.name.split(' ')[0]} 👋
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Keep going! You're making steady progress in <strong className="font-semibold text-slate-700 dark:text-slate-200">{dashboard.course.title}</strong>.
          </p>
        </div>

        {/* Status indicator / Catch-Up banner / Focus Mode Toggle */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          {/* Focus Mode Toggle */}
          <button
            onClick={() => handleToggleFocusMode(nextUp?.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-blue-600 dark:hover:bg-blue-500 text-xs font-semibold shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
            title="Switch to Focus Mode to collapse non-essential UI for watching lecture videos"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Focus Mode</span>
          </button>

          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-slate-400">Today</span>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">{todayFormatted}</p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className={`w-2 h-2 rounded-full ${
              dashboard.aheadBehindText.includes('ahead')
                ? 'bg-emerald-500'
                : dashboard.aheadBehindText.includes('behind')
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
            }`} />
            <span>{dashboard.aheadBehindText}</span>
          </div>

          {dashboard.aheadBehindText.includes('behind') && (
            <button
              onClick={handleOpenCatchUp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Catch-Up Plan</span>
            </button>
          )}
        </div>
      </div>

      {/* Dashboard Top Metric Cards: Overall Progress, Videos Completed, Study Time Today, Streak */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Overall Progress */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Overall Progress</span>
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-display font-bold text-3xl text-emerald-600 dark:text-emerald-400 font-mono">
                {dashboard.overallPercentage}%
              </span>
              <span className="text-xs text-slate-400">Target Exam</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, dashboard.overallPercentage)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Metric 2: Videos Completed */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Videos Completed</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <Play className="w-4 h-4 fill-emerald-600" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-slate-900 dark:text-white font-mono">
              {completedTasks.length}
            </span>
            <span className="text-xs text-slate-400">of {dashboard.todayTasks.length} today</span>
          </div>
        </div>

        {/* Metric 3: Study Time */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Study Time Today</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-slate-900 dark:text-white font-mono">
              {formatDuration(dashboard.todayPlannedSec)}
            </span>
            <span className="text-xs text-slate-400">planned</span>
          </div>
        </div>

        {/* Metric 4: Streak */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Study Streak</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center">
              <Flame className="w-4 h-4 fill-amber-500" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-slate-900 dark:text-white font-mono">
              {dashboard.streak}
            </span>
            <span className="text-xs text-slate-400">days streak</span>
          </div>
        </div>

      </div>

      {/* Main Grid: Today's Schedule (Left) + Upcoming Deadlines & Next Video (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Scheduled For Today */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Today's Schedule ({dashboard.todayTasks.length})
            </h2>

            {remainingTasks.length === 0 && dashboard.todayTasks.length > 0 && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> All today's tasks completed!
              </span>
            )}
          </div>

          {dashboard.todayTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center bg-white dark:bg-slate-900">
              <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                You're all caught up today.
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                No tasks scheduled for today. Today might be your rest day or your schedule is complete. You can jump ahead in the calendar schedule.
              </p>
              <button
                onClick={() => onNavigateTab('calendar')}
                className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                Go to Calendar Schedule →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {dashboard.todayTasks.map((task) => {
                const isCompleted = task.is_completed === 1;
                const isVideo = Boolean(task.youtube_video_id || task.task_type === "video" || task.video_id);

                return (
                  <div
                    key={task.id}
                    id={`task-row-${task.id}`}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isCompleted
                        ? "bg-slate-50/60 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800/50 opacity-80"
                        : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-blue-400/50 shadow-xs hover:shadow-md"
                    }`}
                  >
                    {/* Left: Thumbnail & Task Info */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0 flex-1">
                      {/* Checkbox button */}
                      <button
                        onClick={() => handleToggleTask(task)}
                        disabled={actionLoading}
                        className="self-start sm:self-center shrink-0 text-slate-300 dark:text-slate-600 hover:text-blue-600 transition-colors p-1"
                        title={isCompleted ? "Mark uncompleted" : "Mark completed"}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100 dark:fill-emerald-950" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </button>

                      {/* 16:9 YouTube Video Thumbnail */}
                      {isVideo && (
                        <div 
                          onClick={() => setActiveVideoTask(task)}
                          className="w-full sm:w-44 md:w-48 aspect-video shrink-0 overflow-hidden rounded-2xl bg-slate-950 cursor-pointer shadow-xs group"
                          title={`Click to watch "${task.custom_title}"`}
                        >
                          <YouTubeThumbnail
                            videoId={task.youtube_video_id}
                            thumbnailUrl={task.thumbnail_url}
                            title={task.custom_title}
                            subjectName={task.subject_name}
                            subjectColor={task.subject_color}
                            aspectRatioClass="aspect-video"
                            roundedClass="rounded-2xl"
                            showPlayOverlay={true}
                            className="w-full h-full"
                          />
                        </div>
                      )}

                      {/* Metadata & Title */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {task.subject_name && (
                            <span 
                              className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold"
                              style={{ 
                                backgroundColor: `${task.subject_color || "#2563eb"}18`,
                                color: task.subject_color || "#2563eb"
                              }}
                            >
                              {task.subject_name}
                            </span>
                          )}
                          <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatDuration(task.planned_duration_seconds)}
                          </span>
                          {task.is_locked === 1 && (
                            <span 
                              className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1"
                              title="Locked task"
                            >
                              <Lock className="w-2.5 h-2.5" /> Locked
                            </span>
                          )}
                          {task.schedule_source === "manual" && (
                            <span className="text-[10px] px-2 py-0.5 rounded-lg font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Manual
                            </span>
                          )}
                        </div>

                        <h4 className={`text-sm sm:text-base font-semibold line-clamp-2 leading-snug ${
                          isCompleted ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"
                        }`}>
                          {task.custom_title}
                        </h4>

                        {task.channel_name && (
                          <p className="text-xs text-slate-400 truncate">
                            {task.channel_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800/80 w-full md:w-auto justify-end">
                      <button
                        onClick={() => handleToggleLock(task)}
                        className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors ${
                          task.is_locked === 1
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                            : "border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                        title={task.is_locked === 1 ? "Task locked (click to unlock)" : "Lock task to today"}
                      >
                        {task.is_locked === 1 ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => setActiveVideoTask(task)}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors shadow-2xs"
                      >
                        <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                        <span>Watch</span>
                      </button>

                      <button
                        onClick={() => handleToggleTask(task)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs ${
                          isCompleted
                            ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </>
                        ) : (
                          <span>Mark Done</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Next Up Recommendation & Upcoming Subject Deadlines */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Continue Studying Next Task Card - Large 16:9 YouTube Thumbnail */}
          {nextUp && (
            <div className="rounded-3xl border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-900 overflow-hidden shadow-xs space-y-0">
              {/* Featured 16:9 YouTube Thumbnail */}
              <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                <YouTubeThumbnail
                  videoId={nextUp.youtube_video_id}
                  thumbnailUrl={nextUp.thumbnail_url}
                  title={nextUp.custom_title}
                  subjectName={nextUp.subject_name}
                  subjectColor={nextUp.subject_color}
                  aspectRatioClass="aspect-video"
                  roundedClass="rounded-none"
                  showPlayOverlay={true}
                  onClick={() => setActiveVideoTask(nextUp)}
                >
                  {/* Top-left & Top-right overlay chips */}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-blue-600/90 text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-xs flex items-center gap-1 shadow-md z-10">
                    <Play className="w-3 h-3 fill-white" />
                    <span>Featured Next</span>
                  </div>
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-slate-950/85 text-white text-[11px] font-mono font-semibold backdrop-blur-xs flex items-center gap-1 shadow-md z-10">
                    <Clock className="w-3 h-3 text-slate-300" />
                    {formatDuration(nextUp.planned_duration_seconds)}
                  </div>
                </YouTubeThumbnail>
              </div>

              {/* Card Body */}
              <div className="p-5 space-y-3.5">
                <div>
                  {nextUp.subject_name && (
                    <span 
                      className="text-[11px] font-bold px-2 py-0.5 rounded-md inline-block mb-1.5"
                      style={{
                        backgroundColor: `${nextUp.subject_color || "#2563eb"}18`,
                        color: nextUp.subject_color || "#2563eb"
                      }}
                    >
                      {nextUp.subject_name}
                    </span>
                  )}
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                    {nextUp.custom_title}
                  </h3>
                  {nextUp.channel_name && (
                    <p className="text-xs text-slate-400 mt-1 truncate">
                      {nextUp.channel_name}
                    </p>
                  )}
                </div>

                <div className="pt-1 flex flex-col gap-2">
                  <button
                    id="start-studying-hero-btn"
                    onClick={() => setActiveVideoTask(nextUp)}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start Studying Next Video</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveVideoTask(nextUp)}
                      className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                      <span>Watch</span>
                    </button>
                    <button
                      onClick={() => handleToggleFocusMode(nextUp.id)}
                      className="flex-1 py-2 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Watch in Focus Mode"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Focus Mode</span>
                    </button>
                    <button
                      onClick={() => handleToggleTask(nextUp)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        nextUp.is_completed === 1
                          ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          : "border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {nextUp.is_completed === 1 ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Done</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-3.5 h-3.5 text-slate-400" />
                          <span>Mark Done</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* 13. Upcoming Subject Deadlines */}
          <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                Upcoming Deadlines
              </h3>
              <button
                onClick={() => onNavigateTab('library')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                View Syllabus
              </button>
            </div>

            {deadlines.length === 0 ? (
              <p className="text-xs text-slate-400">
                Target exam date: {formatDateReadable(dashboard.course.exam_date)} ({dashboard.daysLeft} days left).
              </p>
            ) : (
              <div className="space-y-3">
                {deadlines.slice(0, 4).map((d) => {
                  const daysLeft = d.daysRemaining;
                  const isPast = daysLeft < 0;
                  return (
                    <div
                      key={d.id}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {d.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatDateReadable(d.deadline)}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-xs font-bold font-mono ${
                          isPast 
                            ? 'text-red-500' 
                            : daysLeft <= 14 
                              ? 'text-amber-500' 
                              : 'text-slate-700 dark:text-slate-300'
                        }`}>
                          {isPast ? 'Overdue' : `${daysLeft}d left`}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {d.status || (isPast ? 'Needs Attention' : 'On Track')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* 12. Scheduling UI: Smart / Manual / Hybrid Selector Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Scheduling Mode
          </span>
          {modeSaving && <span className="text-xs text-blue-600 dark:text-blue-400">Updating mode...</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Mode 1: Smart */}
          <button
            type="button"
            onClick={() => handleSwitchMode('smart')}
            disabled={modeSaving}
            className={`p-4 rounded-2xl border text-left transition-all relative ${
              planningMode === 'smart'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500/30'
                : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Target className="w-4 h-4 text-blue-600" />
                Smart Mode
              </span>
              {planningMode === 'smart' && (
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              We organize your study plan based on your goals, syllabus order, and deadlines.
            </p>
          </button>

          {/* Mode 2: Manual */}
          <button
            type="button"
            onClick={() => handleSwitchMode('manual')}
            disabled={modeSaving}
            className={`p-4 rounded-2xl border text-left transition-all relative ${
              planningMode === 'manual'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500/30'
                : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-600" />
                Manual Mode
              </span>
              {planningMode === 'manual' && (
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              You decide what to study and when. Full manual scheduling control over tasks.
            </p>
          </button>

          {/* Mode 3: Hybrid */}
          <button
            type="button"
            onClick={() => handleSwitchMode('hybrid')}
            disabled={modeSaving}
            className={`p-4 rounded-2xl border text-left transition-all relative ${
              planningMode === 'hybrid'
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500/30'
                : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-600" />
                Hybrid Mode
              </span>
              {planningMode === 'hybrid' && (
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              We create the plan. You can adjust, lock key routines, and rebalance smoothly.
            </p>
          </button>

        </div>
      </div>

      {/* Video Player Modal */}
      {activeVideoTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="min-w-0 pr-4">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  {activeVideoTask.subject_name || 'Study Task'}
                </span>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                  {activeVideoTask.custom_title}
                </h3>
              </div>
              <button
                onClick={() => setActiveVideoTask(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player (16:9 Iframe) */}
            <div className="relative aspect-video w-full bg-black">
              {activeVideoTask.youtube_video_id && activeVideoTask.youtube_video_id.length === 11 && !activeVideoTask.youtube_video_id.startsWith('yt_') ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${activeVideoTask.youtube_video_id}?autoplay=1&rel=0`}
                  title={activeVideoTask.custom_title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                  <Play className="w-12 h-12 text-blue-500 mb-2 opacity-80" />
                  <p className="text-sm font-semibold text-white">{activeVideoTask.custom_title || 'Study Session'}</p>
                  <p className="text-xs text-slate-400 mt-1">Planned study duration: {formatDuration(activeVideoTask.planned_duration_seconds)}</p>
                  <p className="text-[11px] text-slate-500 mt-2 max-w-sm">
                    Review your core textbook notes, video slides, or problems for this topic, then click "Mark Done" below to record your study time.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {activeVideoTask.youtube_video_id && (
                  <a
                    href={`https://www.youtube.com/watch?v=${activeVideoTask.youtube_video_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 py-2 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <span>Watch on YouTube</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <span className="text-xs text-slate-500 font-mono">
                  Duration: {formatDuration(activeVideoTask.planned_duration_seconds)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const taskId = activeVideoTask.id;
                    setActiveVideoTask(null);
                    setFocusTaskId(taskId);
                    setIsFocusMode(true);
                    try { localStorage.setItem('studyflow_focus_mode', 'true'); } catch {}
                  }}
                  className="px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Switch to minimalist Focus Mode"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Focus Mode</span>
                </button>
                <button
                  onClick={() => handleToggleTask(activeVideoTask)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    activeVideoTask.is_completed === 1
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                  }`}
                >
                  {activeVideoTask.is_completed === 1 ? '✓ Completed' : 'Mark Done'}
                </button>
                <button
                  onClick={() => setActiveVideoTask(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Catch-Up Modal */}
      {catchUpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl relative space-y-4">
            <button
              onClick={() => setCatchUpModalOpen(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Intelligent Catch-Up Recovery
                </h3>
                <p className="text-xs text-slate-500">
                  Catch up on missed syllabus time without burning out.
                </p>
              </div>
            </div>

            {catchUpLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Calculating balanced catch-up schedule...
              </div>
            ) : catchUpAdvice ? (
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs text-slate-700 dark:text-slate-300 space-y-2">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Recommendation:
                </p>
                <p className="leading-relaxed">{catchUpAdvice.summary || catchUpAdvice}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                StudyFlow will distribute your remaining unfinished tasks across upcoming study days, preserving all completed work and locked routines.
              </p>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setCatchUpModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCatchUp}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                {actionLoading ? 'Adjusting...' : 'Rebalance Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
