import { create } from "zustand";
import { loadScores, loadSettings, type ScoreRow } from "./save";

export type Phase = "title" | "playing" | "paused" | "over" | "scores";

export type HudState = {
  phase: Phase;
  score: number;
  lives: number;
  wave: number;
  banner: string;
  shield: number;
  multi: number;
  speed: number;
  muted: boolean;
  shake: boolean;
  highScores: ScoreRow[];
  pendingName: boolean;
  lastScore: number;
  lastWave: number;
  touch: boolean;
};

type Actions = {
  patch: (partial: Partial<HudState>) => void;
  resetRun: () => void;
};

const settings = (() => {
  try {
    return loadSettings();
  } catch {
    return { muted: false, shake: true };
  }
})();

export const useHud = create<HudState & Actions>((set) => ({
  phase: "title",
  score: 0,
  lives: 3,
  wave: 1,
  banner: "",
  shield: 0,
  multi: 0,
  speed: 0,
  muted: settings.muted,
  shake: settings.shake,
  highScores: [],
  pendingName: false,
  lastScore: 0,
  lastWave: 1,
  touch: false,
  patch: (partial) => set(partial),
  resetRun: () =>
    set({
      score: 0,
      lives: 3,
      wave: 1,
      banner: "",
      shield: 0,
      multi: 0,
      speed: 0,
      pendingName: false,
    }),
}));

export function hydrateScores() {
  try {
    useHud.getState().patch({ highScores: loadScores() });
  } catch {
    useHud.getState().patch({ highScores: [] });
  }
}
