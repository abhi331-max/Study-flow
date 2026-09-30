// Deterministic Intelligent Scheduler for StudyFlow
// Supports Subject-Specific Deadlines, Smart Scheduling, Full Manual Mode & Hybrid Mode with Task Locking

export interface SubjectInput {
  id: string;
  name: string;
  priority: 'high' | 'medium' | 'low';
  color: string;
  targetDate?: string | null; // YYYY-MM-DD subject-specific deadline
}

export interface VideoInput {
  id: string;
  subjectId: string;
  title: string;
  durationSeconds: number;
  originalPosition: number;
  status: string; // 'not_started', 'in_progress', 'completed', 'skipped'
}

export interface LockedTaskInput {
  id?: string;
  videoId?: string;
  subjectId?: string;
  scheduledDate: string; // YYYY-MM-DD
  plannedDurationSeconds: number;
  customTitle: string;
  orderIndex?: number;
  isLocked?: number;
  scheduleSource?: string;
  taskCategory?: string;
}

export interface SchedulerInput {
  courseId: string;
  userId: string;
  startDate: string; // YYYY-MM-DD
  examDate: string;  // YYYY-MM-DD
  targetFinishDate?: string | null; // YYYY-MM-DD
  planningMode?: 'smart' | 'manual' | 'hybrid';
  dailyStudyMinutes: number;
  studyDays: string[]; // ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  restDays: string[];
  strategy: 'balanced' | 'one_by_one' | 'priority' | 'smart_interleaved';
  bufferDays: number;
  revisionDays: number;
  pyqDays: number;
  mockDays: number;
  prepMode: 'lectures_only' | 'lectures_revision' | 'lectures_revision_pyq' | 'full';
  subjects: SubjectInput[];
  videos: VideoInput[];
  lockedTasks?: LockedTaskInput[];
}

export interface ScheduledTaskOutput {
  id?: string;
  courseId: string;
  userId: string;
  scheduledDate: string; // YYYY-MM-DD
  taskType: 'video' | 'revision' | 'pyq' | 'mock' | 'buffer' | 'custom';
  subjectId?: string;
  videoId?: string;
  customTitle: string;
  plannedDurationSeconds: number;
  phase: 'learning' | 'revision' | 'pyq' | 'mock';
  orderIndex: number;
  scheduleSource: 'automatic' | 'manual' | 'hybrid' | 'rescheduled';
  isLocked: number;
  taskCategory: string;
  scheduleExplanation?: string;
}

export interface SubjectFeasibilityReport {
  subjectId: string;
  subjectName: string;
  targetDate?: string | null;
  hasDeadline: boolean;
  totalVideos: number;
  completedVideos: number;
  remainingVideos: number;
  totalSeconds: number;
  completedSeconds: number;
  remainingSeconds: number;
  progressPct: number;
  daysRemaining: number;
  availableStudyDays: number;
  requiredDailyMinutes: number;
  currentPaceMinutes: number;
  status: 'On Track' | 'At Risk' | 'Behind' | 'Completed' | 'No Deadline';
  hasConflict: boolean;
  conflictMessage?: string;
  conflictShortfallHours?: number;
  adjustmentOptions?: string[];
}

export interface FeasibilityReport {
  isFeasible: boolean;
  totalRemainingSeconds: number;
  availableStudyDays: number;
  totalAvailableSeconds: number;
  requiredDailyMinutes: number;
  availableDailyMinutes: number;
  shortfallMinutes: number;
  projectedFinishDate: string;
  suggestedDailyMinutes: number;
  warningMessage?: string;
  subjectReports: SubjectFeasibilityReport[];
  deadlineConflicts: SubjectFeasibilityReport[];
}

// Helper: Format date as YYYY-MM-DD
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Add days to date
export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// Helper: Count active study days between two dates
export function countStudyDaysBetween(start: Date, end: Date, activeStudyDays: string[]): number {
  if (end < start) return 0;
  let count = 0;
  let curr = new Date(start);
  let safety = 0;
  while (curr <= end && safety++ < 1500) {
    const dayName = getDayName(curr);
    if (activeStudyDays.includes(dayName)) {
      count++;
    }
    curr = addDays(curr, 1);
  }
  return count;
}

// Get day of week name lowercase
export function getDayName(d: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[d.getDay()];
}

