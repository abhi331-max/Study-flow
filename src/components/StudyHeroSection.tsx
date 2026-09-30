import React from 'react';
import { 
  ArrowRight, Play, CheckCircle2, Circle, Clock, Flame, 
  Calendar, Cloud, BarChart2, Target, Sparkles, Youtube,
  FileText
} from 'lucide-react';

interface StudyHeroSectionProps {
  onPrimaryAction: () => void;
  primaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  userName?: string;
  onNavigateTab?: (tab: string) => void;
}

export const StudyHeroSection: React.FC<StudyHeroSectionProps> = ({
  onPrimaryAction,
  primaryActionLabel = 'Create Your First Study Plan',
  onSecondaryAction,
  secondaryActionLabel = 'Watch How It Works',
  userName = 'Alex',
  onNavigateTab
}) => {
  return (
    <div className="relative overflow-hidden bg-[#F8FAFC] dark:bg-[#0B0F19] transition-colors">
      
      {/* 
        Subtle Organic Blue Curve Accents in Background matching reference:
        Top-left gentle curve sweeping downward, and right-side soft wave shape
      */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        {/* Top Left Organic Wave */}
        <svg 
          className="absolute -top-12 -left-12 w-[600px] h-[550px] text-blue-100/50 dark:text-blue-950/20" 
          viewBox="0 0 600 550" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M-50 0C120 40 280 140 220 320C170 470 50 490 -50 520V0Z" 
            fill="currentColor" 
          />
          <path 
            d="M-40 0C130 60 250 180 200 350C160 480 50 500 -40 520" 
            stroke="#93C5FD" 
            strokeWidth="1.5" 
            strokeOpacity="0.4"
          />
        </svg>

        {/* Right / Bottom Right Subtle Soft Wave */}
        <svg 
          className="absolute -bottom-24 -right-16 w-[700px] h-[600px] text-blue-100/40 dark:text-blue-950/20" 
          viewBox="0 0 700 600" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M750 650C580 620 420 520 450 340C480 180 620 100 750 50V650Z" 
            fill="currentColor" 
          />
          <path 
            d="M750 630C600 600 450 510 470 330C490 190 620 120 750 70" 
            stroke="#93C5FD" 
            strokeWidth="1.5" 
            strokeOpacity="0.3"
          />
        </svg>
      </div>

      {/* Main Container */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-12 sm:pb-16">
        
        {/* Top Hero Section: Left Content + Right Floating Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* LEFT SIDE: Brand Hero Message */}
          <div className="lg:col-span-6 space-y-6 text-left">
            
            {/* Small Badge: ⚡ Your Personal Study Companion */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-300 text-xs font-semibold shadow-2xs">
              <span className="text-blue-500 font-bold text-sm leading-none">⚡</span>
              <span>Your Personal Study Companion</span>
            </div>

            {/* Headline: Plan Better. Study Smarter. */}
            <div className="space-y-1">
              <h1 className="font-display text-5xl sm:text-6xl lg:text-[68px] font-normal tracking-[-0.02em] text-slate-900 dark:text-white leading-[1.05]">
                Plan Better.
              </h1>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-[68px] font-normal tracking-[-0.02em] text-slate-900 dark:text-white leading-[1.05]">
                Study <span className="text-blue-600 dark:text-blue-400 italic">Smarter.</span>
              </h1>
            </div>

            {/* Supporting Paragraph */}
            <p className="text-base sm:text-[17px] text-slate-600 dark:text-slate-300 max-w-lg leading-relaxed font-normal">
              Turn your YouTube playlists and study resources into a personalized plan. Set your goals, track your progress, and achieve your dreams.
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                id="hero-primary-cta-btn"
                onClick={onPrimaryAction}
                className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-[15px] shadow-[0_10px_25px_rgba(37,99,235,0.25)] transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
              >
                <span>{primaryActionLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {onSecondaryAction && (
                <button
                  id="hero-secondary-cta-btn"
                  onClick={onSecondaryAction}
                  className="inline-flex items-center gap-2 px-3 py-3 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-semibold text-[14px] transition-colors group cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-full border border-blue-500/40 dark:border-blue-400/40 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/50 transition-colors">
                    <Play className="w-2.5 h-2.5 fill-blue-600 dark:fill-blue-400 ml-0.5" />
                  </div>
                  <span>{secondaryActionLabel}</span>
                </button>
              )}
            </div>

          </div>

          {/* RIGHT SIDE: Floating Dashboard Preview & Handwritten Doodles */}
          <div className="lg:col-span-6 relative pt-4 lg:pt-0 flex flex-col">
            
            {/* Top Right Handwritten Annotation in Blue Cursive matching reference */}
            {/* Positioned safely above the card with its own dedicated space so it NEVER overlaps the card, date or icons */}
            <div className="hidden xl:flex items-end justify-end mb-3 pr-8 select-none pointer-events-none">
              <div className="text-right">
                <div className="font-handwriting text-2xl text-blue-500 dark:text-blue-400 leading-tight">
                  Your goals.<br />
                  Your content.<br />
                  Your schedule.
                </div>
              </div>
              {/* Hand-drawn blue curved arrow pointing to dashboard */}
              <svg 
                className="w-10 h-8 text-blue-400 dark:text-blue-500 mb-1 ml-1 shrink-0" 
                viewBox="0 0 50 40" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.8"
              >
                <path 
                  d="M10 8 C22 14 30 22 28 34 M28 34 L20 28 M28 34 L34 26" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              </svg>
            </div>

            {/* The Floating Dashboard Card & Squircle Action Anchors */}
            <div className="relative max-w-lg mx-auto lg:max-w-none w-full">
              
              {/* 3 Pastel Floating Squircle Buttons anchored directly to the right edge of the card */}
              <div className="hidden sm:flex flex-col gap-3 absolute -right-3 sm:-right-4 lg:-right-5 top-20 sm:top-24 z-20">
                {/* 1. YouTube Red Squircle */}
                <button
                  type="button"
                  onClick={() => onNavigateTab ? onNavigateTab('library') : onPrimaryAction()}
                  title="View Video Library & Playlists"
                  className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer hover:border-red-300 dark:hover:border-red-500/50"
                >
                  <Youtube className="w-5 h-5 text-red-600 fill-red-600" />
                </button>

                {/* 2. Resources Green Squircle */}
                <button
                  type="button"
                  onClick={() => onNavigateTab ? onNavigateTab('resources') : onPrimaryAction()}
                  title="View Study Resources"
                  className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/50"
                >
                  <FileText className="w-5 h-5 text-emerald-500" />
                </button>

                {/* 3. Calendar Blue/Purple Squircle */}
                <button
                  type="button"
                  onClick={() => onNavigateTab ? onNavigateTab('calendar') : onPrimaryAction()}
                  title="View Study Calendar"
                  className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50"
                >
                  <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </button>
              </div>

              {/* The Floating Dashboard Card itself */}
              <div className="relative z-10 bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-[0_20px_50px_rgba(15,23,42,0.06)] dark:shadow-none text-left w-full">
              
              {/* Demo Badge clearly indicating example preview */}
              <div className="mb-3 flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 text-[11px] font-semibold">
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  Example Study Dashboard Preview
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  Illustrative Demo
                </span>
              </div>

              {/* Card Header: Greeting & Today badge */}
              <div className="flex items-start justify-between gap-4 pb-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Good morning, {userName} 👋
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Keep going! You're making progress.
                  </p>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-right shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider leading-none">Today</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">Apr 25, 2025</span>
                </div>
              </div>

              {/* Section: Overall Progress Bar */}
              <div className="py-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Overall Progress</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">42%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[42%] transition-all duration-700"></div>
                </div>
              </div>

              {/* Section: 3 Stats Badges */}
              <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 dark:border-slate-800 text-left">
                {/* 1. Videos Completed */}
                <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-0.5">
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span className="font-bold text-sm font-mono text-slate-900 dark:text-white">48</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Videos Completed</span>
                </div>

                {/* 2. Study Time */}
                <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 mb-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-bold text-sm font-mono text-slate-900 dark:text-white">36h 20m</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Study Time</span>
                </div>

                {/* 3. Day Streak */}
                <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-amber-500 mb-0.5">
                    <Flame className="w-3.5 h-3.5 fill-current" />
                    <span className="font-bold text-sm font-mono text-slate-900 dark:text-white">12</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Day Streak</span>
                </div>
              </div>

              {/* Section: Today's Goals */}
              <div className="pt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">Today's Goals</span>
                  <button 
                    type="button"
                    onClick={() => onNavigateTab ? onNavigateTab('calendar') : onPrimaryAction()}
                    className="text-xs text-blue-600 dark:text-blue-400 font-semibold cursor-pointer hover:underline"
                  >
                    View All
                  </button>
                </div>

                {/* Goal 1: Network Theory - Completed */}
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      Network Theory – KCL & KVL
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[11px] text-slate-400 font-mono">42 min</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-100 dark:fill-emerald-950/50" />
                  </div>
                </div>

                {/* Goal 2: Electrical Machines - Pending */}
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      Electrical Machines – Lecture 12
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[11px] text-slate-400 font-mono">55 min</span>
                    <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                  </div>
                </div>

                {/* Goal 3: Revision Control Systems - Pending */}
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      Revision – Control Systems
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[11px] text-slate-400 font-mono">40 min</span>
                    <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                  </div>
                </div>

              </div>

            </div>

          </div>

        </div>

        </div>

        {/* 
          5-COLUMN FEATURE SECTION matching reference exactly:
          Use Your YouTube Playlists | Set Deadlines | Smart Scheduling | Track Progress | Access Anywhere
        */}
        <div className="pt-16 sm:pt-20 border-t border-slate-200/70 dark:border-slate-800/80 mt-16 sm:mt-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 text-left">
            
            {/* Feature 1: Use Your YouTube Playlists */}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 flex items-center justify-center text-red-600">
                <Youtube className="w-6 h-6 fill-red-600" />
              </div>
              <h3 className="font-display text-[17px] font-bold text-slate-900 dark:text-white leading-snug">
                Use Your YouTube Playlists
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Add your subject-wise playlists and we'll organize them into a structured course.
              </p>
            </div>

            {/* Feature 2: Set Deadlines */}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center text-emerald-600">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="font-display text-[17px] font-bold text-slate-900 dark:text-white leading-snug">
                Set Deadlines
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Choose when to complete each subject or your entire syllabus.
              </p>
            </div>

            {/* Feature 3: Smart Scheduling */}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="font-display text-[17px] font-bold text-slate-900 dark:text-white leading-snug">
                Smart Scheduling
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Get a personalized study plan based on your goals, time and preferences.
              </p>
            </div>

            {/* Feature 4: Track Progress */}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-pink-50 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/40 flex items-center justify-center text-pink-600">
                <BarChart2 className="w-6 h-6" />
              </div>
              <h3 className="font-display text-[17px] font-bold text-slate-900 dark:text-white leading-snug">
                Track Progress
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Stay motivated with detailed progress, streaks and performance analytics.
              </p>
            </div>

            {/* Feature 5: Access Anywhere */}
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center text-blue-600">
                <Cloud className="w-6 h-6" />
              </div>
              <h3 className="font-display text-[17px] font-bold text-slate-900 dark:text-white leading-snug">
                Access Anywhere
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Your data is saved securely. Log in from any device and continue where you left off.
              </p>
            </div>

          </div>
        </div>

        {/* Bottom Tagline Row matching reference */}
        <div className="pt-12 flex items-center justify-between text-xs text-slate-400 select-none">
          <div className="flex items-center gap-2 font-bold tracking-[0.2em] uppercase text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
            <span className="w-4 h-[2px] bg-blue-600 inline-block"></span>
            <span>BETTER PLANS &nbsp;/&nbsp; BIGGER DREAMS</span>
          </div>

          <div className="font-handwriting text-xl sm:text-2xl text-blue-600 dark:text-blue-400 rotate-[-4deg]">
            You got this!
          </div>
        </div>

      </div>

    </div>
  );
};
