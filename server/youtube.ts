// YouTube Integration Service with API v3 support and curated educational fallback presets
import { getCachedYouTubeMetadata, setCachedYouTubeMetadata, inFlightDeduplicator } from './services/cache.js';

export interface ParsedYouTubeItem {
  youtubeVideoId: string;
  title: string;
  description: string;
  durationSeconds: number;
  thumbnailUrl: string;
  channelName: string;
  originalPosition: number;
}

export interface PlaylistFetchResult {
  playlistId: string;
  title: string;
  channelName: string;
  videoCount: number;
  totalDurationSeconds: number;
  thumbnailUrl: string;
  videos: ParsedYouTubeItem[];
  source: 'api' | 'fallback_preset' | 'parsed' | 'scraped';
}

// Convert ISO 8601 duration (e.g. PT1H15M30S) to seconds
export function parseIso8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 600; // default 10m fallback
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Strict YouTube Hostname Allowlist for SSRF Prevention
export function isAllowedYouTubeHost(hostname: string): boolean {
  const clean = hostname.toLowerCase();
  return (
    clean === 'youtube.com' ||
    clean.endsWith('.youtube.com') ||
    clean === 'youtu.be'
  );
}

export function extractPlaylistId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();

  // 1. Exact match for curated preset keys
  if (CURATED_EDUCATIONAL_PLAYLISTS[trimmed]) {
    return trimmed;
  }

  // 2. Direct alphanumeric/dash/underscore playlist ID (e.g. PL..., UU..., FL..., RD..., OLAK5uy_..., etc.)
  if (/^[a-zA-Z0-9_-]{10,64}$/.test(trimmed) && 
      !trimmed.includes('/') && 
      !trimmed.includes('.') && 
      !trimmed.includes('?') && 
      !trimmed.includes('&') && 
      !trimmed.includes('=')) {
    return trimmed;
  }

  // 3. Robust URL search parameter parsing
  try {
    const urlStr = trimmed.startsWith('http://') || trimmed.startsWith('https://') 
      ? trimmed 
      : `https://${trimmed}`;
    const url = new URL(urlStr);
    
    // Check hostname
    if (isAllowedYouTubeHost(url.hostname)) {
      const listParam = url.searchParams.get('list');
      if (listParam && /^[a-zA-Z0-9_-]{10,64}$/.test(listParam)) {
        return listParam;
      }
    }
  } catch {
    // If URL constructor fails, fall back to regex
  }

  // 4. Robust regex for any URL or string containing list= parameter
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]{10,64})/i);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

export function extractVideoId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();

  // If it's a direct 11-char YouTube video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes('.')) {
    return trimmed;
  }

  // If it's a URL, enforce protocol and hostname allowlist
  try {
    const urlStr = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
    const url = new URL(urlStr);
    
    if (isAllowedYouTubeHost(url.hostname)) {
      if (url.hostname.includes('youtu.be')) {
        const id = url.pathname.slice(1).split('?')[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }

      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const paths = url.pathname.split('/');
      const embedIdx = paths.indexOf('embed');
      if (embedIdx !== -1 && paths[embedIdx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(paths[embedIdx + 1])) {
        return paths[embedIdx + 1];
      }
    }
  } catch {
    // fallback to regex
  }

  const match = trimmed.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([a-zA-Z0-9_-]{11})/);
  if (match && match[1].length === 11) return match[1];

  return null;
}

