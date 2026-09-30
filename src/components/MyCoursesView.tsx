import React from 'react';
import { 
  BookOpen, Plus, Calendar, Clock, CheckCircle2, 
  ArrowRight, Settings, Trash2, Layers, Award
} from 'lucide-react';
import { Course } from '../types';
import { formatDateReadable } from '../utils';

interface MyCoursesViewProps {
  courses: Course[];
  activeCourseId: string | null;
  onSelectCourse: (id: string) => void;
  onNavigateTab: (tab: string) => void;
  onNewCourse: () => void;
  onDeleteCourse: (id: string) => void;
}

export const MyCoursesView: React.FC<MyCoursesViewProps> = ({
  courses,
  activeCourseId,
  onSelectCourse,
  onNavigateTab,
  onNewCourse,
  onDeleteCourse
}) => {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            My Courses & Study Plans
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your courses, track deadlines, and jump into today's structured learning.
          </p>
        </div>

        <button
          onClick={onNewCourse}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all hover:shadow-blue-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Course</span>
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
            <BookOpen className="w-7 h-7" />
          </div>
          <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Your courses will appear here.
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Create your first study plan to start organizing your subjects, playlists and goals.
          </p>
          <button
            onClick={onNewCourse}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all hover:scale-[1.01]"
          >
            <span>Create Your First Study Plan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((c) => {
            const isActive = c.id === activeCourseId;
            return (
              <div
                key={c.id}
                className={`rounded-2xl border bg-white dark:bg-slate-900 p-6 flex flex-col justify-between transition-all duration-200 ${
                  isActive
                    ? 'border-blue-500 dark:border-blue-500 shadow-md shadow-blue-500/5 ring-1 ring-blue-500/30'
                    : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    {isActive ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200/60 dark:border-blue-800/60">
                        Active Course
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                        {c.planning_mode || 'smart'} mode
                      </span>
                    )}
                  </div>

                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                    {c.title}
                  </h3>
                  
                  {c.exam_name && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                      <span>🎯</span>
                      <span>Target: {c.exam_name}</span>
                    </p>
                  )}

                  {/* Metadata List */}
                  <div className="mt-5 space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Target Exam Date
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {formatDateReadable(c.exam_date)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Subjects & Videos
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {c.subject_count ?? 0} subjects · {c.video_count ?? 0} videos
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        Schedule Mode
                      </span>
                      <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                        {c.planning_mode || 'smart'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <button
                    onClick={() => {
                      onSelectCourse(c.id);
                      onNavigateTab('today');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                  >
                    <span>Continue Studying</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      onSelectCourse(c.id);
                      onNavigateTab('settings');
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Course Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDeleteCourse(c.id)}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Delete Course"
                    aria-label={`Delete ${c.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
