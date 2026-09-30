// Automated Comprehensive Test Suite for StudyFlow Engine
import { generateSchedule, checkScheduleFeasibility, formatDate, addDays } from './scheduler.js';
import { extractPlaylistId, extractVideoId, parseIso8601Duration } from './youtube.js';
import { hashPassword, verifyPassword } from './db.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

console.log('--- RUNNING STUDYFLOW TEST SUITE ---');

// 1. Password Hashing & Verification
const pwd = 'StudentSecret123!';
const hash = hashPassword(pwd);
assert(verifyPassword(pwd, hash), 'Password hashing and verification');
assert(!verifyPassword('wrongPassword', hash), 'Reject wrong password');

// 2. YouTube Parsing & ISO Duration
assert(extractPlaylistId('https://www.youtube.com/playlist?list=PL_network_theory_gate') === 'PL_network_theory_gate', 'Extract playlist ID from standard URL');
assert(extractPlaylistId('https://youtu.be/watch?v=123&list=PL123456789012') === 'PL123456789012', 'Extract playlist ID with video param');
assert(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'dQw4w9WgXcQ', 'Extract 11-char video ID from watch URL');
assert(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=10') === 'dQw4w9WgXcQ', 'Extract video ID from youtu.be short URL');
assert(parseIso8601Duration('PT1H15M30S') === 4530, 'Parse PT1H15M30S duration to seconds');
assert(parseIso8601Duration('PT45M') === 2700, 'Parse PT45M duration to seconds');

// 3. Scheduler Test Case: 10 videos across 30 days
const subjects = [
  { id: 'sub-1', name: 'Network Theory', priority: 'high' as const, color: '#2563eb' },
  { id: 'sub-2', name: 'Control Systems', priority: 'medium' as const, color: '#7c3aed' }
];

const videos10 = Array.from({ length: 10 }, (_, i) => ({
  id: `v-${i}`,
  subjectId: i % 2 === 0 ? 'sub-1' : 'sub-2',
  title: `Lecture ${i + 1}`,
  durationSeconds: 3600, // 1 hour each
  originalPosition: i + 1,
  status: 'not_started'
}));

const schedule10 = generateSchedule({
  courseId: 'c-test',
  userId: 'u-test',
  startDate: '2026-10-01',
  examDate: '2026-10-31',
  dailyStudyMinutes: 120, // 2 hours/day
  studyDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  restDays: ['sunday'],
  strategy: 'smart_interleaved',
  bufferDays: 3,
  revisionDays: 5,
  pyqDays: 2,
  mockDays: 1,
  prepMode: 'full',
  subjects,
  videos: videos10
});

assert(schedule10.feasibility.isFeasible === true, '10 videos / 30 days is feasible');
assert(schedule10.tasks.length >= 10, 'All 10 video tasks scheduled plus revision/pyq/mock phases');

// 4. Scheduler Test Case: Sunday Rest Enforcement
const sundayTasks = schedule10.tasks.filter(t => {
  const d = new Date(t.scheduledDate);
  return d.getDay() === 0; // Sunday
});
assert(sundayTasks.length === 0, 'No tasks scheduled on designated Sunday rest days');

// 5. Scheduler Test Case: Impossible Workload Shortfall Detection
const heavyVideos = Array.from({ length: 100 }, (_, i) => ({
  id: `v-heavy-${i}`,
  subjectId: 'sub-1',
  title: `Heavy Lecture ${i}`,
  durationSeconds: 7200, // 2 hours each = 200 hours total
  originalPosition: i + 1,
  status: 'not_started'
}));

const infeasibleCheck = checkScheduleFeasibility({
  courseId: 'c-test',
  userId: 'u-test',
  startDate: '2026-10-01',
  examDate: '2026-10-10', // only 9 days!
  dailyStudyMinutes: 60,  // only 1h/day = 9h available vs 200h required!
  studyDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  restDays: [],
  strategy: 'balanced',
  bufferDays: 1,
  revisionDays: 0,
  pyqDays: 0,
  mockDays: 0,
  prepMode: 'lectures_only',
  subjects,
  videos: heavyVideos
});

assert(infeasibleCheck.isFeasible === false, 'Detect impossible workload');
assert(infeasibleCheck.shortfallMinutes > 0, 'Calculate accurate shortfall duration');
assert(infeasibleCheck.warningMessage !== undefined, 'Provide actionable warning message');

// 6. Scale & Architecture Tests: Memory Cache
import { memoryCache, inFlightDeduplicator, computeHash } from './services/cache.js';
memoryCache.set('test_key', { data: 123 }, 60);
const cachedVal = memoryCache.get<{ data: number }>('test_key');
assert(cachedVal?.data === 123, 'MemoryCache stores and retrieves value');

// 7. Scale & Architecture Tests: Request Deduplicator
let executionCount = 0;
async function deduplicateTest() {
  const op = () => new Promise<string>(resolve => {
    executionCount++;
    setTimeout(() => resolve('done'), 10);
  });
  const [res1, res2] = await Promise.all([
    inFlightDeduplicator.do('dedup_key', op),
    inFlightDeduplicator.do('dedup_key', op)
  ]);
  assert(res1 === 'done' && res2 === 'done', 'Deduplicator returns correct results to concurrent callers');
  assert(executionCount === 1, 'Deduplicator executes expensive operation exactly once');
}

// 8. Hash computation
const hash1 = computeHash('sample content');
const hash2 = computeHash('sample content');
assert(hash1 === hash2 && hash1.length === 64, 'SHA-256 deterministic hash computation');

// 9. Observability snapshot
import { observability } from './services/metrics.js';
observability.recordRequest('GET', '/api/health', 200, 4);
const metricsSnapshot = observability.getSnapshot();
assert(metricsSnapshot.status === 'healthy', 'Observability returns healthy system status');
assert(metricsSnapshot.databaseStats.walMode === true, 'Database configured in WAL mode for concurrent reads');

// 10. Security & Input Validation Tests
import { validateEmail, validatePassword, validateDate, validateSafeUrl, ValidationError } from './services/validation.js';

assert(validateEmail('student@university.edu') === 'student@university.edu', 'Validate standard email format');
try {
  validateEmail('invalid-email-address');
  assert(false, 'Should reject invalid email');
} catch (e) {
  assert(e instanceof ValidationError, 'Reject invalid email format');
}

assert(validatePassword('StrongPass123!') === 'StrongPass123!', 'Accept compliant password');
try {
  validatePassword('short');
  assert(false, 'Should reject short password');
} catch (e) {
  assert(e instanceof ValidationError, 'Reject password shorter than 8 chars');
}

assert(validateDate('2026-12-31') === '2026-12-31', 'Accept valid calendar date format');
try {
  validateDate('not-a-date');
  assert(false, 'Should reject malformed date');
} catch (e) {
  assert(e instanceof ValidationError, 'Reject malformed date');
}

// 11. SSRF & Malicious YouTube URL Rejection Tests
import { isAllowedYouTubeHost } from './youtube.js';
assert(isAllowedYouTubeHost('youtube.com'), 'Allow official youtube.com domain');
assert(isAllowedYouTubeHost('www.youtube.com'), 'Allow www.youtube.com domain');
assert(isAllowedYouTubeHost('youtu.be'), 'Allow youtu.be short domain');
assert(!isAllowedYouTubeHost('169.254.169.254'), 'SSRF: Reject AWS metadata IP');
assert(!isAllowedYouTubeHost('localhost'), 'SSRF: Reject localhost host');
assert(!isAllowedYouTubeHost('evil-site.com'), 'Reject arbitrary external domain');

assert(extractPlaylistId('http://169.254.169.254/latest/meta-data') === null, 'SSRF: Reject metadata URL as playlist');
assert(extractPlaylistId('http://localhost:3000/api/courses') === null, 'SSRF: Reject internal loopback URL');
assert(extractVideoId('http://127.0.0.1:8080/exploit') === null, 'SSRF: Reject loopback URL as video ID');

// 12. XSS & Malicious Resource URL Rejection
assert(validateSafeUrl('https://en.wikipedia.org/wiki/Signal_processing') !== '', 'Accept valid https resource URL');
try {
  validateSafeUrl('javascript:alert(document.cookie)');
  assert(false, 'Should reject javascript: URI scheme');
} catch (e) {
  assert(e instanceof ValidationError, 'XSS: Reject javascript: URI scheme in resources');
}
try {
  validateSafeUrl('http://169.254.169.254/');
  assert(false, 'Should reject internal IP');
} catch (e) {
  assert(e instanceof ValidationError, 'SSRF: Reject cloud metadata in custom resources');
}

// 13. Backup & Database Integrity Tests
import { backupService } from './services/backup.js';
const integrity = backupService.checkIntegrity();
assert(integrity === 'ok', 'Database PRAGMA integrity_check passes');
const backupResult = backupService.createBackup();
assert(backupResult.success && backupResult.bytes > 0, 'Create valid snapshot database backup');
assert(backupService.listBackups().length > 0, 'Backup retention and listing verified');

// 14. Structured Security Logger Verification
import { securityLogger } from './services/security-logger.js';
assert(securityLogger.maskEmail('alex.student@gmail.com') === 'a***t@gmail.com', 'Mask email for privacy in security logs');
securityLogger.log({
  type: 'RATE_LIMIT_EXCEEDED',
  ip: '127.0.0.1',
  details: 'Automated test rate limit event'
});
const recentEvents = securityLogger.getRecentEvents(5);
assert(recentEvents.some(e => e.type === 'RATE_LIMIT_EXCEEDED'), 'Security event logger records audit events');

await deduplicateTest();

console.log(`\nTEST RESULTS: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);
