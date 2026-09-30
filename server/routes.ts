import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { db, hashPassword, verifyPassword, generateToken, runTransaction } from './db.js';
import { fetchPlaylistData, fetchSingleVideo } from './youtube.js';
import { generateSchedule, checkScheduleFeasibility, formatDate } from './scheduler.js';
import { analyzeVideosWithAI, generateStudyInsights, generateCatchUpAdvice } from './gemini.js';
import { memoryCache, invalidateCourseCache } from './services/cache.js';
import { jobQueue } from './services/jobs.js';
import { authLimiter, heavyOperationLimiter, passwordResetLimiter } from './services/rate-limiter.js';
import { securityLogger } from './services/security-logger.js';
import { 
  validateEmail, 
  validatePassword, 
  validateText, 
  validateOptionalText, 
  validateDate, 
  validateOptionalDate, 
  validateSafeUrl, 
  validateEnum, 
  validateNumber,
  ValidationError 
} from './services/validation.js';

export const router = Router();
export { runTransaction };

// Middleware: Authenticate User via Bearer Token
// Query param token is ONLY accepted for GET /courses/:id/export/csv to prevent session leakage
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined = undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.token && typeof req.query.token === 'string' && req.method === 'GET' && req.path.includes('/export/csv')) {
    token = req.query.token.trim();
  }

  if (!token) {
    securityLogger.log({
      type: 'UNAUTHENTICATED_ACCESS_ATTEMPT',
      ip: req.ip || String(req.socket.remoteAddress),
      details: `${req.method} ${req.originalUrl}`
    });
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const sessionStmt = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
  const session = sessionStmt.get(token) as { user_id: string; expires_at: string } | undefined;

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  const userStmt = db.prepare('SELECT id, email, name, exam_target, daily_hours, study_style, email_verified, last_active_course_id, last_active_subject_id, last_active_video_id, last_active_at FROM users WHERE id = ?');
  const user = userStmt.get(session.user_id);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  (req as any).user = user;
  next();
}

// ----------------------------------------------------
// AUTH ROUTES
// ----------------------------------------------------
router.post('/auth/register', authLimiter, (req: Request, res: Response) => {
  try {
    const { email, password, name, examTarget, dailyHours, studyStyle } = req.body;
    
    // Server-side input validation
    const validEmail = validateEmail(email);
    const validPassword = validatePassword(password, 8, 128);
    const validName = validateText(name, 'Name', 1, 100);

    const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    if (checkStmt.get(validEmail)) {
      securityLogger.log({
        type: 'AUTH_REGISTER_FAILED',
        ip: req.ip || String(req.socket.remoteAddress),
        details: `Account conflict for ${securityLogger.maskEmail(validEmail)}`
      });
      res.status(400).json({ error: 'An account with this email already exists' });
      return;
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(validPassword);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, exam_target, daily_hours, study_style, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      validEmail,
      passwordHash,
      validName,
      validateOptionalText(examTarget, 'Exam Target', 100) || 'Competitive Exam',
      validateNumber(dailyHours || 3, 'Daily Hours', 0.5, 18),
      studyStyle || 'balanced',
      now,
      now
    );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      token,
      userId,
      expiresAt,
      now
    );

    securityLogger.log({
      type: 'AUTH_REGISTER_SUCCESS',
      ip: req.ip || String(req.socket.remoteAddress),
      userId,
      details: `User registered: ${securityLogger.maskEmail(validEmail)}`
    });

    res.json({
      token,
      user: {
        id: userId,
        email: validEmail,
        name: validName,
        examTarget: examTarget || 'Competitive Exam',
        dailyHours: Number(dailyHours) || 3,
        studyStyle: studyStyle || 'balanced'
      }
    });
  } catch (err: any) {
    const isVal = err instanceof ValidationError;
    res.status(isVal ? 400 : 500).json({ error: err.message || 'Registration failed' });
  }
});

// Auth Configuration (e.g. Google Client ID for Google Identity Services)
router.get('/auth/config', (_req: Request, res: Response) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || ''
  });
});

// Google One-Tap / OAuth Credential or Token verification & sync
router.post('/auth/google', authLimiter, async (req: Request, res: Response) => {
  try {
    const { credential, accessToken } = req.body;

    if (!credential && !accessToken) {
      res.status(400).json({ error: 'Google credential or access token is required' });
      return;
    }

    let email = '';
    let name = '';
    let googleSub = '';

    // 1. Cryptographically verify Google ID Token credential (from Google Identity Services)
    if (credential && typeof credential === 'string') {
      const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
      const client = new OAuth2Client(googleClientId || undefined);

      try {
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: googleClientId || undefined,
        });

        const payload = ticket.getPayload();
        if (!payload) {
          res.status(401).json({ error: 'Invalid Google credential token payload' });
          return;
        }

        const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
        if (!payload.iss || !validIssuers.includes(payload.iss)) {
          res.status(401).json({ error: 'Invalid Google token issuer' });
          return;
        }

        if (!payload.sub || !payload.email) {
          res.status(401).json({ error: 'Verified Google token missing required identity claims' });
          return;
        }

        googleSub = payload.sub;
        email = String(payload.email).trim().toLowerCase();
        name = payload.name ? String(payload.name).trim() : (email.split('@')[0]);
      } catch (verifyErr: any) {
        securityLogger.log({
          type: 'AUTH_LOGIN_FAILED',
          ip: req.ip || String(req.socket.remoteAddress),
          details: `Google ID token verification failed: ${verifyErr.message || 'Signature/Audience check failed'}`
        });
        res.status(401).json({ error: 'Google authentication failed. Invalid token.' });
        return;
      }
    }

    // 2. Cryptographically verify Google OAuth Access Token if provided
    if (accessToken && typeof accessToken === 'string' && (!email || !googleSub)) {
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!userInfoRes.ok) {
          res.status(401).json({ error: 'Invalid or expired Google access token' });
          return;
        }
        const userInfo = await userInfoRes.json();
        if (!userInfo.sub || !userInfo.email) {
          res.status(401).json({ error: 'Verified Google userinfo missing identity claims' });
          return;
        }
        googleSub = userInfo.sub;
        email = String(userInfo.email).trim().toLowerCase();
        name = userInfo.name ? String(userInfo.name).trim() : (email.split('@')[0]);
      } catch (fetchErr: any) {
        res.status(401).json({ error: 'Failed to verify Google access token' });
        return;
      }
    }

    if (!email || !googleSub) {
      res.status(401).json({ error: 'Verified Google account email and sub are required' });
      return;
    }

    const now = new Date().toISOString();
    
    // Look up user by Google's permanent unique sub identifier first, then fallback to email
    let user: any = null;
    if (googleSub) {
      user = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(googleSub);
    }
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      // Link google_sub if user was found by email and has a sub
      if (user && googleSub && !user.google_sub) {
        db.prepare('UPDATE users SET google_sub = ?, email_verified = 1, updated_at = ? WHERE id = ?').run(googleSub, now, user.id);
        user.google_sub = googleSub;
      }
    }

    if (!user) {
      const userId = crypto.randomUUID();
      const randomPasswordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
      const displayName = name || email.split('@')[0];

      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, exam_target, daily_hours, study_style, email_verified, google_sub, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        userId,
        email,
        randomPasswordHash,
        displayName,
        'Competitive Exam',
        3,
        'smart_interleaved',
        googleSub || null,
        now,
        now
      );

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      token,
      user.id,
      expiresAt,
      now
    );

    securityLogger.log({
      type: 'AUTH_LOGIN_SUCCESS',
      ip: req.ip || String(req.socket.remoteAddress),
      userId: user.id,
      details: `Google login for ${securityLogger.maskEmail(email)}`
    });

    const userCourses = db.prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY created_at DESC').all(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        examTarget: user.exam_target,
        dailyHours: user.daily_hours,
        studyStyle: user.study_style,
        emailVerified: user.email_verified,
        lastActiveCourseId: user.last_active_course_id,
        lastActiveSubjectId: user.last_active_subject_id,
        lastActiveVideoId: user.last_active_video_id
      },
      courses: userCourses
    });
  } catch (err: any) {
    console.error('Google auth failed:', err);
    res.status(500).json({ error: err.message || 'Google authentication failed' });
  }
});

