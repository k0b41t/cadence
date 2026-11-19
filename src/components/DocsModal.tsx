import { useEffect, useState } from 'react';
import { BookOpen, Check, ChevronDown, Copy, Terminal, X } from 'lucide-react';

type ReaderMode = 'all' | 'fast' | 'guided';

interface CodeSnippet {
  label: string;
  language: string;
  code: string;
}

interface WalkthroughBlock {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface DocSection {
  id: string;
  number: string;
  title: string;
  summary: string;
  snippets: CodeSnippet[];
  walkthrough: WalkthroughBlock[];
}

const DOC_SECTIONS: DocSection[] = [
  {
    id: 'cmd-dev',
    number: '01',
    title: 'Command Prompt & Your dev Folder',
    summary:
      'Open Windows Command Prompt, verify your developer tools, and create a clean C:\\Users\\<you>\\dev workspace outside cloud-synced folders.',
    snippets: [
      {
        label: 'Create dev workspace & verify tools (Windows cmd)',
        language: 'bat',
        code: `cd %USERPROFILE%
mkdir dev
cd dev
node -v
npm -v
git --version`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Opening Command Prompt on Windows',
        paragraphs: [
          'The Command Prompt (often called a terminal or shell) lets you run developer commands directly without clicking through menus.',
          'Press the Windows Key, type cmd, and click Command Prompt. It opens inside your Windows User folder (for example: C:\\Users\\btuttle>). That path before the > symbol is your current working directory—the folder your terminal is currently standing inside.',
        ],
      },
      {
        heading: '2. Creating C:\\Users\\<you>\\dev',
        paragraphs: [
          'Keep coding projects inside C:\\Users\\<you>\\dev rather than Desktop or OneDrive Documents. Cloud-sync tools lock thousands of tiny files inside node_modules and cause build failures.',
        ],
        bullets: [
          'cd %USERPROFILE% ensures you start in your User home folder.',
          'mkdir dev creates a new folder named dev (silent output means it worked).',
          'cd dev moves inside it so your prompt reads C:\\Users\\<you>\\dev>.',
          'node -v, npm -v, and git --version confirm Node.js (LTS) and Git for Windows are installed. If any says "not recognized", install them and reopen cmd.',
        ],
      },
    ],
  },
  {
    id: 'git-github',
    number: '02',
    title: 'Git & GitHub Version Control',
    summary:
      'Connect your dev folder to GitHub, understand clone/pull/commit/push, and add .gitignore before installing packages or env files.',
    snippets: [
      {
        label: 'Clone existing repo OR initialize a new repo',
        language: 'bat',
        code: `:: Option A: Pull an existing GitHub repository
git clone https://github.com/<your-username>/cadence.git
cd cadence

:: Option B: Start a brand-new folder linked to an empty repo
mkdir cadence && cd cadence
git init
git branch -M main
git remote add origin https://github.com/<your-username>/cadence.git`,
      },
      {
        label: '.gitignore (create before npm install or .env files)',
        language: 'gitignore',
        code: `node_modules/
build/
dist/
coverage/
.DS_Store
*.log
.env*
!.env.example
.firebase/
.firebaserc
firebase-applet-config.json`,
      },
      {
        label: 'Untrack an already-committed config file (if GitHub emailed an alert)',
        language: 'bat',
        code: `git rm --cached firebase-applet-config.json
git commit -m "Stop tracking local firebase-applet-config.json"
git push`,
      },
      {
        label: 'Daily Git save & sync loop',
        language: 'bat',
        code: `git status
git add .
git commit -m "Describe what you changed"
git push`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Git vs. GitHub',
        paragraphs: [
          'Git is software installed on your laptop that records snapshots (commits) of your code so you can compare edits or rewind mistakes. GitHub is a website that stores a cloud copy of those snapshots for backup and collaboration.',
        ],
      },
      {
        heading: '2. Why .gitignore Comes First (and Why GitHub Flags Firebase Keys)',
        paragraphs: [
          'When you run npm install, it downloads tens of thousands of library files into node_modules/. You never upload node_modules/, compiled dist/ files, local .env.production config, or firebase-applet-config.json to GitHub. Notice .env* ignores all environment files, while !.env.example makes an exception for the safe empty template.',
          'Important: GitHub Secret Scanning automatically emails an alert whenever ANY file in a repo contains an AIza... Google API key (even though Firebase Web apiKeys are public client identifiers protected by firestore.rules, not private secrets). Ignoring firebase-applet-config.json keeps your AI Studio config out of GitHub cleanly.',
        ],
      },
      {
        heading: '3. Everyday Sync Commands',
        paragraphs: [
          'Run git status to see modified files, git add . to stage them, git commit -m "message" to save a snapshot locally, and git push to upload to GitHub (or git pull to download updates from another machine).',
        ],
      },
    ],
  },
  {
    id: 'firebase-order',
    number: '03',
    title: 'Firebase Best-Practice Order ($0 Spark Plan)',
    summary:
      'Architect Cadence as a static React SPA talking directly to Firebase Auth + Cloud Firestore + Hosting so everything runs free without billing.',
    snippets: [
      {
        label: '.env.local (gitignored config for both npm run dev & deploy:prod)',
        language: 'env',
        code: `VITE_FIREBASE_API_KEY="AIza..."
VITE_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project-id.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="1234567890"
VITE_FIREBASE_APP_ID="1:1234567890:web:abcdef"
VITE_FIREBASE_DATABASE_ID="(default)"`,
      },
      {
        label: 'firestore.rules — Default-deny safety net, whitelist gate & color validation',
        language: 'javascript',
        code: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() { return request.auth != null; }
    function isVerifiedUser() {
      return isSignedIn() && request.auth.token.email_verified == true;
    }
    function isAllowedWorkspaceUser() {
      return isAdmin() || isWhitelistedEmail();
    }
    function isValidColumnColorValue(color) {
      return color in ['slate', 'amber', 'red', 'emerald', 'blue', 'violet']
        || (color is string && color.size() == 7 && color.matches('^#[0-9a-fA-F]{6}$'));
    }
  }
}`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Why Cadence Needs Cloud Services, Encapsulation & $0 Spark Plan',
        paragraphs: [
          'Without a cloud database, tasks stored in browser localStorage vanish when cache is cleared and cannot sync between teammates. Firebase gives us Google Sign-In, real-time Cloud Firestore sync, and HTTPS hosting.',
          'To stay 100% free on the Spark plan (no credit card), avoid Cloud Functions, Express servers on Cloud Run, and paid server proxies. Keep Cadence a static Vite + React Single-Page App where the browser talks directly to Auth and Firestore. This also keeps Cadence completely encapsulated inside its own Firebase project—no Google Cloud servers or AI Studio Gemini projects are required in production.',
        ],
      },
      {
        heading: '2. Exact Setup Order in Firebase Console',
        paragraphs: [
          'Always configure Firebase in this sequence before writing database code:',
        ],
        bullets: [
          'Create the Firebase project on the Spark (No-cost) plan.',
          'Authentication → Sign-in method → Enable Google (ensure localhost is an authorized domain).',
          'Firestore Database → Create database → keep the (default) database ID in Production mode.',
          'Project Settings → Add Web App (</>) → paste those values into a gitignored .env.local file in your project root (Vite loads .env.local for both npm run dev and npm run deploy:prod).',
          'Design firebase-blueprint.json and firestore.rules first: because browsers connect directly to Firestore, Security Rules are your backend bouncer (enforce isAllowedWorkspaceUser() on writes, split PII into users/{uid}/private/info, index share invites with SHA-256 emailLookup, enforce server timestamps request.time, and lock every field with affectedKeys().hasOnly(...)).',
        ],
      },
    ],
  },
  {
    id: 'scaffolding',
    number: '04',
    title: 'Scaffolding, package.json & npm Traps',
    summary:
      'Set up Vite 8, Tailwind CSS v4, and TypeScript—and avoid the esbuild peer conflict and firebase vs. firebase-tools confusion.',
    snippets: [
      {
        label: 'package.json (core scripts & compatible esbuild ^0.28.0)',
        language: 'json',
        code: `{
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "deploy:prod": "npm run build && firebase deploy --only hosting,firestore:rules",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.1.1",
    "firebase": "^13.3.0",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "vite": "^8.3.0"
  },
  "devDependencies": {
    "esbuild": "^0.28.0",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2"
  }
}`,
      },
      {
        label: 'Install project packages + global Firebase CLI',
        language: 'bat',
        code: `npm install
npm install -g firebase-tools
npm run dev`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Understanding dependencies vs. devDependencies',
        paragraphs: [
          'dependencies are bundled into the website users download (React, Firebase SDK, Lucide icons). devDependencies (TypeScript, esbuild, Tailwind) only run on your computer while developing and compiling.',
        ],
      },
      {
        heading: '2. Common Windows npm Gotchas',
        paragraphs: [
          'If you see "\'vite\' is not recognized", it means you have not run npm install inside your project folder yet after cloning/pulling from GitHub.',
          'Also note the difference between firebase (the React client SDK already listed in package.json) and firebase-tools (installed globally with npm install -g firebase-tools so the firebase deploy command works in cmd). Keep esbuild at ^0.28.0 so Vite 8 resolves cleanly without ERESOLVE errors. (On npm 12+, non-fatal allowScripts warnings during npm install do not block vite build or tsc --noEmit.)',
        ],
      },
    ],
  },
  {
    id: 'types-service',
    number: '05',
    title: 'Data Types, Firebase SDK & Service Layer',
    summary:
      'Model Boards, Columns, Tasks, and Subtasks in TypeScript, initialize dual-env Firebase, and build stable onSnapshot listeners.',
    snippets: [
      {
        label: 'src/lib/firebase.ts (supports .env.local & (default) DB)',
        language: 'ts',
        code: `import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp(resolvedConfig);
export const db =
  resolvedConfig.firestoreDatabaseId && resolvedConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, resolvedConfig.firestoreDatabaseId)
    : getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });`,
      },
      {
        label: 'src/lib/kanbanService.ts — Stable board subtasks listener',
        language: 'ts',
        code: `export function subscribeBoardSubtasks(
  boardId: string,
  taskIds: string[],
  onData: (byTask: Record<string, Subtask[]>) => void
): Unsubscribe {
  const uniqueIds = Array.from(new Set(taskIds.filter(Boolean)));
  if (uniqueIds.length === 0) { onData({}); return () => {}; }

  const byTask: Record<string, Subtask[]> = {};
  const unsubs = uniqueIds.map((taskId) =>
    onSnapshot(
      collection(db, 'boards', boardId, 'tasks', taskId, 'subtasks'),
      (snap) => {
        byTask[taskId] = snap.docs
          .map((d) => d.data() as Subtask)
          .sort((a, b) => a.position - b.position);
        onData({ ...byTask });
      }
    )
  );
  return () => unsubs.forEach((u) => u());
}`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Why Put Firestore Logic in kanbanService.ts?',
        paragraphs: [
          'Separating database calls from UI components keeps React clean and testable. TypeScript interfaces in src/types/kanban.ts act as a contract so every field—like colorRules, milestones, and notificationsEnabled—matches firestore.rules.',
        ],
      },
      {
        heading: '2. Real-Time Sync Without Wasting Free Reads',
        paragraphs: [
          'onSnapshot keeps a live stream open so teammates see changes immediately. In App.tsx, we join sorted task IDs into a single string key (taskIdsKey) so moving or renaming a card does not tear down and re-subscribe all subtask listeners—preserving your daily Spark read quota.',
        ],
      },
    ],
  },
  {
    id: 'ui-features',
    number: '06',
    title: 'Kanban UI, Dark Scrollbars, RGB Rules & Calendar Zoom',
    summary:
      'Build My Tasks Only filters, conditional checklist arrows, dark-mode scrollbar styling, canvas RGB column tinting, and scroll-wheel Days/Weeks/Months zoom.',
    snippets: [
      {
        label: 'src/index.css — Dark-mode native controls & subtle dark scrollbars',
        language: 'css',
        code: `html.dark { color-scheme: dark; }