// Format friendly hours & minutes
export function formatHoursMins(seconds: number): string {
  const totalMins = Math.round(seconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Calculate feasibility for individual subjects and overall course
export function checkScheduleFeasibility(input: SchedulerInput): FeasibilityReport {
  const start = new Date(input.startDate);
  let exam = new Date(input.examDate);

  if (isNaN(exam.getTime()) || exam <= start) {
    exam = addDays(start, 90);
  }

  let activeStudyDays = (input.studyDays || []).filter(d => !(input.restDays || []).includes(d));
  if (activeStudyDays.length === 0) {
    activeStudyDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  }

  let reservedDays = Math.max(0, input.bufferDays || 0);
  if (input.prepMode === 'lectures_revision' || input.prepMode === 'lectures_revision_pyq' || input.prepMode === 'full') {
    reservedDays += Math.max(0, input.revisionDays || 0);
  }
  if (input.prepMode === 'lectures_revision_pyq' || input.prepMode === 'full') {
    reservedDays += Math.max(0, input.pyqDays || 0);
  }
  if (input.prepMode === 'full') {
    reservedDays += Math.max(0, input.mockDays || 0);
  }

  let lectureDeadline = addDays(exam, -reservedDays);
  if (input.targetFinishDate) {
    const customTarget = new Date(input.targetFinishDate);
    if (!isNaN(customTarget.getTime()) && customTarget < lectureDeadline && customTarget > start) {
      lectureDeadline = customTarget;
    }
  }

  const availableStudyDays = countStudyDaysBetween(start, lectureDeadline, activeStudyDays);
  const availableDailyMinutes = Math.max(15, input.dailyStudyMinutes || 180);

  const uncompletedVideos = (input.videos || []).filter(v => v.status !== 'completed' && v.status !== 'skipped');
  const totalRemainingSeconds = uncompletedVideos.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
  const totalAvailableSeconds = availableStudyDays * (availableDailyMinutes * 60);

  const requiredDailyMinutes = availableStudyDays > 0 
    ? Math.round(totalRemainingSeconds / 60 / availableStudyDays) 
    : Math.round(totalRemainingSeconds / 60);

  const isOverallFeasible = totalRemainingSeconds <= totalAvailableSeconds && availableStudyDays > 0;
  const shortfallMinutes = Math.max(0, Math.round((totalRemainingSeconds - totalAvailableSeconds) / 60));

  // Subject-specific calculations
  const subjectReports: SubjectFeasibilityReport[] = [];
  const deadlineConflicts: SubjectFeasibilityReport[] = [];

  for (const sub of input.subjects || []) {
    const subVideos = (input.videos || []).filter(v => v.subjectId === sub.id);
    const subTotalSec = subVideos.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
    const subCompletedVids = subVideos.filter(v => v.status === 'completed');
    const subCompletedSec = subCompletedVids.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
    const subRemainingVids = subVideos.filter(v => v.status !== 'completed' && v.status !== 'skipped');
    const subRemainingSec = subRemainingVids.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
    const progressPct = subTotalSec > 0 ? Math.round((subCompletedSec / subTotalSec) * 100) : 0;

    let targetDateObj: Date | null = null;
    let hasDeadline = false;
    let daysRemaining = 0;
    let availableSubStudyDays = availableStudyDays;

    if (sub.targetDate) {
      const parsedTarget = new Date(sub.targetDate);
      if (!isNaN(parsedTarget.getTime())) {
        targetDateObj = parsedTarget;
        hasDeadline = true;
        const diffMs = targetDateObj.getTime() - start.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        availableSubStudyDays = countStudyDaysBetween(start, targetDateObj, activeStudyDays);
      }
    }

    const subRequiredDailyMinutes = availableSubStudyDays > 0
      ? Math.round((subRemainingSec / 60) / availableSubStudyDays)
      : Math.round(subRemainingSec / 60);

    // Current daily allocation pace assumption: user's total daily time proportioned or standard
    const currentPaceMinutes = Math.min(availableDailyMinutes, subRequiredDailyMinutes > 0 ? Math.max(30, Math.round(availableDailyMinutes / Math.max(1, input.subjects.length))) : 0);

    let status: 'On Track' | 'At Risk' | 'Behind' | 'Completed' | 'No Deadline' = 'No Deadline';
    let hasConflict = false;
    let conflictMessage: string | undefined;
    let conflictShortfallHours: number | undefined;

    if (subRemainingSec === 0 && subTotalSec > 0) {
      status = 'Completed';
    } else if (!hasDeadline) {
      status = 'No Deadline';
    } else {
      const maxSubAvailableSeconds = availableSubStudyDays * (availableDailyMinutes * 60);
      if (subRemainingSec > maxSubAvailableSeconds) {
        hasConflict = true;
        status = 'Behind';
        const remainingHoursStr = formatHoursMins(subRemainingSec);
        const availableHoursStr = formatHoursMins(maxSubAvailableSeconds);
        const shortfallSec = subRemainingSec - maxSubAvailableSeconds;
        conflictShortfallHours = Math.round((shortfallSec / 3600) * 10) / 10;
        conflictMessage = `You currently have approximately ${remainingHoursStr} of ${sub.name} content remaining, but only about ${availableHoursStr} available study hours before your deadline (${sub.targetDate}).`;
      } else if (subRequiredDailyMinutes > availableDailyMinutes * 0.75) {
        status = 'At Risk';
      } else {
        status = 'On Track';
      }
    }

    const report: SubjectFeasibilityReport = {
      subjectId: sub.id,
      subjectName: sub.name,
      targetDate: sub.targetDate || null,
      hasDeadline,
      totalVideos: subVideos.length,
      completedVideos: subCompletedVids.length,
      remainingVideos: subRemainingVids.length,
      totalSeconds: subTotalSec,
      completedSeconds: subCompletedSec,
      remainingSeconds: subRemainingSec,
      progressPct,
      daysRemaining,
      availableStudyDays: availableSubStudyDays,
      requiredDailyMinutes: subRequiredDailyMinutes,
      currentPaceMinutes,
      status,
      hasConflict,
      conflictMessage,
      conflictShortfallHours,
      adjustmentOptions: hasConflict ? [
        'Increase daily study time',
        'Move subject deadline forward',
        'Remove or skip non-essential videos',
        'Prioritize this subject over other subjects',
        'Keep current deadline and accept shortfall'
      ] : undefined
    };

    subjectReports.push(report);
    if (hasConflict) {
      deadlineConflicts.push(report);
    }
  }

  // Projected overall finish date
  const projectedDaysNeeded = availableDailyMinutes > 0 
    ? Math.ceil((totalRemainingSeconds / 60) / availableDailyMinutes) 
    : 0;
  
  let projectedCurr = new Date(start);
  let daysCounted = 0;
  let projSafety = 0;
  while (daysCounted < projectedDaysNeeded && projSafety++ < 1000) {
    const dayName = getDayName(projectedCurr);
    if (activeStudyDays.includes(dayName)) {
      daysCounted++;
    }
    projectedCurr = addDays(projectedCurr, 1);
  }
  const projectedFinishDate = formatDate(projectedCurr);

  return {
    isFeasible: isOverallFeasible && deadlineConflicts.length === 0,
    totalRemainingSeconds,
    availableStudyDays,
    totalAvailableSeconds,
    requiredDailyMinutes,
    availableDailyMinutes,
    shortfallMinutes,
    projectedFinishDate,
    suggestedDailyMinutes: isOverallFeasible ? availableDailyMinutes : requiredDailyMinutes,
    warningMessage: !isOverallFeasible 
      ? `Total course workload exceeds available study time by ${Math.round(shortfallMinutes / 60)}h ${shortfallMinutes % 60}m before target date.`
      : deadlineConflicts.length > 0 
        ? `${deadlineConflicts.length} subject deadline${deadlineConflicts.length > 1 ? 's' : ''} exceed available capacity.`
        : undefined,
    subjectReports,
    deadlineConflicts
  };
}

// Generate schedule respecting Subject Deadlines, Planning Modes (Smart, Manual, Hybrid) & Locked Tasks
export function generateSchedule(input: SchedulerInput): {
  tasks: ScheduledTaskOutput[];
  feasibility: FeasibilityReport;
} {
  const feasibility = checkScheduleFeasibility(input);
  const start = new Date(input.startDate);
  const planningMode = input.planningMode || 'smart';

  // In FULL MANUAL MODE, the application does NOT automatically assign videos to dates!
  // It returns only existing locked/manual tasks that the user has already scheduled.
  if (planningMode === 'manual') {
    const manualTasks: ScheduledTaskOutput[] = (input.lockedTasks || []).map((lt, idx) => ({
      id: lt.id,
      courseId: input.courseId,
      userId: input.userId,
      scheduledDate: lt.scheduledDate,
      taskType: 'video',
      subjectId: lt.subjectId,
      videoId: lt.videoId,
      customTitle: lt.customTitle,
      plannedDurationSeconds: lt.plannedDurationSeconds,
      phase: 'learning',
      orderIndex: lt.orderIndex ?? idx,
      scheduleSource: 'manual',
      isLocked: lt.isLocked ? 1 : 0,
      taskCategory: lt.taskCategory || 'Watch Lecture',
      scheduleExplanation: 'Manually placed by user'
    }));

    return {
      tasks: manualTasks,
      feasibility
    };
  }

  // SMART or HYBRID SCHEDULING
  const dailyLimitSeconds = Math.max(15, input.dailyStudyMinutes || 180) * 60;
  let activeStudyDays = (input.studyDays || []).filter(d => !(input.restDays || []).includes(d));
  if (activeStudyDays.length === 0) {
    activeStudyDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  }

  // Map of locked / preserved tasks by date
  const lockedTasksByDate = new Map<string, ScheduledTaskOutput[]>();
  const lockedVideoIds = new Set<string>();

  for (const lt of input.lockedTasks || []) {
    if (lt.videoId) lockedVideoIds.add(lt.videoId);
    const existing = lockedTasksByDate.get(lt.scheduledDate) || [];
    existing.push({
      id: lt.id,
      courseId: input.courseId,
      userId: input.userId,
      scheduledDate: lt.scheduledDate,
      taskType: 'video',
      subjectId: lt.subjectId,
      videoId: lt.videoId,
      customTitle: lt.customTitle,
      plannedDurationSeconds: lt.plannedDurationSeconds,
      phase: 'learning',
      orderIndex: lt.orderIndex ?? existing.length,
      scheduleSource: (lt.scheduleSource as any) || (lt.isLocked ? 'hybrid' : 'manual'),
      isLocked: lt.isLocked ? 1 : 0,
      taskCategory: lt.taskCategory || 'Watch Lecture',
      scheduleExplanation: lt.isLocked ? 'Locked by user on this date' : 'Manually scheduled by user'
    });
    lockedTasksByDate.set(lt.scheduledDate, existing);
  }

  // Filter videos that need automatic assignment:
  // Exclude completed, skipped, and already locked videos
  const candidateVideos = (input.videos || [])
    .filter(v => v.status !== 'completed' && v.status !== 'skipped' && !lockedVideoIds.has(v.id))
    .sort((a, b) => a.originalPosition - b.originalPosition);

  // Build subject lookup & priority weights
  const subjectMap = new Map<string, SubjectInput>();
  const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  for (const s of input.subjects) subjectMap.set(s.id, s);

  // Group videos by subject
  const subjectVideoQueues = new Map<string, VideoInput[]>();
  for (const s of input.subjects) {
    subjectVideoQueues.set(
      s.id,
      candidateVideos.filter(v => v.subjectId === s.id)
    );
  }

  const finalTasks: ScheduledTaskOutput[] = [];
  let currentDate = new Date(start);
  let loopSafety = 0;

  // Helper: check if there are still candidate videos left in any queue
  const hasRemainingVideos = () => {
    for (const q of subjectVideoQueues.values()) {
      if (q.length > 0) return true;
    }
    return false;
  };

  // Phase 1: Schedule Learning / Videos
  while (hasRemainingVideos() && loopSafety++ < 730) {
    const dayName = getDayName(currentDate);
    const dateStr = formatDate(currentDate);

    // If rest day, skip unless there are explicit locked tasks on this date
    const lockedToday = lockedTasksByDate.get(dateStr) || [];
    if (!activeStudyDays.includes(dayName)) {
      if (lockedToday.length > 0) {
        finalTasks.push(...lockedToday);
      }
      currentDate = addDays(currentDate, 1);
      continue;
    }

    // Add locked tasks for today first
    let dayAllocatedSeconds = 0;
    let orderInDay = 0;

    for (const lt of lockedToday) {
      lt.orderIndex = orderInDay++;
      finalTasks.push(lt);
      dayAllocatedSeconds += lt.plannedDurationSeconds;
    }

    // Allocate remaining capacity to candidate videos
    while (dayAllocatedSeconds < dailyLimitSeconds && hasRemainingVideos()) {
      // Calculate dynamic score for each active subject queue on this current date
      // Urgency factors:
      // 1. Subject deadline proximity: subjects with upcoming deadlines get highest urgency
      // 2. Required daily pace: remaining seconds / available days before deadline
      // 3. User priority: high, medium, low
      let bestSubjectId: string | null = null;
      let highestScore = -Infinity;

      for (const [subId, queue] of subjectVideoQueues.entries()) {
        if (queue.length === 0) continue;
        const sub = subjectMap.get(subId);
        if (!sub) continue;

        const pWeight = priorityWeight[sub.priority || 'medium'] || 2;
        let urgencyScore = pWeight * 10;

        if (sub.targetDate) {
          const targetD = new Date(sub.targetDate);
          const daysToDeadline = Math.ceil((targetD.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
          const queueDuration = queue.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);

          if (daysToDeadline <= 0) {
            // Deadline already reached or today! Max urgency
            urgencyScore += 1000 + (queueDuration / 3600) * 50;
          } else {
            // Days remaining: higher urgency for closer deadlines with heavy remaining duration
            const availableDays = Math.max(1, countStudyDaysBetween(currentDate, targetD, activeStudyDays));
            const reqPacePerDay = (queueDuration / 3600) / availableDays;
            urgencyScore += 100 + (reqPacePerDay * 30) + Math.max(0, (60 - daysToDeadline) * 3);
          }
        } else {
          // No deadline: baseline priority
          urgencyScore += pWeight * 5;
        }

        if (urgencyScore > highestScore) {
          highestScore = urgencyScore;
          bestSubjectId = subId;
        }
      }

      if (!bestSubjectId) break;

      const queue = subjectVideoQueues.get(bestSubjectId);
      if (!queue || queue.length === 0) break;

      const vid = queue.shift()!;
      const sub = subjectMap.get(bestSubjectId);

      // Construct explanation for transparency
      let explanation = 'Scheduled based on subject priority and balanced progression.';
      if (sub?.targetDate) {
        const remainingQueueHrs = Math.round((queue.reduce((acc, v) => acc + (v.durationSeconds || 0), 0) + vid.durationSeconds) / 3600 * 10) / 10;
        explanation = `Subject target deadline: ${sub.targetDate}. Allocated to maintain required pace (${remainingQueueHrs}h remaining).`;
      }

      finalTasks.push({
        courseId: input.courseId,
        userId: input.userId,
        scheduledDate: dateStr,
        taskType: 'video',
        subjectId: vid.subjectId,
        videoId: vid.id,
        customTitle: vid.title,
        plannedDurationSeconds: vid.durationSeconds,
        phase: 'learning',
        orderIndex: orderInDay++,
        scheduleSource: planningMode === 'hybrid' ? 'hybrid' : 'automatic',
        isLocked: 0,
        taskCategory: 'Watch Lecture',
        scheduleExplanation: explanation
      });

      dayAllocatedSeconds += vid.durationSeconds;
    }

    currentDate = addDays(currentDate, 1);
  }

  // Add any locked tasks on future dates beyond the learning phase
  for (const [dateStr, lTasks] of lockedTasksByDate.entries()) {
    const alreadyAdded = finalTasks.some(t => t.scheduledDate === dateStr && t.isLocked === 1);
    if (!alreadyAdded) {
      finalTasks.push(...lTasks);
    }
  }

  // Phase 2: Revision Days (if enabled)
  if (input.prepMode !== 'lectures_only' && (input.revisionDays || 0) > 0) {
    let revDaysScheduled = 0;
    let revLoopSafety = 0;
    while (revDaysScheduled < input.revisionDays && revLoopSafety++ < 365) {
      const dayName = getDayName(currentDate);
      if (activeStudyDays.includes(dayName)) {
        const subIndex = revDaysScheduled % Math.max(1, input.subjects.length);
        const targetSub = input.subjects[subIndex];
        finalTasks.push({
          courseId: input.courseId,
          userId: input.userId,
          scheduledDate: formatDate(currentDate),
          taskType: 'revision',
          subjectId: targetSub?.id,
          customTitle: `Comprehensive Formula & Concept Revision: ${targetSub?.name || 'All Subjects'}`,
          plannedDurationSeconds: dailyLimitSeconds,
          phase: 'revision',
          orderIndex: 0,
          scheduleSource: 'automatic',
          isLocked: 0,
          taskCategory: 'Revision',
          scheduleExplanation: 'Scheduled final revision phase prior to exam.'
        });
        revDaysScheduled++;
      }
      currentDate = addDays(currentDate, 1);
    }
  }

  // Sort final tasks by date and orderIndex
  finalTasks.sort((a, b) => {
    if (a.scheduledDate !== b.scheduledDate) {
      return a.scheduledDate.localeCompare(b.scheduledDate);
    }
    return a.orderIndex - b.orderIndex;
  });

  return {
    tasks: finalTasks,
    feasibility
  };
}
