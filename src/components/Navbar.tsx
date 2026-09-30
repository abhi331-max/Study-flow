import React, { useState, useEffect, useRef } from 'react';
import { 
  Flame, Calendar, Moon, Sun, LogOut, ChevronDown, 
  Plus, Trophy, Search, X, CheckCircle2, Play, Settings, 
  Layers, Menu, ExternalLink, Sparkles, BookMarked, SlidersHorizontal,
  Bell, BarChart2
} from 'lucide-react';
import { Course, User } from '../types';
import { apiRequest } from '../utils';
import { StudyFlowLogo } from './StudyFlowLogo';

interface NavbarProps {
  user: User;
  courses: Course[];
  activeCourse: Course | null;
  onSelectCourse: (courseId: string) => void;
  onNewCourse: () => void;
  streak: number;
  daysLeft: number;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  courses,
  activeCourse,
  onSelectCourse,
  onNewCourse,
  streak,
  daysLeft,
  isDarkMode,
  onToggleDarkMode,
  onLogout,
  activeTab,
  onSelectTab
}) => {
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    courses: any[];
    subjects: any[];
    tasks: any[];
  }>({ courses: [], subjects: [], tasks: [] });
  const [searching, setSearching] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const courseDropdownRef = useRef<HTMLDivElement>(null);

  // Perform search across user's courses and active course items
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ courses: [], subjects: [], tasks: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const q = searchQuery.toLowerCase();
        // 1. Filter courses
        const matchedCourses = courses.filter(c => 
          c.title.toLowerCase().includes(q) || (c.exam_name && c.exam_name.toLowerCase().includes(q))
        );

        // 2. If active course exists, fetch subjects and tasks matching query
        let matchedSubjects: any[] = [];
        let matchedTasks: any[] = [];

        if (activeCourse) {
          try {
            const [subsRes, calRes] = await Promise.all([
              apiRequest(`/courses/${activeCourse.id}/subjects`),
              apiRequest(`/courses/${activeCourse.id}/calendar`)
            ]);

            matchedSubjects = (subsRes.subjects || []).filter((s: any) =>
              s.name.toLowerCase().includes(q)
            );

            // Extract tasks from calendar days
            const allTasks: any[] = [];
            (calRes.days || []).forEach((d: any) => {
              (d.tasks || []).forEach((t: any) => allTasks.push(t));
            });

            matchedTasks = allTasks.filter((t: any) =>
              (t.custom_title || '').toLowerCase().includes(q) ||
              (t.subject_name || '').toLowerCase().includes(q)
            ).slice(0, 5);
          } catch (e) {
            // Ignore search sub-errors
          }
        }

        setSearchResults({
          courses: matchedCourses.slice(0, 3),
          subjects: matchedSubjects.slice(0, 4),
          tasks: matchedTasks
        });
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, courses, activeCourse]);

  // Click outside listener for search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key handler to close all dropdowns
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreDropdownOpen(false);
        setUserMenuOpen(false);
        setCourseDropdownOpen(false);
        setSearchFocused(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalResults = searchResults.courses.length + searchResults.subjects.length + searchResults.tasks.length;

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
        
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div 
            onClick={() => onSelectTab('home')}
            className="cursor-pointer select-none group"
            title="StudyFlow Home"
          >
            <StudyFlowLogo size={32} />
          </div>

          {/* Active Course Selector */}
          {courses.length > 0 && (
            <div ref={courseDropdownRef} className="relative hidden xl:block ml-2">
              <button
                id="course-selector-btn"
                onClick={() => setCourseDropdownOpen(!courseDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors max-w-[220px]"
              >
                <span className="truncate">{activeCourse ? activeCourse.title : 'Select Course'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {courseDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCourseDropdownOpen(false)} />
                  <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 p-2 py-2">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Your Courses
                    </div>
                    {courses.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          onSelectCourse(c.id);
                          setCourseDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors flex items-center justify-between ${
                          c.id === activeCourse?.id
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate font-medium">{c.title}</span>
                        {c.id === activeCourse?.id && (
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        )}
                      </button>
                    ))}
                    <div className="border-t border-slate-100 dark:border-slate-800 my-1.5"></div>
                    <button
                      id="create-new-course-dropdown-btn"
                      onClick={() => {
                        setCourseDropdownOpen(false);
                        onNewCourse();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-semibold flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create New Course
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Center: Simplified Primary Navigation with Reference Underline Indicators */}
        <nav className="hidden lg:flex items-center gap-3 text-sm">
          {[
            { id: 'home', label: 'Home' },
            { id: 'calendar', label: 'Schedule' },
            { id: 'courses', label: 'My Courses' },
            { id: 'library', label: 'Library' },
            { id: 'progress', label: 'Progress' }
          ].map(tab => {
            const isActive = tab.id === 'home' 
              ? (activeTab === 'today' || activeTab === 'home') 
              : activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`nav-link-${tab.id}`}
                onClick={() => onSelectTab(tab.id === 'home' ? 'today' : tab.id)}
                className="px-3 pt-2 pb-1.5 flex flex-col items-center group transition-colors"
              >
                <span className={`text-[14px] transition-colors ${
                  isActive
                    ? 'text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white font-medium'
                }`}>
                  {tab.label}
                </span>
                <span className={`w-6 h-[3px] rounded-full mt-1.5 transition-all ${
                  isActive ? 'bg-blue-600' : 'bg-transparent'
                }`} />
              </button>
            );
          })}

          {/* More Dropdown */}
          <div ref={moreMenuRef} className="relative">
            <button
              onClick={() => setMoreDropdownOpen(!moreDropdownOpen)}
              className="px-3 pt-2 pb-1.5 flex flex-col items-center group transition-colors"
            >
              <span className={`text-[14px] flex items-center gap-1 transition-colors ${
                ['analytics', 'resources', 'settings'].includes(activeTab)
                  ? 'text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white font-medium'
              }`}>
                <span>More</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </span>
              <span className={`w-6 h-[3px] rounded-full mt-1.5 transition-all ${
                ['analytics', 'resources', 'settings'].includes(activeTab) ? 'bg-blue-600' : 'bg-transparent'
              }`} />
            </button>

            {moreDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreDropdownOpen(false)} />
                <div className="absolute left-0 mt-2 w-52 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 p-2 py-2 text-xs">
                  <button
                    onClick={() => {
                      onSelectTab('analytics');
                      setMoreDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 ${
                      activeTab === 'analytics' 
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <BarChart2 className="w-4 h-4 text-pink-500" />
                    <span>Analytics & Insights</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('resources');
                      setMoreDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 ${
                      activeTab === 'resources' 
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <BookMarked className="w-4 h-4 text-purple-500" />
                    <span>Study Resources</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectTab('settings');
                      setMoreDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 ${
                      activeTab === 'settings' 
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                    <span>Course Preferences</span>
                  </button>
                  <div className="border-t border-slate-100 dark:border-slate-800 my-1.5"></div>
                  <button
                    onClick={() => {
                      onNewCourse();
                      setMoreDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 flex items-center gap-2.5 font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Course</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </nav>

        {/* Global Search Bar */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-xs md:max-w-sm hidden sm:block">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Search anything..."
              className="w-full pl-9 pr-8 py-2 rounded-full text-xs bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 transition-all outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchFocused && searchQuery.trim() && (
            <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden text-xs max-h-96 overflow-y-auto">
              <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-semibold px-3">
                <span>SEARCH RESULTS</span>
                {searching && <span>Searching...</span>}
              </div>

              {totalResults === 0 && !searching ? (
                <div className="p-6 text-center text-slate-400">
                  No matching courses, subjects, or tasks found for "{searchQuery}".
                </div>
              ) : (
                <div className="p-2 space-y-3">
                  {/* Courses */}
                  {searchResults.courses.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">Courses</div>
                      {searchResults.courses.map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            onSelectCourse(c.id);
                            onSelectTab('today');
                            setSearchFocused(false);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-slate-800 dark:text-slate-200"
                        >
                          <span className="font-semibold truncate">{c.title}</span>
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded">Course</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Subjects */}
                  {searchResults.subjects.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">Subjects</div>
                      {searchResults.subjects.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            onSelectTab('library');
                            setSearchFocused(false);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-slate-800 dark:text-slate-200"
                        >
                          <span className="font-medium truncate">{s.name}</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">Subject</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Tasks */}
                  {searchResults.tasks.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">Tasks</div>
                      {searchResults.tasks.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            onSelectTab('today');
                            setSearchFocused(false);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-slate-800 dark:text-slate-200"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-medium truncate">{t.custom_title}</p>
                            <p className="text-[10px] text-slate-400">{t.subject_name}</p>
                          </div>
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded shrink-0">Task</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Controls: Theme Toggle, Bell Notification, Streak, Avatar */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          
          {/* Theme Toggle Button (Circular Sun/Moon matching reference) */}
          <button
            id="theme-toggle-btn"
            onClick={onToggleDarkMode}
            aria-label="Toggle dark/light mode"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-amber-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:scale-105 flex items-center justify-center transition-all shadow-2xs cursor-pointer"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Notification Bell Icon (matching reference) */}
          <button
            aria-label="Notifications"
            title="Study Reminders"
            onClick={() => {
              onSelectTab('calendar');
            }}
            className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* Streak Indicator */}
          <button
            type="button"
            onClick={() => onSelectTab('progress')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 hover:scale-[1.02] transition-all"
            title="View study streak and progress"
          >
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span className="font-mono font-bold">{streak}</span>
            <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">streak</span>
          </button>

          {/* User Profile Avatar & Dropdown */}
          <div ref={userMenuRef} className="relative">
            <button
              id="user-profile-menu-btn"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-blue-500/20 transition-all"
            >
              <div className="w-9 h-9 rounded-full bg-[#2563EB] text-white font-bold text-sm flex items-center justify-center shadow-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 p-2 py-2">
                  <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    {user.examTarget && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1 truncate">
                        🎯 {user.examTarget}
                      </p>
                    )}
                  </div>

                  <div className="py-1">
                    <button
                      id="menu-settings-btn"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSelectTab('settings');
                      }}
                      className="w-full text-left px-3.5 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      Study Preferences & Settings
                    </button>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSelectTab('courses');
                      }}
                      className="w-full text-left px-3.5 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5"
                    >
                      <Layers className="w-4 h-4 text-slate-400" />
                      All Courses & Syllabi
                    </button>
                  </div>

                  {/* Theme Toggle */}
                  <div className="py-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        onToggleDarkMode();
                      }}
                      className="w-full text-left px-3.5 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2.5">
                        {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
                        Dark Theme
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        {isDarkMode ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                  <button
                    id="menu-logout-btn"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3.5 py-2 rounded-xl text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2.5 font-semibold"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] px-4 py-3 space-y-2">
          {/* Mobile Course Switcher */}
          {courses.length > 0 && (
            <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Active Course</label>
              <select
                value={activeCourse?.id || ''}
                onChange={(e) => {
                  onSelectCourse(e.target.value);
                  setMobileMenuOpen(false);
                }}
                className="w-full mt-1 p-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          )}

          {[
            { id: 'today', label: 'Home' },
            { id: 'calendar', label: 'Schedule' },
            { id: 'courses', label: 'My Courses' },
            { id: 'library', label: 'Library & Playlists' },
            { id: 'progress', label: 'Progress & Analytics' },
            { id: 'resources', label: 'Study Resources' },
            { id: 'settings', label: 'Preferences' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                onSelectTab(tab.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
