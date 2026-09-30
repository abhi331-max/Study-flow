import React, { useState, useEffect } from 'react';
import { Course, DashboardData, User } from './types';
import { apiRequest } from './utils';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { TodayView } from './components/TodayView';
import { CalendarView } from './components/CalendarView';
import { SubjectsView } from './components/SubjectsView';
import { AnalyticsView } from './components/AnalyticsView';
import { ResourcesView } from './components/ResourcesView';
import { SettingsView } from './components/SettingsView';
import { CourseWizard } from './components/CourseWizard';
import { MyCoursesView } from './components/MyCoursesView';
import { LibraryView } from './components/LibraryView';
import { StudyHeroSection } from './components/StudyHeroSection';
import { SectionEmptyState } from './components/SectionEmptyState';
import { 
  BookOpen, Plus, Sparkles, ArrowRight, Play, CheckCircle2,
  Calendar, Clock, Target, Layers, HelpCircle, X, BarChart2,
  FileText
} from 'lucide-react';

const TAB_TO_PATH: Record<string, string> = {
  today: '/',
  home: '/',
  courses: '/courses',
  library: '/library',
  progress: '/progress',
  calendar: '/calendar',
  analytics: '/analytics',
  resources: '/resources',
  settings: '/settings',
};

const PATH_TO_TAB: Record<string, string> = {
  '/': 'today',
  '/courses': 'courses',
  '/library': 'library',
  '/progress': 'progress',
  '/calendar': 'calendar',
  '/analytics': 'analytics',
  '/resources': 'resources',
  '/settings': 'settings',
};

