import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, ExternalLink, Trash2, CheckCircle2, 
  BookOpen, Link as LinkIcon, Download, Layers 
} from 'lucide-react';
import { Course, CustomResource } from '../types';
import { apiRequest } from '../utils';

interface ResourcesViewProps {
  course: Course;
}

function getSafeHref(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return undefined;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({ course }) => {
  const [resources, setResources] = useState<CustomResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [resourceType, setResourceType] = useState<'pdf' | 'link' | 'book' | 'notes'>('pdf');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  const loadResources = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/courses/${course.id}/resources`);
      setResources(res.resources || []);
    } catch (err) {
      console.error('Failed to load resources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResources();
  }, [course.id]);

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await apiRequest(`/courses/${course.id}/resources`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          resourceType,
          url,
          notes
        })
      });
      setModalOpen(false);
      setTitle('');
      setUrl('');
      setNotes('');
      await loadResources();
    } catch (err: any) {
      alert(err.message || 'Failed to add resource');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Study Materials & Formula Sheets
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Store exam syllabus PDFs, formula cheat sheets, PYQ collections, and reference links alongside your video schedule.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Resource
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-zinc-400">Loading resources...</div>
      ) : resources.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-10 text-center bg-white/50 dark:bg-zinc-900/50">
          <FileText className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
          <h3 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">No resources attached yet</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Upload or link syllabus PDFs, formula summaries, or handwritten notes for quick access during revision phases.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
          >
            Add First Resource
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] px-2 py-0.5 rounded uppercase font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    {item.resource_type}
                  </span>
                  {getSafeHref(item.url) && (
                    <a
                      href={getSafeHref(item.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-400 hover:text-blue-600 p-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>

                <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">
                  {item.title}
                </h3>

                {item.notes && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3">
                    {item.notes}
                  </p>
                )}
              </div>

              {getSafeHref(item.url) && (
                <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <a
                    href={getSafeHref(item.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Open Link / Document <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Resource Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-4">
              Add Study Resource
            </h3>
            <form onSubmit={handleCreateResource} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Resource Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Network Theory Formula Sheet PDF"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Resource Type
                </label>
                <select
                  value={resourceType}
                  onChange={(e: any) => setResourceType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                >
                  <option value="pdf">PDF Document / Notes</option>
                  <option value="link">External Web Link / Drive</option>
                  <option value="notes">Handwritten Summary / Formula</option>
                  <option value="book">Reference Book</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  URL / Link (Optional)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Notes / Key Topics
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Important formulas on pages 3-7..."
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  Save Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
