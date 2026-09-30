import React, { useState } from 'react';
import { 
  BookOpen, Calendar, Clock, Plus, Play, CheckCircle2, 
  ArrowRight, ArrowLeft, Layers, Sparkles, AlertCircle, Trash2,
  Tv, Youtube, Check, ChevronDown, ChevronRight, Video as VideoIcon,
  HelpCircle, Sparkle, Tag
} from 'lucide-react';
import { Course } from '../types';
import { formatDuration, apiRequest } from '../utils';

interface CourseWizardProps {
  onClose: () => void;
  onCourseCreated: (course: Course) => void;
}

interface SubjectDraft {
  id: string;
  name: string;
  priority: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  color: string;
  targetDate?: string;
}

interface AttachedVideoDraft {
  youtubeVideoId: string;
  title: string;
  description?: string;
  durationSeconds: number;
  thumbnailUrl?: string;
  channelName?: string;
  originalPosition: number;
  included: boolean;
  contentType?: string;
}

interface AttachedPlaylistDraft {
  id: string;
  subjectId: string;
  playlistId: string;
  title: string;
  channelName: string;
  thumbnailUrl?: string;
  resourceType: string;
  videos: AttachedVideoDraft[];
}

const RESOURCE_TYPES = [
  'Main Lectures',
  'Problem Solving',
  'PYQs (Previous Years)',
  'Rapid Revision',
  'Practice Problems',
  'Formula / Short Notes'
];

const PRESET_SUGGESTIONS = [
  {
    name: 'Network Theory (GATE / ESE)',
    url: 'https://www.youtube.com/playlist?list=PL_network_theory_gate',
    subject: 'Network Theory'
  },
  {
    name: 'Control Systems Masterclass',
    url: 'https://www.youtube.com/playlist?list=PL_control_systems_gate',
    subject: 'Control Systems'
  },
  {
    name: 'Signals and Systems',
    url: 'https://www.youtube.com/playlist?list=PL_signals_and_systems',
    subject: 'Signals & Systems'
  },
  {
    name: 'Data Structures & Algorithms',
    url: 'https://www.youtube.com/playlist?list=PL_dsa_computer_science',
    subject: 'Algorithms & DSA'
  }
];

const COLOR_PALETTE = [
  '#2563eb', '#7c3aed', '#059669', '#d97706', 
  '#dc2626', '#0891b2', '#4f46e5', '#db2777'
];