// Update Last Active State for Cross-Device Continuity
router.post('/auth/active-state', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { courseId, subjectId, videoId } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users 
    SET last_active_course_id = COALESCE(?, last_active_course_id),
        last_active_subject_id = COALESCE(?, last_active_subject_id),
        last_active_video_id = COALESCE(?, last_active_video_id),
        last_active_at = ?
    WHERE id = ?
  `).run(courseId || null, subjectId || null, videoId || null, now, userId);

  res.json({ success: true });
});

router.post('/auth/login', authLimiter, (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const userStmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = userStmt.get(cleanEmail) as any;

    if (!user) {
      securityLogger.log({
        type: 'AUTH_LOGIN_FAILED',
        ip: req.ip || String(req.socket.remoteAddress),
        details: `Account not found for ${securityLogger.maskEmail(cleanEmail)}`
      });
      res.status(401).json({ error: 'No account found with this email. Please check your spelling or sign up.' });
      return;
    }

    if (!verifyPassword(password, user.password_hash)) {
      securityLogger.log({
        type: 'AUTH_LOGIN_FAILED',
        ip: req.ip || String(req.socket.remoteAddress),
        details: `Failed credentials for ${securityLogger.maskEmail(cleanEmail)}`
      });
      res.status(401).json({ error: 'Incorrect password. If you originally signed in with Google, please use "Continue with Google" or click "Forgot password?".' });
      return;
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      token,
      user.id,
      expiresAt,
      now
    );

    securityLogger.log({
      type: 'AUTH_LOGIN_SUCCESS',
      ip: req.ip || String(req.socket.remoteAddress),
      userId: user.id
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        examTarget: user.exam_target,
        dailyHours: user.daily_hours,
        studyStyle: user.study_style
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Request Password Reset
router.post('/auth/forgot-password', passwordResetLimiter, (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail) as { id: string } | undefined;

    if (user) {
      // Invalidate any previous unexpired reset tokens for this user
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour expiration
      const now = new Date().toISOString();

      db.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)').run(
        tokenHash,
        user.id,
        expiresAt,
        now
      );

      securityLogger.log({
        type: 'AUTH_PASSWORD_RESET_REQUEST',
        ip: req.ip || String(req.socket.remoteAddress),
        userId: user.id,
        details: `Reset requested for ${securityLogger.maskEmail(cleanEmail)}`
      });

      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset token has been issued.',
        resetToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined
      });
      return;
    }

    // Return constant success message to prevent user enumeration
    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset token has been issued.'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Complete Password Reset
router.post('/auth/reset-password', passwordResetLimiter, (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Reset token and new password are required' });
      return;
    }

    validatePassword(newPassword, 8, 128);

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const record = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0').get(tokenHash) as any;

    if (!record) {
      res.status(400).json({ error: 'Invalid or already used password reset token' });
      return;
    }

    if (new Date(record.expires_at) < new Date()) {
      db.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
      res.status(400).json({ error: 'Password reset token has expired' });
      return;
    }

    const newPasswordHash = hashPassword(newPassword);
    const now = new Date().toISOString();

    runTransaction(() => {
      // 1. Update user password
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newPasswordHash, now, record.user_id);
      
      // 2. Mark token as used (prevents replay)
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?').run(tokenHash);

      // 3. Security best practice: Invalidate all existing active sessions
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(record.user_id);
    });

    securityLogger.log({
      type: 'AUTH_PASSWORD_RESET_SUCCESS',
      ip: req.ip || String(req.socket.remoteAddress),
      userId: record.user_id
    });

    res.json({ success: true, message: 'Password has been successfully reset. Please log in with your new password.' });
  } catch (err: any) {
    const isVal = err instanceof ValidationError;
    res.status(isVal ? 400 : 500).json({ error: err.message || 'Password reset failed' });
  }
});

// Email Verification: Request token
router.post('/auth/verify-email/request', requireAuth, authLimiter, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO email_verification_tokens (token_hash, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)').run(
      tokenHash,
      user.id,
      expiresAt,
      now
    );

    res.json({
      success: true,
      message: 'Verification token generated',
      verificationToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to request email verification' });
  }
});

// Email Verification: Confirm
router.post('/auth/verify-email', authLimiter, (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const record = db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used = 0').get(tokenHash) as any;

    if (!record || new Date(record.expires_at) < new Date()) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }

    runTransaction(() => {
      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(record.user_id);
      db.prepare('UPDATE email_verification_tokens SET used = 1 WHERE token_hash = ?').run(tokenHash);
    });

    res.json({ success: true, message: 'Email successfully verified' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Quick-start Demo Account with complete seed data
router.post('/auth/demo', async (req: Request, res: Response) => {
  try {
    const demoEmail = 'student@studyflow.app';
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(demoEmail) as any;
    const now = new Date().toISOString();

    if (!user) {
      const userId = crypto.randomUUID();
      const passwordHash = hashPassword('demo123456');
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, exam_target, daily_hours, study_style, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        demoEmail,
        passwordHash,
        'Aryan Sharma',
        'GATE Electrical Engineering 2027',
        3,
        'smart_interleaved',
        now,
        now
      );

      // Seed a comprehensive course
      const courseId = crypto.randomUUID();
      const examDate = new Date();
      examDate.setDate(examDate.getDate() + 120); // 120 days from now
      const targetFinish = new Date();
      targetFinish.setDate(targetFinish.getDate() + 95);

      db.prepare(`
        INSERT INTO courses (id, user_id, title, exam_name, exam_date, target_finish_date, description, schedule_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        courseId,
        userId,
        'GATE EE 2027 Comprehensive Preparation',
        'GATE Electrical Engineering',
        formatDate(examDate),
        formatDate(targetFinish),
        'Complete curriculum covering Network Theory, Control Systems, Signals & Systems with targeted revision and PYQ sessions.',
        now,
        now
      );

      // Seed Subjects
      const sub1Id = crypto.randomUUID();
      const sub2Id = crypto.randomUUID();
      const sub3Id = crypto.randomUUID();

      db.prepare(`INSERT INTO subjects (id, course_id, user_id, name, priority, difficulty, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        sub1Id, courseId, userId, 'Network Theory', 'high', 'medium', '#2563eb', now, now
      );
      db.prepare(`INSERT INTO subjects (id, course_id, user_id, name, priority, difficulty, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        sub2Id, courseId, userId, 'Control Systems', 'high', 'hard', '#7c3aed', now, now
      );
      db.prepare(`INSERT INTO subjects (id, course_id, user_id, name, priority, difficulty, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        sub3Id, courseId, userId, 'Signals & Systems', 'medium', 'medium', '#059669', now, now
      );

      // Import videos from presets
      const playlist1 = await fetchPlaylistData('PL_network_theory_gate');
      const playlist2 = await fetchPlaylistData('PL_control_systems_gate');
      const playlist3 = await fetchPlaylistData('PL_signals_and_systems');

      // Helper to insert videos
      const insertPlaylistVideos = (pData: any, subId: string) => {
        const pId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO playlists (id, course_id, subject_id, user_id, youtube_playlist_id, title, channel_name, video_count, total_duration_seconds, thumbnail_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pId, courseId, subId, userId, pData.playlistId, pData.title, pData.channelName, pData.videoCount, pData.totalDurationSeconds, pData.thumbnailUrl, now);

        pData.videos.forEach((v: any, idx: number) => {
          const vId = crypto.randomUUID();
          // Mark first 3 videos of Network Theory as completed to demonstrate progress & streak!
          const status = (subId === sub1Id && idx < 3) ? 'completed' : 'not_started';
          db.prepare(`
            INSERT INTO videos (id, course_id, subject_id, playlist_id, user_id, youtube_video_id, title, description, duration_seconds, thumbnail_url, channel_name, original_position, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(vId, courseId, subId, pId, userId, v.youtubeVideoId, v.title, v.description, v.durationSeconds, v.thumbnailUrl, v.channelName, v.originalPosition, status, now, now);
        });
      };

      insertPlaylistVideos(playlist1, sub1Id);
      insertPlaylistVideos(playlist2, sub2Id);
      insertPlaylistVideos(playlist3, sub3Id);

      // Seed Preferences
      db.prepare(`
        INSERT INTO study_preferences (id, course_id, user_id, daily_study_minutes, study_days_json, rest_days_json, strategy, buffer_days, revision_days, pyq_days, mock_days, created_at, updated_at)
        VALUES (?, ?, ?, 180, ?, ?, 'smart_interleaved', 5, 10, 5, 3, ?, ?)
      `).run(
        crypto.randomUUID(),
        courseId,
        userId,
        JSON.stringify(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
        JSON.stringify(['sunday']),
        now,
        now
      );

      // Auto-generate initial schedule
      const subjects = [
        { id: sub1Id, name: 'Network Theory', priority: 'high' as const, color: '#2563eb' },
        { id: sub2Id, name: 'Control Systems', priority: 'high' as const, color: '#7c3aed' },
        { id: sub3Id, name: 'Signals & Systems', priority: 'medium' as const, color: '#059669' }
      ];

      const allVideos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any;

      const scheduleRes = generateSchedule({
        courseId,
        userId,
        startDate: formatDate(new Date()),
        examDate: formatDate(examDate),
        dailyStudyMinutes: 180,
        studyDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        restDays: ['sunday'],
        strategy: 'smart_interleaved',
        bufferDays: 5,
        revisionDays: 10,
        pyqDays: 5,
        mockDays: 3,
        prepMode: 'full',
        subjects,
        videos: allVideos
      });

      for (const t of scheduleRes.tasks) {
        db.prepare(`
          INSERT INTO study_tasks (id, course_id, user_id, scheduled_date, task_type, subject_id, video_id, custom_title, planned_duration_seconds, phase, order_index, is_completed, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(
          crypto.randomUUID(),
          courseId,
          userId,
          t.scheduledDate,
          t.taskType,
          t.subjectId || null,
          t.videoId || null,
          t.customTitle,
          t.plannedDurationSeconds,
          t.phase,
          t.orderIndex,
          now,
          now
        );
      }

      // Seed a few past study logs for streak
      const today = new Date();
      for (let i = 1; i <= 5; i++) {
        const past = new Date(today);
        past.setDate(past.getDate() - i);
        db.prepare(`
          INSERT OR REPLACE INTO daily_logs (id, user_id, course_id, log_date, study_seconds, videos_completed, created_at)
          VALUES (?, ?, ?, ?, 10800, 2, ?)
        `).run(crypto.randomUUID(), userId, courseId, formatDate(past), now);
      }

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      token,
      user.id,
      expiresAt,
      now
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        examTarget: user.exam_target,
        dailyHours: user.daily_hours,
        studyStyle: user.study_style
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Demo login failed' });
  }
});

router.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const courses = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM subjects WHERE course_id = c.id) as subject_count,
      (SELECT COUNT(*) FROM videos WHERE course_id = c.id) as video_count,
      (SELECT COUNT(*) FROM videos WHERE course_id = c.id AND status = 'completed') as completed_video_count,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE course_id = c.id) as total_duration_seconds,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE course_id = c.id AND status = 'completed') as completed_duration_seconds
    FROM courses c
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `).all(user.id);

  res.json({ 
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      examTarget: user.exam_target,
      dailyHours: user.daily_hours,
      studyStyle: user.study_style,
      emailVerified: user.email_verified,
      lastActiveCourseId: user.last_active_course_id,
      lastActiveSubjectId: user.last_active_subject_id,
      lastActiveVideoId: user.last_active_video_id,
      lastActiveAt: user.last_active_at
    }, 
    courses 
  });
});

router.post('/auth/logout', requireAuth, (req: Request, res: Response) => {
  const token = req.headers.authorization?.substring(7).trim();
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ success: true });
});

router.post('/auth/update-profile', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, examTarget, dailyHours, studyStyle } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users SET name = ?, exam_target = ?, daily_hours = ?, study_style = ?, updated_at = ? WHERE id = ?
  `).run(
    name || user.name,
    examTarget || user.exam_target,
    Number(dailyHours) || user.daily_hours,
    studyStyle || user.study_style,
    now,
    user.id
  );

  const updated = db.prepare('SELECT id, email, name, exam_target, daily_hours, study_style FROM users WHERE id = ?').get(user.id);
  res.json({ user: updated });
});

// ----------------------------------------------------
// COURSES ROUTES
// ----------------------------------------------------
router.get('/courses', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courses = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM subjects WHERE course_id = c.id) as subject_count,
      (SELECT COUNT(*) FROM videos WHERE course_id = c.id) as video_count,
      (SELECT COUNT(*) FROM videos WHERE course_id = c.id AND status = 'completed') as completed_video_count,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE course_id = c.id) as total_duration_seconds,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE course_id = c.id AND status = 'completed') as completed_duration_seconds
    FROM courses c
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `).all(userId);

  res.json({ courses });
});

router.post('/courses', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { title, examName, examDate, targetFinishDate, description, planningMode, planning_mode, dailyStudyMinutes, studyDays, restDays, strategy } = req.body;

    if (!title || !examDate) {
      res.status(400).json({ error: 'Title and Exam Date are required' });
      return;
    }

    const courseId = crypto.randomUUID();
    const now = new Date().toISOString();
    const selectedPlanningMode = planningMode || planning_mode || 'smart';

    db.prepare(`
      INSERT INTO courses (id, user_id, title, exam_name, exam_date, target_finish_date, description, planning_mode, schedule_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      courseId,
      userId,
      title.trim(),
      (examName || title).trim(),
      examDate,
      targetFinishDate || null,
      description || '',
      selectedPlanningMode,
      now,
      now
    );

    // Initialize Default Study Preferences
    const prefId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO study_preferences (id, course_id, user_id, daily_study_minutes, study_days_json, rest_days_json, strategy, buffer_days, revision_days, pyq_days, mock_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 5, 10, 5, 3, ?, ?)
    `).run(
      prefId,
      courseId,
      userId,
      Number(dailyStudyMinutes) || 180,
      JSON.stringify(studyDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
      JSON.stringify(restDays || ['sunday']),
      strategy || 'smart_interleaved',
      now,
      now
    );

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    res.json({ course });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create course' });
  }
});

router.put('/courses/:id/planning-mode', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { planningMode } = req.body;

    if (!planningMode || !['smart', 'manual', 'hybrid'].includes(planningMode)) {
      res.status(400).json({ error: 'Invalid planning mode. Must be smart, manual, or hybrid' });
      return;
    }

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE courses SET planning_mode = ?, updated_at = ? WHERE id = ?').run(planningMode, now, courseId);

    res.json({ success: true, planningMode });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update planning mode' });
  }
});

