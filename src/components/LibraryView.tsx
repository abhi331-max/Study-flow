import React, { useState } from 'react';
import { Youtube, FileText, Layers, Plus } from 'lucide-react';
import { Course } from '../types';
import { SubjectsView } from './SubjectsView';
import { ResourcesView } from './ResourcesView';

interface LibraryViewProps {
  course: Course;
  onRefresh: () => Promise<void>;
  initialSection?: 'subjects' | 'resources';
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  course,
  onRefresh,
  initialSection = 'subjects'
}) => {
  const [activeSection, setActiveSection] = useState<'subjects' | 'resources'>(initialSection);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Library Top Bar & Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Library
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Organized subject syllabus, imported YouTube playlists, lecture videos, and study materials.
          </p>
        </div>

        {/* Segmented Control */}
        <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 self-start sm:self-auto">
          <button
            id="library-tab-subjects"
            onClick={() => setActiveSection('subjects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeSection === 'subjects'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Youtube className="w-4 h-4" />
            <span>Subjects & Playlists</span>
          </button>
          <button
            id="library-tab-resources"
            onClick={() => setActiveSection('resources')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeSection === 'resources'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Study Resources & PDFs</span>
          </button>
        </div>
      </div>

      {/* Active Section */}
      {activeSection === 'subjects' ? (
        <SubjectsView course={course} onRefresh={onRefresh} />
      ) : (
        <ResourcesView course={course} />
      )}
    </div>
  );
};