html.dark * {
  scrollbar-color: rgba(51, 65, 85, 0.7) transparent;
  scrollbar-width: thin;
}
html.dark ::-webkit-scrollbar-thumb {
  background-color: rgba(51, 65, 85, 0.65);
  border-radius: 9999px;
}`,
      },
      {
        label: 'TaskCard.tsx — Conditional checklist arrow + stopPropagation',
        language: 'tsx',
        code: `{subtasks.length > 0 && (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      setChecklistExpanded((prev) => !prev);
    }}
  >
    <ChevronDown className={checklistExpanded ? 'rotate-180' : ''} />
  </button>
)}`,
      },
      {
        label: 'KanbanColumn.tsx — Threshold color rules with CSS RGB vars',
        language: 'tsx',
        code: `const activeRule = (column.colorRules ?? [])
  .filter((r) => tasks.length >= r.threshold)
  .sort((a, b) => b.threshold - a.threshold)[0];

// Apply --col-rgb and bg-[rgba(var(--col-rgb),0.14)] for readable tinting`,
      },
      {
        label: 'CalendarTimelineView.tsx — Continuous pxPerDay wheel zoom',
        language: 'ts',
        code: `function getGranularity(pxPerDay: number): 'day' | 'week' | 'month' {
  if (pxPerDay >= 24) return 'day';
  if (pxPerDay >= 9) return 'week';
  return 'month';
}
// Attach with { passive: false } so e.preventDefault() zooms instead of scrolling`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Expandable Card Checklists, Filters & Dark Scrollbars',
        paragraphs: [
          'The top-right expand arrow only renders when subtasks.length > 0. Both the arrow and inline checklist toggles call e.stopPropagation() so clicking them does not accidentally open the full TaskDetailModal. Next to Hide completed, the My Tasks Only toggle filters tasks where task.assigneeId === user?.uid.',
          'In src/index.css, setting color-scheme: dark and custom slate-700 ::-webkit-scrollbar / scrollbar-color rules replaces bright Windows scrollbars with low-glare dark tracks that blend into slate-900/950 surfaces.',
        ],
      },
      {
        heading: '2. Canvas RGB Palette & Threshold Column Tinting',
        paragraphs: [
          'RgbPalettePicker paints a Hue + Lightness gradient and grayscale strip onto an HTML <canvas> and reads pixels with ctx.getImageData(px, py, 1, 1).data when clicked or dragged. Columns sort matching rules descending so the highest threshold reached (e.g. red at WIP max vs. yellow 1 below) wins, and tint softly via rgba(var(--col-rgb), 0.14).',
        ],
      },
      {
        heading: '3. Smooth Calendar Zoom (Days → Weeks → Months)',
        paragraphs: [
          'A single scale value (pxPerDay, from 2.5 to 80) drives the entire timeline. A non-passive wheel listener scales pxPerDay around the date right under your mouse cursor, automatically collapsing Day columns into Week buckets below 24px/day and Month buckets below 9px/day.',
        ],
      },
    ],
  },
  {
    id: 'admin-whitelist',
    number: '07',
    title: 'Admin Permissions, Email Whitelist & Board Sharing',
    summary:
      'Gate workspace entry behind an admin whitelist, control who can create boards, issue join codes (?access=CODE), and let board creators assign column/task permissions.',
    snippets: [
      {
        label: 'firestore.rules — Per-user board creation & code redemption',
        language: 'javascript',
        code: `function canUserCreateBoards() {
  return isAdmin() || (
    isWhitelistedEmail()
    && 'canCreateBoards' in get(/databases/$(database)/documents/whitelist/$(request.auth.token.email.lower())).data
    && get(/databases/$(database)/documents/whitelist/$(request.auth.token.email.lower())).data.canCreateBoards == true
  );
}

match /boards/{boardId} {
  allow create: if canUserCreateBoards() && ...;
}`,
      },
      {
        label: 'App.tsx — Verify whitelist & board permission before provisioning',
        language: 'ts',
        code: `const adminStatus = await checkIsAdmin(nextUser);
let wlStatus = await checkUserWhitelistAccess(nextUser, adminStatus.isAdmin);
if (!wlStatus.allowed && !wlStatus.suspended && pendingAccessCode) {
  const redeemed = await redeemAccessCode(nextUser, pendingAccessCode);
  wlStatus = { allowed: true, suspended: false, canCreateBoards: redeemed.canCreateBoards, email: wlStatus.email };
}
if (!wlStatus.allowed) {
  setAccessStatus('denied');
  return;
}
await ensureUserAndStarterWorkspace(nextUser, adminStatus.isAdmin || wlStatus.canCreateBoards);`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Zero-Trust Whitelist & Board Creation Gate',
        paragraphs: [
          'When a user signs in with Google, App.tsx runs checkIsAdmin and checkUserWhitelistAccess BEFORE calling ensureUserAndStarterWorkspace. Unlisted or paused users see AccessDeniedView instead of provisioning profiles.',
          'Admins also toggle per-user board creation (canCreateBoards) on whitelist entries and join codes. Users without board-creation rights can join shared boards via invite links, while firestore.rules enforces canUserCreateBoards() on every /boards/{boardId} create.',
        ],
      },
      {
        heading: '2. Dedicated Admin Page & Join Access Codes',
        paragraphs: [
          'Admins (starting with btuttle@orangeusd.org) open Workspace Admin from the top bar or Sidebar to add single emails, bulk-paste rosters, toggle Create boards or Pause/Resume per account, generate join codes with preset permissions, and manage Global Admins.',
          'Clicking Copy Join Link copies a ?access=CODE URL that activates the verified user into /whitelist using the code’s cohort label and canCreateBoards setting.',
        ],
      },
      {
        heading: '3. Board Creator Collaborator Permissions',
        paragraphs: [
          'Inside any board’s Share & Permissions modal, the Board Creator chooses exactly what added collaborators or invite links can do: Create tasks, Edit & move tasks, Delete tasks, Add & manage columns, and Add assignee / reviewer—and can toggle those permissions live at any time. Board Creators automatically receive all permissions, and Board Manager includes Add assignee / reviewer by default.',
        ],
      },
    ],
  },
  {
    id: 'notifications-deploy',
    number: '08',
    title: 'Notifications & One-Command Free Deploy',
    summary:
      'Track upcoming due dates and milestones with per-task mute toggles, configure firebase.json, and ship live via npm run deploy:prod.',
    snippets: [
      {
        label: 'firebase.json (Hosting SPA rewrite + Firestore rules)',
        language: 'json',
        code: `{
  "firestore": {
    "rules": "firestore.rules"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}`,
      },
      {
        label: 'Deploy live from C:\\Users\\<you>\\dev\\cadence',
        language: 'bat',
        code: `git pull
npm run lint
firebase login
firebase use <your-spark-project-id>
npm run deploy:prod`,
      },
    ],
    walkthrough: [
      {
        heading: '1. Due Date & Milestone Notifications',
        paragraphs: [
          'NotificationsModal scans active tasks across accessible boards for upcoming or overdue due dates and milestones (default 7-day lead window). Checking task.notificationsEnabled === false means older tasks stay enabled by default unless explicitly muted in TaskDetailModal or inline.',
        ],
      },
      {
        heading: '2. Deploying Live With npm run deploy:prod',
        paragraphs: [
          'Running npm run deploy:prod first compiles your React app into static files inside dist/ (baking in your .env.local config), then uploads dist/ to Firebase Hosting and firestore.rules to Firestore—giving you a live HTTPS URL at https://<your-project-id>.web.app on the $0 Spark plan.',
          'Note on URLs: Firebase Project IDs are globally unique worldwide. If your chosen display name (like "cadence") is already taken by another Firebase user, Firebase appends a short suffix (e.g. cadence-2a977) and hosts your default site at https://<project-id>.web.app. Keep .firebaserc in .gitignore so each developer runs firebase use <their-own-project-id> locally.',
        ],
      },
    ],
  },
];