router.get('/courses/:id', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const subjects = db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM videos WHERE subject_id = s.id) as video_count,
      (SELECT COUNT(*) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_video_count,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id) as total_duration_seconds,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_duration_seconds
    FROM subjects s
    WHERE s.course_id = ?
    ORDER BY s.created_at ASC
  `).all(courseId);

  const preferences = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;

  res.json({
    course,
    subjects,
    preferences: preferences ? {
      ...preferences,
      studyDays: JSON.parse(preferences.study_days_json || '[]'),
      restDays: JSON.parse(preferences.rest_days_json || '[]')
    } : null
  });
});

router.delete('/courses/:id', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const course = db.prepare('SELECT id, title FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found or access denied' });
    return;
  }

  try {
    runTransaction(() => {
      db.prepare('DELETE FROM study_tasks WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('DELETE FROM videos WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('DELETE FROM playlists WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('DELETE FROM custom_resources WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('DELETE FROM study_preferences WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('DELETE FROM daily_logs WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('DELETE FROM topics WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('DELETE FROM subjects WHERE course_id = ? AND user_id = ?').run(courseId, userId);
      db.prepare('UPDATE users SET last_active_course_id = NULL WHERE id = ? AND last_active_course_id = ?').run(userId, courseId);
      db.prepare('DELETE FROM courses WHERE id = ? AND user_id = ?').run(courseId, userId);
    });

    res.json({ success: true, message: `Course "${course.title}" deleted successfully` });
  } catch (err: any) {
    console.error('Failed to delete course:', err);
    res.status(500).json({ error: 'Failed to delete course and associated records' });
  }
});

// ----------------------------------------------------
// SUBJECTS ROUTES
// ----------------------------------------------------
router.get('/courses/:id/subjects', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const rawSubjects = db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM playlists WHERE subject_id = s.id) as playlist_count,
      (SELECT COUNT(*) FROM videos WHERE subject_id = s.id) as video_count,
      (SELECT COUNT(*) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_video_count,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id) as total_duration_seconds,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_duration_seconds
    FROM subjects s
    WHERE s.course_id = ? AND s.user_id = ?
    ORDER BY s.created_at ASC
  `).all(courseId, userId) as any[];

  const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
  const allVideos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any[];

  const studyDays = prefs ? JSON.parse(prefs.study_days_json) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const restDays = prefs ? JSON.parse(prefs.rest_days_json) : ['sunday'];

  const feasibilityReport = checkScheduleFeasibility({
    courseId,
    userId,
    startDate: formatDate(new Date()),
    examDate: course.exam_date,
    targetFinishDate: course.target_finish_date,
    dailyStudyMinutes: prefs?.daily_study_minutes || 180,
    studyDays,
    restDays,
    strategy: prefs?.strategy || 'smart_interleaved',
    bufferDays: prefs?.buffer_days || 5,
    revisionDays: prefs?.revision_days || 10,
    pyqDays: prefs?.pyq_days || 5,
    mockDays: prefs?.mock_days || 3,
    prepMode: prefs?.prep_mode || 'full',
    subjects: rawSubjects.map(s => ({
      id: s.id,
      name: s.name,
      priority: s.priority,
      color: s.color,
      targetDate: s.target_date
    })),
    videos: allVideos
  });

  const subjectReportMap = new Map<string, any>();
  for (const sr of feasibilityReport.subjectReports) {
    subjectReportMap.set(sr.subjectId, sr);
  }

  const subjects = rawSubjects.map(s => {
    const report = subjectReportMap.get(s.id);
    const remainingDuration = (s.total_duration_seconds || 0) - (s.completed_duration_seconds || 0);
    return {
      ...s,
      remaining_duration_seconds: remainingDuration,
      status: report?.status || 'No Deadline',
      days_remaining: report?.daysRemaining ?? null,
      available_study_days: report?.availableStudyDays ?? null,
      required_daily_minutes: report?.requiredDailyMinutes ?? 0,
      current_pace_minutes: report?.currentPaceMinutes ?? 0,
      has_conflict: report?.hasConflict || false,
      conflict_message: report?.conflictMessage,
      conflict_shortfall_hours: report?.conflictShortfallHours,
      adjustment_options: report?.adjustmentOptions
    };
  });

  res.json({ subjects, feasibility: feasibilityReport });
});

// Single Subject Detail Endpoint
router.get('/courses/:id/subjects/:subjectId', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;
  const subjectId = req.params.subjectId;

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const subject = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM playlists WHERE subject_id = s.id) as playlist_count,
      (SELECT COUNT(*) FROM videos WHERE subject_id = s.id) as video_count,
      (SELECT COUNT(*) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_video_count,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id) as total_duration_seconds,
      (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_duration_seconds
    FROM subjects s
    WHERE s.id = ? AND s.course_id = ? AND s.user_id = ?
  `).get(subjectId, courseId, userId) as any;

  if (!subject) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }

  const playlists = db.prepare('SELECT * FROM playlists WHERE subject_id = ? AND course_id = ? ORDER BY created_at ASC').all(subjectId, courseId);
  const videos = db.prepare(`
    SELECT v.*, 
      (SELECT scheduled_date FROM study_tasks WHERE video_id = v.id ORDER BY scheduled_date ASC LIMIT 1) as scheduled_date,
      (SELECT is_completed FROM study_tasks WHERE video_id = v.id ORDER BY scheduled_date ASC LIMIT 1) as task_is_completed,
      (SELECT is_locked FROM study_tasks WHERE video_id = v.id ORDER BY scheduled_date ASC LIMIT 1) as is_locked,
      (SELECT schedule_source FROM study_tasks WHERE video_id = v.id ORDER BY scheduled_date ASC LIMIT 1) as schedule_source
    FROM videos v
    WHERE v.subject_id = ? AND v.course_id = ?
    ORDER BY v.original_position ASC
  `).all(subjectId, courseId);

  // Compute feasibility & pace stats
  const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
  const studyDays = prefs ? JSON.parse(prefs.study_days_json) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const restDays = prefs ? JSON.parse(prefs.rest_days_json) : ['sunday'];

  const allCourseVideos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any[];

  const feasibilityReport = checkScheduleFeasibility({
    courseId,
    userId,
    startDate: formatDate(new Date()),
    examDate: course.exam_date,
    targetFinishDate: course.target_finish_date,
    dailyStudyMinutes: prefs?.daily_study_minutes || 180,
    studyDays,
    restDays,
    strategy: prefs?.strategy || 'smart_interleaved',
    bufferDays: prefs?.buffer_days || 5,
    revisionDays: prefs?.revision_days || 10,
    pyqDays: prefs?.pyq_days || 5,
    mockDays: prefs?.mock_days || 3,
    prepMode: prefs?.prep_mode || 'full',
    subjects: [{ id: subject.id, name: subject.name, priority: subject.priority, color: subject.color, targetDate: subject.target_date }],
    videos: allCourseVideos
  });

  const subjectReport = feasibilityReport.subjectReports.find(sr => sr.subjectId === subjectId);
  const remainingDuration = (subject.total_duration_seconds || 0) - (subject.completed_duration_seconds || 0);

  const unscheduledVideos = videos.filter((v: any) => !v.scheduled_date && v.status !== 'completed' && v.status !== 'skipped');
  const scheduledVideos = videos.filter((v: any) => v.scheduled_date);

  res.json({
    subject: {
      ...subject,
      remaining_duration_seconds: remainingDuration,
      status: subjectReport?.status || 'No Deadline',
      days_remaining: subjectReport?.daysRemaining ?? null,
      available_study_days: subjectReport?.availableStudyDays ?? null,
      required_daily_minutes: subjectReport?.requiredDailyMinutes ?? 0,
      current_pace_minutes: subjectReport?.currentPaceMinutes ?? 0,
      has_conflict: subjectReport?.hasConflict || false,
      conflict_message: subjectReport?.conflictMessage,
      conflict_shortfall_hours: subjectReport?.conflictShortfallHours,
      adjustment_options: subjectReport?.adjustmentOptions
    },
    playlists,
    videos,
    unscheduledVideos,
    scheduledVideos
  });
});

router.post('/courses/:id/subjects', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;
  const { name, priority, difficulty, color, targetDate, target_date } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Subject name is required' });
    return;
  }

  const course = db.prepare('SELECT id, exam_date FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const subjectId = crypto.randomUUID();
  const now = new Date().toISOString();
  const targetDateVal = targetDate || target_date || null;

  db.prepare(`
    INSERT INTO subjects (id, course_id, user_id, name, priority, difficulty, color, target_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    subjectId,
    courseId,
    userId,
    name.trim(),
    priority || 'medium',
    difficulty || 'medium',
    color || '#3b82f6',
    targetDateVal,
    now,
    now
  );

  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
  res.json({ subject });
});