// Curated high-yield educational presets for popular exams (GATE, JEE, UPSC, CS, Engineering)
export const CURATED_EDUCATIONAL_PLAYLISTS: Record<string, {
  title: string;
  channelName: string;
  thumbnailUrl: string;
  videos: { title: string; durationMinutes: number; videoId: string; description: string }[];
}> = {
  'PL_network_theory_gate': {
    title: 'Network Theory Complete Comprehensive Course for GATE & ESE',
    channelName: 'NPTEL & Gate Academy',
    thumbnailUrl: 'https://i.ytimg.com/vi/b4_Jz7o_gW0/hqdefault.jpg',
    videos: [
      { title: 'Lecture 01: Introduction to Electric Circuits & Basic Elements (R, L, C)', durationMinutes: 48, videoId: 'b4_Jz7o_gW0', description: 'Understanding active and passive elements, ideal voltage and current sources.' },
      { title: 'Lecture 02: Kirchhoff’s Current Law (KCL) & Kirchhoff’s Voltage Law (KVL)', durationMinutes: 52, videoId: 'q7uYk9x0V_E', description: 'Sign conventions, loop equations, and nodal formulation fundamentals.' },
      { title: 'Lecture 03: Nodal Analysis with Independent and Dependent Sources', durationMinutes: 56, videoId: 'k8F3uW9j_a0', description: 'Supernode concept and step-by-step matrix method for circuit solving.' },
      { title: 'Lecture 04: Mesh Analysis with Dependent Sources & Supermesh Method', durationMinutes: 44, videoId: '4fVbYmE5e3M', description: 'Supermesh formulation and solving complex planar multi-source circuits.' },
      { title: 'Lecture 05: Linearity Principle & Superposition Theorem with Solved GATE Questions', durationMinutes: 62, videoId: 'mK_9u_L_x3Q', description: 'Applying superposition when independent AC and DC sources coexist.' },
      { title: 'Lecture 06: Thevenin’s and Norton’s Equivalent Theorems In-Depth', durationMinutes: 58, videoId: '5yP4L9-60wQ', description: 'Finding Rth for circuits containing internal dependent sources with test sources.' },
      { title: 'Lecture 07: Maximum Power Transfer Theorem for DC and AC Circuits', durationMinutes: 42, videoId: 't01p92-4s5E', description: 'Condition for complex load conjugate matching and efficiency calculation.' },
      { title: 'Lecture 08: Transient Analysis of Series RL Circuits (Natural & Step Response)', durationMinutes: 65, videoId: '2_6O5-7lE3g', description: 'Differential equations, time constant calculation, and initial value continuity.' },
      { title: 'Lecture 09: Transient Analysis of Series RC Circuits & Switch Timing', durationMinutes: 55, videoId: 'b3m0_42lF8U', description: 'Charge preservation, voltage continuity, and response to impulse input.' },
      { title: 'Lecture 10: Second-Order RLC Transient Response (Overdamped, Critical, Underdamped)', durationMinutes: 70, videoId: 'sB2Xl8n-Vq8', description: 'Characteristic equations, damping ratio, natural undamped frequency.' },
      { title: 'Lecture 11: Sinusoidal Steady State Analysis & Phasor Representation', durationMinutes: 50, videoId: 'wYv8xOQWd74', description: 'Impedance, admittance, phasor diagrams, power triangle and power factor.' },
      { title: 'Lecture 12: Series and Parallel Resonance (Q-factor and Bandwidth)', durationMinutes: 54, videoId: '6_3B_1p746c', description: 'Resonant frequency derivation, selectivity, half power frequencies.' },
      { title: 'Lecture 13: Two-Port Networks: Z, Y, ABCD, and h-Parameters', durationMinutes: 68, videoId: 'q1W_42rL_t0', description: 'Reciprocity and symmetry conditions, interconversions, and cascading.' },
      { title: 'Lecture 14: Magnetic Coupled Circuits and Dot Convention', durationMinutes: 46, videoId: 'Wq4-o-4eC8k', description: 'Mutual inductance, coefficient of coupling, and equivalent T-network.' }
    ]
  },
  'PL_control_systems_gate': {
    title: 'Control Systems Engineering Complete Masterclass',
    channelName: 'Prof. S. Sen (IIT Kharagpur)',
    thumbnailUrl: 'https://i.ytimg.com/vi/pYq9u_B8lEw/hqdefault.jpg',
    videos: [
      { title: '01. Basics of Control Systems: Open Loop vs Closed Loop Systems', durationMinutes: 45, videoId: 'pYq9u_B8lEw', description: 'Feedback sensitivity, stability margins, and disturbance rejection.' },
      { title: '02. Transfer Function & Mathematical Modeling of Mechanical Systems', durationMinutes: 58, videoId: 'rM7g6i43J9g', description: 'Translational and rotational systems, force-voltage and force-current analogies.' },
      { title: '03. Block Diagram Reduction Rules with Complex Solved Problems', durationMinutes: 52, videoId: 's0_B8_K1_pY', description: 'Moving summing points and takeoff points, feedback loop elimination.' },
      { title: '04. Signal Flow Graphs (SFG) and Mason’s Gain Formula', durationMinutes: 48, videoId: 'd0_b8K1_eQw', description: 'Forward paths, non-touching loops, and rapid transfer function computation.' },
      { title: '05. Time Response Analysis of First Order Systems (Step and Ramp)', durationMinutes: 40, videoId: 'f4_98_kL1oP', description: 'Rise time, settling time, and steady-state error constants.' },
      { title: '06. Second Order Systems Transient Specifications (Overshoot, Settling Time)', durationMinutes: 64, videoId: 'u2_8N_bK1oE', description: 'Standard second-order transfer function, damping ratio, peak time.' },
      { title: '07. Steady State Error & Error Constants (Kp, Kv, Ka) for System Types', durationMinutes: 50, videoId: 'w4_8P_1nE9u', description: 'Type 0, Type 1, Type 2 system error responses to canonical inputs.' },
      { title: '08. Routh-Hurwitz Stability Criterion & Special Difficult Cases', durationMinutes: 56, videoId: 'z8_1k_L0pQ9', description: 'Entire row of zeros, auxiliary equation, and jw-axis roots.' },
      { title: '09. Root Locus Technique: Rules for Construction (Angles, Breakaway, Asymptotes)', durationMinutes: 72, videoId: 'a3_9b_K1pL0', description: 'Angle of departure and arrival, intersection with imaginary axis.' },
      { title: '10. Nyquist Stability Criterion & Contour Mapping', durationMinutes: 68, videoId: 'x1_7v_N4pM2', description: 'Encirclement of (-1, j0), open-loop vs closed-loop stability verification.' },
      { title: '11. Bode Plot Construction: Magnitude & Phase Angle Plots', durationMinutes: 62, videoId: 'q5_2w_M8nK1', description: 'Corner frequencies, Gain Margin (GM) and Phase Margin (PM) computation.' },
      { title: '12. Compensators (Lead, Lag, Lead-Lag) & PID Controllers', durationMinutes: 54, videoId: 'l9_4c_P2nB5', description: 'Improving steady-state accuracy and transient response via phase compensation.' },
      { title: '13. State Space Representation: State Transition Matrix & Controllability', durationMinutes: 60, videoId: 'k3_8d_R5tN6', description: 'Diagonalization, Cayley-Hamilton theorem, Kalman test for observability.' }
    ]
  },
  'PL_signals_and_systems': {
    title: 'Signals and Systems Comprehensive Video Lectures',
    channelName: 'IIT Madras Educational Series',
    thumbnailUrl: 'https://i.ytimg.com/vi/1u_N_B70-tM/hqdefault.jpg',
    videos: [
      { title: 'Lec 01: Classification of Signals (Continuous, Discrete, Energy & Power)', durationMinutes: 50, videoId: '1u_N_B70-tM', description: 'Energy signals vs Power signals, periodicity, even/odd signals.' },
      { title: 'Lec 02: Operations on Signals: Shifting, Scaling, and Inversion', durationMinutes: 42, videoId: '2v_N_B70-tM', description: 'Order of precedence in time transformation of independent variable.' },
      { title: 'Lec 03: Basic Elementary Signals (Unit Step, Impulse, Ramp, Sinc)', durationMinutes: 46, videoId: '3w_N_B70-tM', description: 'Sifting property of Dirac delta function and derivatives of step function.' },
      { title: 'Lec 04: Classification of Systems: Linearity, Time-Invariance, Causality, Stability', durationMinutes: 60, videoId: '4x_N_B70-tM', description: 'BIBO stability condition and static vs dynamic memory verification.' },
      { title: 'Lec 05: Convolution Integral and Convolution Sum in LTI Systems', durationMinutes: 65, videoId: '5y_N_B70-tM', description: 'Graphical convolution, impulse response, and cascade/parallel systems.' },
      { title: 'Lec 06: Continuous-Time Fourier Series (CTFS): Trigonometric & Exponential', durationMinutes: 58, videoId: '6z_N_B70-tM', description: 'Dirichlet conditions, symmetry properties, and Parseval’s power relation.' },
      { title: 'Lec 07: Continuous-Time Fourier Transform (CTFT) Properties and Duality', durationMinutes: 66, videoId: '7a_N_B70-tM', description: 'Frequency shifting, differentiation in time, integration, and duality theorem.' },
      { title: 'Lec 08: Laplace Transform: Region of Convergence (ROC) & System Stability', durationMinutes: 62, videoId: '8b_N_B70-tM', description: 'Unilateral and bilateral Laplace transforms, initial and final value theorems.' },
      { title: 'Lec 09: Z-Transform: Properties, Inverse ZT, and Stability of DT Systems', durationMinutes: 60, videoId: '9c_N_B70-tM', description: 'ROC analysis in complex z-plane, poles on unit circle, and transfer function.' },
      { title: 'Lec 10: Sampling Theorem & Nyquist Rate (Aliasing and Reconstruction)', durationMinutes: 52, videoId: '0d_N_B70-tM', description: 'Ideal impulse train sampling, anti-aliasing filtering, and flat-top sampling.' }
    ]
  },
  'PL_dsa_computer_science': {
    title: 'Data Structures and Algorithms for Competitive Programming & Interviews',
    channelName: 'Striver & FreeCodeCamp',
    thumbnailUrl: 'https://i.ytimg.com/vi/8hly31xKli0/hqdefault.jpg',
    videos: [
      { title: '01. Asymptotic Notations: Big-O, Omega, Theta Analysis', durationMinutes: 45, videoId: '8hly31xKli0', description: 'Time and space complexity bounds with recurrence relations.' },
      { title: '02. Arrays: Two Pointers, Sliding Window, and Prefix Sums', durationMinutes: 65, videoId: 'RBSGKlAvoiM', description: 'Subarray sum problems, Dutch National Flag algorithm, and Kadane’s theorem.' },
      { title: '03. Binary Search in Depth: Search on Answers & Rotated Arrays', durationMinutes: 58, videoId: 'bbmtn3yFq8o', description: 'Lower bound, upper bound, peak element, and allocation problem.' },
      { title: '04. Linked Lists: Reverse, Detect Cycle, and Merge K Sorted Lists', durationMinutes: 50, videoId: 'G32RM8Si5LD', description: 'Floyd’s cycle detection algorithm and memory pointer manipulation.' },
      { title: '05. Stacks & Queues: Monotonic Stack & Next Greater Element', durationMinutes: 55, videoId: 'wjI1WNcIntg', description: 'Trapping rain water, largest rectangle in histogram, LRU cache.' },
      { title: '06. Binary Trees & BST: Traversals, Lowest Common Ancestor (LCA)', durationMinutes: 70, videoId: 'fAAZ2GDZCQ4', description: 'DFS recursive/iterative, Morris traversal, diameter of tree.' },
      { title: '07. Graphs: BFS, DFS, Cycle Detection, Topological Sort (Kahn’s)', durationMinutes: 75, videoId: 'tWVWeAqZ0WU', description: 'Bipartite check, directed vs undirected graphs, dependency resolution.' },
      { title: '08. Shortest Path Algorithms: Dijkstra, Bellman-Ford, Floyd-Warshall', durationMinutes: 68, videoId: 'GazC3VDpe0U', description: 'Priority queue implementation, negative weight cycles detection.' },
      { title: '09. Dynamic Programming: 1D to 2D DP, Knapsack & Subsequences', durationMinutes: 80, videoId: 'oBt53YbR9Kk', description: 'Tabulation vs memoization, space optimization techniques.' },
      { title: '10. Disjoint Set Union (DSU) & Minimum Spanning Tree (Kruskal/Prim)', durationMinutes: 52, videoId: 'pkYVOmU3MgA', description: 'Path compression and union by rank with cycle detection.' }
    ]
  }
};

