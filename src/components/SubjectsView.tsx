import { YouTubeThumbnail } from "./YouTubeThumbnail";
import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Plus, Sparkles, Play, Search, Filter, 
  Trash2, ExternalLink, CheckCircle2, Clock, Check, AlertCircle, Layers,
  RefreshCw, RotateCcw, Youtube, Video as VideoIcon, Tag, Info, Calendar,
  Edit2, Lock, ArrowLeft, ArrowRight, ShieldAlert, CheckCircle, XCircle,
  HelpCircle, ChevronRight, AlertTriangle
} from 'lucide-react';
import { Course, Subject, Video, Playlist } from '../types';
import { formatDuration, formatDateReadable, apiRequest } from '../utils';

interface SubjectsViewProps {
  course: Course;
  onRefresh: () => Promise<void>;
}

const RESOURCE_TYPES = [
  'Main Lectures',
  'Problem Solving',
  'PYQs (Previous Years)',
  'Rapid Revision',
  'Practice Problems',
  'Formula / Short Notes'
];

export const SubjectsView: React.FC<SubjectsViewProps> = ({ course, onRefresh }) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Drill-down Detail View State
  const [detailSubjectId, setDetailSubjectId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'all' | 'scheduled' | 'unscheduled'>('all');

  // Modals
  const [addSubjectModalOpen, setAddSubjectModalOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectPriority, setNewSubjectPriority] = useState<'high' | 'medium' | 'low'>('high');
  const [newSubjectDifficulty, setNewSubjectDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [newSubjectColor, setNewSubjectColor] = useState('#2563eb');
  const [newSubHasDeadline, setNewSubHasDeadline] = useState(false);
  const [newSubTargetDate, setNewSubTargetDate] = useState('');

  // Edit Subject Modal
  const [editSubjectModalOpen, setEditSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low'>('high');
  const [editDifficulty, setEditDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [editColor, setEditColor] = useState('#2563eb');
  const [editHasDeadline, setEditHasDeadline] = useState(false);
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete Subject Modal
  const [deleteSubjectModalOpen, setDeleteSubjectModalOpen] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null);
  const [deleteKeepHistorical, setDeleteKeepHistorical] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Schedule Single Video Modal (Manual scheduling)
  const [scheduleVideoModalOpen, setScheduleVideoModalOpen] = useState(false);
  const [schedulingVideo, setSchedulingVideo] = useState<Video | null>(null);
  const [targetScheduleDate, setTargetScheduleDate] = useState('');
  const [targetScheduleTime, setTargetScheduleTime] = useState('');
  const [schedulingLoading, setSchedulingLoading] = useState(false);

  // Import Playlist Modal
  const [importPlaylistModalOpen, setImportPlaylistModalOpen] = useState(false);
  const [playlistSubjectId, setPlaylistSubjectId] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistResourceType, setPlaylistResourceType] = useState('Main Lectures');
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false);
  const [playlistPreview, setPlaylistPreview] = useState<any>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  // Add Single Video Modal
  const [singleVideoModalOpen, setSingleVideoModalOpen] = useState(false);
  const [singleVideoUrl, setSingleVideoUrl] = useState('');
  const [singleVideoSubjectId, setSingleVideoSubjectId] = useState('');
  const [singleVideoContentType, setSingleVideoContentType] = useState('Lecture');
  const [addingSingleVideo, setAddingSingleVideo] = useState(false);

  // Replace Playlist Modal
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [targetPlaylistToReplace, setTargetPlaylistToReplace] = useState<Playlist | null>(null);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replaceHandling, setReplaceHandling] = useState<'replace_unfinished' | 'remove_all' | 'keep_all'>('replace_unfinished');
  const [replacingPlaylist, setReplacingPlaylist] = useState(false);

  // Refresh Playlist Modal
  const [refreshModalOpen, setRefreshModalOpen] = useState(false);
  const [refreshDiff, setRefreshDiff] = useState<any | null>(null);
  const [refreshingPlaylistId, setRefreshingPlaylistId] = useState<string | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [applyingRefresh, setApplyingRefresh] = useState(false);

  // Video Watching Modal
  const [watchModalVideo, setWatchModalVideo] = useState<Video | null>(null);

  // Action Success Message
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [subsRes, vidsRes, plRes] = await Promise.all([
        apiRequest(`/courses/${course.id}/subjects`),
        apiRequest(`/courses/${course.id}/videos`),
        apiRequest(`/courses/${course.id}/playlists`)
      ]);
      setSubjects(subsRes.subjects || []);
      setVideos(vidsRes.videos || []);
      setPlaylists(plRes.playlists || []);
      if (subsRes.subjects?.length > 0 && !playlistSubjectId) {
        setPlaylistSubjectId(subsRes.subjects[0].id);
        setSingleVideoSubjectId(subsRes.subjects[0].id);
      }
    } catch (err) {
      console.error('Failed to load subjects/videos/playlists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [course.id]);

  // Quick preset deadline helper
  const applyPresetDeadline = (days: number, isEdit: boolean) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = d.toISOString().split('T')[0];
    if (isEdit) {
      setEditTargetDate(dateStr);
      setEditHasDeadline(true);
    } else {
      setNewSubTargetDate(dateStr);
      setNewSubHasDeadline(true);
    }
  };

  // Create Subject
  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    try {
      await apiRequest(`/courses/${course.id}/subjects`, {
        method: 'POST',
        body: JSON.stringify({
          name: newSubjectName.trim(),
          priority: newSubjectPriority,
          difficulty: newSubjectDifficulty,
          color: newSubjectColor,
          targetDate: newSubHasDeadline && newSubTargetDate ? newSubTargetDate : null
        })
      });
      setAddSubjectModalOpen(false);
      setNewSubjectName('');
      setNewSubHasDeadline(false);
      setNewSubTargetDate('');
      setActionSuccessMsg(`Subject created successfully!`);
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to add subject');
    }
  };

  // Open Edit Subject
  const openEditSubject = (sub: Subject, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSubject(sub);
    setEditName(sub.name);
    setEditPriority(sub.priority);
    setEditDifficulty(sub.difficulty);
    setEditColor(sub.color || '#2563eb');
    setEditHasDeadline(Boolean(sub.target_date));
    setEditTargetDate(sub.target_date || '');
    setEditSubjectModalOpen(true);
  };

  // Submit Edit Subject
  const handleSaveEditSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await apiRequest(`/courses/${course.id}/subjects/${editingSubject.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          priority: editPriority,
          difficulty: editDifficulty,
          color: editColor,
          targetDate: editHasDeadline && editTargetDate ? editTargetDate : null
        })
      });

      setEditSubjectModalOpen(false);
      setEditingSubject(null);
      setActionSuccessMsg(res.deadlineImpactMessage || 'Subject updated successfully!');
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update subject');
    } finally {
      setEditSaving(false);
    }
  };

  // Open Delete Subject
  const openDeleteSubject = (sub: Subject, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeletingSubject(sub);
    setDeleteSubjectModalOpen(true);
  };

  // Confirm Delete Subject
  const handleConfirmDeleteSubject = async () => {
    if (!deletingSubject) return;
    setDeleting(true);
    try {
      await apiRequest(`/subjects/${deletingSubject.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ keepHistorical: deleteKeepHistorical })
      });
      setDeleteSubjectModalOpen(false);
      if (detailSubjectId === deletingSubject.id) {
        setDetailSubjectId(null);
      }
      setDeletingSubject(null);
      setActionSuccessMsg('Subject removed.');
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete subject');
    } finally {
      setDeleting(false);
    }
  };

  // Preview Playlist
  const handleFetchPlaylist = async (urlToFetch?: string) => {
    const targetUrl = urlToFetch || playlistUrl;
    if (!targetUrl.trim()) return;
    setFetchingPlaylist(true);
    try {
      const res = await apiRequest('/youtube/playlist/preview', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl, courseId: course.id })
      });
      setPlaylistPreview(res);
      const allIds = new Set<string>((res.videos || []).map((v: any) => v.id));
      setSelectedVideoIds(allIds);
    } catch (err: any) {
      alert(err.message || 'Could not fetch playlist');
    } finally {
      setFetchingPlaylist(false);
    }
  };

  // Submit Playlist Import
  const handleImportPlaylist = async () => {
    if (!playlistPreview || !playlistSubjectId) return;
    const chosenVideos = playlistPreview.videos.filter((v: any) => selectedVideoIds.has(v.id));
    if (chosenVideos.length === 0) {
      alert('Please select at least one video to import.');
      return;
    }

    try {
      await apiRequest(`/courses/${course.id}/playlists/import`, {
        method: 'POST',
        body: JSON.stringify({
          subjectId: playlistSubjectId,
          playlistId: playlistPreview.playlistId,
          title: playlistPreview.title,
          description: playlistPreview.description,
          resourceType: playlistResourceType,
          videos: chosenVideos
        })
      });

      // If smart/hybrid, automatically schedule new videos
      if (course.planning_mode !== 'manual') {
        await apiRequest(`/courses/${course.id}/schedule/generate`, {
          method: 'POST',
          body: JSON.stringify({ preserveCompleted: true })
        });
      }

      setImportPlaylistModalOpen(false);
      setPlaylistPreview(null);
      setPlaylistUrl('');
      setActionSuccessMsg(`Imported ${chosenVideos.length} videos from "${playlistPreview.title}".`);
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to import playlist');
    }
  };

  // Submit Single Video
  const handleAddSingleVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleVideoUrl.trim() || !singleVideoSubjectId) return;
    setAddingSingleVideo(true);
    try {
      await apiRequest('/videos/add-single', {
        method: 'POST',
        body: JSON.stringify({
          courseId: course.id,
          subjectId: singleVideoSubjectId,
          urlOrId: singleVideoUrl.trim(),
          contentType: singleVideoContentType
        })
      });

      if (course.planning_mode !== 'manual') {
        await apiRequest(`/courses/${course.id}/schedule/generate`, {
          method: 'POST',
          body: JSON.stringify({ preserveCompleted: true })
        });
      }

      setSingleVideoModalOpen(false);
      setSingleVideoUrl('');
      setActionSuccessMsg('Added individual video to your library!');
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to add video');
    } finally {
      setAddingSingleVideo(false);
    }
  };

  // Open Schedule Single Video Modal
  const openScheduleVideo = (vid: Video) => {
    setSchedulingVideo(vid);
    const today = new Date().toISOString().split('T')[0];
    setTargetScheduleDate(today);
    setTargetScheduleTime('09:00');
    setScheduleVideoModalOpen(true);
  };

  // Submit Manual Schedule Video onto a Day
  const handleConfirmScheduleVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingVideo || !targetScheduleDate) return;
    setSchedulingLoading(true);
    try {
      await apiRequest(`/courses/${course.id}/videos/${schedulingVideo.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          scheduledDate: targetScheduleDate,
          startTime: targetScheduleTime || null
        })
      });

      setScheduleVideoModalOpen(false);
      setSchedulingVideo(null);
      setActionSuccessMsg(`Scheduled "${schedulingVideo.title}" for ${formatDateReadable(targetScheduleDate)}.`);
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to schedule video');
    } finally {
      setSchedulingLoading(false);
    }
  };

  // Toggle Video Status directly
  const handleUpdateVideoStatus = async (videoId: string, newStatus: string) => {
    try {
      await apiRequest(`/videos/${videoId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update video status');
    }
  };

  // Check Refresh for Playlist
  const handleCheckRefresh = async (playlist: Playlist) => {
    setRefreshingPlaylistId(playlist.id);
    setRefreshLoading(true);
    try {
      const res = await apiRequest(`/playlists/${playlist.id}/refresh`, { method: 'POST' });
      setRefreshDiff(res);
      setRefreshModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Could not check YouTube for updates');
    } finally {
      setRefreshLoading(false);
      setRefreshingPlaylistId(null);
    }
  };

  // Apply Refresh Changes
  const handleApplyRefresh = async () => {
    if (!refreshDiff || !refreshDiff.newVideos || refreshDiff.newVideos.length === 0) {
      setRefreshModalOpen(false);
      return;
    }
    setApplyingRefresh(true);
    try {
      await apiRequest(`/playlists/${refreshDiff.playlistId}/refresh/apply`, {
        method: 'POST',
        body: JSON.stringify({ videosToAdd: refreshDiff.newVideos })
      });

      if (course.planning_mode !== 'manual') {
        await apiRequest(`/courses/${course.id}/schedule/generate`, {
          method: 'POST',
          body: JSON.stringify({ preserveCompleted: true })
        });
      }

      setRefreshModalOpen(false);
      setRefreshDiff(null);
      setActionSuccessMsg(`Added ${refreshDiff.newVideos.length} newly released lectures to your schedule!`);
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to apply refresh');
    } finally {
      setApplyingRefresh(false);
    }
  };

  // Replace Playlist
  const handleReplacePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPlaylistToReplace || !replaceUrl.trim()) return;
    setReplacingPlaylist(true);
    try {
      await apiRequest(`/playlists/${targetPlaylistToReplace.id}/replace`, {
        method: 'POST',
        body: JSON.stringify({
          newPlaylistUrl: replaceUrl.trim(),
          handlingOption: replaceHandling
        })
      });

      if (course.planning_mode !== 'manual') {
        await apiRequest(`/courses/${course.id}/schedule/generate`, {
          method: 'POST',
          body: JSON.stringify({ preserveCompleted: replaceHandling !== 'remove_all' })
        });
      }

      setReplaceModalOpen(false);
      setReplaceUrl('');
      setTargetPlaylistToReplace(null);
      setActionSuccessMsg('Playlist successfully replaced!');
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to replace playlist');
    } finally {
      setReplacingPlaylist(false);
    }
  };

  // Delete Playlist
  const handleDeletePlaylist = async (playlistId: string, title: string) => {
    if (!confirm(`Are you sure you want to remove the playlist "${title}" and its videos from your course?`)) return;
    try {
      await apiRequest(`/playlists/${playlistId}`, { method: 'DELETE' });
      if (course.planning_mode !== 'manual') {
        await apiRequest(`/courses/${course.id}/schedule/generate`, {
          method: 'POST',
          body: JSON.stringify({ preserveCompleted: true })
        });
      }
      setActionSuccessMsg(`Removed playlist "${title}".`);
      await loadData();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete playlist');
    }
  };

  // Quick preset helper
  const handlePresetSelect = (presetUrl: string) => {
    setPlaylistUrl(presetUrl);
    handleFetchPlaylist(presetUrl);
  };

  // Helper for Status Badge styling
  const getStatusBadge = (status?: string) => {
    const s = (status || 'no_deadline').toLowerCase();
    if (s.includes('completed')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-blue-600" /> Completed
        </span>
      );
    }
    if (s.includes('on_track') || s.includes('track')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> On Track
        </span>
      );
    }
    if (s.includes('risk')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-amber-600" /> At Risk
        </span>
      );
    }
    if (s.includes('behind')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 flex items-center gap-1">
          <XCircle className="w-3 h-3 text-red-600" /> Behind
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
        No Deadline
      </span>
    );
  };

  // If viewing details for a single subject
  const currentDetailSubject = subjects.find(s => s.id === detailSubjectId);

  // Filtered detail videos
  const detailVideos = videos.filter(v => {
    if (v.subject_id !== detailSubjectId) return false;
    if (detailTab === 'scheduled') return Boolean(v.scheduled_date);
    if (detailTab === 'unscheduled') return !v.scheduled_date && v.status !== 'completed' && v.status !== 'skipped';
    return true;
  });

  // Filtered detail playlists
  const detailPlaylists = playlists.filter(p => p.subject_id === detailSubjectId);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Action Notification Toast */}
      {actionSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>{actionSuccessMsg}</span>
          <button onClick={() => setActionSuccessMsg(null)} className="font-bold text-sm px-2">✕</button>
        </div>
      )}

      {/* DEDICATED SUBJECT DETAIL VIEW */}
      {currentDetailSubject ? (
        <div className="space-y-6">
          {/* Breadcrumb & Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDetailSubjectId(null)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to All Subjects
              </button>
              <span className="text-zinc-400">/</span>
              <span className="text-xs font-bold text-zinc-900 dark:text-white">{currentDetailSubject.name}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => openEditSubject(currentDetailSubject)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-600" /> Edit Subject & Deadline
              </button>
              <button
                onClick={() => openDeleteSubject(currentDetailSubject)}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 hover:bg-red-100 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>

          {/* Subject Detail Header Card */}
          <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span 
                  className="w-4 h-4 rounded-full mt-1.5 shrink-0" 
                  style={{ backgroundColor: currentDetailSubject.color || '#2563eb' }}
                />
                <div>
                  <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                    {currentDetailSubject.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {currentDetailSubject.priority} priority
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {currentDetailSubject.difficulty} difficulty
                    </span>
                    {getStatusBadge(currentDetailSubject.status)}
                  </div>
                </div>
              </div>

              {/* Target Deadline Badge */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 flex flex-col items-start sm:items-end gap-1">
                <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <span>🎯 Subject Target Deadline</span>
                </div>
                {currentDetailSubject.target_date ? (
                  <>
                    <div className="text-base font-extrabold text-zinc-900 dark:text-white">
                      Finish by {new Date(currentDetailSubject.target_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                      {currentDetailSubject.days_remaining !== undefined && currentDetailSubject.days_remaining !== null
                        ? `${currentDetailSubject.days_remaining} day${currentDetailSubject.days_remaining === 1 ? '' : 's'} remaining`
                        : ''}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500 font-medium">
                    No specific deadline set (Distributed until overall course finish)
                  </div>
                )}
              </div>
            </div>

            {/* Feasibility & Pace Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Lectures Completed</div>
                <div className="text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                  {currentDetailSubject.completed_video_count || 0} / {currentDetailSubject.video_count || 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Duration Completed</div>
                <div className="text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                  {formatDuration(currentDetailSubject.completed_duration_seconds || 0)} / {formatDuration(currentDetailSubject.total_duration_seconds || 0)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Required Pace</div>
                <div className="text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5">
                  {currentDetailSubject.required_daily_minutes ? `${Math.round(currentDetailSubject.required_daily_minutes)} min/day` : 'N/A'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Current Study Pace</div>
                <div className="text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                  {currentDetailSubject.current_pace_minutes ? `${Math.round(currentDetailSubject.current_pace_minutes)} min/day` : '180 min/day'}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                <span>Subject Completion Rate</span>
                <span>
                  {currentDetailSubject.video_count && currentDetailSubject.video_count > 0
                    ? Math.round(((currentDetailSubject.completed_video_count || 0) / currentDetailSubject.video_count) * 100)
                    : 0}%
                </span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${currentDetailSubject.video_count && currentDetailSubject.video_count > 0
                      ? Math.round(((currentDetailSubject.completed_video_count || 0) / currentDetailSubject.video_count) * 100)
                      : 0}%`,
                    backgroundColor: currentDetailSubject.color || '#2563eb'
                  }}
                />
              </div>
            </div>

            {/* Deadline Conflict Warning Banner */}
            {currentDetailSubject.has_conflict && (
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      ⚠️ Deadline Conflict Detected for {currentDetailSubject.name}
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                      {currentDetailSubject.conflict_message || 
                        `You have set a deadline of ${currentDetailSubject.target_date}, but the remaining workload (${formatDuration(currentDetailSubject.remaining_duration_seconds || 0)}) exceeds available study hours before this date.`}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200">Quick Adjustments:</span>
                  <button
                    onClick={() => openEditSubject(currentDetailSubject)}
                    className="px-3 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-amber-300 dark:border-amber-700 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 transition-colors shadow-xs"
                  >
                    📅 Move Subject Deadline
                  </button>
                  <button
                    onClick={() => {
                      applyPresetDeadline(14, true);
                      openEditSubject(currentDetailSubject);
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors shadow-xs"
                  >
                    + Extend Deadline 2 Weeks
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Attached YouTube Playlists for this Subject */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-600" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Attached Playlists for {currentDetailSubject.name} ({detailPlaylists.length})
                </h3>
              </div>
              <button
                onClick={() => {
                  setPlaylistSubjectId(currentDetailSubject.id);
                  setImportPlaylistModalOpen(true);
                }}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                + Add Another Playlist
              </button>
            </div>

            {detailPlaylists.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
                No YouTube playlists attached to this subject yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detailPlaylists.map(pl => (
                  <div key={pl.id} className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{pl.title}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 shrink-0">
                          {pl.resource_type || 'Main Lectures'}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Channel: {pl.channel_name || 'Educator'} • {pl.video_count} videos • {formatDuration(pl.total_duration_seconds)}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCheckRefresh(pl)}
                          className="px-2 py-1 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3 text-blue-600" /> Refresh
                        </button>
                        <button
                          onClick={() => {
                            setTargetPlaylistToReplace(pl);
                            setReplaceModalOpen(true);
                          }}
                          className="px-2 py-1 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-600" /> Replace
                        </button>
                      </div>
                      <button
                        onClick={() => handleDeletePlaylist(pl.id, pl.title)}
                        className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Videos List with Filter Tabs */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">
                  Video Lectures ({detailVideos.length})
                </span>
              </div>

              {/* Tabs: All / Scheduled / Unscheduled */}
              <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                <button
                  onClick={() => setDetailTab('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    detailTab === 'all'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  All ({videos.filter(v => v.subject_id === detailSubjectId).length})
                </button>
                <button
                  onClick={() => setDetailTab('scheduled')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    detailTab === 'scheduled'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Scheduled ({videos.filter(v => v.subject_id === detailSubjectId && v.scheduled_date).length})
                </button>
                <button
                  onClick={() => setDetailTab('unscheduled')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    detailTab === 'unscheduled'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Unscheduled ({videos.filter(v => v.subject_id === detailSubjectId && !v.scheduled_date && v.status !== 'completed' && v.status !== 'skipped').length})
                </button>
              </div>
            </div>

            {/* Video List */}
            {detailVideos.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                No videos match the selected tab filter.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {detailVideos.map((vid, idx) => (
                  <div
                    key={vid.id}
                    className="p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:bg-white dark:hover:bg-zinc-800/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-zinc-400 font-mono w-7 text-right shrink-0">
                        #{vid.original_position || idx + 1}
                      </span>

                      <div className="w-24 aspect-video shrink-0 rounded-lg overflow-hidden bg-slate-900 shadow-2xs">
                        <YouTubeThumbnail
                          videoId={vid.youtube_video_id}
                          thumbnailUrl={vid.thumbnail_url}
                          title={vid.title}
                          aspectRatioClass="aspect-video"
                          roundedClass="rounded-lg"
                          className="w-full h-full"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {vid.content_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                              {vid.content_type}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 font-medium">
                            {formatDuration(vid.duration_seconds)}
                          </span>

                          {/* Scheduled Date badge */}
                          {vid.scheduled_date ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDateReadable(vid.scheduled_date)}
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Unscheduled
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                          {vid.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {vid.channel_name || 'YouTube Educator'}
                        </p>
                      </div>
                    </div>

                    {/* Actions: Watch, Status Selector, Schedule Button */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => setWatchModalVideo(vid)}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-blue-600 text-xs font-semibold flex items-center gap-1"
                        title="Watch lecture video"
                      >
                        <Play className="w-3 h-3 text-blue-600" /> Watch
                      </button>

                      {/* Manual Schedule button if unscheduled */}
                      <button
                        onClick={() => openScheduleVideo(vid)}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Schedule this video onto a specific date"
                      >
                        <Calendar className="w-3 h-3" /> Schedule
                      </button>

                      {/* Status Dropdown */}
                      <select
                        value={vid.status}
                        onChange={(e) => handleUpdateVideoStatus(vid.id, e.target.value)}
                        className={`text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer ${
                          vid.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
                            : vid.status === 'in_progress'
                              ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300'
                              : vid.status === 'skipped'
                                ? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400 border-zinc-300'
                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MAIN SUBJECTS OVERVIEW VIEW */
        <div className="space-y-6">
          {/* Top Header & Action Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-blue-600" />
                Subjects & Video Library
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Each subject has user-chosen YouTube playlists, customizable deadlines, and workload feasibility tracking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="add-single-video-btn"
                onClick={() => setSingleVideoModalOpen(true)}
                className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <VideoIcon className="w-3.5 h-3.5 text-blue-600" />
                + Single Video
              </button>

              <button
                id="import-playlist-btn"
                onClick={() => setImportPlaylistModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" />
                Import Playlist
              </button>

              <button
                id="add-subject-btn"
                onClick={() => setAddSubjectModalOpen(true)}
                className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Subject
              </button>
            </div>
          </div>

          {/* Subject Cards Grid with Subject Deadlines & Feasibility Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((sub) => {
              const completedCount = sub.completed_video_count || 0;
              const totalCount = sub.video_count || 0;
              const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
              const subPlaylistsCount = playlists.filter(p => p.subject_id === sub.id).length;

              return (
                <div
                  key={sub.id}
                  className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs hover:border-blue-400 dark:hover:border-blue-600 transition-all flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span 
                          className="w-3.5 h-3.5 rounded-full shrink-0" 
                          style={{ backgroundColor: sub.color || '#2563eb' }}
                        />
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                          {sub.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => openEditSubject(sub, e)}
                          className="p-1 text-zinc-400 hover:text-blue-600 transition-colors"
                          title="Edit subject & deadline"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => openDeleteSubject(sub, e)}
                          className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                          title="Delete subject"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Priority & Status Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {sub.priority} priority
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {subPlaylistsCount} {subPlaylistsCount === 1 ? 'playlist' : 'playlists'}
                      </span>
                      {getStatusBadge(sub.status)}
                    </div>

                    {/* Target Deadline Badge */}
                    <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 font-semibold flex items-center gap-1">
                          <span>🎯 Target:</span>
                        </span>
                        {sub.target_date ? (
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">
                            Finish by {new Date(sub.target_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-medium">No specific deadline</span>
                        )}
                      </div>

                      {sub.target_date && sub.days_remaining !== undefined && sub.days_remaining !== null && (
                        <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium text-right">
                          {sub.days_remaining} day{sub.days_remaining === 1 ? '' : 's'} remaining
                        </div>
                      )}
                    </div>

                    {/* Conflict Warning */}
                    {sub.has_conflict && (
                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Deadline conflict: Study time shortfall</span>
                      </div>
                    )}

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs text-zinc-500 font-medium">
                        <span>{completedCount} / {totalCount} videos ({pct}%)</span>
                        <span>{formatDuration(sub.total_duration_seconds || 0)}</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ 
                            width: `${pct}%`,
                            backgroundColor: sub.color || '#2563eb'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Button: Drill into Detail View */}
                  <button
                    onClick={() => {
                      setDetailSubjectId(sub.id);
                      setDetailTab('all');
                    }}
                    className="w-full py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white text-zinc-700 dark:text-zinc-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>View Subject Details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Configured Playlists across all subjects */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-600" />
                <span className="text-sm font-bold text-zinc-900 dark:text-white">
                  All Configured YouTube Playlists ({playlists.length})
                </span>
              </div>
              <button
                onClick={() => setImportPlaylistModalOpen(true)}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                + Import Playlist
              </button>
            </div>

            {playlists.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                No YouTube playlists attached yet. Click "Import Playlist" above to attach educational videos.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {playlists.map((pl) => (
                  <div
                    key={pl.id}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pl.subject_color || '#2563eb' }} />
                          <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {pl.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 shrink-0">
                          {pl.resource_type || 'Main Lectures'}
                        </span>
                      </div>

                      <div className="text-[11px] text-zinc-500 mt-1">
                        Subject: <strong className="text-zinc-700 dark:text-zinc-300">{pl.subject_name}</strong> • {pl.video_count} videos • {formatDuration(pl.total_duration_seconds)}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCheckRefresh(pl)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-zinc-700 dark:text-zinc-300 flex items-center gap-1 font-medium transition-colors"
                        >
                          <RefreshCw className="w-3 h-3 text-blue-600" /> Refresh
                        </button>
                        <button
                          onClick={() => {
                            setTargetPlaylistToReplace(pl);
                            setReplaceModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-zinc-700 dark:text-zinc-300 flex items-center gap-1 font-medium transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-600" /> Replace
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeletePlaylist(pl.id, pl.title)}
                        className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Add Subject Modal with Deadline Controls */}
      {addSubjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-4">
              Add New Subject
            </h3>

            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  required
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Electrical Machines, Algorithms"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Exam Priority
                  </label>
                  <select
                    value={newSubjectPriority}
                    onChange={(e: any) => setNewSubjectPriority(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Difficulty
                  </label>
                  <select
                    value={newSubjectDifficulty}
                    onChange={(e: any) => setNewSubjectDifficulty(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Deadline Settings */}
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-800/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                    <span>🎯</span> Set Subject Deadline?
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewSubHasDeadline(false)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        !newSubHasDeadline
                          ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white font-bold'
                          : 'text-zinc-500'
                      }`}
                    >
                      No deadline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSubHasDeadline(true);
                        if (!newSubTargetDate) applyPresetDeadline(30, false);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        newSubHasDeadline
                          ? 'bg-blue-600 text-white font-bold'
                          : 'text-zinc-500'
                      }`}
                    >
                      Set deadline
                    </button>
                  </div>
                </div>

                {newSubHasDeadline && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[10px] text-zinc-500 self-center mr-1">Presets:</span>
                      <button type="button" onClick={() => applyPresetDeadline(7, false)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">1 Wk</button>
                      <button type="button" onClick={() => applyPresetDeadline(14, false)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">2 Wks</button>
                      <button type="button" onClick={() => applyPresetDeadline(30, false)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">1 Mo</button>
                      <button type="button" onClick={() => applyPresetDeadline(60, false)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">2 Mos</button>
                    </div>
                    <input
                      type="date"
                      value={newSubTargetDate}
                      onChange={(e) => setNewSubTargetDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Color Tag
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#db2777'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewSubjectColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${newSubjectColor === c ? 'scale-125 ring-2 ring-blue-500' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAddSubjectModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  Create Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Subject Modal (with Deadline Editor) */}
      {editSubjectModalOpen && editingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-4">
              Edit Subject & Deadline
            </h3>

            <form onSubmit={handleSaveEditSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e: any) => setEditPriority(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Difficulty
                  </label>
                  <select
                    value={editDifficulty}
                    onChange={(e: any) => setEditDifficulty(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Target Deadline Settings */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-800/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                    <span>🎯</span> Subject Target Deadline
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditHasDeadline(false);
                        setEditTargetDate('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        !editHasDeadline
                          ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white font-bold'
                          : 'text-zinc-500'
                      }`}
                    >
                      No deadline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditHasDeadline(true);
                        if (!editTargetDate) applyPresetDeadline(30, true);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        editHasDeadline
                          ? 'bg-blue-600 text-white font-bold'
                          : 'text-zinc-500'
                      }`}
                    >
                      Set deadline
                    </button>
                  </div>
                </div>

                {editHasDeadline && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[10px] text-zinc-500 self-center mr-1">Quick presets:</span>
                      <button type="button" onClick={() => applyPresetDeadline(7, true)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">1 Wk</button>
                      <button type="button" onClick={() => applyPresetDeadline(14, true)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">2 Wks</button>
                      <button type="button" onClick={() => applyPresetDeadline(30, true)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">1 Mo</button>
                      <button type="button" onClick={() => applyPresetDeadline(60, true)} className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-700 border text-zinc-700 dark:text-zinc-300">2 Mos</button>
                    </div>
                    <input
                      type="date"
                      value={editTargetDate}
                      onChange={(e) => setEditTargetDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Color Accent
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#db2777'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${editColor === c ? 'scale-125 ring-2 ring-blue-500' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditSubjectModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Subject Confirmation Modal */}
      {deleteSubjectModalOpen && deletingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Delete Subject "{deletingSubject.name}"?
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Are you sure you want to delete this subject and its attached YouTube playlists?
            </p>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteKeepHistorical}
                onChange={(e) => setDeleteKeepHistorical(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Keep historical completed study sessions in my analytics and daily log
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteSubjectModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSubject}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Subject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Single Video onto a Calendar Date Modal */}
      {scheduleVideoModalOpen && schedulingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Schedule Lecture
              </h3>
              <p className="text-xs text-zinc-500 truncate mt-0.5">
                {schedulingVideo.title}
              </p>
            </div>

            <form onSubmit={handleConfirmScheduleVideo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Choose Scheduled Date
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setTargetScheduleDate(new Date().toISOString().split('T')[0])}
                    className="px-2.5 py-1 rounded-lg text-[11px] bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 text-zinc-700 dark:text-zinc-300 font-semibold"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      setTargetScheduleDate(d.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 text-zinc-700 dark:text-zinc-300 font-semibold"
                  >
                    Tomorrow
                  </button>
                </div>
                <input
                  type="date"
                  required
                  value={targetScheduleDate}
                  onChange={(e) => setTargetScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Start Time (Optional)
                </label>
                <input
                  type="time"
                  value={targetScheduleTime}
                  onChange={(e) => setTargetScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Duration: {formatDuration(schedulingVideo.duration_seconds)}</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setScheduleVideoModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulingLoading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {schedulingLoading ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Playlist Modal */}
      {importPlaylistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-blue-600" />
                Import YouTube Playlist
              </h3>
              <button
                onClick={() => {
                  setImportPlaylistModalOpen(false);
                  setPlaylistPreview(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Target Subject
                  </label>
                  <select
                    value={playlistSubjectId}
                    onChange={(e) => setPlaylistSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Resource Type
                  </label>
                  <select
                    value={playlistResourceType}
                    onChange={(e) => setPlaylistResourceType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  >
                    {RESOURCE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  YouTube Playlist URL or ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    placeholder="https://www.youtube.com/playlist?list=PL..."
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                  />
                  <button
                    onClick={() => handleFetchPlaylist()}
                    disabled={fetchingPlaylist || !playlistUrl.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {fetchingPlaylist ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
                  ⚡ Curated Presets
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: 'Network Theory (GATE)', url: 'https://www.youtube.com/playlist?list=PL_network_theory_gate' },
                    { name: 'Control Systems', url: 'https://www.youtube.com/playlist?list=PL_control_systems_gate' },
                    { name: 'Signals & Systems', url: 'https://www.youtube.com/playlist?list=PL_signals_and_systems' },
                    { name: 'DSA & Algorithms', url: 'https://www.youtube.com/playlist?list=PL_dsa_computer_science' }
                  ].map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handlePresetSelect(p.url)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:border-blue-500 text-zinc-800 dark:text-zinc-200"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {playlistPreview && (
                <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white">{playlistPreview.title}</h4>
                      <p className="text-xs text-zinc-500">{playlistPreview.videos?.length} videos · {formatDuration(playlistPreview.totalDurationSeconds)} total</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const all = new Set<string>((playlistPreview.videos || []).map((v: any) => v.id || v.youtubeVideoId));
                          setSelectedVideoIds(all);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Select All
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => setSelectedVideoIds(new Set())}
                        className="text-xs text-zinc-500 hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-2">
                    {playlistPreview.videos.map((vid: any) => {
                      const vId = vid.id || vid.youtubeVideoId;
                      const isChecked = selectedVideoIds.has(vId);
                      return (
                        <label
                          key={vId}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(selectedVideoIds);
                                if (e.target.checked) next.add(vId);
                                else next.delete(vId);
                                setSelectedVideoIds(next);
                              }}
                              className="rounded text-blue-600"
                            />
                            <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">{vid.title}</span>
                          </div>
                          <span className="text-[11px] text-zinc-400 shrink-0">{formatDuration(vid.durationSeconds)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setImportPlaylistModalOpen(false)}
                className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleImportPlaylist}
                disabled={!playlistPreview || selectedVideoIds.size === 0}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
              >
                Import {selectedVideoIds.size} Selected Videos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Single Video Modal */}
      {singleVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-4">
              Add Individual Video (Revision / PYQ)
            </h3>

            <form onSubmit={handleAddSingleVideo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Target Subject
                </label>
                <select
                  value={singleVideoSubjectId}
                  onChange={(e) => setSingleVideoSubjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Content Type
                </label>
                <select
                  value={singleVideoContentType}
                  onChange={(e) => setSingleVideoContentType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                >
                  <option value="Lecture">Lecture</option>
                  <option value="PYQ">PYQ (Past Paper)</option>
                  <option value="Problem Solving">Problem Solving</option>
                  <option value="Revision">Rapid Revision</option>
                  <option value="Formula">Formula / Summary</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  YouTube Video Watch URL
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={singleVideoUrl}
                  onChange={(e) => setSingleVideoUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSingleVideoModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingSingleVideo || !singleVideoUrl.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {addingSingleVideo ? 'Adding...' : 'Add Video'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Replace Playlist Modal */}
      {replaceModalOpen && targetPlaylistToReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Replace Playlist: "{targetPlaylistToReplace.title}"
            </h3>
            <p className="text-xs text-zinc-500">
              Switch educator or course material. You can preserve your completed video study records.
            </p>

            <form onSubmit={handleReplacePlaylist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  New YouTube Playlist URL
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://www.youtube.com/playlist?list=PL..."
                  value={replaceUrl}
                  onChange={(e) => setReplaceUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Historical Progress Handling
                </label>
                <div className="space-y-2">
                  {[
                    { id: 'replace_unfinished', label: 'Replace unfinished lectures only (Keep completed videos in progress history)' },
                    { id: 'remove_all', label: 'Reset and replace all videos completely' },
                    { id: 'keep_all', label: 'Append new playlist alongside old playlist' }
                  ].map(opt => (
                    <label key={opt.id} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name="replaceHandling"
                        checked={replaceHandling === opt.id}
                        onChange={() => setReplaceHandling(opt.id as any)}
                        className="mt-0.5 text-blue-600"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setReplaceModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={replacingPlaylist || !replaceUrl.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {replacingPlaylist ? 'Replacing...' : 'Confirm Replace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refresh Playlist Modal */}
      {refreshModalOpen && refreshDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Playlist Sync: "{refreshDiff.playlistTitle}"
            </h3>

            {refreshDiff.newVideosCount === 0 ? (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 text-center">
                ✓ Playlist is fully up to date with YouTube. No new videos found.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 text-xs text-blue-800 dark:text-blue-200">
                  The creator added <strong>{refreshDiff.newVideosCount} new lecture{refreshDiff.newVideosCount > 1 ? 's' : ''}</strong>!
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 text-xs border border-zinc-200 dark:border-zinc-800 rounded-xl p-2">
                  {refreshDiff.newVideos.map((v: any) => (
                    <div key={v.youtubeVideoId} className="truncate text-zinc-700 dark:text-zinc-300">
                      • {v.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setRefreshModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
              >
                Close
              </button>
              {refreshDiff.newVideosCount > 0 && (
                <button
                  type="button"
                  onClick={handleApplyRefresh}
                  disabled={applyingRefresh}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {applyingRefresh ? 'Adding...' : `Add ${refreshDiff.newVideosCount} New Videos`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Embedded YouTube Watch Modal */}
      {watchModalVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                  {watchModalVideo.title}
                </h3>
                <span className="text-xs text-zinc-500">
                  {watchModalVideo.channel_name || 'YouTube Educator'} · {formatDuration(watchModalVideo.duration_seconds)}
                </span>
              </div>
              <button
                onClick={() => setWatchModalVideo(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${watchModalVideo.youtube_video_id}?autoplay=1`}
                title={watchModalVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>

            <div className="p-4 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Status:</span>
                <span className="text-xs font-bold capitalize text-zinc-800 dark:text-zinc-200">
                  {watchModalVideo.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleUpdateVideoStatus(
                      watchModalVideo.id, 
                      watchModalVideo.status === 'completed' ? 'not_started' : 'completed'
                    );
                    setWatchModalVideo(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  {watchModalVideo.status === 'completed' ? 'Mark Incomplete' : '✓ Mark as Completed'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