// Update Subject (Name, Target Deadline, Priority, Color)
router.put('/subjects/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const subjectId = req.params.id;
    const { name, priority, difficulty, color, targetDate, target_date } = req.body;
    const now = new Date().toISOString();

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(subjectId, userId) as any;
    if (!subject) {
      res.status(404).json({ error: 'Subject not found' });
      return;
    }

    const newTargetDate = (targetDate !== undefined ? targetDate : (target_date !== undefined ? target_date : subject.target_date)) || null;

    db.prepare(`
      UPDATE subjects 
      SET name = ?, priority = ?, difficulty = ?, color = ?, target_date = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      name !== undefined ? name.trim() : subject.name,
      priority || subject.priority,
      difficulty || subject.difficulty,
      color || subject.color,
      newTargetDate,
      now,
      subjectId,
      userId
    );

    const updated = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);

    // Calculate deadline change impact
    let deadlineImpactMessage: string | null = null;
    if (subject.target_date !== newTargetDate) {
      if (newTargetDate && subject.target_date) {
        const oldD = new Date(subject.target_date).getTime();
        const newD = new Date(newTargetDate).getTime();
        const diffDays = Math.round((newD - oldD) / (1000 * 60 * 60 * 24));
        deadlineImpactMessage = `Your schedule will change because the subject deadline moved by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} (${diffDays > 0 ? 'later' : 'earlier'}).`;
      } else if (newTargetDate) {
        deadlineImpactMessage = `New deadline set for ${newTargetDate}. The scheduler will allocate study time to meet this target.`;
      } else {
        deadlineImpactMessage = 'Subject deadline removed. The scheduler will distribute this subject evenly.';
      }
    }

    res.json({ 
      success: true, 
      subject: updated,
      deadlineImpactMessage 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update subject' });
  }
});

router.delete('/subjects/:id', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const subjectId = req.params.id;
  const { keepHistorical = true } = req.body || {};

  runTransaction(() => {
    if (keepHistorical) {
      // Delete future uncompleted study tasks only
      db.prepare('DELETE FROM study_tasks WHERE subject_id = ? AND user_id = ? AND is_completed = 0').run(subjectId, userId);
    } else {
      db.prepare('DELETE FROM study_tasks WHERE subject_id = ? AND user_id = ?').run(subjectId, userId);
    }

    // Delete subject
    db.prepare('DELETE FROM subjects WHERE id = ? AND user_id = ?').run(subjectId, userId);
  });

  res.json({ success: true });
});

// ----------------------------------------------------
// YOUTUBE & VIDEO IMPORT ROUTES
// ----------------------------------------------------
async function handlePlaylistPreview(req: Request, res: Response) {
  try {
    const { urlOrId, url } = req.body;
    const target = urlOrId || url;
    if (!target) {
      res.status(400).json({ error: 'Playlist URL or ID is required' });
      return;
    }

    const preview = await fetchPlaylistData(target);
    const videos = preview.videos.map(v => ({
      ...v,
      id: v.youtubeVideoId
    }));

    const responsePayload = {
      ...preview,
      videos,
      preview: {
        ...preview,
        videos
      }
    };

    res.json(responsePayload);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to preview playlist' });
  }
}

router.post('/youtube/preview', requireAuth, handlePlaylistPreview);
router.post('/youtube/playlist/preview', requireAuth, handlePlaylistPreview);

// Import Playlist for Course / Subject
router.post('/courses/:id/playlists/import', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { subjectId, playlistId, title, description, videos } = req.body;

    if (!subjectId || !Array.isArray(videos)) {
      res.status(400).json({ error: 'Invalid import payload: subjectId and videos array required' });
      return;
    }

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: courseId,
        resourceType: 'course'
      });
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND course_id = ? AND user_id = ?').get(subjectId, courseId, userId);
    if (!subject) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: subjectId,
        resourceType: 'subject'
      });
      res.status(404).json({ error: 'Subject not found in this course' });
      return;
    }

    const now = new Date().toISOString();
    const dbPlaylistId = crypto.randomUUID();

    // Existing videos in course
    const existingVideoStmt = db.prepare('SELECT youtube_video_id FROM videos WHERE course_id = ?');
    const existingRows = existingVideoStmt.all(courseId) as { youtube_video_id: string }[];
    const existingSet = new Set(existingRows.map(r => r.youtube_video_id));

    const totalSecs = videos.reduce((acc: number, v: any) => acc + (v.durationSeconds || 0), 0);
    const { resourceType = 'Main Lectures' } = req.body;

    const result = runTransaction(() => {
      db.prepare(`
        INSERT INTO playlists (id, course_id, subject_id, user_id, youtube_playlist_id, title, channel_name, resource_type, video_count, total_duration_seconds, thumbnail_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        dbPlaylistId,
        courseId,
        subjectId,
        userId,
        playlistId || 'custom_pl',
        title || 'Imported Playlist',
        videos[0]?.channelName || '',
        resourceType,
        videos.length,
        totalSecs,
        videos[0]?.thumbnailUrl || '',
        now
      );

      let importedCount = 0;
      let duplicateCount = 0;

      const insertVideoStmt = db.prepare(`
        INSERT INTO videos (id, course_id, subject_id, playlist_id, user_id, youtube_video_id, title, description, duration_seconds, thumbnail_url, channel_name, original_position, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?)
      `);

      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const yId = v.youtubeVideoId || v.id;
        if (existingSet.has(yId)) {
          duplicateCount++;
          continue;
        }

        const vidId = crypto.randomUUID();
        insertVideoStmt.run(
          vidId,
          courseId,
          subjectId,
          dbPlaylistId,
          userId,
          yId,
          v.title || `Video ${i + 1}`,
          v.description || description || '',
          v.durationSeconds || 1800,
          v.thumbnailUrl || '',
          v.channelName || '',
          v.originalPosition || (i + 1),
          now,
          now
        );
        existingSet.add(yId);
        importedCount++;
      }

      return { importedCount, duplicateCount };
    });

    res.json({
      success: true,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      totalVideosInPlaylist: videos.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

router.post('/youtube/import', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { courseId, subjectId, playlistData, selectedVideoIds } = req.body;

    if (!courseId || !subjectId || !playlistData || !Array.isArray(playlistData.videos)) {
      res.status(400).json({ error: 'Invalid import payload' });
      return;
    }

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: courseId,
        resourceType: 'course'
      });
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND course_id = ? AND user_id = ?').get(subjectId, courseId, userId);
    if (!subject) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: subjectId,
        resourceType: 'subject'
      });
      res.status(404).json({ error: 'Subject not found in this course' });
      return;
    }

    const now = new Date().toISOString();
    const playlistId = crypto.randomUUID();

    // Check for duplicate video IDs in this course
    const existingVideoStmt = db.prepare('SELECT youtube_video_id FROM videos WHERE course_id = ?');
    const existingRows = existingVideoStmt.all(courseId) as { youtube_video_id: string }[];
    const existingSet = new Set(existingRows.map(r => r.youtube_video_id));

    // Filter videos based on selection
    const videosToImport = playlistData.videos.filter((v: any) => {
      const yId = v.youtubeVideoId || v.id;
      if (selectedVideoIds && Array.isArray(selectedVideoIds)) {
        return selectedVideoIds.includes(yId);
      }
      return true;
    });

    const totalSecs = videosToImport.reduce((acc: number, v: any) => acc + (v.durationSeconds || 0), 0);
    const { resourceType = 'Main Lectures' } = req.body;

    const result = runTransaction(() => {
      db.prepare(`
        INSERT INTO playlists (id, course_id, subject_id, user_id, youtube_playlist_id, title, channel_name, resource_type, video_count, total_duration_seconds, thumbnail_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        playlistId,
        courseId,
        subjectId,
        userId,
        playlistData.playlistId || 'custom_pl',
        playlistData.title,
        playlistData.channelName || '',
        resourceType,
        videosToImport.length,
        totalSecs,
        playlistData.thumbnailUrl || '',
        now
      );

      let importedCount = 0;
      let duplicateCount = 0;

      const insertVideoStmt = db.prepare(`
        INSERT INTO videos (id, course_id, subject_id, playlist_id, user_id, youtube_video_id, title, description, duration_seconds, thumbnail_url, channel_name, original_position, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?)
      `);

      for (const v of videosToImport) {
        const yId = v.youtubeVideoId || v.id;
        if (existingSet.has(yId)) {
          duplicateCount++;
          continue;
        }

        const vidId = crypto.randomUUID();
        insertVideoStmt.run(
          vidId,
          courseId,
          subjectId,
          playlistId,
          userId,
          yId,
          v.title,
          v.description || '',
          v.durationSeconds || 1800,
          v.thumbnailUrl || '',
          v.channelName || '',
          v.originalPosition || (importedCount + 1),
          now,
          now
        );
        existingSet.add(yId);
        importedCount++;
      }

      return { importedCount, duplicateCount };
    });
    res.json({
      success: true,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      totalVideosInPlaylist: videosToImport.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// List playlists for a course (with subject context)
router.get('/courses/:id/playlists', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;

    const playlists = db.prepare(`
      SELECT p.*, s.name as subject_name, s.color as subject_color,
        (SELECT COUNT(*) FROM videos WHERE playlist_id = p.id) as actual_video_count,
        (SELECT COUNT(*) FROM videos WHERE playlist_id = p.id AND status = 'completed') as completed_video_count,
        (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE playlist_id = p.id) as actual_duration_seconds
      FROM playlists p
      LEFT JOIN subjects s ON p.subject_id = s.id
      WHERE p.course_id = ? AND p.user_id = ?
      ORDER BY p.created_at ASC
    `).all(courseId, userId);

    res.json({ playlists });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list playlists' });
  }
});

// Delete a playlist
router.delete('/playlists/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const playlistId = req.params.id;

    const playlist = db.prepare('SELECT id, course_id FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId) as any;
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    runTransaction(() => {
      // Remove scheduled tasks for this playlist's videos
      db.prepare(`
        DELETE FROM study_tasks 
        WHERE video_id IN (SELECT id FROM videos WHERE playlist_id = ?)
      `).run(playlistId);

      // Remove videos
      db.prepare('DELETE FROM videos WHERE playlist_id = ? AND user_id = ?').run(playlistId, userId);

      // Remove playlist
      db.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?').run(playlistId, userId);
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete playlist' });
  }
});

// Replace a playlist
router.post('/playlists/:id/replace', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const playlistId = req.params.id;
    const { newPlaylistUrl, handlingOption = 'replace_unfinished', resourceType } = req.body;

    if (!newPlaylistUrl) {
      res.status(400).json({ error: 'New playlist URL is required' });
      return;
    }

    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId) as any;
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    // Fetch new playlist metadata and videos
    const newPlaylistData = await fetchPlaylistData(newPlaylistUrl);
    const now = new Date().toISOString();

    runTransaction(() => {
      if (handlingOption === 'remove_all') {
        // Delete all tasks and videos of old playlist
        db.prepare('DELETE FROM study_tasks WHERE video_id IN (SELECT id FROM videos WHERE playlist_id = ?)').run(playlistId);
        db.prepare('DELETE FROM videos WHERE playlist_id = ?').run(playlistId);
      } else if (handlingOption === 'replace_unfinished') {
        // Keep completed videos, remove unfinished ones
        db.prepare(`
          DELETE FROM study_tasks 
          WHERE video_id IN (SELECT id FROM videos WHERE playlist_id = ? AND status != 'completed')
        `).run(playlistId);
        db.prepare("DELETE FROM videos WHERE playlist_id = ? AND status != 'completed'").run(playlistId);
      }

      // Check existing video IDs in course to prevent duplicates
      const existingVideos = db.prepare('SELECT youtube_video_id FROM videos WHERE course_id = ?').all(playlist.course_id) as { youtube_video_id: string }[];
      const existingSet = new Set(existingVideos.map(r => r.youtube_video_id));

      const insertVideoStmt = db.prepare(`
        INSERT INTO videos (id, course_id, subject_id, playlist_id, user_id, youtube_video_id, title, description, duration_seconds, thumbnail_url, channel_name, original_position, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?)
      `);

      let addedCount = 0;
      for (let i = 0; i < newPlaylistData.videos.length; i++) {
        const v = newPlaylistData.videos[i];
        if (existingSet.has(v.youtubeVideoId)) continue;

        insertVideoStmt.run(
          crypto.randomUUID(),
          playlist.course_id,
          playlist.subject_id,
          playlistId,
          userId,
          v.youtubeVideoId,
          v.title,
          v.description || '',
          v.durationSeconds || 1800,
          v.thumbnailUrl || '',
          v.channelName || newPlaylistData.channelName || '',
          i + 1,
          now,
          now
        );
        existingSet.add(v.youtubeVideoId);
        addedCount++;
      }

      // Update playlist header info
      const totalSecs = db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as s, COUNT(*) as c FROM videos WHERE playlist_id = ?').get(playlistId) as any;

      db.prepare(`
        UPDATE playlists 
        SET youtube_playlist_id = ?, title = ?, channel_name = ?, resource_type = COALESCE(?, resource_type), video_count = ?, total_duration_seconds = ?, thumbnail_url = ?
        WHERE id = ?
      `).run(
        newPlaylistData.playlistId,
        newPlaylistData.title,
        newPlaylistData.channelName,
        resourceType || null,
        totalSecs?.c || newPlaylistData.videoCount,
        totalSecs?.s || newPlaylistData.totalDurationSeconds,
        newPlaylistData.thumbnailUrl,
        playlistId
      );
    });

    const updated = db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId);
    res.json({ success: true, playlist: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to replace playlist' });
  }
});

// Refresh Playlist to check for added/removed videos
router.post('/playlists/:id/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const playlistId = req.params.id;

    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId) as any;
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const remoteData = await fetchPlaylistData(playlist.youtube_playlist_id);
    const existingVideos = db.prepare('SELECT youtube_video_id, title FROM videos WHERE playlist_id = ?').all(playlistId) as any[];
    const existingSet = new Set(existingVideos.map(v => v.youtube_video_id));
    const remoteSet = new Set(remoteData.videos.map(v => v.youtubeVideoId));

    const newVideos = remoteData.videos.filter(v => !existingSet.has(v.youtubeVideoId));
    const removedVideos = existingVideos.filter(v => !remoteSet.has(v.youtube_video_id));

    res.json({
      playlistId,
      playlistTitle: playlist.title,
      newVideos,
      newVideosCount: newVideos.length,
      removedVideos,
      removedVideosCount: removedVideos.length,
      totalRemoteVideos: remoteData.videos.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to refresh playlist' });
  }
});

// Apply refreshed new videos to playlist
router.post('/playlists/:id/refresh/apply', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const playlistId = req.params.id;
    const { videosToAdd } = req.body;

    if (!Array.isArray(videosToAdd) || videosToAdd.length === 0) {
      res.status(400).json({ error: 'videosToAdd array is required' });
      return;
    }

    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId) as any;
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const now = new Date().toISOString();
    let addedCount = 0;

    runTransaction(() => {
      const existing = db.prepare('SELECT youtube_video_id FROM videos WHERE course_id = ?').all(playlist.course_id) as any[];
      const existingSet = new Set(existing.map(e => e.youtube_video_id));

      const insertStmt = db.prepare(`
        INSERT INTO videos (id, course_id, subject_id, playlist_id, user_id, youtube_video_id, title, description, duration_seconds, thumbnail_url, channel_name, original_position, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?)
      `);

      for (let i = 0; i < videosToAdd.length; i++) {
        const v = videosToAdd[i];
        if (existingSet.has(v.youtubeVideoId)) continue;

        insertStmt.run(
          crypto.randomUUID(),
          playlist.course_id,
          playlist.subject_id,
          playlistId,
          userId,
          v.youtubeVideoId,
          v.title,
          v.description || '',
          v.durationSeconds || 1800,
          v.thumbnailUrl || '',
          v.channelName || playlist.channel_name || '',
          playlist.video_count + i + 1,
          now,
          now
        );
        existingSet.add(v.youtubeVideoId);
        addedCount++;
      }

      // Update count & duration
      const stats = db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as s, COUNT(*) as c FROM videos WHERE playlist_id = ?').get(playlistId) as any;
      db.prepare('UPDATE playlists SET video_count = ?, total_duration_seconds = ? WHERE id = ?').run(stats.c, stats.s, playlistId);
    });

    res.json({ success: true, addedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to apply refresh' });
  }
});

// Add individual video
router.post('/videos/add-single', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { courseId, subjectId, urlOrId, contentType = 'Lecture' } = req.body;

    if (!courseId || !subjectId || !urlOrId) {
      res.status(400).json({ error: 'courseId, subjectId, and URL are required' });
      return;
    }

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: courseId,
        resourceType: 'course'
      });
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND course_id = ? AND user_id = ?').get(subjectId, courseId, userId);
    if (!subject) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: subjectId,
        resourceType: 'subject'
      });
      res.status(404).json({ error: 'Subject not found in this course' });
      return;
    }

    const videoData = await fetchSingleVideo(urlOrId);
    const existing = db.prepare('SELECT id FROM videos WHERE course_id = ? AND youtube_video_id = ?').get(courseId, videoData.youtubeVideoId);
    if (existing) {
      res.status(400).json({ error: 'This video already exists in this course.' });
      return;
    }

    const now = new Date().toISOString();
    const vidId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO videos (id, course_id, subject_id, user_id, youtube_video_id, title, description, duration_seconds, thumbnail_url, channel_name, original_position, content_type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 999, ?, 'not_started', ?, ?)
    `).run(
      vidId,
      courseId,
      subjectId,
      userId,
      videoData.youtubeVideoId,
      videoData.title,
      videoData.description,
      videoData.durationSeconds,
      videoData.thumbnailUrl,
      videoData.channelName,
      contentType,
      now,
      now
    );

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(vidId);
    res.json({ video });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add video' });
  }
});

