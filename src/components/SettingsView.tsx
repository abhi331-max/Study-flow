import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, Save, Download, RefreshCw, 
  Trash2, AlertTriangle, CheckCircle2, Clock, Calendar,
  Sparkles, Lock, ShieldAlert, ArrowRight, CheckCircle, XCircle
} from 'lucide-react';
import { Course, FeasibilityReport, StudyPreferences, Subject } from '../types';
import { formatDuration, formatDateReadable, apiRequest } from '../utils';

interface SettingsViewProps {
  course: Course;
  onRefresh: () => Promise<void>;
  onDeleteCourse: (courseId: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  course,
  onRefresh,
  onDeleteCourse
}) => {
  const [preferences, setPreferences] = useState<StudyPreferences | null>(null);
  const [feasibility, setFeasibility] = useState<FeasibilityReport | null>(null);
  const [examDate, setExamDate] = useState(course.exam_date || '');
  const [planningMode, setPlanningMode] = useState<'smart' | 'manual' | 'hybrid'>(course.planning_mode || 'smart');
  const [deadlinesData, setDeadlinesData] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load preferences and deadlines
  const loadData = async () => {
    setLoading(true);
    try {
      const [prefRes, deadRes] = await Promise.all([
        apiRequest(`/courses/${course.id}/preferences`),
        apiRequest(`/courses/${course.id}/deadlines`)
      ]);
      setPreferences(prefRes.preferences);
      setFeasibility(prefRes.feasibility);
      setDeadlinesData(deadRes);
      setPlanningMode(course.planning_mode || 'smart');
    } catch (err) {
      console.error('Failed to load preferences/deadlines:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [course.id]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferences) return;
    setSaving(true);
    try {
      // 1. Save preferences
      const res = await apiRequest(`/courses/${course.id}/preferences`, {
        method: 'PUT',
        body: JSON.stringify({
          ...preferences,
          examDate
        })
      });

      // 2. Save planning mode if changed
      if (planningMode !== course.planning_mode) {
        await apiRequest(`/courses/${course.id}/planning-mode`, {
          method: 'PUT',
          body: JSON.stringify({ planningMode })
        });
      }

      setFeasibility(res.feasibility);
      setSuccessMsg('Settings and planning mode saved successfully!');
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateSchedule = async () => {
    const confirm = window.confirm(
      'Rebalance schedule? All your completed tasks and locked tasks will remain untouched.'
    );
    if (!confirm) return;

    setRegenerating(true);
    try {
      await apiRequest(`/courses/${course.id}/schedule/generate`, {
        method: 'POST',
        body: JSON.stringify({ preserveCompleted: true })
      });
      setSuccessMsg('Schedule successfully rebalanced with your latest preferences.');
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate schedule');
    } finally {
      setRegenerating(false);
    }
  };

  const handleExportCsv = () => {
    const token = localStorage.getItem('studyflow_token') || '';
    window.location.href = `/api/courses/${course.id}/export/csv?token=${encodeURIComponent(token)}`;
  };

  if (loading || !preferences) {
    return <div className="p-12 text-center text-zinc-400">Loading settings...</div>;
  }

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const toggleStudyDay = (day: string) => {
    const currentStudy = new Set(preferences.studyDays);
    const currentRest = new Set(preferences.restDays);

    if (currentStudy.has(day)) {
      if (currentStudy.size <= 1) {
        alert('You must have at least one study day per week.');
        return;
      }
      currentStudy.delete(day);
      currentRest.add(day);
    } else {
      currentRest.delete(day);
      currentStudy.add(day);
    }

    setPreferences({
      ...preferences,
      studyDays: Array.from(currentStudy),
      restDays: Array.from(currentRest)
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-blue-600" />
            Course Settings & Strategy
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure your planning mode, daily study hours, exam target date, and subject deadlines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="export-schedule-csv-btn"
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* DEADLINES & FEASIBILITY DASHBOARD */}
      {deadlinesData && (
        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>🎯</span> Subject Deadlines & Workload Feasibility
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Overview of subject completion targets relative to your daily study capacity ({Math.round(preferences.daily_study_minutes / 60)}h/day).
              </p>
            </div>
            {deadlinesData.hasAnyConflict ? (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600" /> Deadline Conflicts Found
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> All Subjects Feasible
              </span>
            )}
          </div>

          {/* Subjects Table */}
          <div className="space-y-2">
            {(deadlinesData.subjects || []).map((sub: any) => (
              <div
                key={sub.id}
                className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sub.color || '#2563eb' }} />
                  <div>
                    <span className="font-bold text-zinc-900 dark:text-white truncate block">
                      {sub.name}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {sub.videoCount} lectures · {formatDuration(sub.totalDurationSeconds)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Deadline text */}
                  <div className="text-right">
                    <span className="block font-semibold text-zinc-800 dark:text-zinc-200">
                      {sub.targetDate ? `Deadline: ${formatDateReadable(sub.targetDate).split(',')[0]}` : 'No deadline'}
                    </span>
                    {sub.targetDate && sub.daysRemaining !== null && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400">
                        {sub.daysRemaining} days left
                      </span>
                    )}
                  </div>

                  {/* Status pill */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    sub.status === 'Completed'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      : sub.status === 'On Track'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : sub.status === 'At Risk'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : sub.status === 'Behind'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                            : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                  }`}>
                    {sub.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Settings */}
      <form onSubmit={handleSavePreferences} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xs space-y-6">
        
        {/* PLANNING MODE SELECTOR */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-0.5">
              Course Scheduling Mode
            </label>
            <p className="text-[11px] text-zinc-500">
              Select how you want StudyFlow to organize your daily schedule.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'smart',
                title: 'Smart Schedule',
                icon: <Sparkles className="w-4 h-4 text-blue-600" />,
                desc: 'Automatic distribution based on available study hours, priorities, and rest days.'
              },
              {
                id: 'hybrid',
                title: 'Hybrid Mode',
                icon: <Lock className="w-4 h-4 text-indigo-600" />,
                desc: 'Preserves your manually locked tasks while auto-filling open calendar slots.'
              },
              {
                id: 'manual',
                title: 'Manual Mode',
                icon: <span className="text-sm">✋</span>,
                desc: 'Full control. You assign individual lectures to calendar dates manually.'
              }
            ].map(m => (
              <div
                key={m.id}
                onClick={() => setPlanningMode(m.id as any)}
                className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  planningMode === m.id
                    ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/30 dark:bg-zinc-800/30'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {m.icon}
                  <span className="text-xs font-bold text-zinc-900 dark:text-white">{m.title}</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Exam Date & Daily Hours */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Target Exam Date
            </label>
            <input
              type="date"
              value={examDate || ''}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Daily Study Target: {Math.floor(preferences.daily_study_minutes / 60)}h {preferences.daily_study_minutes % 60 > 0 ? `${preferences.daily_study_minutes % 60}m` : ''}
            </label>
            <input
              type="range"
              min="30"
              max="480"
              step="30"
              value={preferences.daily_study_minutes}
              onChange={(e) => setPreferences({ ...preferences, daily_study_minutes: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
              <span>30m</span>
              <span>2h</span>
              <span>4h</span>
              <span>6h</span>
              <span>8h</span>
            </div>
          </div>
        </div>

        {/* Study Days vs Rest Days */}
        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            Weekly Study Schedule (Click a day to toggle Study vs Rest)
          </label>
          <div className="grid grid-cols-7 gap-2">
            {daysOfWeek.map((day) => {
              const isStudy = preferences.studyDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleStudyDay(day)}
                  className={`py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
                    isStudy
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  {day.slice(0, 3)}
                  <span className="block text-[9px] font-normal opacity-80 mt-0.5">
                    {isStudy ? 'Study' : 'Rest'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scheduling Strategy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Scheduling Strategy
            </label>
            <select
              value={preferences.strategy}
              onChange={(e: any) => setPreferences({ ...preferences, strategy: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
            >
              <option value="smart_interleaved">Smart Interleaving (High retention, 2 subjects/day)</option>
              <option value="balanced">Balanced Daily Distribution</option>
              <option value="priority">High Exam-Priority Subjects First</option>
              <option value="one_by_one">One Subject at a Time (Serial)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Preparation Phases
            </label>
            <select
              value={preferences.prep_mode}
              onChange={(e: any) => setPreferences({ ...preferences, prep_mode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
            >
              <option value="full">Full Prep (Lectures + Revision + PYQs + Mocks)</option>
              <option value="lectures_revision">Lectures + Comprehensive Revision</option>
              <option value="lectures_only">Lectures Only</option>
            </select>
          </div>
        </div>

        {/* Buffer & Phase Days */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              Buffer Days
            </label>
            <input
              type="number"
              min="0"
              max="30"
              value={preferences.buffer_days}
              onChange={(e) => setPreferences({ ...preferences, buffer_days: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              Revision Days
            </label>
            <input
              type="number"
              min="0"
              max="30"
              value={preferences.revision_days}
              onChange={(e) => setPreferences({ ...preferences, revision_days: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              PYQ Days
            </label>
            <input
              type="number"
              min="0"
              max="30"
              value={preferences.pyq_days}
              onChange={(e) => setPreferences({ ...preferences, pyq_days: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              Mock Test Days
            </label>
            <input
              type="number"
              min="0"
              max="30"
              value={preferences.mock_days}
              onChange={(e) => setPreferences({ ...preferences, mock_days: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            id="regenerate-schedule-btn"
            onClick={handleRegenerateSchedule}
            disabled={regenerating}
            className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'Regenerating...' : 'Rebalance Schedule'}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="p-5 rounded-2xl border border-red-200 dark:border-red-950/60 bg-red-50/30 dark:bg-red-950/10 flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-red-700 dark:text-red-400">Delete Course</h4>
          <p className="text-[11px] text-zinc-500">
            Permanently removes this course, its scheduled tasks, and attached materials.
          </p>
        </div>

        <button
          onClick={() => onDeleteCourse(course.id)}
          className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950 transition-colors"
          aria-label={`Delete ${course.title}`}
        >
          <Trash2 className="w-3.5 h-3.5 inline mr-1" />
          Delete
        </button>
      </div>
    </div>
  );
};
