// Centralized Input Validation and Sanitization Service

export class ValidationError extends Error {
  public field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

// RFC 5322 compliant simplified email regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Standard ISO Date format (YYYY-MM-DD)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Safe UUID regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateEmail(email: unknown): string {
  if (typeof email !== 'string' || !email.trim()) {
    throw new ValidationError('email', 'Email address is required');
  }
  const clean = email.trim().toLowerCase();
  if (clean.length > 254) {
    throw new ValidationError('email', 'Email address exceeds maximum length of 254 characters');
  }
  if (!EMAIL_REGEX.test(clean)) {
    throw new ValidationError('email', 'Please provide a valid email address');
  }
  return clean;
}

export function validatePassword(password: unknown, minLength = 8, maxLength = 128): string {
  if (typeof password !== 'string') {
    throw new ValidationError('password', 'Password is required');
  }
  if (password.length < minLength) {
    throw new ValidationError('password', `Password must be at least ${minLength} characters in length`);
  }
  if (password.length > maxLength) {
    throw new ValidationError('password', `Password must not exceed ${maxLength} characters in length`);
  }
  return password;
}

export function validateText(val: unknown, fieldName: string, minLength = 1, maxLength = 255): string {
  if (typeof val !== 'string') {
    throw new ValidationError(fieldName, `${fieldName} must be a valid text string`);
  }
  const trimmed = val.trim();
  if (trimmed.length < minLength) {
    throw new ValidationError(fieldName, `${fieldName} cannot be empty`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(fieldName, `${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  // Strip control characters
  return trimmed.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function validateOptionalText(val: unknown, fieldName: string, maxLength = 1000): string {
  if (val === undefined || val === null) return '';
  if (typeof val !== 'string') {
    throw new ValidationError(fieldName, `${fieldName} must be a string`);
  }
  const trimmed = val.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(fieldName, `${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  return trimmed.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function validateDate(dateStr: unknown, fieldName = 'date'): string {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) {
    throw new ValidationError(fieldName, `${fieldName} must be in YYYY-MM-DD format`);
  }
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    throw new ValidationError(fieldName, `${fieldName} is not a valid calendar date`);
  }
  return dateStr;
}

export function validateOptionalDate(dateStr: unknown, fieldName = 'date'): string | null {
  if (dateStr === undefined || dateStr === null || dateStr === '') return null;
  return validateDate(dateStr, fieldName);
}

export function validateEnum<T extends string>(val: unknown, allowed: readonly T[], fieldName: string): T {
  if (typeof val !== 'string' || !allowed.includes(val as T)) {
    throw new ValidationError(fieldName, `${fieldName} must be one of: ${allowed.join(', ')}`);
  }
  return val as T;
}

export function validateNumber(val: unknown, fieldName: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) {
    throw new ValidationError(fieldName, `${fieldName} must be a valid number`);
  }
  if (num < min || num > max) {
    throw new ValidationError(fieldName, `${fieldName} must be between ${min} and ${max}`);
  }
  return num;
}

export function validateSafeUrl(urlVal: unknown, fieldName = 'url'): string {
  if (!urlVal) return '';
  if (typeof urlVal !== 'string') {
    throw new ValidationError(fieldName, `${fieldName} must be a string`);
  }
  const trimmed = urlVal.trim();
  if (!trimmed) return '';

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ValidationError(fieldName, `${fieldName} is not a valid URL`);
  }

  // Strictly enforce http/https protocols to prevent javascript: or data: XSS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError(fieldName, `${fieldName} must use http or https protocol`);
  }

  // Reject localhost and loopback references
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.startsWith('192.168.') || host.startsWith('10.') || host === '169.254.169.254') {
    throw new ValidationError(fieldName, 'Private or internal network URLs are prohibited');
  }

  return parsed.toString();
}

export function isValidId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id) || /^[a-zA-Z0-9_-]{3,64}$/.test(id);
}