// List videos in course
router.get('/courses/:id/videos', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;
  const { subjectId, status, search } = req.query;

  let query = 'SELECT v.*, s.name as subject_name, s.color as subject_color FROM videos v LEFT JOIN subjects s ON v.subject_id = s.id WHERE v.course_id = ? AND v.user_id = ?';
  const params: any[] = [courseId, userId];

  if (subjectId) {
    query += ' AND v.subject_id = ?';
    params.push(subjectId);
  }
  if (status) {
    query += ' AND v.status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND (v.title LIKE ? OR v.channel_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY v.subject_id ASC, v.original_position ASC';

  const videos = db.prepare(query).all(...params);
  res.json({ videos });
});

// Update video status (completed, in_progress, not_started, skipped)
router.put('/videos/:id/status', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const videoId = req.params.id;
  const { status } = req.body;
  const now = new Date().toISOString();

  const video = db.prepare('SELECT * FROM videos WHERE id = ? AND user_id = ?').get(videoId, userId) as any;
  if (!video) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  db.prepare('UPDATE videos SET status = ?, updated_at = ? WHERE id = ?').run(status, now, videoId);

  // Synchronize with any study_tasks for this video
  const isCompleted = status === 'completed' ? 1 : 0;
  db.prepare('UPDATE study_tasks SET is_completed = ?, completed_at = ? WHERE video_id = ?').run(
    isCompleted,
    isCompleted ? now : null,
    videoId
  );

  // Record into daily_logs if completed
  if (isCompleted) {
    const todayStr = formatDate(new Date());
    db.prepare(`
      INSERT INTO daily_logs (id, user_id, course_id, log_date, study_seconds, videos_completed, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(user_id, course_id, log_date) DO UPDATE SET
        study_seconds = study_seconds + excluded.study_seconds,
        videos_completed = videos_completed + 1
    `).run(crypto.randomUUID(), userId, video.course_id, todayStr, video.duration_seconds, now);
  }

  res.json({ success: true, status });
});

// ----------------------------------------------------
// SCHEDULER & PREFERENCES ROUTES
// ----------------------------------------------------
router.get('/courses/:id/preferences', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
  if (!prefs) {
    res.json({ preferences: null });
    return;
  }

  const preferences = {
    ...prefs,
    dailyStudyMinutes: prefs.daily_study_minutes,
    studyDays: JSON.parse(prefs.study_days_json || '[]'),
    restDays: JSON.parse(prefs.rest_days_json || '[]'),
    difficultyLevel: prefs.difficulty_level,
    revisionMode: prefs.revision_mode,
    prepMode: prefs.prep_mode,
    bufferDays: prefs.buffer_days,
    revisionDays: prefs.revision_days,
    pyqDays: prefs.pyq_days,
    mockDays: prefs.mock_days
  };

  res.json({ preferences });
});

function handleSavePreferences(req: Request, res: Response) {
  const userId = (req as any).user.id;
  const courseId = req.params.id;
  const { 
    dailyStudyMinutes, daily_study_minutes, 
    studyDays, restDays, strategy, difficultyLevel, 
    revisionMode, prepMode, 
    bufferDays, buffer_days, 
    revisionDays, revision_days, 
    pyqDays, pyq_days, 
    mockDays, mock_days,
    examDate
  } = req.body;
  const now = new Date().toISOString();

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  if (examDate) {
    db.prepare('UPDATE courses SET exam_date = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(examDate, now, courseId, userId);
    course.exam_date = examDate;
  }

  const minutes = Number(dailyStudyMinutes || daily_study_minutes) || 180;
  const sDays = studyDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const rDays = restDays || ['sunday'];
  const strat = strategy || 'smart_interleaved';
  const diffLevel = difficultyLevel || 'normal';
  const revMode = revisionMode || 'full';
  const pMode = prepMode || 'full';
  const bDays = Number(bufferDays ?? buffer_days) ?? 5;
  const revDays = Number(revisionDays ?? revision_days) ?? 10;
  const pDays = Number(pyqDays ?? pyq_days) ?? 5;
  const mDays = Number(mockDays ?? mock_days) ?? 3;

  db.prepare(`
    INSERT INTO study_preferences (id, course_id, user_id, daily_study_minutes, study_days_json, rest_days_json, strategy, difficulty_level, revision_mode, prep_mode, buffer_days, revision_days, pyq_days, mock_days, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(course_id) DO UPDATE SET
      daily_study_minutes = excluded.daily_study_minutes,
      study_days_json = excluded.study_days_json,
      rest_days_json = excluded.rest_days_json,
      strategy = excluded.strategy,
      difficulty_level = excluded.difficulty_level,
      revision_mode = excluded.revision_mode,
      prep_mode = excluded.prep_mode,
      buffer_days = excluded.buffer_days,
      revision_days = excluded.revision_days,
      pyq_days = excluded.pyq_days,
      mock_days = excluded.mock_days,
      updated_at = excluded.updated_at
  `).run(
    crypto.randomUUID(),
    courseId,
    userId,
    minutes,
    JSON.stringify(sDays),
    JSON.stringify(rDays),
    strat,
    diffLevel,
    revMode,
    pMode,
    bDays,
    revDays,
    pDays,
    mDays,
    now,
    now
  );

  const subjects = db.prepare('SELECT id, name, priority, color FROM subjects WHERE course_id = ?').all(courseId) as any;
  const videos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any;

  const feasibility = checkScheduleFeasibility({
    courseId,
    userId,
    startDate: formatDate(new Date()),
    examDate: course.exam_date,
    targetFinishDate: course.target_finish_date,
    dailyStudyMinutes: minutes,
    studyDays: sDays,
    restDays: rDays,
    strategy: strat,
    bufferDays: bDays,
    revisionDays: revDays,
    pyqDays: pDays,
    mockDays: mDays,
    prepMode: pMode,
    subjects,
    videos
  });

  res.json({ success: true, feasibility });
}

router.post('/courses/:id/preferences', requireAuth, handleSavePreferences);
router.put('/courses/:id/preferences', requireAuth, handleSavePreferences);

router.post('/courses/:id/schedule/feasibility', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
  const subjects = db.prepare('SELECT id, name, priority, color FROM subjects WHERE course_id = ?').all(courseId) as any;
  const videos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any;

  const studyDays = prefs ? JSON.parse(prefs.study_days_json) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const restDays = prefs ? JSON.parse(prefs.rest_days_json) : ['sunday'];

  const report = checkScheduleFeasibility({
    courseId,
    userId,
    startDate: formatDate(new Date()),
    examDate: course.exam_date,
    targetFinishDate: course.target_finish_date,
    dailyStudyMinutes: prefs?.daily_study_minutes || 180,
    studyDays,
    restDays,
    strategy: prefs?.strategy || 'smart_interleaved',
    bufferDays: prefs?.buffer_days || 5,
    revisionDays: prefs?.revision_days || 10,
    pyqDays: prefs?.pyq_days || 5,
    mockDays: prefs?.mock_days || 3,
    prepMode: prefs?.prep_mode || 'full',
    subjects,
    videos
  });

  res.json({ feasibility: report });
});

router.post('/courses/:id/schedule/generate', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { preserveCompleted = true } = req.body;

    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const planningMode = course.planning_mode || 'smart';

    // In FULL MANUAL MODE, the application does not auto-assign videos to dates
    if (planningMode === 'manual') {
      res.json({
        success: true,
        message: 'Manual scheduling mode active. Tasks are placed and controlled manually by you.',
        planningMode: 'manual'
      });
      return;
    }

    const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
    const subjects = db.prepare('SELECT id, name, priority, color, target_date as targetDate FROM subjects WHERE course_id = ?').all(courseId) as any;
    const videos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any;

    if (videos.length === 0) {
      res.status(400).json({ error: 'Please import videos before generating a schedule' });
      return;
    }

    const studyDays = prefs ? JSON.parse(prefs.study_days_json) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const restDays = prefs ? JSON.parse(prefs.rest_days_json) : ['sunday'];

    // Query locked tasks and manual tasks to preserve
    const existingLockedTasks = db.prepare(`
      SELECT id, scheduled_date as scheduledDate, task_type as taskType, subject_id as subjectId, video_id as videoId, 
             custom_title as customTitle, planned_duration_seconds as plannedDurationSeconds, 
             phase, order_index as orderIndex, schedule_source as scheduleSource, is_locked as isLocked, task_category as taskCategory
      FROM study_tasks
      WHERE course_id = ? AND user_id = ? AND (is_locked = 1 OR schedule_source = 'manual' OR is_completed = 1)
    `).all(courseId, userId) as any[];

    const { tasks, feasibility } = generateSchedule({
      courseId,
      userId,
      startDate: formatDate(new Date()),
      examDate: course.exam_date,
      targetFinishDate: course.target_finish_date,
      planningMode,
      dailyStudyMinutes: prefs?.daily_study_minutes || 180,
      studyDays,
      restDays,
      strategy: prefs?.strategy || 'smart_interleaved',
      bufferDays: prefs?.buffer_days || 5,
      revisionDays: prefs?.revision_days || 10,
      pyqDays: prefs?.pyq_days || 5,
      mockDays: prefs?.mock_days || 3,
      prepMode: prefs?.prep_mode || 'full',
      subjects,
      videos,
      lockedTasks: existingLockedTasks
    });

    const now = new Date().toISOString();

    runTransaction(() => {
      // Delete unlocked, uncompleted automatic tasks ONLY
      // This guarantees locked tasks, manual tasks, and completed tasks remain strictly untouched!
      db.prepare(`
        DELETE FROM study_tasks 
        WHERE course_id = ? AND user_id = ? AND is_completed = 0 AND is_locked = 0 AND schedule_source != 'manual'
      `).run(courseId, userId);

      // Identify already preserved task IDs
      const preservedIds = new Set(existingLockedTasks.map(t => t.id).filter(Boolean));

      // Insert newly generated tasks
      const insertTaskStmt = db.prepare(`
        INSERT INTO study_tasks (
          id, course_id, user_id, scheduled_date, task_type, subject_id, video_id, 
          custom_title, planned_duration_seconds, phase, order_index, is_completed, 
          schedule_source, is_locked, task_category, schedule_explanation, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `);

      for (const t of tasks) {
        if (t.id && preservedIds.has(t.id)) {
          // Already preserved in database
          continue;
        }

        insertTaskStmt.run(
          crypto.randomUUID(),
          courseId,
          userId,
          t.scheduledDate,
          t.taskType,
          t.subjectId || null,
          t.videoId || null,
          t.customTitle,
          t.plannedDurationSeconds,
          t.phase,
          t.orderIndex,
          t.scheduleSource || (planningMode === 'hybrid' ? 'hybrid' : 'automatic'),
          t.isLocked ? 1 : 0,
          t.taskCategory || 'Watch Lecture',
          t.scheduleExplanation || null,
          now,
          now
        );
      }

      // Bump schedule version
      db.prepare('UPDATE courses SET schedule_version = schedule_version + 1, updated_at = ? WHERE id = ? AND user_id = ?').run(now, courseId, userId);
    });

    invalidateCourseCache(userId, courseId);

    res.json({
      success: true,
      tasksCount: tasks.length,
      feasibility
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Schedule generation failed' });
  }
});

