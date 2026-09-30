import React, { useState, useEffect } from 'react';
import { 
  BarChart2, TrendingUp, Sparkles, CheckCircle2, Clock, 
  Calendar, Flame, RefreshCw, Award, ArrowUpRight 
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { AIInsights, Course } from '../types';
import { formatDuration, formatDateReadable, apiRequest } from '../utils';

interface AnalyticsViewProps {
  course: Course;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ course }) => {
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/courses/${course.id}/analytics`);
      setAnalyticsData(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAiInsights = async () => {
    setAiLoading(true);
    try {
      const res = await apiRequest(`/courses/${course.id}/ai/study-insights`, { method: 'POST' });
      setAiInsights(res.insights);
    } catch (err: any) {
      alert(err.message || 'Could not generate AI insights');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [course.id]);

  const COLORS = ['#2563eb', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 text-xs">
        Loading study analytics...
      </div>
    );
  }

  // Format daily bar chart data
  const chartData = (analyticsData?.recentDays || []).map((d: any) => ({
    date: d.date.slice(5), // MM-DD
    plannedHours: Number((d.plannedSeconds / 3600).toFixed(1)),
    completedHours: Number((d.completedSeconds / 3600).toFixed(1))
  }));

  const subjectPieData = (analyticsData?.subjectBreakdown || []).map((s: any) => ({
    name: s.name,
    hours: Number((s.totalDuration / 3600).toFixed(1)),
    color: s.color || '#2563eb'
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="w-7 h-7 text-blue-600" />
            Study Progress & Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track daily study consistency, subject distribution, and exam readiness pace.
          </p>
        </div>

        <button
          id="generate-ai-review-btn"
          onClick={handleFetchAiInsights}
          disabled={aiLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-semibold shadow-xs transition-colors"
        >
          <Sparkles className="w-4 h-4 text-purple-600" />
          {aiLoading ? 'Analyzing Performance...' : 'Generate AI Study Review'}
        </button>
      </div>

      {/* Metrics Row (Coolvetica display numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Completed Study Time</span>
          <div className="mt-2">
            <span className="font-display font-bold text-3xl text-slate-900 dark:text-white font-mono">
              {formatDuration(analyticsData?.totalCompletedSeconds || 0)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              of {formatDuration(analyticsData?.totalRequiredSeconds || 0)} total
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Completion Rate</span>
          <div className="mt-2">
            <span className="font-display font-bold text-3xl text-emerald-600 dark:text-emerald-400 font-mono">
              {analyticsData?.completionRate || 0}%
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {analyticsData?.completedTasksCount || 0} tasks finished
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Study Streak</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-amber-500 font-mono">
              {analyticsData?.streak || 0}
            </span>
            <span className="text-xs text-slate-400">days active habit</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Projected Finish</span>
          <div className="mt-2">
            <span className="font-display font-bold text-xl text-slate-900 dark:text-white truncate block">
              {formatDateReadable(analyticsData?.projectedFinishDate || course.exam_date)}
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
              On schedule before exam
            </span>
          </div>
        </div>

      </div>

      {/* AI Study Coach Review Box */}
      {aiInsights && (
        <div className="p-6 rounded-3xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-sm">
            <Sparkles className="w-4 h-4" />
            <span>AI Study Coach Review & Action Plan</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            {aiInsights.summary}
          </p>

          <div className="p-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 border border-purple-100 dark:border-purple-800/60 text-xs">
            <strong className="text-slate-900 dark:text-white block mb-1">Key Observation:</strong>
            <p className="text-slate-600 dark:text-slate-400">{aiInsights.keyObservation}</p>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-white block mb-2">
              Actionable Recommendations:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(aiInsights.actionableRecommendations || []).map((rec, i) => (
                <div 
                  key={i} 
                  className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed shadow-xs"
                >
                  <span className="font-bold text-purple-600 mr-1.5">{i + 1}.</span>
                  {rec}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Daily Study Time: Planned vs Actual */}
        <div className="lg:col-span-2 p-6 rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Daily Study Hours (Recent Schedule)
              </h3>
              <p className="text-xs text-slate-400">Planned (Blue) vs Completed (Emerald) in hours</p>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0F172A', 
                    borderColor: '#334155', 
                    borderRadius: '12px', 
                    fontSize: '12px',
                    color: '#fff' 
                  }} 
                />
                <Bar dataKey="plannedHours" fill="#2563EB" name="Planned (hrs)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completedHours" fill="#10B981" name="Completed (hrs)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subject Breakdown Pie */}
        <div className="p-6 rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Subject Duration Distribution
            </h3>
            <p className="text-xs text-slate-400">Hours allocated per subject</p>
          </div>

          <div className="h-48 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={subjectPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="hours"
                >
                  {subjectPieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0F172A', 
                    borderColor: '#334155', 
                    borderRadius: '12px', 
                    fontSize: '11px',
                    color: '#fff' 
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 max-h-36 overflow-y-auto">
            {subjectPieData.map((sub: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                  <span className="truncate text-slate-700 dark:text-slate-300 font-medium">{sub.name}</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white shrink-0 font-mono">{sub.hours}h</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