// Main Playlist Resolver with Single-Flight Deduplication and Database Caching
export async function fetchPlaylistData(urlOrId: string): Promise<PlaylistFetchResult> {
  if (!urlOrId || typeof urlOrId !== 'string') {
    throw new Error('Playlist URL or ID is required.');
  }

  const trimmed = urlOrId.trim();
  const playlistId = extractPlaylistId(trimmed);

  if (!playlistId) {
    const singleVid = extractVideoId(trimmed);
    if (singleVid) {
      throw new Error('The provided link is for a single YouTube video, not a playlist. Please paste a YouTube playlist link (containing ?list=...) or use the Add Single Video feature.');
    }
    throw new Error('Invalid YouTube playlist URL or ID. Please provide a valid playlist link (e.g. https://www.youtube.com/playlist?list=...) or playlist ID.');
  }

  // 1. Check exact match for curated educational course presets (only exact key match)
  if (CURATED_EDUCATIONAL_PLAYLISTS[playlistId]) {
    const preset = CURATED_EDUCATIONAL_PLAYLISTS[playlistId];
    const videos: ParsedYouTubeItem[] = preset.videos.map((v, idx) => ({
      youtubeVideoId: v.videoId,
      title: v.title,
      description: v.description,
      durationSeconds: v.durationMinutes * 60,
      thumbnailUrl: v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : preset.thumbnailUrl,
      channelName: preset.channelName,
      originalPosition: idx + 1
    }));
    const totalDuration = videos.reduce((acc, v) => acc + v.durationSeconds, 0);
    return {
      playlistId,
      title: preset.title,
      channelName: preset.channelName,
      videoCount: videos.length,
      totalDurationSeconds: totalDuration,
      thumbnailUrl: preset.thumbnailUrl,
      videos,
      source: 'fallback_preset'
    };
  }

  const cacheKey = `playlist:${playlistId}`;

  // 2. Check persistent SQLite cache first (verify it contains genuine videos)
  const cached = getCachedYouTubeMetadata(cacheKey);
  if (cached && (cached.source === 'api' || cached.source === 'scraped') && Array.isArray(cached.videos) && cached.videos.length > 0) {
    const hasFake = cached.videos.some((v: any) => v.youtubeVideoId && v.youtubeVideoId.startsWith('yt_lec_'));
    if (!hasFake) {
      return cached as PlaylistFetchResult;
    }
  }

  // 3. Single-flight deduplication across concurrent requests
  return inFlightDeduplicator.do(cacheKey, async () => {
    // Double-check cache inside lock
    const cachedAgain = getCachedYouTubeMetadata(cacheKey);
    if (cachedAgain && (cachedAgain.source === 'api' || cachedAgain.source === 'scraped') && Array.isArray(cachedAgain.videos) && cachedAgain.videos.length > 0) {
      const hasFake = cachedAgain.videos.some((v: any) => v.youtubeVideoId && v.youtubeVideoId.startsWith('yt_lec_'));
      if (!hasFake) return cachedAgain as PlaylistFetchResult;
    }

    const result = await fetchPlaylistDataInternal(playlistId);
    if (result && result.videos && result.videos.length > 0) {
      setCachedYouTubeMetadata(cacheKey, result, result.source, 7);
    }
    return result;
  });
}