function getTabFromLocation(): string {
  if (typeof window === 'undefined') return 'today';
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  return PATH_TO_TAB[pathname] || 'today';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<string>(getTabFromLocation);
  const [courseWizardOpen, setCourseWizardOpen] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [howItWorksModalOpen, setHowItWorksModalOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [isDeletingCourse, setIsDeletingCourse] = useState(false);

  // Sync activeTab with browser history and handle back/forward navigation
  const handleSelectTab = (tab: string, pushState = true) => {
    const targetTab = tab === 'home' ? 'today' : tab;
    setActiveTab(targetTab);
    if (pushState && typeof window !== 'undefined') {
      const targetPath = TAB_TO_PATH[targetTab] || '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab: targetTab }, '', targetPath);
      }
    }
  };

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.tab) {
        setActiveTab(e.state.tab);
      } else {
        setActiveTab(getTabFromLocation());
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Reliable Theme Toggle State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('studyflow_dark');
    if (saved !== null) {
      return saved === 'true';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Dark mode class sync with documentElement
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('studyflow_dark', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('studyflow_dark', 'false');
    }
  }, [isDarkMode]);

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Initial Auth Check
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('studyflow_token');
      if (!token) {
        setLoadingInitial(false);
        return;
      }

      try {
        const data = await apiRequest('/auth/me');
        setUser(data.user);
        const userCourses = data.courses || [];
        setCourses(userCourses);
        if (userCourses.length > 0) {
          const preferredCourse = userCourses.find((c: Course) => c.id === data.user?.lastActiveCourseId) || userCourses[0];
          setActiveCourseId(preferredCourse.id);
        }
      } catch (err) {
        console.warn('Session expired or invalid token');
        localStorage.removeItem('studyflow_token');
      } finally {
        setLoadingInitial(false);
      }
    };

    initAuth();
  }, []);

  // Fetch Dashboard Data whenever activeCourseId changes
  const fetchDashboard = async (courseId?: string) => {
    const targetId = courseId || activeCourseId;
    if (!targetId) return;

    setRefreshing(true);
    try {
      const data = await apiRequest(`/courses/${targetId}/dashboard`);
      setDashboardData(data);
      // Also update course list summary
      const coursesRes = await apiRequest('/courses');
      setCourses(coursesRes.courses || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (activeCourseId) {
      fetchDashboard(activeCourseId);
      apiRequest('/auth/active-state', {
        method: 'POST',
        body: JSON.stringify({ courseId: activeCourseId })
      }).catch(() => {});
    }
  }, [activeCourseId]);

  // Demo account instant launcher
  const handleStartDemo = async () => {
    const res = await apiRequest('/auth/demo', { method: 'POST' });
    localStorage.setItem('studyflow_token', res.token);
    setUser(res.user);
    setCourses(res.courses || []);
    if (res.courses?.length > 0) {
      setActiveCourseId(res.courses[0].id);
    }
    handleSelectTab('today');
  };

  const handleAuthSuccess = (token: string, newUser: User) => {
    setUser(newUser);
    apiRequest('/courses').then(res => {
      setCourses(res.courses || []);
      if (res.courses?.length > 0) {
        setActiveCourseId(res.courses[0].id);
      } else {
        setCourseWizardOpen(true);
      }
    }).catch(console.error);
    handleSelectTab('today');
  };

  const handleLogout = () => {
    localStorage.removeItem('studyflow_token');
    setUser(null);
    setCourses([]);
    setActiveCourseId(null);
    setDashboardData(null);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
    setActiveTab('today');
  };

  const requestDeleteCourse = (courseId: string) => {
    const target = courses.find(c => c.id === courseId) || null;
    if (target) {
      setCourseToDelete(target);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!courseToDelete) return;
    setIsDeletingCourse(true);
    try {
      await apiRequest(`/courses/${courseToDelete.id}`, { method: 'DELETE' });
      const updated = courses.filter(c => c.id !== courseToDelete.id);
      setCourses(updated);
      if (updated.length > 0) {
        setActiveCourseId(updated[0].id);
      } else {
        setActiveCourseId(null);
        setDashboardData(null);
      }
      setCourseToDelete(null);
      handleSelectTab('today');
    } catch (err: any) {
      alert(err.message || "Couldn't delete this course. Please try again.");
    } finally {
      setIsDeletingCourse(false);
    }
  };

  const activeCourse = courses.find(c => c.id === activeCourseId) || null;

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-9 h-9 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-medium">Loading StudyFlow...</p>
        </div>
      </div>
    );
  }

  // If unauthenticated, show high-craft Landing Page
  if (!user) {
    return (
      <LandingPage
        onStartDemo={handleStartDemo}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col transition-colors">
      
      {/* Global Navigation Header */}
      <Navbar
        user={user}
        courses={courses}
        activeCourse={activeCourse}
        onSelectCourse={(id) => {
          setActiveCourseId(id);
          fetchDashboard(id);
        }}
        onNewCourse={() => setCourseWizardOpen(true)}
        streak={dashboardData?.streak || 0}
        daysLeft={dashboardData?.daysLeft || 0}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleTheme}
        onLogout={handleLogout}
        activeTab={activeTab}
        onSelectTab={(tab) => handleSelectTab(tab)}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* 1. Home / Today Tab */}
        {(activeTab === 'today' || activeTab === 'home') && (
          courses.length === 0 ? (
            <StudyHeroSection
              userName={user.name?.split(' ')[0] || 'Alex'}
              onPrimaryAction={() => setCourseWizardOpen(true)}
              primaryActionLabel="Create Your First Study Plan"
              onSecondaryAction={() => setHowItWorksModalOpen(true)}
              secondaryActionLabel="Watch How It Works"
              onNavigateTab={(tab) => handleSelectTab(tab)}
            />
          ) : dashboardData && activeCourse ? (
            <TodayView
              user={user}
              dashboard={dashboardData}
              onRefresh={() => fetchDashboard()}
              onNavigateTab={(tab) => handleSelectTab(tab)}
            />
          ) : (
            <div className="p-16 text-center text-slate-400 text-xs">
              Loading dashboard data...
            </div>
          )
        )}

        {/* 2. My Courses Tab */}
        {activeTab === 'courses' && (
          <MyCoursesView
            courses={courses}
            activeCourseId={activeCourseId}
            onSelectCourse={(id) => {
              setActiveCourseId(id);
              fetchDashboard(id);
            }}
            onNavigateTab={(tab) => handleSelectTab(tab)}
            onNewCourse={() => setCourseWizardOpen(true)}
            onDeleteCourse={requestDeleteCourse}
          />
        )}

        {/* 3. Library Tab */}
        {activeTab === 'library' && (
          activeCourse ? (
            <LibraryView
              course={activeCourse}
              onRefresh={() => fetchDashboard()}
            />
          ) : (
            <SectionEmptyState
              icon={BookOpen}
              badge="Resource Library"
              title="Your study library is empty."
              description="Your YouTube playlists, videos, PDFs and other study resources will appear here."
              actionLabel="Create a Study Plan"
              onAction={() => setCourseWizardOpen(true)}
            />
          )
        )}

        {/* Subjects Direct fallback */}
        {activeTab === 'subjects' && (
          activeCourse ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <SubjectsView
                course={activeCourse}
                onRefresh={() => fetchDashboard()}
              />
            </div>
          ) : (
            <SectionEmptyState
              icon={Layers}
              badge="Subjects & Syllabus"
              title="Your study syllabus is empty."
              description="Create a study plan to organize your subjects and playlists."
              actionLabel="Create Your First Study Plan"
              onAction={() => setCourseWizardOpen(true)}
            />
          )
        )}

        {/* 4. Progress Tab */}
        {activeTab === 'progress' && (
          activeCourse ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <AnalyticsView
                course={activeCourse}
              />
            </div>
          ) : (
            <SectionEmptyState
              icon={Target}
              badge="Progress Tracking"
              title="Your progress starts here."
              description="Complete your first study task to start tracking your progress."
              actionLabel="Create Your First Study Plan"
              onAction={() => setCourseWizardOpen(true)}
            />
          )
        )}

        {/* Analytics Tab (From More dropdown) */}
        {activeTab === 'analytics' && (
          activeCourse ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <AnalyticsView
                course={activeCourse}
              />
            </div>
          ) : (
            <SectionEmptyState
              icon={BarChart2}
              badge="Study Analytics"
              title="Your analytics will appear here."
              description="Complete study sessions to see your progress, study time and performance."
              actionLabel="Create Your First Study Plan"
              onAction={() => setCourseWizardOpen(true)}
            />
          )
        )}

        {/* 5. Calendar Tab */}
        {activeTab === 'calendar' && (
          activeCourse ? (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <CalendarView
                course={activeCourse}
                onRefresh={() => fetchDashboard()}
              />
            </div>
          ) : (
            <SectionEmptyState
              icon={Calendar}
              badge="Study Calendar"
              title="Your study calendar is empty."
              description="Create a study plan to start scheduling your learning."
              actionLabel="Create Your First Study Plan"
              onAction={() => setCourseWizardOpen(true)}
            />
          )
        )}

        {/* 6. Resources Tab */}
        {activeTab === 'resources' && (
          activeCourse ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <ResourcesView
                course={activeCourse}
              />
            </div>
          ) : (
            <SectionEmptyState
              icon={FileText}
              badge="Resources & PDFs"
              title="Your resources will appear here."
              description="Add study notes, links, and documents to your courses."
              actionLabel="Create Your First Study Plan"
              onAction={() => setCourseWizardOpen(true)}
            />
          )
        )}

        {/* 7. Settings Tab */}
        {activeTab === 'settings' && (
          activeCourse ? (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <SettingsView
                course={activeCourse}
                onRefresh={() => fetchDashboard()}
                onDeleteCourse={requestDeleteCourse}
              />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
              <div className="rounded-[28px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xs space-y-6">
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Account & Preferences
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage your account details and interface theme.
                  </p>
                </div>

                <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-sm">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                    {user.examTarget && (
                      <span className="px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                        🎯 {user.examTarget}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200 text-xs">Appearance Theme</p>
                      <p className="text-[11px] text-slate-500">Switch between light and dark visual themes</p>
                    </div>
                    <button
                      onClick={handleToggleTheme}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      {isDarkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => setCourseWizardOpen(true)}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Create Study Plan →
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </main>

      {/* Course Creation Modal Wizard */}
      {/* SAFE COURSE DELETION CONFIRMATION MODAL */}
      {courseToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                <X className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Delete Course?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This action is permanent and will remove all study progress.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {courseToDelete.title}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                This will delete the course curriculum, subjects, playlist connections, daily schedules, and your study logs from the cloud database.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingCourse}
                onClick={() => setCourseToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-course-btn"
                disabled={isDeletingCourse}
                onClick={confirmDeleteCourse}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5"
              >
                {isDeletingCourse ? "Deleting..." : "Delete Course"}
              </button>
            </div>
          </div>
        </div>
      )}

      {courseWizardOpen && (
        <CourseWizard
          onClose={() => setCourseWizardOpen(false)}
          onCourseCreated={(newCourse) => {
            setCourseWizardOpen(false);
            setCourses([newCourse, ...courses]);
            setActiveCourseId(newCourse.id);
            handleSelectTab('today');
          }}
        />
      )}

      {/* How It Works Modal */}
      {howItWorksModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                How StudyFlow Works
              </h3>
              <button
                onClick={() => setHowItWorksModalOpen(false)}
                className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              StudyFlow makes self-studying from YouTube lectures as disciplined and structured as a university course.
            </p>
            <div className="space-y-2.5 pt-1 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <strong className="text-slate-900 dark:text-white block mb-0.5">1. Import Playlists</strong>
                <span className="text-slate-500 dark:text-slate-400">Add your favorite YouTube lecture series or subject channels.</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <strong className="text-slate-900 dark:text-white block mb-0.5">2. Set Deadlines</strong>
                <span className="text-slate-500 dark:text-slate-400">Choose your target exam date and daily study availability.</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <strong className="text-slate-900 dark:text-white block mb-0.5">3. Study Daily</strong>
                <span className="text-slate-500 dark:text-slate-400">Follow your curated goals, track your streak, and reach your goals.</span>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setHowItWorksModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setHowItWorksModalOpen(false);
                  setCourseWizardOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all hover:scale-[1.02]"
              >
                Get Started →
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
