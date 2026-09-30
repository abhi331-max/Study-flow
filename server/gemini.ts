// Gemini AI Service for StudyFlow Topic Classification, Syllabus Mapping & Study Insights
import { GoogleGenAI } from '@google/genai';
import { getCachedAIAnalysis, setCachedAIAnalysis, computeHash, inFlightDeduplicator } from './services/cache.js';
import { observability } from './services/metrics.js';

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiInstance && process.env.GEMINI_API_KEY) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

export interface VideoClassificationResult {
  videoId: string;
  topic: string;
  subtopic: string;
  contentType: 'Lecture' | 'Concept' | 'Problem Solving' | 'Revision' | 'PYQ' | 'Practice' | 'Announcement' | 'Other';
  difficulty: 'easy' | 'normal' | 'hard';
  conceptualImportance: 'high' | 'medium' | 'low';
}

// Classify videos into topics, content types and difficulty with caching & single-flight deduplication
export async function analyzeVideosWithAI(
  subjectName: string,
  videos: { id: string; title: string; description?: string }[]
): Promise<VideoClassificationResult[]> {
  if (videos.length === 0) return [];

  const rawKey = subjectName + ':' + videos.map(v => `${v.id}:${v.title}`).join('|');
  const cacheKey = `ai:classify:${computeHash(rawKey)}`;

  const cached = getCachedAIAnalysis(cacheKey);
  if (cached && Array.isArray(cached)) {
    observability.recordAIMetric({
      feature: 'classify_videos',
      latencyMs: 1,
      wasCached: true
    });
    return cached;
  }

  return inFlightDeduplicator.do(cacheKey, async () => {
    const cachedAgain = getCachedAIAnalysis(cacheKey);
    if (cachedAgain && Array.isArray(cachedAgain)) return cachedAgain;

    const start = Date.now();
    const result = await analyzeVideosWithAIInternal(subjectName, videos);
    const duration = Date.now() - start;

    setCachedAIAnalysis(cacheKey, 'video_classification', result);
    observability.recordAIMetric({
      feature: 'classify_videos',
      latencyMs: duration,
      wasCached: false
    });

    return result;
  });
}

