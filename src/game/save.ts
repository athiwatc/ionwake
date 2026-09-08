export const SAVE_VERSION = 1;
const KEY = "ionwake-save-v1";

export type ScoreRow = {
  name: string;
  score: number;
  wave: number;
  at: number;
};

export type Settings = {
  muted: boolean;
  shake: boolean;
};

type SaveBlob = {
  version: number;
  scores: ScoreRow[];
  settings: Settings;
};

const DEFAULTS: SaveBlob = {
  version: SAVE_VERSION,
  scores: [],
  settings: { muted: false, shake: true },
};

function migrate(raw: SaveBlob): SaveBlob {
  const s = { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...raw.settings } };
  s.version = SAVE_VERSION;
  s.scores = Array.isArray(raw.scores)
    ? raw.scores
        .filter((r) => r && typeof r.score === "number")
        .map((r) => ({
          name: String(r.name ?? "---").slice(0, 3).toUpperCase(),
          score: Math.max(0, Math.floor(r.score)),
          wave: Math.max(1, Math.floor(r.wave ?? 1)),
          at: typeof r.at === "number" ? r.at : Date.now(),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
    : [];
  return s;
}

function read(): SaveBlob {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as SaveBlob;
    if (!parsed || typeof parsed !== "object") return structuredClone(DEFAULTS);
    return migrate(parsed);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function write(blob: SaveBlob) {
  try {
    localStorage.setItem(KEY, JSON.stringify(blob));
  } catch {
    /* private mode / quota */
  }
}

export function loadScores(): ScoreRow[] {
  return read().scores;
}

export function loadSettings(): Settings {
  return read().settings;
}

export function saveSettings(settings: Settings) {
  const blob = read();
  blob.settings = settings;
  write(blob);
}

export function qualifies(score: number): boolean {
  const scores = loadScores();
  return scores.length < 10 || score > (scores[scores.length - 1]?.score ?? 0);
}

export function submitScore(row: Omit<ScoreRow, "at">): ScoreRow[] {
  const blob = read();
  blob.scores.push({ ...row, name: row.name.slice(0, 3).toUpperCase(), at: Date.now() });
  blob.scores.sort((a, b) => b.score - a.score);
  blob.scores = blob.scores.slice(0, 10);
  write(blob);
  return blob.scores;
}
