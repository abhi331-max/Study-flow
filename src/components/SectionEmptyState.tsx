import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface SectionEmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  badge?: string;
}

export const SectionEmptyState: React.FC<SectionEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel = 'Create Your First Study Plan',
  onAction,
  badge
}) => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="rounded-[28px] border border-slate-200/90 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-8 sm:p-14 text-center max-w-xl mx-auto space-y-6 shadow-xs">
        
        {badge && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>{badge}</span>
          </div>
        )}

        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
          <Icon className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            {description}
          </p>
        </div>

        {onAction && (
          <div className="pt-2">
            <button
              onClick={onAction}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <span>{actionLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