async function analyzeVideosWithAIInternal(
  subjectName: string,
  videos: { id: string; title: string; description?: string }[]
): Promise<VideoClassificationResult[]> {
  const client = getAiClient();
  if (!client || videos.length === 0) {
    // Deterministic heuristic fallback
    return videos.map(v => {
      const lower = v.title.toLowerCase();
      let contentType: VideoClassificationResult['contentType'] = 'Lecture';
      if (lower.includes('pyq') || lower.includes('previous year') || lower.includes('gate 20')) contentType = 'PYQ';
      else if (lower.includes('revision') || lower.includes('one shot') || lower.includes('marathon')) contentType = 'Revision';
      else if (lower.includes('problem') || lower.includes('numerical') || lower.includes('mcq')) contentType = 'Problem Solving';
      else if (lower.includes('concept') || lower.includes('intro') || lower.includes('basics')) contentType = 'Concept';

      let difficulty: VideoClassificationResult['difficulty'] = 'normal';
      if (lower.includes('advanced') || lower.includes('hard') || lower.includes('masterclass')) difficulty = 'hard';
      else if (lower.includes('basic') || lower.includes('intro') || lower.includes('easy')) difficulty = 'easy';

      // Clean topic from title
      const topic = v.title.replace(/^(\d+[\.\:\-]\s*|lec(ture)?\s*\d+[\.\:\-]\s*)/i, '').split(/[-–|:]/)[0]?.trim() || subjectName;

      return {
        videoId: v.id,
        topic,
        subtopic: subjectName,
        contentType,
        difficulty,
        conceptualImportance: 'medium'
      };
    });
  }

  try {
    const videoSnippetList = videos.slice(0, 30).map((v, i) => `[${i + 1}] ID: ${v.id} | Title: "${v.title}" | Desc: "${(v.description || '').slice(0, 100)}"`).join('\n');

    const prompt = `Analyze these educational video lectures for the subject "${subjectName}".
Classify each video by:
- topic (e.g., KCL/KVL, Thevenin Theorem, Transients, Fourier Transform)
- subtopic
- contentType: one of ["Lecture", "Concept", "Problem Solving", "Revision", "PYQ", "Practice", "Announcement", "Other"]
- difficulty: one of ["easy", "normal", "hard"]
- conceptualImportance: one of ["high", "medium", "low"]

Videos:
${videoSnippetList}

Return ONLY a JSON array of objects with keys: videoId, topic, subtopic, contentType, difficulty, conceptualImportance.`;

    const response = await client.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const parsed = JSON.parse(response.text?.trim() || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Gemini video analysis failed, using fallback:', err);
  }

  // Fallback
  return videos.map(v => ({
    videoId: v.id,
    topic: subjectName,
    subtopic: subjectName,
    contentType: 'Lecture',
    difficulty: 'normal',
    conceptualImportance: 'medium'
  }));
}

// Generate intelligent weekly review & pace insights with caching
export async function generateStudyInsights(params: {
  courseName: string;
  examName: string;
  daysRemaining: number;
  totalPlannedHours: number;
  completedHours: number;
  completionPercentage: number;
  currentPaceHoursPerDay: number;
  requiredPaceHoursPerDay: number;
  streakDays: number;
  statusText: string;
}): Promise<{
  summary: string;
  keyObservation: string;
  actionableRecommendations: string[];
}> {
  const cacheKey = `ai:insights:${computeHash(
    `${params.courseName}:${params.examName}:${params.daysRemaining}:${Math.round(params.completionPercentage)}:${params.streakDays}`
  )}`;

  const cached = getCachedAIAnalysis(cacheKey);
  if (cached && cached.summary) {
    observability.recordAIMetric({
      feature: 'study_insights',
      latencyMs: 1,
      wasCached: true
    });
    return cached;
  }

  return inFlightDeduplicator.do(cacheKey, async () => {
    const cachedAgain = getCachedAIAnalysis(cacheKey);
    if (cachedAgain && cachedAgain.summary) return cachedAgain;

    const start = Date.now();
    const result = await generateStudyInsightsInternal(params);
    const duration = Date.now() - start;

    setCachedAIAnalysis(cacheKey, 'study_insights', result);
    observability.recordAIMetric({
      feature: 'study_insights',
      latencyMs: duration,
      wasCached: false
    });

    return result;
  });
}

async function generateStudyInsightsInternal(params: {
  courseName: string;
  examName: string;
  daysRemaining: number;
  totalPlannedHours: number;
  completedHours: number;
  completionPercentage: number;
  currentPaceHoursPerDay: number;
  requiredPaceHoursPerDay: number;
  streakDays: number;
  statusText: string;
}): Promise<{
  summary: string;
  keyObservation: string;
  actionableRecommendations: string[];
}> {
  const client = getAiClient();
  if (!client) {
    return {
      summary: `You have completed ${params.completedHours.toFixed(1)}h out of ${params.totalPlannedHours.toFixed(1)}h planned for ${params.examName}. Current streak is ${params.streakDays} days.`,
      keyObservation: params.currentPaceHoursPerDay >= params.requiredPaceHoursPerDay 
        ? `You are currently maintaining a steady pace of ${params.currentPaceHoursPerDay.toFixed(1)}h/day, on track for your exam in ${params.daysRemaining} days.`
        : `Your current pace of ${params.currentPaceHoursPerDay.toFixed(1)}h/day is slightly below the required pace of ${params.requiredPaceHoursPerDay.toFixed(1)}h/day.`,
      actionableRecommendations: [
        'Complete today’s prioritized video tasks early in your prime focus window.',
        'Use active recall and solve 3-5 practice questions right after each video lecture.',
        'Ensure you reserve weekends or designated buffer days for revision.'
      ]
    };
  }

  try {
    const prompt = `You are a world-class academic study coach.
Review the student's exam preparation data:
- Course: ${params.courseName} (${params.examName})
- Days until exam: ${params.daysRemaining} days
- Progress: ${params.completionPercentage}% (${params.completedHours.toFixed(1)}h completed / ${params.totalPlannedHours.toFixed(1)}h total)
- Current pace: ${params.currentPaceHoursPerDay.toFixed(1)}h/day
- Required pace: ${params.requiredPaceHoursPerDay.toFixed(1)}h/day
- Streak: ${params.streakDays} days
- Status: ${params.statusText}

Provide an encouraging, concise, highly realistic study evaluation.
Return a JSON object with:
- "summary": (2 sentences maximum)
- "keyObservation": (1 sharp factual sentence analyzing their trajectory)
- "actionableRecommendations": (array of 3 specific, non-generic study tips for this stage)
`;

    const response = await client.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    return JSON.parse(response.text?.trim() || '{}');
  } catch (err) {
    console.warn('Gemini study insights generation failed:', err);
    return {
      summary: `You are making steady progress on ${params.courseName} with ${params.completionPercentage}% completed.`,
      keyObservation: `You need approximately ${params.requiredPaceHoursPerDay.toFixed(1)} hours per day over the remaining ${params.daysRemaining} days.`,
      actionableRecommendations: [
        'Stick to your daily scheduled lecture slot.',
        'Prioritize high-weightage subjects first.',
        'Maintain concise formula revision sheets after each topic.'
      ]
    };
  }
}

// Generate catch-up recovery advice with caching
export async function generateCatchUpAdvice(params: {
  missedMinutes: number;
  remainingDays: number;
  availableDailyMinutes: number;
  courseName: string;
}): Promise<{
  adviceTitle: string;
  recommendedOption: string;
  options: { title: string; description: string; impact: string }[];
}> {
  const roundedMissed = Math.round(params.missedMinutes / 15) * 15;
  const cacheKey = `ai:catchup:${computeHash(`${params.courseName}:${roundedMissed}:${params.remainingDays}`)}`;

  const cached = getCachedAIAnalysis(cacheKey);
  if (cached && cached.adviceTitle) {
    observability.recordAIMetric({
      feature: 'catchup_advice',
      latencyMs: 1,
      wasCached: true
    });
    return cached;
  }

  const result = generateCatchUpAdviceInternal(params);
  setCachedAIAnalysis(cacheKey, 'catchup_advice', result);
  observability.recordAIMetric({
    feature: 'catchup_advice',
    latencyMs: 1,
    wasCached: false
  });
  return result;
}

function generateCatchUpAdviceInternal(params: {
  missedMinutes: number;
  remainingDays: number;
  availableDailyMinutes: number;
  courseName: string;
}): {
  adviceTitle: string;
  recommendedOption: string;
  options: { title: string; description: string; impact: string }[];
} {
  const missedHours = (params.missedMinutes / 60).toFixed(1);
  const extraPerDay5 = Math.ceil(params.missedMinutes / 5);
  const extraPerDay3 = Math.ceil(params.missedMinutes / 3);

  return {
    adviceTitle: `You missed approximately ${missedHours} hours of planned study time.`,
    recommendedOption: 'Spread across the next 5 days',
    options: [
      {
        title: 'Option A: Gentle Recovery (5 Days)',
        description: `Add just ${extraPerDay5} minutes to each of your next 5 study sessions.`,
        impact: 'Maintains healthy study stamina without fatigue.'
      },
      {
        title: 'Option B: Rapid Catch-Up (3 Days)',
        description: `Add ${extraPerDay3} minutes per day over the next 3 days.`,
        impact: 'Quickly eliminates the backlog so your original schedule stays 100% on track.'
      },
      {
        title: 'Option C: Absorb into Buffer / Revision Period',
        description: `Shift uncompleted lectures forward and slightly compress the final buffer days.`,
        impact: 'Preserves your current daily hours; slightly reduces end-of-syllabus buffer.'
      }
    ]
  };
}