interface DocsModalProps {
  onClose: () => void;
}

export function DocsModal({ onClose }: DocsModalProps) {
  const [readerMode, setReaderMode] = useState<ReaderMode>('all');
  const [activeSectionId, setActiveSectionId] = useState<string>(DOC_SECTIONS[0].id);
  const [fastTrackExpanded, setFastTrackExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const activeSection =
    DOC_SECTIONS.find((s) => s.id === activeSectionId) ?? DOC_SECTIONS[0];

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="docs-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2
                id="docs-modal-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                Building Cadence — Complete Student & Engineering Guide
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                From Windows Command Prompt &amp; Git to a $0 Firebase Spark deployment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Reading mode"
              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5 text-xs"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'fast', label: 'Fast Track' },
                  { id: 'guided', label: 'Guided' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setReaderMode(item.id);
                    if (item.id === 'fast') {
                      setFastTrackExpanded(true);
                    } else if (item.id === 'all') {
                      setFastTrackExpanded(false);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                    readerMode === item.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close documentation"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: Left Chapter Index + Main Article Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          <nav
            aria-label="Documentation chapters"
            className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1"
          >
            {DOC_SECTIONS.map((sec) => {
              const active = sec.id === activeSection.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors whitespace-nowrap md:whitespace-normal shrink-0 ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200/80 dark:border-blue-800/70'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="font-mono tabular-nums text-[11px] opacity-75 shrink-0">
                    {sec.number}
                  </span>
                  <span className="leading-snug">{sec.title}</span>
                </button>
              );
            })}
          </nav>

          <article className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
            <header className="space-y-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400 font-medium">
                PART {activeSection.number} OF {String(DOC_SECTIONS.length).padStart(2, '0')}
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                {activeSection.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {activeSection.summary}
              </p>
            </header>

            {(readerMode === 'all' || readerMode === 'fast') && (
              <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 overflow-hidden">
                <button
                  type="button"
                  aria-expanded={fastTrackExpanded}
                  onClick={() => setFastTrackExpanded((prev) => !prev)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-100/80 dark:hover:bg-slate-900/60 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Terminal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
                      Fast Track — Commands &amp; Code Snippets
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      · {activeSection.snippets.length}{' '}
                      {activeSection.snippets.length === 1 ? 'snippet' : 'snippets'}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-150 shrink-0 ${
                      fastTrackExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {fastTrackExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    {activeSection.snippets.map((snippet, idx) => {
                      const key = `${activeSection.id}_${idx}`;
                      const copied = copiedKey === key;
                      return (
                        <div
                          key={key}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 overflow-hidden"
                        >
                          <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-300 truncate">
                              {snippet.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(key, snippet.code)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
                            >
                              {copied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-3.5 text-xs font-mono leading-relaxed overflow-x-auto text-slate-100">
                            <code>{snippet.code}</code>
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {(readerMode === 'all' || readerMode === 'guided') && (
              <section className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Guided Walkthrough — Step-by-Step Explanation
                </div>
                <div className="space-y-4">
                  {activeSection.walkthrough.map((block) => (
                    <div
                      key={block.heading}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4 space-y-2.5"
                    >
                      <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {block.heading}
                      </h4>
                      {block.paragraphs.map((p, i) => (
                        <p
                          key={i}
                          className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                        >
                          {p}
                        </p>
                      ))}
                      {block.bullets && (
                        <ul className="space-y-1.5 pt-1 text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                          {block.bullets.map((b, i) => (
                            <li key={i} className="leading-relaxed">
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Footer Prev / Next Chapter Navigation */}
            <footer className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              {(() => {
                const idx = DOC_SECTIONS.findIndex((s) => s.id === activeSection.id);
                const prev = idx > 0 ? DOC_SECTIONS[idx - 1] : null;
                const next = idx < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[idx + 1] : null;
                return (
                  <>
                    {prev ? (
                      <button
                        type="button"
                        onClick={() => setActiveSectionId(prev.id)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        ← {prev.number} {prev.title}
                      </button>
                    ) : (
                      <span />
                    )}
                    {next && (
                      <button
                        type="button"
                        onClick={() => setActiveSectionId(next.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        Next: {next.number} {next.title} →
                      </button>
                    )}
                  </>
                );
              })()}
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