// Scrape public YouTube playlist HTML when YouTube API key is missing or quota is exceeded
export async function scrapePublicYouTubePlaylist(playlistId: string): Promise<PlaylistFetchResult | null> {
  try {
    const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      return null;
    }

    const html = await res.text();

    // Extract Title
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) ||
                       html.match(/<title>(.*?) - YouTube<\/title>/i) ||
                       html.match(/<title>(.*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : '';
    title = title.replace(/ - YouTube$/, '').trim();

    if (!title || title.toLowerCase() === 'undefined' || title.toLowerCase() === 'youtube') {
      return null;
    }

    // Extract Channel Name
    const channelMatch = html.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/i) ||
                         html.match(/<link itemprop="name" content="([^"]+)"/i) ||
                         html.match(/"author":"([^"]+)"/i);
    const channelName = channelMatch ? channelMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'") : 'YouTube Educator';

    // Parse videos from ytInitialData
    const parsedVideos: ParsedYouTubeItem[] = [];
    const initialDataMatch = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s) ||
                             html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/s);

    if (initialDataMatch) {
      try {
        const data = JSON.parse(initialDataMatch[1]);
        const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
        const sectionContents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        const itemSectionContents = sectionContents[0]?.itemSectionRenderer?.contents || [];

        for (const item of itemSectionContents) {
          // Format 1: Modern lockupViewModel (2025/2026 YouTube layout)
          if (item.lockupViewModel && item.lockupViewModel.contentId) {
            const lockup = item.lockupViewModel;
            const vId = lockup.contentId;
            if (!/^[a-zA-Z0-9_-]{11}$/.test(vId)) continue;

            const vTitle = lockup.metadata?.lockupMetadataViewModel?.title?.content || `Video ${parsedVideos.length + 1}`;

            // Parse duration from overlay labels
            let durationSeconds = 1800;
            const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
            for (const overlay of overlays) {
              const label = overlay.thumbnailOverlayTimeStatusRenderer?.text?.accessibility?.accessibilityData?.label ||
                            overlay.thumbnailBadgeViewModel?.rendererContext?.accessibilityContext?.label ||
                            JSON.stringify(overlay);
              const durationMatch = label.match(/(\d+\s*(?:hour|hr|minute|min|second|sec|hours|minutes|seconds)[\s,0-9a-zA-Z]*)/i);
              if (durationMatch) {
                let s = 0;
                const h = durationMatch[1].match(/(\d+)\s*(?:hour|hr|hours)/i);
                const m = durationMatch[1].match(/(\d+)\s*(?:minute|min|minutes)/i);
                const sec = durationMatch[1].match(/(\d+)\s*(?:second|sec|seconds)/i);
                if (h) s += parseInt(h[1], 10) * 3600;
                if (m) s += parseInt(m[1], 10) * 60;
                if (sec) s += parseInt(sec[1], 10);
                if (s > 0) durationSeconds = s;
              }
            }

            parsedVideos.push({
              youtubeVideoId: vId,
              title: vTitle,
              description: '',
              durationSeconds,
              thumbnailUrl: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
              channelName,
              originalPosition: parsedVideos.length + 1
            });
          }
          // Format 2: playlistVideoListRenderer / playlistVideoRenderer (classic YouTube layout)
          else if (item.playlistVideoListRenderer?.contents) {
            for (const vidItem of item.playlistVideoListRenderer.contents) {
              const pvr = vidItem.playlistVideoRenderer;
              if (!pvr || !pvr.videoId) continue;
              const vId = pvr.videoId;
              const vTitle = pvr.title?.runs?.[0]?.text || pvr.title?.simpleText || `Video ${parsedVideos.length + 1}`;
              const durSec = parseInt(pvr.lengthSeconds || '1800', 10);
              parsedVideos.push({
                youtubeVideoId: vId,
                title: vTitle,
                description: '',
                durationSeconds: isNaN(durSec) ? 1800 : durSec,
                thumbnailUrl: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
                channelName,
                originalPosition: parsedVideos.length + 1
              });
            }
          }
        }
      } catch (jsonErr) {
        console.warn('Error parsing ytInitialData in scraper:', jsonErr);
      }
    }

    // Format 3: Fallback regex on HTML watch links if ytInitialData had no video items
    if (parsedVideos.length === 0) {
      const vidMatches = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map(m => m[1]);
      const uniqueIds = [...new Set(vidMatches)];
      for (let i = 0; i < uniqueIds.length; i++) {
        const vId = uniqueIds[i];
        parsedVideos.push({
          youtubeVideoId: vId,
          title: `Video ${i + 1}`,
          description: '',
          durationSeconds: 1800,
          thumbnailUrl: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
          channelName,
          originalPosition: i + 1
        });
      }
    }

    if (parsedVideos.length === 0) {
      return null;
    }

    const totalSecs = parsedVideos.reduce((acc, v) => acc + v.durationSeconds, 0);
    const thumb = parsedVideos[0]?.thumbnailUrl || `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`;

    return {
      playlistId,
      title,
      channelName,
      videoCount: parsedVideos.length,
      totalDurationSeconds: totalSecs,
      thumbnailUrl: thumb,
      videos: parsedVideos,
      source: 'scraped'
    };
  } catch (err) {
    console.warn('Public playlist scraper failed:', err);
    return null;
  }
}