// Create Manual Study Task (Full Manual / Hybrid Mode)
router.post('/courses/:id/tasks/manual', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { 
      customTitle, 
      subjectId, 
      videoId, 
      scheduledDate, 
      startTime, 
      durationMinutes, 
      taskCategory,
      taskType = 'custom',
      isLocked = 0
    } = req.body;

    const cleanDate = validateDate(scheduledDate, 'Scheduled Date');

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: courseId,
        resourceType: 'course'
      });
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    if (subjectId) {
      const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND course_id = ? AND user_id = ?').get(subjectId, courseId, userId);
      if (!subject) {
        securityLogger.log({
          type: 'AUTHORIZATION_DENIED_IDOR',
          ip: req.ip || '',
          userId,
          resourceId: subjectId,
          resourceType: 'subject'
        });
        res.status(404).json({ error: 'Subject not found in this course' });
        return;
      }
    }

    let title = customTitle ? customTitle.trim() : '';
    let durationSeconds = Number(durationMinutes || 0) * 60;

    if (videoId) {
      const video = db.prepare('SELECT title, duration_seconds, subject_id FROM videos WHERE id = ? AND course_id = ? AND user_id = ?').get(videoId, courseId, userId) as any;
      if (!video) {
        securityLogger.log({
          type: 'AUTHORIZATION_DENIED_IDOR',
          ip: req.ip || '',
          userId,
          resourceId: videoId,
          resourceType: 'video'
        });
        res.status(404).json({ error: 'Video not found in this course' });
        return;
      }
      if (!title) title = video.title;
      if (!durationSeconds) durationSeconds = video.duration_seconds || 1800;
    }

    if (!title) {
      title = 'Study Session';
    }

    if (durationSeconds <= 0) {
      durationSeconds = 2700; // default 45 min
    }

    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    const maxOrder = (db.prepare('SELECT COALESCE(MAX(order_index), 0) as m FROM study_tasks WHERE course_id = ? AND user_id = ? AND scheduled_date = ?').get(courseId, userId, cleanDate) as any).m;

    db.prepare(`
      INSERT INTO study_tasks (
        id, course_id, user_id, scheduled_date, task_type, subject_id, video_id,
        custom_title, planned_duration_seconds, phase, order_index, is_completed,
        schedule_source, is_locked, start_time, task_category, status, schedule_explanation, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'learning', ?, 0, 'manual', ?, ?, ?, 'pending', 'Manually created by user', ?, ?)
    `).run(
      taskId,
      courseId,
      userId,
      cleanDate,
      videoId ? 'video' : (taskType || 'custom'),
      subjectId || null,
      videoId || null,
      title,
      durationSeconds,
      maxOrder + 1,
      isLocked ? 1 : 0,
      startTime || null,
      taskCategory || 'Watch Lecture',
      now,
      now
    );

    const task = db.prepare(`
      SELECT t.*, s.name as subject_name, s.color as subject_color, v.youtube_video_id, v.thumbnail_url
      FROM study_tasks t
      LEFT JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN videos v ON t.video_id = v.id
      WHERE t.id = ?
    `).get(taskId);

    res.json({ success: true, task });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create task' });
  }
});

// Schedule a Specific Video onto a Date (Manual Video Scheduling)
router.post('/courses/:id/videos/:videoId/schedule', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const videoId = req.params.videoId;
    const { scheduledDate, startTime } = req.body;

    if (!scheduledDate) {
      res.status(400).json({ error: 'Date is required to schedule video' });
      return;
    }

    const video = db.prepare('SELECT * FROM videos WHERE id = ? AND course_id = ? AND user_id = ?').get(videoId, courseId, userId) as any;
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    const maxOrder = (db.prepare('SELECT COALESCE(MAX(order_index), 0) as m FROM study_tasks WHERE course_id = ? AND scheduled_date = ?').get(courseId, scheduledDate) as any).m;

    db.prepare(`
      INSERT INTO study_tasks (
        id, course_id, user_id, scheduled_date, task_type, subject_id, video_id,
        custom_title, planned_duration_seconds, phase, order_index, is_completed,
        schedule_source, is_locked, start_time, task_category, status, schedule_explanation, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'video', ?, ?, ?, ?, 'learning', ?, 0, 'manual', 0, ?, 'Watch Lecture', 'pending', 'Manually scheduled by user', ?, ?)
    `).run(
      taskId,
      courseId,
      userId,
      scheduledDate,
      video.subject_id,
      video.id,
      video.title,
      video.duration_seconds || 1800,
      maxOrder + 1,
      startTime || null,
      now,
      now
    );

    const task = db.prepare(`
      SELECT t.*, s.name as subject_name, s.color as subject_color, v.youtube_video_id, v.thumbnail_url
      FROM study_tasks t
      LEFT JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN videos v ON t.video_id = v.id
      WHERE t.id = ?
    `).get(taskId);

    res.json({ success: true, task });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to schedule video' });
  }
});

