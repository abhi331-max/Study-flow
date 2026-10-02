import React, { useState, useEffect } from 'react';
import { 
  Play, BookOpen, Calendar, Clock, CheckCircle2, Circle,
  ArrowRight, ShieldCheck, Flame, Layers, HelpCircle,
  BarChart2, Zap, ChevronDown, Sparkles, Youtube, Check, 
  Target, Cloud, Moon, Sun, X
} from 'lucide-react';
import { StudyFlowLogo } from './StudyFlowLogo';
import { StudyHeroSection } from './StudyHeroSection';

interface LandingPageProps {
  onStartDemo: () => Promise<void>;
  onAuthSuccess: (token: string, user: any) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartDemo, onAuthSuccess }) => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [examTarget, setExamTarget] = useState('GATE 2027');
  const [dailyHours, setDailyHours] = useState('3');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // References to native input elements for bulletproof browser autofill synchronization
  const emailInputRef = React.useRef<HTMLInputElement | null>(null);
  const passwordInputRef = React.useRef<HTMLInputElement | null>(null);

  // Synchronize browser autofill natively with React state without stale closures
  useEffect(() => {
    const emailEl = emailInputRef.current;
    const pwdEl = passwordInputRef.current;

    const syncEmail = () => {
      if (emailEl && emailEl.value !== undefined) {
        setEmail(emailEl.value);
      }
    };

    const syncPassword = () => {
      if (pwdEl && pwdEl.value !== undefined) {
        setPassword(pwdEl.value);
      }
    };

    if (emailEl) {
      emailEl.addEventListener('input', syncEmail);
      emailEl.addEventListener('change', syncEmail);
    }
    if (pwdEl) {
      pwdEl.addEventListener('input', syncPassword);
      pwdEl.addEventListener('change', syncPassword);
    }

    return () => {
      if (emailEl) {
        emailEl.removeEventListener('input', syncEmail);
        emailEl.removeEventListener('change', syncEmail);
      }
      if (pwdEl) {
        pwdEl.removeEventListener('input', syncPassword);
        pwdEl.removeEventListener('change', syncPassword);
      }
    };
  }, [authModalOpen]);

  // Reset error message when modal is opened, closed, or toggled
  useEffect(() => {
    setError(null);
  }, [authModalOpen, isSignUp]);

  // How It Works Modal
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // Forgot password flow state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Interactive dark mode preview state
  const [previewDarkMode, setPreviewDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const togglePreviewDark = () => {
    const next = !previewDarkMode;
    setPreviewDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('studyflow_dark', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('studyflow_dark', 'false');
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string>("");

  // Fetch Auth Configuration (e.g. Google Client ID) from backend
  useEffect(() => {
    fetch("/api/auth/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.googleClientId) {
          setGoogleClientId(data.googleClientId);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize Google Identity Services (GIS) when available
  useEffect(() => {
    if (typeof window === "undefined" || !googleClientId) return;
    const initGsi = () => {
      const google = (window as any).google;
      if (google?.accounts?.id) {
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: any) => {
            if (response.credential) {
              setGoogleLoading(true);
              try {
                const res = await fetch("/api/auth/google", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ credential: response.credential })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Google authentication failed");
                localStorage.setItem("studyflow_token", data.token);
                onAuthSuccess(data.token, data.user);
              } catch (err: any) {
                setError(err.message || "Google authentication failed");
              } finally {
                setGoogleLoading(false);
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
      }
    };

    if ((window as any).google?.accounts?.id) {
      initGsi();
    } else {
      const interval = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(interval);
          initGsi();
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [googleClientId]);

  const handleGoogleLogin = async () => {
    setError(null);

    // If GOOGLE_CLIENT_ID is not configured, inform the user cleanly
    if (!googleClientId) {
      setError("Google Sign-In is not configured yet. Please use email and password.");
      return;
    }

    setGoogleLoading(true);
    try {
      const google = typeof window !== "undefined" ? (window as any).google : null;

      // Trigger Google Identity Services One-Tap / Account Chooser prompt
      if (google?.accounts?.id) {
        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setGoogleLoading(false);
            setError("Google Sign-In prompt was closed or unavailable. Please try again.");
          }
        });
        return;
      }

      setError("Google Sign-In service is still loading. Please try again in a moment.");
    } catch (err: any) {
      setError(err.message || "Google authentication failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);

      // Extract values with triple-redundancy: FormData -> DOM element -> React state
      const emailElem = (form.elements.namedItem('email') as HTMLInputElement | null) || emailInputRef.current;
      const passwordElem = (form.elements.namedItem('password') as HTMLInputElement | null) || passwordInputRef.current;
      const nameElem = form.elements.namedItem('name') as HTMLInputElement | null;
      const examTargetElem = form.elements.namedItem('examTarget') as HTMLInputElement | null;
      const dailyHoursElem = form.elements.namedItem('dailyHours') as HTMLInputElement | null;

      const rawEmail = (formData.get('email') as string || emailElem?.value || email || '').trim();
      const rawPassword = (formData.get('password') as string || passwordElem?.value || password || '');
      const rawName = (formData.get('name') as string || nameElem?.value || name || '').trim();
      const rawExamTarget = (formData.get('examTarget') as string || examTargetElem?.value || examTarget || 'Competitive Exam').trim();
      const rawDailyHours = Number(formData.get('dailyHours') || dailyHoursElem?.value || dailyHours || 3);

      // Ensure state is in sync with submitted data
      if (rawEmail && rawEmail !== email) setEmail(rawEmail);
      if (rawPassword && rawPassword !== password) setPassword(rawPassword);
      if (rawName && rawName !== name) setName(rawName);

      if (!rawEmail) {
        throw new Error('Please enter your email address');
      }
      if (!rawPassword) {
        throw new Error('Please enter your password');
      }

      const endpoint = isSignUp ? '/api/auth/register' : '/api/auth/login';
      const body = isSignUp
        ? { 
            email: rawEmail, 
            password: rawPassword, 
            name: rawName || rawEmail.split('@')[0], 
            examTarget: rawExamTarget, 
            dailyHours: rawDailyHours 
          }
        : { 
            email: rawEmail, 
            password: rawPassword 
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('studyflow_token', data.token);
      onAuthSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMsg(null);
    try {
      const formData = new FormData(e.currentTarget);
      const targetEmail = (formData.get('email') as string || forgotEmail || '').trim();
      if (!targetEmail) {
        throw new Error('Please enter your email address');
      }
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });
      const data = await res.json();
      setForgotMsg(data.message || 'If an account exists, a reset link has been issued.');
    } catch (err: any) {
      setForgotMsg(err.message || 'Request submitted. Please check your inbox.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleDemoClick = async () => {
    setLoading(true);
    try {
      await onStartDemo();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-[#0F172A] dark:text-[#F8FAFC] transition-colors">
      
      {/* 4. Header / Navigation */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#0B0F19]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand & Tagline */}
          <div className="flex items-center gap-3">
            <StudyFlowLogo size={32} />
            <span className="hidden sm:inline-block text-xs font-medium text-slate-400 dark:text-slate-500 border-l border-slate-200 dark:border-slate-800 pl-3 ml-1">
              Your YouTube Learning Companion
            </span>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3">
            <button
              id="landing-login-btn"
              onClick={() => {
                setError(null);
                setIsSignUp(false);
                setAuthModalOpen(true);
              }}
              className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white px-3 py-1.5 transition-colors"
            >
              Sign In
            </button>

            <button
              id="landing-demo-top-btn"
              onClick={handleDemoClick}
              disabled={loading}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              1-Click Demo
            </button>

            <button
              id="landing-cta-top-btn"
              onClick={() => {
                setError(null);
                setIsSignUp(true);
                setAuthModalOpen(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs shadow-blue-500/20 transition-all hover:scale-[1.02]"
            >
              Get Started
            </button>

            {/* Dark mode button */}
            <button
              onClick={togglePreviewDark}
              aria-label="Toggle dark mode"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            >
              {previewDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* 5. Reference Hero & 5-Feature Section */}
      <StudyHeroSection
        onPrimaryAction={() => {
          setError(null);
          setIsSignUp(true);
          setAuthModalOpen(true);
        }}
        primaryActionLabel="Create Your First Study Plan"
        onSecondaryAction={() => setHowItWorksOpen(true)}
        secondaryActionLabel="Watch How It Works"
        userName="Alex"
      />

      {/* 7. "Your Journey, Our Support" & Dark Mode Cards */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Your Journey, Our Support
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Big Card: Community & Metrics */}
            <div className="lg:col-span-8 rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 flex flex-col justify-between shadow-xs">
              <div className="space-y-4 max-w-xl">
                <h3 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                  Build the habit.<br />Achieve your dreams.
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Join thousands of students who are already learning smarter with StudyFlow. From competitive engineering exams to semester finals, study with calm structure.
                </p>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-6 pt-8 mt-6 border-t border-slate-100 dark:border-slate-800 text-left">
                <div>
                  <span className="font-display text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">10K+</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Students</p>
                </div>
                <div>
                  <span className="font-display text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">1M+</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Videos</p>
                </div>
                <div>
                  <span className="font-display text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">1000+</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Courses</p>
                </div>
              </div>
            </div>

            {/* Right Card: Dark Mode Interactive Preview Card from Image */}
            <div className="lg:col-span-4 rounded-3xl border border-slate-800 bg-[#0F172A] text-white p-8 flex flex-col justify-between shadow-xs relative overflow-hidden">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                  <Moon className="w-5 h-5" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">
                  Dark Mode
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Switch to dark mode for a better experience during late night study sessions, anytime.
                </p>
              </div>

              {/* Interactive Toggle Switch */}
              <div className="pt-6 flex items-center justify-between border-t border-slate-800 mt-6">
                <span className="text-xs text-slate-300 font-medium">
                  {previewDarkMode ? 'Dark Theme Active' : 'Switch to Dark'}
                </span>
                <button
                  onClick={togglePreviewDark}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-1 ${
                    previewDarkMode ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                  aria-label="Toggle dark mode"
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      previewDarkMode ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

          </div>

          {/* Bottom Right Handwritten Doodle */}
          <div className="text-right pt-4 select-none">
            <span className="font-handwriting text-2xl text-slate-400 dark:text-slate-500">
              Learn · Plan · Grow
            </span>
          </div>

        </div>
      </section>

      {/* How It Works Modal */}
      {howItWorksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setHowItWorksOpen(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">
              How StudyFlow Works
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Turn any YouTube playlist into an exam preparation system in three simple steps.
            </p>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Import Your YouTube Playlists</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Paste public playlist or lecture links for each subject. StudyFlow automatically retrieves actual lecture durations and video order.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-800 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  2
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Set Deadlines & Daily Hours</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Specify your target exam date and how many hours you study daily. Set per-subject deadlines to prioritize difficult topics.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  3
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Follow Your Daily Plan</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    StudyFlow schedules balanced daily video tasks. Choose between Smart, Manual, or Hybrid modes, lock your favorite routines, and catch up automatically if you fall behind.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => {
                  setHowItWorksOpen(false);
                  setError(null);
                  setIsSignUp(true);
                  setAuthModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                Create Your First Plan →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal (Sign In / Sign Up matching the reference image) */}
      {authModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setError(null);
              setAuthModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => {
                setError(null);
                setAuthModalOpen(false);
              }}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Logo in Auth Modal */}
            <div className="flex items-center gap-2 mb-6">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                <BookOpen className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-xl text-slate-900 dark:text-white">StudyFlow</span>
            </div>

            <div className="mb-6">
              <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {isSignUp ? 'Create your account' : 'Welcome back!'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isSignUp
                  ? 'Start your structured YouTube learning journey today.'
                  : 'Sign in to continue your personalized study plan.'}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            
            {/* Google Authentication Button */}
            <button
              type="button"
              id="google-login-btn"
              disabled={googleLoading || loading}
              onClick={() => handleGoogleLogin()}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-xs flex items-center justify-center gap-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700"
            >
              {googleLoading ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
              )}
              <span>{isSignUp ? "Sign up with Google" : "Continue with Google"}</span>
            </button>

            {/* Subtle Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider absolute">
                or with email
              </span>
            </div>

            <form id="studyflow-auth-form" method="POST" onSubmit={handleAuthSubmit} className="space-y-4">
              {isSignUp && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onInput={(e) => setName((e.target as HTMLInputElement).value)}
                    placeholder="Alex Student"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  ref={emailInputRef}
                  id="auth-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                  placeholder="alex@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        const currentVal = (emailInputRef.current?.value || email || '').trim();
                        if (currentVal) {
                          setForgotEmail(currentVal);
                        }
                        setAuthModalOpen(false);
                        setForgotModalOpen(true);
                      }}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  ref={passwordInputRef}
                  id="auth-password"
                  name="password"
                  type="password"
                  required
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {isSignUp && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="auth-exam-target" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Exam Target
                    </label>
                    <input
                      id="auth-exam-target"
                      name="examTarget"
                      type="text"
                      value={examTarget}
                      onChange={(e) => setExamTarget(e.target.value)}
                      onInput={(e) => setExamTarget((e.target as HTMLInputElement).value)}
                      placeholder="e.g. GATE 2027"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-daily-hours" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Daily Study Hours
                    </label>
                    <input
                      id="auth-daily-hours"
                      name="dailyHours"
                      type="number"
                      min="1"
                      max="16"
                      value={dailyHours}
                      onChange={(e) => setDailyHours(e.target.value)}
                      onInput={(e) => setDailyHours((e.target as HTMLInputElement).value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                id="auth-submit-btn"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all hover:scale-[1.01] mt-2 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>{loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}</span>
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              {isSignUp ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(false);
                      setError(null);
                    }}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setError(null);
                    }}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative">
            <button
              onClick={() => setForgotModalOpen(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-2">
              Reset Password
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter your account email to receive reset instructions.
            </p>

            {forgotMsg && (
              <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs">
                {forgotMsg}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onInput={(e) => setForgotEmail((e.target as HTMLInputElement).value)}
                  placeholder="alex@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs cursor-pointer"
              >
                {forgotLoading ? 'Submitting...' : 'Send Reset Link'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setForgotModalOpen(false);
                  setIsSignUp(false);
                  setAuthModalOpen(true);
                }}
                className="text-xs text-slate-500 hover:underline cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