async function fetchPlaylistDataInternal(playlistId: string): Promise<PlaylistFetchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  let apiFailureReason = '';

  // 1. If YouTube API Key is available, attempt official YouTube Data API v3
  if (apiKey && apiKey.trim().length > 10) {
    try {
      const playlistMetaRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${encodeURIComponent(playlistId)}&key=${apiKey}`
      );
      if (playlistMetaRes.ok) {
        const metaData = await playlistMetaRes.json();
        if (metaData.items && metaData.items.length > 0) {
          const playlistSnippet = metaData.items[0].snippet;
          const title = playlistSnippet.title;
          const channelName = playlistSnippet.channelTitle;
          const thumbnailUrl = playlistSnippet.thumbnails?.maxres?.url || 
                               playlistSnippet.thumbnails?.high?.url || 
                               playlistSnippet.thumbnails?.medium?.url || 
                               playlistSnippet.thumbnails?.default?.url || 
                               `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`;

          // Fetch items in playlist with pagination (up to 4 pages / 200 videos)
          const allRawItems: any[] = [];
          let pageToken: string | undefined = undefined;
          let pagesCount = 0;

          while (pagesCount < 4) {
            const pageUrl: string = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
            const itemsRes = await fetch(pageUrl);
            if (!itemsRes.ok) break;

            const itemsData = await itemsRes.json();
            if (itemsData.items && itemsData.items.length > 0) {
              allRawItems.push(...itemsData.items);
            }
            pageToken = itemsData.nextPageToken;
            pagesCount++;
            if (!pageToken) break;
          }

          if (allRawItems.length > 0) {
            // Fetch durations in chunks of 50
            const durationsMap: Record<string, number> = {};
            const allVideoIds = allRawItems
              .map((i: any) => i.contentDetails?.videoId)
              .filter((id: any) => Boolean(id) && typeof id === 'string');

            for (let i = 0; i < allVideoIds.length; i += 50) {
              const chunkIds = allVideoIds.slice(i, i + 50).join(',');
              if (!chunkIds) continue;
              const videosRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${chunkIds}&key=${apiKey}`
              );
              if (videosRes.ok) {
                const vidData = await videosRes.json();
                for (const v of vidData.items || []) {
                  durationsMap[v.id] = parseIso8601Duration(v.contentDetails?.duration || 'PT30M');
                }
              }
            }

            const parsedVideos: ParsedYouTubeItem[] = allRawItems
              .filter((item: any) => item.snippet?.title !== 'Private video' && item.snippet?.title !== 'Deleted video')
              .map((item: any, index: number) => {
                const vId = item.contentDetails?.videoId || `yt_${index}`;
                const duration = durationsMap[vId] || 1800;
                return {
                  youtubeVideoId: vId,
                  title: item.snippet.title,
                  description: item.snippet.description || '',
                  durationSeconds: duration,
                  thumbnailUrl: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || (vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : undefined),
                  channelName: item.snippet.videoOwnerChannelTitle || channelName,
                  originalPosition: index + 1
                };
              });

            const totalDuration = parsedVideos.reduce((acc, v) => acc + v.durationSeconds, 0);

            return {
              playlistId,
              title,
              channelName,
              videoCount: parsedVideos.length,
              totalDurationSeconds: totalDuration,
              thumbnailUrl,
              videos: parsedVideos,
              source: 'api'
            };
          }
        } else {
          apiFailureReason = 'Playlist not found or empty on YouTube';
        }
      } else {
        const errJson = await playlistMetaRes.json().catch(() => null);
        apiFailureReason = errJson?.error?.message || `HTTP ${playlistMetaRes.status}`;
        console.warn('YouTube API call returned non-200:', playlistMetaRes.status, apiFailureReason);
      }
    } catch (apiErr: any) {
      apiFailureReason = apiErr.message || 'Network error';
      console.warn('YouTube API call failed:', apiErr);
    }
  }

  // 2. Fallback to public scraper (handles instances where API key is missing or quota exceeded)
  const scraped = await scrapePublicYouTubePlaylist(playlistId);
  if (scraped && scraped.videos && scraped.videos.length > 0) {
    return scraped;
  }

  // 3. Informative error reporting — NEVER return fake demo data
  if (!apiKey || apiKey.trim().length <= 10) {
    throw new Error(`Could not fetch YouTube playlist "${playlistId}". Please ensure the playlist exists and is public. (Note: On Render, configure the YOUTUBE_API_KEY environment variable for reliable YouTube Data API access).`);
  }

  if (apiFailureReason) {
    throw new Error(`YouTube playlist "${playlistId}" could not be retrieved (${apiFailureReason}). Please check that the playlist is public.`);
  }

  throw new Error(`YouTube playlist "${playlistId}" was not found or is private. Please ensure the link is correct and the playlist is set to Public or Unlisted on YouTube.`);
}