// Toggle Task Lock (Hybrid / Smart Mode: Locked tasks do not move during regeneration)
router.put('/tasks/:id/lock', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const taskId = req.params.id;
    const now = new Date().toISOString();

    const task = db.prepare('SELECT * FROM study_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as any;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const newLockState = task.is_locked === 1 ? 0 : 1;
    db.prepare('UPDATE study_tasks SET is_locked = ?, updated_at = ? WHERE id = ?').run(newLockState, now, taskId);

    invalidateCourseCache(userId, task.course_id);

    res.json({ success: true, isLocked: newLockState === 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle lock' });
  }
});

// Reschedule Task to a new Date (Desktop Drag-and-Drop or Mobile Move dialog)
router.put('/tasks/:id/reschedule', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const taskId = req.params.id;
    const { newDate, startTime } = req.body;
    const now = new Date().toISOString();

    if (!newDate) {
      res.status(400).json({ error: 'New scheduled date is required' });
      return;
    }

    const task = db.prepare('SELECT * FROM study_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as any;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const maxOrder = (db.prepare('SELECT COALESCE(MAX(order_index), 0) as m FROM study_tasks WHERE course_id = ? AND scheduled_date = ?').get(task.course_id, newDate) as any).m;

    db.prepare(`
      UPDATE study_tasks 
      SET scheduled_date = ?, order_index = ?, start_time = COALESCE(?, start_time), schedule_source = 'rescheduled', updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(newDate, maxOrder + 1, startTime || null, now, taskId, userId);

    invalidateCourseCache(userId, task.course_id);

    res.json({ success: true, newDate });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reschedule task' });
  }
});

// Missed Task Handling (Reschedule to date, Mark Skipped, Keep as missed)
router.put('/tasks/:id/missed-action', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const taskId = req.params.id;
    const { action, newDate } = req.body;
    const now = new Date().toISOString();

    const task = db.prepare('SELECT * FROM study_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as any;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (action === 'reschedule') {
      if (!newDate) {
        res.status(400).json({ error: 'New date required for reschedule' });
        return;
      }
      db.prepare(`
        UPDATE study_tasks 
        SET scheduled_date = ?, status = 'pending', schedule_source = 'rescheduled', updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(newDate, now, taskId, userId);
    } else if (action === 'skip') {
      db.prepare(`
        UPDATE study_tasks 
        SET status = 'skipped', is_completed = 0, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(now, taskId, userId);

      if (task.video_id) {
        db.prepare("UPDATE videos SET status = 'skipped', updated_at = ? WHERE id = ?").run(now, task.video_id);
      }
    } else if (action === 'keep') {
      db.prepare(`
        UPDATE study_tasks 
        SET status = 'missed', updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(now, taskId, userId);
    } else {
      res.status(400).json({ error: 'Invalid missed action' });
      return;
    }

    invalidateCourseCache(userId, task.course_id);

    res.json({ success: true, action });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to process missed task action' });
  }
});

// Unscheduled Videos Section Endpoint (Grouped by Subject)
router.get('/courses/:id/unscheduled', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;

    const subjects = db.prepare('SELECT id, name, color, priority, target_date FROM subjects WHERE course_id = ? AND user_id = ? ORDER BY name ASC').all(courseId, userId) as any[];

    // Videos with no pending or scheduled study task
    const unscheduledVideos = db.prepare(`
      SELECT v.*, p.title as playlist_title, s.name as subject_name, s.color as subject_color
      FROM videos v
      LEFT JOIN playlists p ON v.playlist_id = p.id
      LEFT JOIN subjects s ON v.subject_id = s.id
      WHERE v.course_id = ? AND v.user_id = ? AND v.status != 'completed' AND v.status != 'skipped'
        AND v.id NOT IN (SELECT video_id FROM study_tasks WHERE course_id = ? AND user_id = ? AND video_id IS NOT NULL AND status != 'skipped')
      ORDER BY v.original_position ASC
    `).all(courseId, userId, courseId, userId) as any[];

    const grouped = subjects.map(s => {
      const subjectVids = unscheduledVideos.filter(v => v.subject_id === s.id);
      const totalSeconds = subjectVids.reduce((acc, v) => acc + (v.duration_seconds || 0), 0);
      return {
        subject: s,
        videos: subjectVids,
        count: subjectVids.length,
        totalSeconds
      };
    });

    res.json({
      totalUnscheduledCount: unscheduledVideos.length,
      grouped
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch unscheduled videos' });
  }
});

// Upcoming Deadlines Dashboard
router.get('/courses/:id/deadlines', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { sortBy = 'deadline' } = req.query;

    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const subjects = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM videos WHERE subject_id = s.id) as video_count,
        (SELECT COUNT(*) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_video_count,
        (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id) as total_duration_seconds,
        (SELECT COALESCE(SUM(duration_seconds), 0) FROM videos WHERE subject_id = s.id AND status = 'completed') as completed_duration_seconds
      FROM subjects s
      WHERE s.course_id = ? AND s.user_id = ?
    `).all(courseId, userId) as any[];

    const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
    const allVideos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any[];

    const studyDays = prefs ? JSON.parse(prefs.study_days_json) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const restDays = prefs ? JSON.parse(prefs.rest_days_json) : ['sunday'];

    const report = checkScheduleFeasibility({
      courseId,
      userId,
      startDate: formatDate(new Date()),
      examDate: course.exam_date,
      targetFinishDate: course.target_finish_date,
      dailyStudyMinutes: prefs?.daily_study_minutes || 180,
      studyDays,
      restDays,
      strategy: prefs?.strategy || 'smart_interleaved',
      bufferDays: prefs?.buffer_days || 5,
      revisionDays: prefs?.revision_days || 10,
      pyqDays: prefs?.pyq_days || 5,
      mockDays: prefs?.mock_days || 3,
      prepMode: prefs?.prep_mode || 'full',
      subjects: subjects.map(s => ({
        id: s.id,
        name: s.name,
        priority: s.priority,
        color: s.color,
        targetDate: s.target_date
      })),
      videos: allVideos
    });

    const reportMap = new Map<string, any>();
    for (const sr of report.subjectReports) {
      reportMap.set(sr.subjectId, sr);
    }

    let deadlineList = subjects.map(s => {
      const sr = reportMap.get(s.id);
      const remainingSec = (s.total_duration_seconds || 0) - (s.completed_duration_seconds || 0);
      const progressPct = s.total_duration_seconds > 0 ? Math.round((s.completed_duration_seconds / s.total_duration_seconds) * 100) : 0;
      return {
        ...s,
        target_date: s.target_date || null,
        days_remaining: sr?.daysRemaining ?? null,
        remaining_duration_seconds: remainingSec,
        progressPct,
        status: sr?.status || 'No Deadline',
        required_daily_minutes: sr?.requiredDailyMinutes || 0,
        current_pace_minutes: sr?.currentPaceMinutes || 0,
        has_conflict: sr?.hasConflict || false,
        conflict_message: sr?.conflictMessage,
        conflict_shortfall_hours: sr?.conflictShortfallHours
      };
    });

    // Sorting
    if (sortBy === 'deadline') {
      deadlineList.sort((a, b) => {
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return a.target_date.localeCompare(b.target_date);
      });
    } else if (sortBy === 'progress') {
      deadlineList.sort((a, b) => b.progressPct - a.progressPct);
    } else if (sortBy === 'workload') {
      deadlineList.sort((a, b) => b.remaining_duration_seconds - a.remaining_duration_seconds);
    } else if (sortBy === 'priority') {
      const weight: Record<string, number> = { high: 3, medium: 2, low: 1 };
      deadlineList.sort((a, b) => (weight[b.priority] || 2) - (weight[a.priority] || 2));
    }

    res.json({
      upcomingDeadlines: deadlineList,
      conflicts: report.deadlineConflicts,
      overallFeasible: report.isFeasible
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load deadline dashboard' });
  }
});

// Toggle Task Completion
router.put('/tasks/:id/toggle', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const taskId = req.params.id;
  const now = new Date().toISOString();

  const task = db.prepare('SELECT * FROM study_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as any;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const newStatus = task.is_completed === 1 ? 0 : 1;
  const taskStatus = newStatus === 1 ? 'completed' : 'pending';

  db.prepare('UPDATE study_tasks SET is_completed = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    newStatus,
    taskStatus,
    newStatus === 1 ? now : null,
    now,
    taskId,
    userId
  );

  // If task has video_id, sync video status
  if (task.video_id) {
    const videoStatus = newStatus === 1 ? 'completed' : 'not_started';
    db.prepare('UPDATE videos SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(videoStatus, now, task.video_id, userId);

    // Record study log
    const todayStr = formatDate(new Date());
    if (newStatus === 1) {
      db.prepare(`
        INSERT INTO daily_logs (id, user_id, course_id, log_date, study_seconds, videos_completed, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(user_id, course_id, log_date) DO UPDATE SET
          study_seconds = study_seconds + excluded.study_seconds,
          videos_completed = videos_completed + 1
      `).run(crypto.randomUUID(), userId, task.course_id, todayStr, task.planned_duration_seconds, now);
    }
  }

  invalidateCourseCache(userId, task.course_id);

  res.json({ success: true, isCompleted: newStatus === 1 });
});

// ----------------------------------------------------
// DASHBOARD & TODAY'S GOAL
// ----------------------------------------------------
router.get('/courses/:id/dashboard', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const todayStr = formatDate(new Date());

    const cacheKey = `user:${userId}:course:${courseId}:dashboard`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    // Today's tasks
    const todayTasks = db.prepare(`
      SELECT t.*, s.name as subject_name, s.color as subject_color, v.youtube_video_id, v.thumbnail_url, v.channel_name
      FROM study_tasks t
      LEFT JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN videos v ON t.video_id = v.id
      WHERE t.course_id = ? AND t.user_id = ? AND t.scheduled_date = ?
      ORDER BY t.order_index ASC
    `).all(courseId, userId, todayStr) as any[];

    // Missed tasks (scheduled in the past, uncompleted, not skipped)
    const missedTasks = db.prepare(`
      SELECT t.*, s.name as subject_name, s.color as subject_color, v.youtube_video_id, v.thumbnail_url
      FROM study_tasks t
      LEFT JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN videos v ON t.video_id = v.id
      WHERE t.course_id = ? AND t.user_id = ? AND t.scheduled_date < ? AND t.is_completed = 0 AND (t.status IS NULL OR t.status != 'skipped')
      ORDER BY t.scheduled_date DESC
      LIMIT 10
    `).all(courseId, userId, todayStr) as any[];

    // Compute Today's Metrics
    const todayPlannedSec = todayTasks.reduce((acc, t) => acc + t.planned_duration_seconds, 0);
    const todayCompletedSec = todayTasks.filter(t => t.is_completed === 1).reduce((acc, t) => acc + t.planned_duration_seconds, 0);
    const todayProgressPct = todayPlannedSec > 0 ? Math.round((todayCompletedSec / todayPlannedSec) * 100) : 0;

    // Next unfinished task
    const nextTask = todayTasks.find(t => t.is_completed === 0) || db.prepare(`
      SELECT t.*, s.name as subject_name, s.color as subject_color, v.youtube_video_id, v.thumbnail_url, v.channel_name
      FROM study_tasks t
      LEFT JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN videos v ON t.video_id = v.id
      WHERE t.course_id = ? AND t.user_id = ? AND t.is_completed = 0 AND t.scheduled_date >= ?
      ORDER BY t.scheduled_date ASC, t.order_index ASC
      LIMIT 1
    `).get(courseId, userId, todayStr);

    // Overall Course Stats
    const totalVideoDuration = (db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as s FROM videos WHERE course_id = ? AND user_id = ?').get(courseId, userId) as any).s;
    const completedVideoDuration = (db.prepare("SELECT COALESCE(SUM(duration_seconds), 0) as s FROM videos WHERE course_id = ? AND user_id = ? AND status = 'completed'").get(courseId, userId) as any).s;
    const overallPercentage = totalVideoDuration > 0 ? Math.round((completedVideoDuration / totalVideoDuration) * 100) : 0;

    // Days left until exam
    const examDate = new Date(course.exam_date);
    const diffTime = examDate.getTime() - new Date().getTime();
    const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Optimized Single-Pass Grouped Subject Calculation
    const rawSubjects = db.prepare(`
      SELECT s.*, 
        COUNT(v.id) as video_count,
        COUNT(CASE WHEN v.status = 'completed' THEN 1 END) as completed_video_count,
        COALESCE(SUM(v.duration_seconds), 0) as total_duration_seconds,
        COALESCE(SUM(CASE WHEN v.status = 'completed' THEN v.duration_seconds ELSE 0 END), 0) as completed_duration_seconds
      FROM subjects s
      LEFT JOIN videos v ON s.id = v.subject_id
      WHERE s.course_id = ? AND s.user_id = ?
      GROUP BY s.id
      ORDER BY s.created_at ASC
    `).all(courseId, userId) as any[];

    const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;
    const allVideos = db.prepare('SELECT id, subject_id as subjectId, title, duration_seconds as durationSeconds, original_position as originalPosition, status FROM videos WHERE course_id = ?').all(courseId) as any[];

    const studyDays = prefs ? JSON.parse(prefs.study_days_json) : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const restDays = prefs ? JSON.parse(prefs.rest_days_json) : ['sunday'];

    const feasibilityReport = checkScheduleFeasibility({
      courseId,
      userId,
      startDate: todayStr,
      examDate: course.exam_date,
      targetFinishDate: course.target_finish_date,
      dailyStudyMinutes: prefs?.daily_study_minutes || 180,
      studyDays,
      restDays,
      strategy: prefs?.strategy || 'smart_interleaved',
      bufferDays: prefs?.buffer_days || 5,
      revisionDays: prefs?.revision_days || 10,
      pyqDays: prefs?.pyq_days || 5,
      mockDays: prefs?.mock_days || 3,
      prepMode: prefs?.prep_mode || 'full',
      subjects: rawSubjects.map(s => ({ id: s.id, name: s.name, priority: s.priority, color: s.color, targetDate: s.target_date })),
      videos: allVideos
    });

    const reportMap = new Map<string, any>();
    for (const sr of feasibilityReport.subjectReports) {
      reportMap.set(sr.subjectId, sr);
    }

    const upcomingSubjectDeadlines = rawSubjects.map(s => {
      const sr = reportMap.get(s.id);
      const remainingSec = (s.total_duration_seconds || 0) - (s.completed_duration_seconds || 0);
      const progressPct = s.total_duration_seconds > 0 ? Math.round((s.completed_duration_seconds / s.total_duration_seconds) * 100) : 0;
      return {
        ...s,
        days_remaining: sr?.daysRemaining ?? null,
        remaining_duration_seconds: remainingSec,
        progressPct,
        status: sr?.status || 'No Deadline',
        required_daily_minutes: sr?.requiredDailyMinutes || 0,
        current_pace_minutes: sr?.currentPaceMinutes || 0,
        has_conflict: sr?.hasConflict || false,
        conflict_message: sr?.conflictMessage,
        conflict_shortfall_hours: sr?.conflictShortfallHours
      };
    }).sort((a, b) => {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return a.target_date.localeCompare(b.target_date);
    });

    // Calculate Streak
    const logs = db.prepare('SELECT log_date, study_seconds FROM daily_logs WHERE user_id = ? AND course_id = ? ORDER BY log_date DESC LIMIT 30').all(userId, courseId) as any[];
    let streak = 0;
    
    // If today has study logged, count today, otherwise start from yesterday
    const todayLog = logs.find(l => l.log_date === todayStr && l.study_seconds >= 3600);
    if (todayLog) streak++;

    for (let i = 1; i <= 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = formatDate(d);
      const found = logs.find(l => l.log_date === dStr && l.study_seconds >= 3600);
      if (found) streak++;
      else break;
    }

    // Calculate Ahead / Behind
    const expectedTaskSec = (db.prepare('SELECT COALESCE(SUM(planned_duration_seconds), 0) as s FROM study_tasks WHERE course_id = ? AND user_id = ? AND scheduled_date <= ?').get(courseId, userId, todayStr) as any).s;
    const actualCompletedSec = (db.prepare('SELECT COALESCE(SUM(planned_duration_seconds), 0) as s FROM study_tasks WHERE course_id = ? AND user_id = ? AND scheduled_date <= ? AND is_completed = 1').get(courseId, userId, todayStr) as any).s;
    
    let aheadBehindText = 'On schedule';
    let diffSec = actualCompletedSec - expectedTaskSec;
    if (diffSec > 1800) {
      aheadBehindText = `${Math.round(diffSec / 3600 * 10) / 10}h ahead of schedule`;
    } else if (diffSec < -1800) {
      aheadBehindText = `${Math.round(Math.abs(diffSec) / 3600 * 10) / 10}h behind schedule`;
    }

    const result = {
      course,
      planningMode: course.planning_mode || 'smart',
      todayStr,
      daysLeft,
      todayTasks,
      missedTasks,
      todayPlannedSec,
      todayCompletedSec,
      todayProgressPct,
      nextTask,
      overallPercentage,
      totalVideoDuration,
      completedVideoDuration,
      streak,
      aheadBehindText,
      upcomingSubjectDeadlines,
      deadlineConflicts: feasibilityReport.deadlineConflicts
    };

    // Cache in memory for 30 seconds
    memoryCache.set(cacheKey, result, 30);

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: err.message || 'Failed to load dashboard' });
  }
});

// Calendar View endpoint
router.get('/courses/:id/calendar', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const tasks = db.prepare(`
    SELECT t.*, s.name as subject_name, s.color as subject_color,
      v.youtube_video_id,
      v.thumbnail_url,
      v.channel_name
    FROM study_tasks t
    LEFT JOIN subjects s ON t.subject_id = s.id
    LEFT JOIN videos v ON t.video_id = v.id
    WHERE t.course_id = ? AND t.user_id = ?
    ORDER BY t.scheduled_date ASC, t.order_index ASC
  `).all(courseId, userId) as any[];

  // Group by date
  const dateMap: Record<string, any> = {};
  for (const t of tasks) {
    if (!dateMap[t.scheduled_date]) {
      dateMap[t.scheduled_date] = {
        date: t.scheduled_date,
        totalPlannedSeconds: 0,
        completedSeconds: 0,
        tasks: [],
        subjects: new Set<string>()
      };
    }
    dateMap[t.scheduled_date].totalPlannedSeconds += t.planned_duration_seconds;
    if (t.is_completed === 1) {
      dateMap[t.scheduled_date].completedSeconds += t.planned_duration_seconds;
    }
    dateMap[t.scheduled_date].tasks.push(t);
    if (t.subject_name) {
      dateMap[t.scheduled_date].subjects.add(t.subject_name);
    }
  }

  const days = Object.values(dateMap).map(d => ({
    ...d,
    subjects: Array.from(d.subjects),
    completionRate: d.totalPlannedSeconds > 0 ? Math.round((d.completedSeconds / d.totalPlannedSeconds) * 100) : 0
  }));

  res.json({ days });
});

// Analytics & Review endpoint
router.get('/courses/:id/analytics', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  // Past 14 days study logs
  const logs = db.prepare(`
    SELECT log_date, study_seconds, videos_completed 
    FROM daily_logs 
    WHERE user_id = ? AND course_id = ?
    ORDER BY log_date DESC LIMIT 14
  `).all(userId, courseId) as any[];

  // Subject distribution
  const subjects = db.prepare(`
    SELECT s.name, s.color,
      COALESCE(SUM(v.duration_seconds), 0) as totalDuration,
      COALESCE(SUM(CASE WHEN v.status = 'completed' THEN v.duration_seconds ELSE 0 END), 0) as completedDuration
    FROM subjects s
    LEFT JOIN videos v ON s.id = v.subject_id
    WHERE s.course_id = ? AND s.user_id = ?
    GROUP BY s.id
  `).all(courseId, userId) as any[];

  // Total completed & required seconds
  const totalVideoDuration = (db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as s FROM videos WHERE course_id = ? AND user_id = ?').get(courseId, userId) as any).s;
  const completedVideoDuration = (db.prepare("SELECT COALESCE(SUM(duration_seconds), 0) as s FROM videos WHERE course_id = ? AND user_id = ? AND status = 'completed'").get(courseId, userId) as any).s;
  const completionRate = totalVideoDuration > 0 ? Math.round((completedVideoDuration / totalVideoDuration) * 100) : 0;

  // Completed tasks count
  const completedTasksCount = (db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE course_id = ? AND user_id = ? AND is_completed = 1').get(courseId, userId) as any).c;

  // Last 14 days planned vs completed for charts (Single Aggregated Query)
  const recentDays: Array<{ date: string; plannedSeconds: number; completedSeconds: number }> = [];
  const logMap = new Map<string, number>();
  for (const l of logs) {
    logMap.set(l.log_date, l.study_seconds);
  }

  const dStart = new Date();
  dStart.setDate(dStart.getDate() - 14);
  const startDateStr = formatDate(dStart);

  const aggregatedTasks = db.prepare(`
    SELECT scheduled_date, 
           COALESCE(SUM(planned_duration_seconds), 0) as planned,
           COALESCE(SUM(CASE WHEN is_completed = 1 THEN planned_duration_seconds ELSE 0 END), 0) as task_completed
    FROM study_tasks
    WHERE course_id = ? AND user_id = ? AND scheduled_date >= ?
    GROUP BY scheduled_date
  `).all(courseId, userId, startDateStr) as any[];

  const taskMap = new Map<string, { planned: number; taskCompleted: number }>();
  for (const row of aggregatedTasks) {
    taskMap.set(row.scheduled_date, {
      planned: row.planned,
      taskCompleted: row.task_completed,
    });
  }

  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);

    const taskData = taskMap.get(dateStr) || { planned: 0, taskCompleted: 0 };
    const logSeconds = logMap.get(dateStr) || 0;
    const completedSec = Math.max(taskData.taskCompleted, logSeconds);

    recentDays.push({
      date: dateStr,
      plannedSeconds: taskData.planned,
      completedSeconds: completedSec
    });
  }

  // Active streak
  const todayStr = formatDate(new Date());
  let streak = 0;
  const todayLog = logs.find(l => l.log_date === todayStr && l.study_seconds >= 1800);
  if (todayLog) streak++;

  for (let i = 1; i <= 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = formatDate(d);
    const found = logs.find(l => l.log_date === dStr && l.study_seconds >= 1800);
    if (found) streak++;
    else break;
  }

  // Projected finish date
  const lastTask = db.prepare('SELECT scheduled_date FROM study_tasks WHERE course_id = ? AND user_id = ? ORDER BY scheduled_date DESC LIMIT 1').get(courseId, userId) as any;
  const projectedFinishDate = lastTask?.scheduled_date || course.exam_date;

  res.json({
    recentDays,
    subjectBreakdown: subjects,
    totalCompletedSeconds: completedVideoDuration,
    totalRequiredSeconds: totalVideoDuration,
    completionRate,
    completedTasksCount,
    streak,
    projectedFinishDate,
    logs,
    subjects
  });
});

// AI Study Insights (supports both GET and POST)
async function handleStudyInsights(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;

    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const totalDuration = (db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as s FROM videos WHERE course_id = ? AND user_id = ?').get(courseId, userId) as any).s;
    const completedDuration = (db.prepare("SELECT COALESCE(SUM(duration_seconds), 0) as s FROM videos WHERE course_id = ? AND user_id = ? AND status = 'completed'").get(courseId, userId) as any).s;

    const daysRemaining = Math.max(1, Math.ceil((new Date(course.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const totalPlannedHours = totalDuration / 3600;
    const completedHours = completedDuration / 3600;
    const completionPercentage = totalDuration > 0 ? Math.round((completedDuration / totalDuration) * 100) : 0;

    const prefs = db.prepare('SELECT daily_study_minutes FROM study_preferences WHERE course_id = ?').get(courseId) as any;
    const currentPaceHours = (prefs?.daily_study_minutes || 180) / 60;
    const remainingHours = Math.max(0, totalPlannedHours - completedHours);
    const requiredPaceHours = remainingHours / Math.max(1, daysRemaining * 0.85);

    const logs = db.prepare('SELECT log_date, study_seconds FROM daily_logs WHERE user_id = ? AND course_id = ? ORDER BY log_date DESC LIMIT 30').all(userId, courseId) as any[];
    let streak = 0;
    const todayStr = formatDate(new Date());
    if (logs.find(l => l.log_date === todayStr && l.study_seconds >= 1800)) streak++;
    for (let i = 1; i <= 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = formatDate(d);
      if (logs.find(l => l.log_date === dStr && l.study_seconds >= 1800)) streak++;
      else break;
    }

    const insights = await generateStudyInsights({
      courseName: course.title,
      examName: course.exam_name,
      daysRemaining,
      totalPlannedHours,
      completedHours,
      completionPercentage,
      currentPaceHoursPerDay: currentPaceHours,
      requiredPaceHoursPerDay: requiredPaceHours,
      streakDays: streak,
      statusText: currentPaceHours >= requiredPaceHours ? 'On Track' : 'Slightly Behind'
    });

    res.json({ insights });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate insights' });
  }
}

router.get('/courses/:id/ai/insights', requireAuth, handleStudyInsights);
router.post('/courses/:id/ai/study-insights', requireAuth, handleStudyInsights);

// AI Video Classification & Syllabus Mapping (supports subject-specific or all course videos)
async function handleClassifyTopics(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { subjectId } = req.body || {};

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    let videosToClassify: any[] = [];
    let subjectName = 'General Course Syllabus';

    if (subjectId) {
      const subject = db.prepare('SELECT * FROM subjects WHERE id = ? AND course_id = ? AND user_id = ?').get(subjectId, courseId, userId) as any;
      if (!subject) {
        res.status(404).json({ error: 'Subject not found' });
        return;
      }
      subjectName = subject.name;
      videosToClassify = db.prepare('SELECT id, title, description FROM videos WHERE subject_id = ? AND course_id = ? AND user_id = ?').all(subjectId, courseId, userId) as any[];
    } else {
      videosToClassify = db.prepare('SELECT id, title, description FROM videos WHERE course_id = ? AND user_id = ? LIMIT 60').all(courseId, userId) as any[];
    }

    if (videosToClassify.length === 0) {
      res.json({ success: true, classifiedVideosCount: 0, classifications: [] });
      return;
    }

    const classifications = await analyzeVideosWithAI(subjectName, videosToClassify);

    // Update database records
    const updateStmt = db.prepare('UPDATE videos SET content_type = ?, difficulty = ? WHERE id = ? AND user_id = ?');
    for (const c of classifications) {
      updateStmt.run(c.contentType || 'Lecture', c.difficulty || 'normal', c.videoId, userId);
    }

    res.json({ 
      success: true, 
      classifiedVideosCount: classifications.length, 
      classifications 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI Classification failed' });
  }
}

router.post('/courses/:id/ai/classify-videos', requireAuth, handleClassifyTopics);
router.post('/courses/:id/ai/classify-topics', requireAuth, handleClassifyTopics);

// Catch-Up Recovery Plan Advice
router.post('/courses/:id/ai/catchup-advice', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { missedMinutes } = req.body;

    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId) as any;
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const prefs = db.prepare('SELECT * FROM study_preferences WHERE course_id = ?').get(courseId) as any;

    const daysRemaining = Math.max(1, Math.ceil((new Date(course.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    const advice = await generateCatchUpAdvice({
      missedMinutes: Number(missedMinutes) || 120,
      remainingDays: daysRemaining,
      availableDailyMinutes: prefs?.daily_study_minutes || 180,
      courseName: course.title
    });

    res.json({ advice });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Catch-up advice failed' });
  }
});

// Custom Resources
router.get('/courses/:id/resources', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;
  const resources = db.prepare(`
    SELECT r.*, s.name as subject_name 
    FROM custom_resources r 
    LEFT JOIN subjects s ON r.subject_id = s.id 
    WHERE r.course_id = ? AND r.user_id = ? 
    ORDER BY r.created_at DESC
  `).all(courseId, userId);
  res.json({ resources });
});

router.post('/courses/:id/resources', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const courseId = req.params.id;
    const { title, subjectId, resourceType, url, notes } = req.body;

    const cleanTitle = validateText(title, 'Title', 1, 200);
    const cleanUrl = validateSafeUrl(url, 'Resource URL');

    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      securityLogger.log({
        type: 'AUTHORIZATION_DENIED_IDOR',
        ip: req.ip || '',
        userId,
        resourceId: courseId,
        resourceType: 'course'
      });
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    if (subjectId) {
      const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND course_id = ? AND user_id = ?').get(subjectId, courseId, userId);
      if (!subject) {
        securityLogger.log({
          type: 'AUTHORIZATION_DENIED_IDOR',
          ip: req.ip || '',
          userId,
          resourceId: subjectId,
          resourceType: 'subject'
        });
        res.status(404).json({ error: 'Subject not found in this course' });
        return;
      }
    }

    const resId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO custom_resources (id, course_id, subject_id, user_id, title, resource_type, url, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resId, 
      courseId, 
      subjectId || null, 
      userId, 
      cleanTitle, 
      resourceType || 'link', 
      cleanUrl, 
      validateOptionalText(notes, 'Notes', 1000), 
      now
    );

    res.json({ success: true, resourceId: resId });
  } catch (err: any) {
    const isVal = err instanceof ValidationError;
    res.status(isVal ? 400 : 500).json({ error: err.message || 'Failed to add resource' });
  }
});

router.delete('/resources/:id', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = db.prepare('DELETE FROM custom_resources WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Resource not found or unauthorized' });
    return;
  }
  res.json({ success: true });
});

// Export Schedule to CSV
router.get('/courses/:id/export/csv', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const courseId = req.params.id;

  const tasks = db.prepare(`
    SELECT t.scheduled_date, t.task_type, t.custom_title, t.planned_duration_seconds, t.is_completed, s.name as subject_name
    FROM study_tasks t
    LEFT JOIN subjects s ON t.subject_id = s.id
    WHERE t.course_id = ? AND t.user_id = ?
    ORDER BY t.scheduled_date ASC, t.order_index ASC
  `).all(courseId, userId) as any[];

  let csv = 'Date,Subject,Task Type,Title,Planned Minutes,Status\n';
  for (const t of tasks) {
    const minutes = Math.round(t.planned_duration_seconds / 60);
    const status = t.is_completed ? 'Completed' : 'Pending';
    const cleanTitle = `"${(t.custom_title || '').replace(/"/g, '""')}"`;
    const cleanSubject = `"${(t.subject_name || 'General').replace(/"/g, '""')}"`;
    csv += `${t.scheduled_date},${cleanSubject},${t.task_type},${cleanTitle},${minutes},${status}\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="studyflow-schedule-${courseId}.csv"`);
  res.send(csv);
});

