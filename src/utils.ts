// Frontend helper utilities for StudyFlow

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

export function formatDurationColon(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDateReadable(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatDayName(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// API client helper with auth token attachment
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('studyflow_token');
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers
  });

  let data: any;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = { error: 'Invalid JSON response from server' };
    }
  } else {
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: response.ok ? text : (text.slice(0, 200) || `HTTP error ${response.status}`) };
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}


// ----------------------------------------------------
// YOUTUBE THUMBNAIL & VIDEO ID RESOLUTION HELPERS
// ----------------------------------------------------

export function extractYouTubeVideoId(videoId?: string | null, url?: string | null): string | null {
  const candidate = (videoId || "").trim();
  if (candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate) && !candidate.startsWith("yt_") && !candidate.startsWith("lec_")) {
    return candidate;
  }

  const urlCandidate = (url || videoId || "").trim();
  if (!urlCandidate) return null;

  const ytMatch = urlCandidate.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|i\.ytimg\.com\/vi\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return ytMatch[1];
  }

  return null;
}

export function getYouTubeThumbnailUrl(videoId?: string | null, storedThumbnailUrl?: string | null): string | null {
  if (
    storedThumbnailUrl &&
    (storedThumbnailUrl.includes("ytimg.com") ||
      storedThumbnailUrl.includes("youtube.com") ||
      storedThumbnailUrl.includes("ggpht.com"))
  ) {
    return storedThumbnailUrl;
  }

  const resolvedId = extractYouTubeVideoId(videoId, storedThumbnailUrl);
  if (resolvedId) {
    return "https://i.ytimg.com/vi/" + resolvedId + "/hqdefault.jpg";
  }

  if (
    storedThumbnailUrl &&
    storedThumbnailUrl.trim().length > 0 &&
    !storedThumbnailUrl.includes("placeholder") &&
    !storedThumbnailUrl.includes("unsplash")
  ) {
    return storedThumbnailUrl;
  }

  return null;
}

export function getFallbackQualityUrl(currentUrl: string, videoId: string): string | null {
  if (!videoId) return null;
  if (currentUrl.includes("maxresdefault.jpg")) {
    return "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
  }
  if (currentUrl.includes("hqdefault.jpg")) {
    return "https://i.ytimg.com/vi/" + videoId + "/mqdefault.jpg";
  }
  if (currentUrl.includes("mqdefault.jpg")) {
    return "https://i.ytimg.com/vi/" + videoId + "/default.jpg";
  }
  return null;
}
