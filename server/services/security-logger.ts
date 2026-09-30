// Structured Security Event Logger
// Logs security events without leaking credentials, tokens, or sensitive PII

export type SecurityEventType = 
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_REGISTER_SUCCESS'
  | 'AUTH_REGISTER_FAILED'
  | 'AUTH_PASSWORD_RESET_REQUEST'
  | 'AUTH_PASSWORD_RESET_SUCCESS'
  | 'AUTH_PASSWORD_RESET_FAILED'
  | 'AUTHORIZATION_DENIED_IDOR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SUSPICIOUS_URL_REJECTED'
  | 'MALFORMED_INPUT_REJECTED'
  | 'UNAUTHENTICATED_ACCESS_ATTEMPT';

export interface SecurityEvent {
  type: SecurityEventType;
  ip: string;
  userId?: string;
  resourceId?: string;
  resourceType?: string;
  details?: string;
  timestamp: string;
}

class SecurityLogger {
  private recentEvents: SecurityEvent[] = [];
  private readonly maxEvents = 200;

  // Mask email for privacy (e.g., "j***e@domain.com")
  maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `*@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  log(event: Omit<SecurityEvent, 'timestamp'>): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    // Keep bounded in-memory buffer
    this.recentEvents.push(fullEvent);
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.shift();
    }

    // Console output for cloud monitoring
    const prefix = `[SECURITY][${fullEvent.type}]`;
    const userStr = fullEvent.userId ? ` user=${fullEvent.userId}` : '';
    const resStr = fullEvent.resourceId ? ` resource=${fullEvent.resourceType || 'res'}:${fullEvent.resourceId}` : '';
    const detailsStr = fullEvent.details ? ` - ${fullEvent.details}` : '';
    
    if (fullEvent.type.includes('DENIED') || fullEvent.type.includes('REJECTED') || fullEvent.type.includes('EXCEEDED')) {
      console.warn(`${prefix} ip=${fullEvent.ip}${userStr}${resStr}${detailsStr}`);
    } else {
      console.info(`${prefix} ip=${fullEvent.ip}${userStr}${resStr}${detailsStr}`);
    }
  }

  getRecentEvents(limit: number = 50): SecurityEvent[] {
    return this.recentEvents.slice(-limit);
  }
}

export const securityLogger = new SecurityLogger();