// ----------------------------------------------------
// ASYNCHRONOUS BACKGROUND JOBS (Scale 10,000+ Concurrent)
// ----------------------------------------------------
router.post('/jobs', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { courseId, jobType, payload } = req.body;

    if (!jobType || !['import_playlist', 'generate_schedule', 'classify_videos'].includes(jobType)) {
      res.status(400).json({ error: 'Invalid jobType. Supported types: import_playlist, generate_schedule, classify_videos' });
      return;
    }

    if (courseId) {
      const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(courseId, userId);
      if (!course) {
        securityLogger.log({
          type: 'AUTHORIZATION_DENIED_IDOR',
          ip: req.ip || '',
          userId,
          resourceId: courseId,
          resourceType: 'course'
        });
        res.status(404).json({ error: 'Course not found or unauthorized' });
        return;
      }
    }

    const jobId = jobQueue.createJob(userId, courseId || null, jobType, payload || {});
    res.json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Job submitted to background queue'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to enqueue job' });
  }
});

router.get('/jobs/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const job = jobQueue.getJob(req.params.id, userId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      id: job.id,
      jobType: job.job_type,
      status: job.status,
      progress: job.progress,
      result: job.result_json ? JSON.parse(job.result_json) : null,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve job' });
  }
});

router.get('/jobs', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const jobs = jobQueue.listJobs(userId).map(j => ({
      id: j.id,
      jobType: j.job_type,
      courseId: j.course_id,
      status: j.status,
      progress: j.progress,
      result: j.result_json ? JSON.parse(j.result_json) : null,
      errorMessage: j.error_message,
      createdAt: j.created_at,
      updatedAt: j.updated_at
    }));
    res.json({ jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list jobs' });
  }
});

// 404 for unhandled API routes
router.use((req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl || req.path}` });
});

// Global API error handler
router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