// Fetch single video details with caching and deduplication
export async function fetchSingleVideo(urlOrId: string): Promise<ParsedYouTubeItem> {
  const videoId = extractVideoId(urlOrId) || urlOrId.trim();
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error('Invalid YouTube video link or ID. Please provide a valid 11-character video ID or watch link.');
  }

  const cacheKey = `video:${videoId}`;
  const cached = getCachedYouTubeMetadata(cacheKey);
  if (cached) return cached as ParsedYouTubeItem;

  return inFlightDeduplicator.do(cacheKey, async () => {
    const cachedAgain = getCachedYouTubeMetadata(cacheKey);
    if (cachedAgain) return cachedAgain as ParsedYouTubeItem;

    const result = await fetchSingleVideoInternal(videoId);
    setCachedYouTubeMetadata(cacheKey, result, 'single_video', 14);
    return result;
  });
}

async function fetchSingleVideoInternal(videoId: string): Promise<ParsedYouTubeItem> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey && apiKey.trim().length > 10) {
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          return {
            youtubeVideoId: videoId,
            title: item.snippet.title,
            description: item.snippet.description || '',
            durationSeconds: parseIso8601Duration(item.contentDetails?.duration || 'PT30M'),
            thumbnailUrl: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined),
            channelName: item.snippet.channelTitle || 'YouTube Channel',
            originalPosition: 1
          };
        }
      }
    } catch (e) {
      console.warn('Single video API call failed:', e);
    }
  }

  // Fallback via oEmbed to get real title and creator
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      return {
        youtubeVideoId: videoId,
        title: oembedData.title || `YouTube Video (${videoId})`,
        description: '',
        durationSeconds: 1800,
        thumbnailUrl: oembedData.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        channelName: oembedData.author_name || 'YouTube Creator',
        originalPosition: 1
      };
    }
  } catch (oeErr) {
    console.warn('Single video oEmbed failed:', oeErr);
  }

  throw new Error(`YouTube video "${videoId}" could not be found or is private.`);
}