export const CourseWizard: React.FC<CourseWizardProps> = ({ onClose, onCourseCreated }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Course Info
  const [title, setTitle] = useState('My Comprehensive Study Plan');
  const [examName, setExamName] = useState('GATE 2027');
  
  // Default exam date: 4 months from now
  const defaultExam = new Date();
  defaultExam.setMonth(defaultExam.getMonth() + 4);
  const [examDate, setExamDate] = useState(defaultExam.toISOString().split('T')[0]);

  // Target completion date: 2 weeks before exam
  const defaultTarget = new Date(defaultExam);
  defaultTarget.setDate(defaultTarget.getDate() - 14);
  const [targetFinishDate, setTargetFinishDate] = useState(defaultTarget.toISOString().split('T')[0]);

  // Step 2: Subjects (Free entry) with optional individual deadlines
  const [subjects, setSubjects] = useState<SubjectDraft[]>([
    { id: 'sub-1', name: 'Network Theory', priority: 'high', difficulty: 'medium', color: '#2563eb' },
    { id: 'sub-2', name: 'Control Systems', priority: 'medium', difficulty: 'hard', color: '#7c3aed' }
  ]);
  const [newSubName, setNewSubName] = useState('');
  const [newSubPriority, setNewSubPriority] = useState<'high' | 'medium' | 'low'>('high');
  const [newSubDifficulty, setNewSubDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [newSubColor, setNewSubColor] = useState(COLOR_PALETTE[0]);
  const [newSubHasDeadline, setNewSubHasDeadline] = useState(false);
  const [newSubTargetDate, setNewSubTargetDate] = useState('');

  // Step 3: Playlists attachment
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('sub-1');
  const [playlistInputUrl, setPlaylistInputUrl] = useState('');
  const [selectedResourceType, setSelectedResourceType] = useState<string>('Main Lectures');
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false);
  const [playlistPreview, setPlaylistPreview] = useState<any>(null);
  const [attachedPlaylists, setAttachedPlaylists] = useState<AttachedPlaylistDraft[]>([]);
  
  // Single video input state
  const [singleVideoUrl, setSingleVideoUrl] = useState('');
  const [fetchingSingleVideo, setFetchingSingleVideo] = useState(false);

  // Step 4: Review inspection accordion state
  const [expandedPlaylists, setExpandedPlaylists] = useState<Record<string, boolean>>({});

  // Step 5: Study Preferences & Planning Mode
  const [planningMode, setPlanningMode] = useState<'smart' | 'manual' | 'hybrid'>('smart');
  const [dailyHours, setDailyHours] = useState(3);
  const [strategy, setStrategy] = useState<'smart_interleaved' | 'balanced' | 'priority' | 'one_by_one'>('smart_interleaved');
  const [restDays, setRestDays] = useState<string[]>(['sunday']);
  const [bufferDays, setBufferDays] = useState(3);
  const [revisionDays, setRevisionDays] = useState(5);

  // Helper for quick deadline presets
  const applyDeadlinePreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNewSubTargetDate(d.toISOString().split('T')[0]);
    setNewSubHasDeadline(true);
  };

  // Helper to add subject
  const handleAddSubject = () => {
    if (!newSubName.trim()) return;
    const newId = `sub-${Date.now()}`;
    const newSub: SubjectDraft = {
      id: newId,
      name: newSubName.trim(),
      priority: newSubPriority,
      difficulty: newSubDifficulty,
      color: newSubColor,
      targetDate: newSubHasDeadline && newSubTargetDate ? newSubTargetDate : undefined
    };
    setSubjects([...subjects, newSub]);
    setNewSubName('');
    setNewSubHasDeadline(false);
    setNewSubTargetDate('');
    if (!selectedSubjectId) setSelectedSubjectId(newId);
    // rotate default color
    const nextColorIdx = (COLOR_PALETTE.indexOf(newSubColor) + 1) % COLOR_PALETTE.length;
    setNewSubColor(COLOR_PALETTE[nextColorIdx]);
  };

  const handleUpdateSubjectDeadline = (subId: string, targetDate?: string) => {
    setSubjects(subjects.map(s => s.id === subId ? { ...s, targetDate: targetDate || undefined } : s));
  };

  const handleRemoveSubject = (id: string) => {
    if (subjects.length <= 1) return;
    const updated = subjects.filter(s => s.id !== id);
    setSubjects(updated);
    setAttachedPlaylists(attachedPlaylists.filter(p => p.subjectId !== id));
    if (selectedSubjectId === id && updated.length > 0) {
      setSelectedSubjectId(updated[0].id);
    }
  };

  // Preview Playlist in Step 3
  const handleFetchPlaylist = async (urlToFetch?: string) => {
    const targetUrl = (urlToFetch || playlistInputUrl).trim();
    if (!targetUrl) return;
    setFetchingPlaylist(true);
    setError(null);
    try {
      const res = await apiRequest('/youtube/playlist/preview', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl })
      });
      setPlaylistPreview(res);
    } catch (err: any) {
      setError(err.message || 'Could not fetch YouTube playlist. Verify the URL or list ID.');
    } finally {
      setFetchingPlaylist(false);
    }
  };

  // Add the previewed playlist to the current selected subject
  const handleAddPreviewedPlaylist = () => {
    if (!playlistPreview || !selectedSubjectId) return;
    
    const draftVideos: AttachedVideoDraft[] = (playlistPreview.videos || []).map((v: any, idx: number) => ({
      youtubeVideoId: v.youtubeVideoId || v.id,
      title: v.title,
      description: v.description || '',
      durationSeconds: v.durationSeconds || 1800,
      thumbnailUrl: v.thumbnailUrl || playlistPreview.thumbnailUrl,
      channelName: v.channelName || playlistPreview.channelName,
      originalPosition: v.originalPosition || idx + 1,
      included: true,
      contentType: selectedResourceType
    }));

    const newDraft: AttachedPlaylistDraft = {
      id: `pl-${Date.now()}`,
      subjectId: selectedSubjectId,
      playlistId: playlistPreview.playlistId || 'custom_pl',
      title: playlistPreview.title || 'Educational Playlist',
      channelName: playlistPreview.channelName || 'YouTube Educator',
      thumbnailUrl: playlistPreview.thumbnailUrl,
      resourceType: selectedResourceType,
      videos: draftVideos
    };

    setAttachedPlaylists([...attachedPlaylists, newDraft]);
    setPlaylistPreview(null);
    setPlaylistInputUrl('');
  };

  // Add Single Video to current selected subject
  const handleAddSingleVideo = async () => {
    const url = singleVideoUrl.trim();
    if (!url || !selectedSubjectId) return;
    setFetchingSingleVideo(true);
    setError(null);
    try {
      // Find or create a "Single Videos" container playlist draft for this subject
      let existingPl = attachedPlaylists.find(p => p.subjectId === selectedSubjectId && p.playlistId === 'single_videos_collection');
      
      // Fetch video info
      const vidRes = await apiRequest('/youtube/preview', {
        method: 'POST',
        body: JSON.stringify({ url })
      });

      const videoItem = vidRes.videos?.[0] || {
        youtubeVideoId: 'video_' + Date.now(),
        title: vidRes.title || 'Single Video',
        durationSeconds: vidRes.totalDurationSeconds || 1800,
        channelName: vidRes.channelName || 'YouTube'
      };

      const newVideoDraft: AttachedVideoDraft = {
        youtubeVideoId: videoItem.youtubeVideoId || videoItem.id,
        title: videoItem.title,
        description: videoItem.description || '',
        durationSeconds: videoItem.durationSeconds || 1800,
        thumbnailUrl: videoItem.thumbnailUrl,
        channelName: videoItem.channelName,
        originalPosition: existingPl ? existingPl.videos.length + 1 : 1,
        included: true,
        contentType: selectedResourceType
      };

      if (existingPl) {
        setAttachedPlaylists(attachedPlaylists.map(p => 
          p.id === existingPl!.id 
            ? { ...p, videos: [...p.videos, newVideoDraft] } 
            : p
        ));
      } else {
        const singleContainer: AttachedPlaylistDraft = {
          id: `pl-single-${Date.now()}`,
          subjectId: selectedSubjectId,
          playlistId: 'single_videos_collection',
          title: 'Individual Lectures & Videos',
          channelName: videoItem.channelName || 'YouTube Collection',
          thumbnailUrl: videoItem.thumbnailUrl,
          resourceType: selectedResourceType,
          videos: [newVideoDraft]
        };
        setAttachedPlaylists([...attachedPlaylists, singleContainer]);
      }

      setSingleVideoUrl('');
    } catch (err: any) {
      setError(err.message || 'Could not fetch individual video information.');
    } finally {
      setFetchingSingleVideo(false);
    }
  };

  // Remove attached playlist
  const handleRemovePlaylist = (plId: string) => {
    setAttachedPlaylists(attachedPlaylists.filter(p => p.id !== plId));
  };

  // Toggle video inclusion in Step 4
  const handleToggleVideoInclusion = (plId: string, videoId: string) => {
    setAttachedPlaylists(attachedPlaylists.map(pl => {
      if (pl.id !== plId) return pl;
      return {
        ...pl,
        videos: pl.videos.map(v => 
          v.youtubeVideoId === videoId ? { ...v, included: !v.included } : v
        )
      };
    }));
  };

  // Calculate totals
  const allVideos = attachedPlaylists.flatMap(p => p.videos);
  const selectedVideos = allVideos.filter(v => v.included);
  const totalDurationSeconds = selectedVideos.reduce((acc, v) => acc + v.durationSeconds, 0);
  const totalDurationHours = Math.round((totalDurationSeconds / 3600) * 10) / 10;

  // Calculate feasibility in Step 6
  const calcFeasibility = () => {
    const today = new Date();
    const examD = new Date(targetFinishDate || examDate);
    const diffTime = examD.getTime() - today.getTime();
    const totalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    
    // Available study days excluding rest days
    const activeDaysPerWeek = 7 - restDays.length;
    const studyDaysCount = Math.max(1, Math.round(totalDays * (activeDaysPerWeek / 7)));
    const totalAvailableHours = studyDaysCount * dailyHours;
    const isFeasible = totalAvailableHours >= totalDurationHours;
    const requiredHoursPerDay = Math.round((totalDurationHours / studyDaysCount) * 10) / 10;

    return {
      totalDays,
      studyDaysCount,
      totalAvailableHours,
      requiredHoursPerDay,
      isFeasible,
      shortfall: totalDurationHours - totalAvailableHours
    };
  };

  const feasibility = calcFeasibility();

  // Final Action: Create course, subjects, playlists, videos, preferences, and generate schedule!
  const handleGenerateCourseAndSchedule = async () => {
    if (selectedVideos.length === 0) {
      setError('Please select at least one video to include in your study plan.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. Create Course
      const courseRes = await apiRequest('/courses', {
        method: 'POST',
        body: JSON.stringify({
          title,
          examName,
          examDate,
          targetFinishDate,
          planningMode,
          description: `Personalized study plan created with ${attachedPlaylists.length} user-selected playlists.`
        })
      });

      const newCourse = courseRes.course;

      // 2. Create Subjects with target deadlines
      const subjectIdMap: Record<string, string> = {};
      for (const sub of subjects) {
        const subRes = await apiRequest(`/courses/${newCourse.id}/subjects`, {
          method: 'POST',
          body: JSON.stringify({
            name: sub.name,
            priority: sub.priority,
            difficulty: sub.difficulty,
            color: sub.color,
            targetDate: sub.targetDate || null
          })
        });
        subjectIdMap[sub.id] = subRes.subject.id;
      }

      // 3. Import User-Selected Playlists and Videos
      for (const pl of attachedPlaylists) {
        const realSubjectId = subjectIdMap[pl.subjectId];
        if (!realSubjectId) continue;

        const includedVideos = pl.videos.filter(v => v.included);
        if (includedVideos.length === 0) continue;

        await apiRequest(`/courses/${newCourse.id}/playlists/import`, {
          method: 'POST',
          body: JSON.stringify({
            subjectId: realSubjectId,
            playlistId: pl.playlistId,
            title: pl.title,
            resourceType: pl.resourceType,
            videos: includedVideos
          })
        });
      }

      // 4. Save Study Preferences
      const studyDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].filter(
        d => !restDays.includes(d)
      );

      await apiRequest(`/courses/${newCourse.id}/preferences`, {
        method: 'PUT',
        body: JSON.stringify({
          daily_study_minutes: dailyHours * 60,
          studyDays,
          restDays,
          strategy,
          examDate,
          buffer_days: bufferDays,
          revision_days: revisionDays,
          pyq_days: 2,
          mock_days: 1
        })
      });

      // 5. Generate Initial Schedule
      await apiRequest(`/courses/${newCourse.id}/schedule/generate`, {
        method: 'POST',
        body: JSON.stringify({ preserveCompleted: false })
      });

      // Done! Launch Dashboard
      onCourseCreated(newCourse);
    } catch (err: any) {
      setError(err.message || 'Failed to generate study plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header & Step Flow Indicator */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  Create Study Plan: You Choose, We Schedule
                </h2>
                <p className="text-xs text-zinc-500">
                  Select your subjects and trusted YouTube playlists. We organize your workload into a structured schedule.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 6 Step Indicators */}
          <div className="grid grid-cols-6 gap-1.5 text-center">
            {[
              { num: 1, label: 'Info' },
              { num: 2, label: 'Subjects' },
              { num: 3, label: 'Playlists' },
              { num: 4, label: 'Review' },
              { num: 5, label: 'Routine' },
              { num: 6, label: 'Generate' }
            ].map(s => (
              <div 
                key={s.num} 
                onClick={() => s.num < step && setStep(s.num)}
                className={`py-1.5 px-1 rounded-lg text-xs font-semibold border transition-all ${
                  step === s.num
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : step > s.num
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 cursor-pointer'
                    : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400 border-transparent'
                }`}
              >
                <div className="text-[10px] opacity-75">Step {s.num}</div>
                <div className="truncate">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Wizard Scrollable Content Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* STEP 1: Basic Information */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                  Step 1: Course & Target Exam Information
                </h3>
                <p className="text-xs text-zinc-500 mb-4">
                  Define your course name and timeline. The scheduler will distribute your videos evenly across available study days.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Course Title
                </label>
                <input
                  type="text"
                  value={title}
                  name="courseTitle"
                  autoComplete="off"
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. GATE 2027 Electrical Engineering Complete Prep"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Target Exam
                </label>
                <input
                  type="text"
                  value={examName}
                  name="examName"
                  autoComplete="on"
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="e.g. GATE 2027, JEE Advanced, UPSC, Semester Exams"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Exam Date
                  </label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Target Syllabus Finish Date (Buffer/Revision)
                  </label>
                  <input
                    type="date"
                    value={targetFinishDate}
                    onChange={(e) => setTargetFinishDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Setting this 2-3 weeks before your exam leaves room for mock tests and full revisions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Add Subjects */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                  Step 2: Add Your Subjects
                </h3>
                <p className="text-xs text-zinc-500">
                  Add the subjects you want to prepare for. You can enter any custom subject freely. In the next step, you will select the YouTube playlists for each.
                </p>
              </div>

              {/* Subject Creation Box */}
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Subject Name
                    </label>
                    <input
                      type="text"
                      value={newSubName}
                      name="subjectName"
                      autoComplete="on"
                      onChange={(e) => setNewSubName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubject())}
                      placeholder="e.g. Electrical Machines, Signals & Systems, Organic Chemistry"
                      className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Priority
                    </label>
                    <select
                      value={newSubPriority}
                      onChange={(e: any) => setNewSubPriority(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                    >
                      <option value="high">High Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>
                  </div>
                </div>

                {/* Subject Target Deadline Option (Prompt Requirement 2: Subject-Specific Deadlines) */}
                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                      <span>🎯</span> Do you want to set a deadline for this subject?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNewSubHasDeadline(false)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                          !newSubHasDeadline
                            ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white font-bold'
                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                      >
                        No deadline
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewSubHasDeadline(true);
                          if (!newSubTargetDate) applyDeadlinePreset(30);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                          newSubHasDeadline
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                      >
                        Set a deadline
                      </button>
                    </div>
                  </div>

                  {newSubHasDeadline && (
                    <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-700/50 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-500">Quick presets:</span>
                        <button
                          type="button"
                          onClick={() => applyDeadlinePreset(7)}
                          className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-100 dark:bg-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-zinc-700 dark:text-zinc-300 font-medium"
                        >
                          1 Week
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDeadlinePreset(14)}
                          className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-100 dark:bg-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-zinc-700 dark:text-zinc-300 font-medium"
                        >
                          2 Weeks
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDeadlinePreset(30)}
                          className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-100 dark:bg-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-zinc-700 dark:text-zinc-300 font-medium"
                        >
                          1 Month
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDeadlinePreset(60)}
                          className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-100 dark:bg-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-zinc-700 dark:text-zinc-300 font-medium"
                        >
                          2 Months
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDeadlinePreset(90)}
                          className="px-2 py-0.5 rounded-md text-[10px] bg-zinc-100 dark:bg-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-zinc-700 dark:text-zinc-300 font-medium"
                        >
                          3 Months
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 shrink-0">Target completion date:</span>
                        <input
                          type="date"
                          value={newSubTargetDate}
                          onChange={(e) => setNewSubTargetDate(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Color Tag:</span>
                    <div className="flex items-center gap-1.5">
                      {COLOR_PALETTE.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewSubColor(color)}
                          className={`w-5 h-5 rounded-full transition-transform ${newSubColor === color ? 'scale-125 ring-2 ring-blue-500' : 'hover:scale-110'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddSubject}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Subject
                  </button>
                </div>
              </div>

              {/* Current Subjects List */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Added Subjects ({subjects.length})
                </div>

                {subjects.map((sub, idx) => (
                  <div
                    key={sub.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 shadow-xs gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                      <div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{sub.name}</span>
                          {sub.targetDate ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                              <span>🎯 Finish by:</span> {new Date(sub.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                              No specific deadline
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className="capitalize">{sub.priority} priority</span>
                          <span>•</span>
                          <span className="capitalize">{sub.difficulty} difficulty</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <input
                        type="date"
                        value={sub.targetDate || ''}
                        onChange={(e) => handleUpdateSubjectDeadline(sub.id, e.target.value)}
                        title="Set or change deadline for this subject"
                        className="px-2 py-1 text-[11px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      />
                      <button
                        onClick={() => handleRemoveSubject(sub.id)}
                        disabled={subjects.length <= 1}
                        className="p-1.5 text-zinc-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                        title={subjects.length <= 1 ? 'Must keep at least 1 subject' : 'Remove subject'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Choose YouTube Playlists per Subject */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                  Step 3: Choose YouTube Playlists for Your Subjects
                </h3>
                <p className="text-xs text-zinc-500">
                  <strong className="text-blue-600 dark:text-blue-400">Core Rule:</strong> You choose the learning source. Paste the YouTube playlist link you trust for each subject. You can attach multiple playlists (e.g. Theory + PYQs) or individual videos.
                </p>
              </div>

              {/* Subject Selector Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {subjects.map(sub => {
                  const count = attachedPlaylists.filter(p => p.subjectId === sub.id).length;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setSelectedSubjectId(sub.id);
                        setPlaylistPreview(null);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-2 border transition-all ${
                        selectedSubjectId === sub.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sub.color }} />
                      <span>{sub.name}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${selectedSubjectId === sub.id ? 'bg-blue-700 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>
                        {count} {count === 1 ? 'playlist' : 'playlists'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Paste URL Input & Preview Section */}
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Youtube className="w-4 h-4 text-red-600" />
                    Attach YouTube Playlist for: <span className="text-blue-600 dark:text-blue-400">{subjects.find(s => s.id === selectedSubjectId)?.name}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-semibold text-zinc-500">Resource Type:</label>
                    <select
                      value={selectedResourceType}
                      onChange={(e) => setSelectedResourceType(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                    >
                      {RESOURCE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={playlistInputUrl}
                    name="playlistUrl"
                    autoComplete="url"
                    onChange={(e) => setPlaylistInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleFetchPlaylist())}
                    placeholder="Paste YouTube Playlist URL (e.g. https://www.youtube.com/playlist?list=...)"
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleFetchPlaylist()}
                    disabled={fetchingPlaylist || !playlistInputUrl.trim()}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {fetchingPlaylist ? 'Analyzing...' : 'Fetch Playlist'}
                  </button>
                </div>

                {/* Optional Helpful URL Suggestions */}
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <div className="text-[11px] font-semibold text-zinc-500 mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Optional: Click an example educational playlist to paste link
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_SUGGESTIONS.map(preset => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setPlaylistInputUrl(preset.url);
                          handleFetchPlaylist(preset.url);
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Playlist Preview Card */}
                {playlistPreview && (
                  <div className="mt-3 p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {playlistPreview.thumbnailUrl && (
                          <img
                            src={playlistPreview.thumbnailUrl}
                            alt="thumbnail"
                            className="w-20 h-12 rounded-lg object-cover shrink-0"
                          />
                        )}
                        <div>
                          <div className="text-xs font-bold text-zinc-900 dark:text-white">
                            {playlistPreview.title}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {playlistPreview.channelName} • {playlistPreview.videos?.length || 0} lectures • {formatDuration(playlistPreview.totalDurationSeconds || 0)}
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                            <Tag className="w-2.5 h-2.5" /> {selectedResourceType}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddPreviewedPlaylist}
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 flex items-center gap-1 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" /> Attach to {subjects.find(s => s.id === selectedSubjectId)?.name}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Individual Video Attachment Optional Form */}
              <div className="p-3.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 flex flex-col sm:flex-row items-center gap-2">
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                  + Add Single Video (Revision/PYQ):
                </div>
                <input
                  type="text"
                  value={singleVideoUrl}
                  name="singleVideoUrl"
                  autoComplete="url"
                  onChange={(e) => setSingleVideoUrl(e.target.value)}
                  placeholder="Paste YouTube watch URL (e.g. https://www.youtube.com/watch?v=...)"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddSingleVideo}
                  disabled={fetchingSingleVideo || !singleVideoUrl.trim()}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 dark:bg-zinc-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {fetchingSingleVideo ? 'Fetching...' : 'Add Video'}
                </button>
              </div>

              {/* Attached Playlists for All Subjects */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Configured Educational Content ({attachedPlaylists.length} Playlists)
                </div>

                {attachedPlaylists.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
                    No YouTube playlists attached yet. Paste a YouTube playlist link above to attach content.
                  </div>
                ) : (
                  attachedPlaylists.map((pl) => {
                    const sub = subjects.find(s => s.id === pl.subjectId);
                    const durSec = pl.videos.reduce((acc, v) => acc + v.durationSeconds, 0);
                    return (
                      <div
                        key={pl.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 shadow-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sub?.color || '#2563eb' }} />
                          <div>
                            <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                              <span>{pl.title}</span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                                {pl.resourceType}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              Subject: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{sub?.name}</span> • {pl.videos.length} videos • {formatDuration(durSec)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePlaylist(pl.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Review Imported Content */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                  Step 4: Review Imported Lectures & Topics
                </h3>
                <p className="text-xs text-zinc-500">
                  Inspect the videos inside each playlist. You can uncheck any video you do not want in your schedule. The original playlist lecture sequence is strictly preserved.
                </p>
              </div>

              {/* Summary Stats Pill Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">Total Subjects</div>
                  <div className="text-base font-extrabold text-blue-950 dark:text-blue-100">{subjects.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">Playlists</div>
                  <div className="text-base font-extrabold text-blue-950 dark:text-blue-100">{attachedPlaylists.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">Included Videos</div>
                  <div className="text-base font-extrabold text-blue-950 dark:text-blue-100">{selectedVideos.length} / {allVideos.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">Total Watch Time</div>
                  <div className="text-base font-extrabold text-blue-950 dark:text-blue-100">{totalDurationHours} hrs</div>
                </div>
              </div>

              {/* Playlists & Videos Accordion */}
              <div className="space-y-3">
                {attachedPlaylists.map(pl => {
                  const sub = subjects.find(s => s.id === pl.subjectId);
                  const isExpanded = Boolean(expandedPlaylists[pl.id]);
                  const includedCount = pl.videos.filter(v => v.included).length;

                  return (
                    <div
                      key={pl.id}
                      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 overflow-hidden shadow-xs"
                    >
                      {/* Accordion Header */}
                      <div
                        onClick={() => setExpandedPlaylists({ ...expandedPlaylists, [pl.id]: !isExpanded })}
                        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: sub?.color || '#2563eb' }} />
                          <div>
                            <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                              <span>{pl.title}</span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                                {pl.resourceType}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {sub?.name} • {includedCount} of {pl.videos.length} videos selected
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span>{isExpanded ? 'Hide Lectures' : 'Inspect Lectures'}</span>
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>

                      {/* Expanded Video Checklist */}
                      {isExpanded && (
                        <div className="border-t border-zinc-100 dark:border-zinc-700/60 divide-y divide-zinc-100 dark:divide-zinc-700/40 max-h-64 overflow-y-auto bg-zinc-50/40 dark:bg-zinc-900/40">
                          {pl.videos.map((vid, idx) => (
                            <div
                              key={vid.youtubeVideoId}
                              onClick={() => handleToggleVideoInclusion(pl.id, vid.youtubeVideoId)}
                              className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-zinc-100/70 dark:hover:bg-zinc-800/80 transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                <input
                                  type="checkbox"
                                  checked={vid.included}
                                  onChange={() => {}} // Handled by outer div click
                                  className="w-4 h-4 rounded-sm text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-xs font-mono text-zinc-400 w-6 shrink-0">
                                  #{idx + 1}
                                </span>
                                <span className={`text-xs truncate ${vid.included ? 'text-zinc-800 dark:text-zinc-200 font-medium' : 'text-zinc-400 line-through'}`}>
                                  {vid.title}
                                </span>
                              </div>

                              <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                                {formatDuration(vid.durationSeconds)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 5: Study Preferences & Routine */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                  Step 5: Define Your Scheduling Mode & Routine
                </h3>
                <p className="text-xs text-zinc-500">
                  Choose how much control you want over your daily study schedule.
                </p>
              </div>

              {/* Planning Mode Selector (Prompt Requirement 1 & 2: Scheduling Modes) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  How do you want to plan your studies?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: 'smart',
                      title: 'Smart Schedule',
                      badge: 'Automatic',
                      icon: '🤖',
                      desc: 'The engine automatically distributes your selected YouTube playlists based on subject deadlines, priorities, and pace.'
                    },
                    {
                      id: 'manual',
                      title: 'Manual Schedule',
                      badge: 'Full Control',
                      icon: '✋',
                      desc: 'You decide what you want to study each day. Lectures start in your Unscheduled bucket for manual calendar placement.'
                    },
                    {
                      id: 'hybrid',
                      title: 'Hybrid Schedule',
                      badge: 'Best of Both',
                      icon: '⚡',
                      desc: 'The engine generates an initial roadmap, and you can freely lock tasks, reschedule, and add custom study sessions.'
                    }
                  ].map(m => (
                    <div
                      key={m.id}
                      onClick={() => setPlanningMode(m.id as any)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        planningMode === m.id
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-blue-500'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 bg-white dark:bg-zinc-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{m.icon}</span>
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">{m.title}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          planningMode === m.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}>
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Daily Hours Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  How many hours can you realistically study per day?
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setDailyHours(hrs)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        dailyHours === hrs
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200'
                      }`}
                    >
                      {hrs} {hrs === 1 ? 'Hour' : 'Hours'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rest Days Setup */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Weekly Rest Days (Buffer to prevent burnout)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                    const isRest = restDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (isRest) setRestDays(restDays.filter(d => d !== day));
                          else setRestDays([...restDays, day]);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all ${
                          isRest
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-200'
                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {day} {isRest ? '(Off)' : '(Study)'}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRestDays(['sunday'])}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    Set Sunday Off
                  </button>
                  <span className="text-[11px] text-zinc-400">•</span>
                  <button
                    type="button"
                    onClick={() => setRestDays([])}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    No Rest Days (Study Every Day)
                  </button>
                </div>
              </div>

              {/* Scheduling Strategy */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Scheduling Strategy
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      id: 'smart_interleaved',
                      title: 'Smart Interleaved (Recommended)',
                      desc: 'Rotates 2 subjects per day for higher retention and less fatigue.'
                    },
                    {
                      id: 'balanced',
                      title: 'Balanced Distribution',
                      desc: 'Distributes all subjects equally across the week.'
                    },
                    {
                      id: 'priority',
                      title: 'Priority-First',
                      desc: 'Finishes high-priority subjects completely before lower priority.'
                    },
                    {
                      id: 'one_by_one',
                      title: 'One-by-One Subject Mastery',
                      desc: 'Master one full subject sequentially before starting the next.'
                    }
                  ].map(st => (
                    <div
                      key={st.id}
                      onClick={() => setStrategy(st.id as any)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        strategy === st.id
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                        <span>{st.title}</span>
                        {strategy === st.id && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1">{st.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Buffer Days */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Emergency Buffer Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={bufferDays}
                    onChange={(e) => setBufferDays(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  />
                  <span className="text-[10px] text-zinc-400">Empty days reserved for catching up if you fall behind</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Dedicated Full-Revision Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={revisionDays}
                    onChange={(e) => setRevisionDays(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  />
                  <span className="text-[10px] text-zinc-400">Days reserved solely for review before exam</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Feasibility Analysis & Plan Generation */}
          {step === 6 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                  Step 6: Workload Feasibility & Schedule Generation
                </h3>
                <p className="text-xs text-zinc-500">
                  Here is the calculated workload analysis based strictly on the content you chose.
                </p>
              </div>

              {/* Feasibility Verdict Card */}
              <div className={`p-4 rounded-2xl border ${
                feasibility.isFeasible 
                  ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200'
                  : 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200'
              }`}>
                <div className="flex items-center gap-2 mb-2 font-bold text-sm">
                  {feasibility.isFeasible ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Plan is Fully Feasible!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Tight Schedule: Adjustment Recommended</span>
                    </>
                  )}
                </div>

                <p className="text-xs">
                  {feasibility.isFeasible
                    ? `You have ${feasibility.totalAvailableHours} available study hours across ${feasibility.studyDaysCount} study days to complete ${totalDurationHours} hours of content. You have plenty of safety margin.`
                    : `You need ${feasibility.requiredHoursPerDay} hours/day to finish before your target date, but have configured ${dailyHours} hours/day. We recommend increasing your daily study time or extending the target finish date.`}
                </p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">Total Lectures</div>
                  <div className="text-lg font-extrabold text-zinc-900 dark:text-white">{selectedVideos.length}</div>
                </div>

                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">Lecture Duration</div>
                  <div className="text-lg font-extrabold text-zinc-900 dark:text-white">{totalDurationHours} hrs</div>
                </div>

                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">Available Days</div>
                  <div className="text-lg font-extrabold text-zinc-900 dark:text-white">{feasibility.studyDaysCount} days</div>
                </div>

                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">Daily Target</div>
                  <div className="text-lg font-extrabold text-zinc-900 dark:text-white">{dailyHours} hrs / day</div>
                </div>
              </div>

              {/* Final Checklist Confirmation */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 text-xs space-y-2">
                <div className="font-semibold text-zinc-700 dark:text-zinc-300">Schedule will be created with:</div>
                <div className="text-zinc-500">• <strong className="text-zinc-700 dark:text-zinc-200 capitalize">{planningMode} Scheduling Mode</strong> ({planningMode === 'manual' ? 'Full manual task placement' : planningMode === 'hybrid' ? 'Smart roadmap with task locking' : 'Smart automatic distribution'})</div>
                <div className="text-zinc-500">• {subjects.length} subjects: {subjects.map(s => s.name + (s.targetDate ? ` (🎯 ${new Date(s.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})` : '')).join(', ')}</div>
                <div className="text-zinc-500">• {attachedPlaylists.length} YouTube playlists chosen directly by you</div>
                <div className="text-zinc-500">• {strategy.replace('_', ' ')} algorithm with {bufferDays} buffer days and {revisionDays} revision days</div>
              </div>
            </div>
          )}

        </div>

        {/* Wizard Footer Navigation Controls */}
        <div className="p-4 sm:px-6 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 6 ? (
            <button
              onClick={() => {
                // Step validation
                if (step === 2 && subjects.length === 0) {
                  setError('Please add at least one subject to proceed.');
                  return;
                }
                if (step === 3 && attachedPlaylists.length === 0) {
                  setError('Please attach at least one YouTube playlist for your subjects.');
                  return;
                }
                setError(null);
                setStep(step + 1);
              }}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              Continue <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              id="generate-plan-final-btn"
              onClick={handleGenerateCourseAndSchedule}
              disabled={loading || selectedVideos.length === 0}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'Building Your Custom Schedule...' : 'Generate Personalized Study Plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
