import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronsUp,
  Gauge,
  Pause,
  Play,
  Shield,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Game } from "@/game/engine";
import { hydrateScores, useHud } from "@/game/store";
import { saveSettings } from "@/game/save";

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const hud = useHud();
  const [name, setName] = useState("ACE");
  const [ready, setReady] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    hydrateScores();
    const coarseMq = window.matchMedia("(pointer: coarse)");
    const sync = () => {
      const touch = coarseMq.matches || "ontouchstart" in window;
      setCoarse(touch);
      useHud.getState().patch({ touch });
    };
    sync();
    coarseMq.addEventListener("change", sync);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    gameRef.current = game;
    game.startLoop();
    setReady(true);
    return () => {
      coarseMq.removeEventListener("change", sync);
      game.destroy();
      gameRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    gameRef.current?.audio.setMuted(hud.muted);
    saveSettings({ muted: hud.muted, shake: hud.shake });
  }, [hud.muted, hud.shake]);

  const playing = hud.phase === "playing";
  const overlay = hud.phase !== "playing";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        aria-label="IONWAKE arena"
      />

      {playing && <HudChrome />}
      {playing && <PauseFab onClick={() => gameRef.current?.togglePause()} />}
      {(playing || hud.phase === "paused") && coarse && (
        <Joystick
          onChange={(x, y, active, id) => gameRef.current?.input.setStick(x, y, active, id)}
        />
      )}

      {overlay && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="pointer-events-auto w-full max-w-md">
            {hud.phase === "title" && (
              <Panel>
                <p className="font-display text-xs font-medium tracking-[0.28em] text-muted">
                  BREAK THE VEIL
                </p>
                <h1 className="font-display mt-2 text-5xl font-semibold tracking-tight text-fg text-balance sm:text-6xl">
                  IONWAKE
                </h1>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted text-pretty">
                  WASD or arrows to move. Mouse aims, auto-fire. Drag to fly with a
                  pointer. Survive the waves.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  <Primary disabled={!ready} onClick={() => gameRef.current?.begin()}>Start</Primary>
                  <Ghost onClick={() => gameRef.current?.toScores()}>High scores</Ghost>
                </div>
              </Panel>
            )}

            {hud.phase === "paused" && (
              <Panel>
                <h2 className="font-display text-3xl font-semibold tracking-tight">Halted</h2>
                <p className="mt-2 text-sm text-muted">Wave {String(hud.wave).padStart(2, "0")}</p>
                <div className="mt-6 flex flex-col gap-2">
                  <Primary onClick={() => gameRef.current?.resume()}>
                    <Play className="size-4" /> Resume
                  </Primary>
                  <Ghost onClick={() => gameRef.current?.toScores()}>High scores</Ghost>
                  <Ghost
                    onClick={() =>
                      useHud.getState().patch({ muted: !useHud.getState().muted })
                    }
                  >
                    {hud.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                    {hud.muted ? "Sound off" : "Sound on"}
                  </Ghost>
                  <Ghost
                    onClick={() =>
                      useHud.getState().patch({ shake: !useHud.getState().shake })
                    }
                  >
                    Shake {hud.shake ? "on" : "off"}
                  </Ghost>
                  <Ghost onClick={() => gameRef.current?.toTitle()}>Quit to title</Ghost>
                </div>
              </Panel>
            )}

            {hud.phase === "over" && (
              <Panel>
                <p className="font-display text-xs tracking-[0.24em] text-muted">SIGNAL LOST</p>
                <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight">
                  {hud.lastScore.toLocaleString()}
                </h2>
                <p className="mt-1 text-sm text-muted">Wave {hud.lastWave}</p>
                {hud.pendingName && (
                  <form
                    className="mt-5 flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      gameRef.current?.submitName(name);
                    }}
                  >
                    <label className="text-xs font-medium tracking-[0.16em] text-muted" htmlFor="pilot">
                      Callsign
                    </label>
                    <input
                      id="pilot"
                      value={name}
                      maxLength={3}
                      autoComplete="off"
                      onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      className="h-11 rounded-md border border-border bg-surface-2 px-3 font-display text-lg tracking-[0.4em] text-fg outline-none focus:border-border-strong"
                    />
                    <Primary type="submit">Save score</Primary>
                  </form>
                )}
                <div className="mt-5 flex flex-col gap-2">
                  <Primary onClick={() => gameRef.current?.begin()}>Again</Primary>
                  <Ghost onClick={() => gameRef.current?.toScores()}>High scores</Ghost>
                  <Ghost onClick={() => gameRef.current?.toTitle()}>Title</Ghost>
                </div>
              </Panel>
            )}

            {hud.phase === "scores" && <ScoreBoard onBack={() => gameRef.current?.toTitle()} />}
          </div>
        </div>
      )}
    </div>
  );
}

function HudChrome() {
  const { score, lives, wave, banner, shield, multi, speed } = useHud();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="rounded-lg border border-border bg-bg/70 px-3 py-2">
        <p className="font-display text-[0.65rem] tracking-[0.22em] text-muted">SCORE</p>
        <p className="font-display text-xl font-semibold tabular-nums tracking-tight">{score.toLocaleString()}</p>
        <p className="mt-1 font-display text-[0.65rem] tracking-[0.18em] text-muted">
          WAVE {String(wave).padStart(2, "0")}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg/70 px-3 py-2">
          {Array.from({ length: Math.max(lives, 0) }).map((_, i) => (
            <span key={i} className="block size-2 rounded-full bg-fg" />
          ))}
          {lives <= 0 && <span className="text-xs text-muted">—</span>}
        </div>
        <div className="flex gap-1">
          {multi > 0 && (
            <Chip>
              <ChevronsUp className="size-3.5" /> {Math.ceil(multi)}s
            </Chip>
          )}
          {shield > 0 && (
            <Chip>
              <Shield className="size-3.5" /> {Math.ceil(shield)}s
            </Chip>
          )}
          {speed > 0 && (
            <Chip>
              <Gauge className="size-3.5" /> {Math.ceil(speed)}s
            </Chip>
          )}
        </div>
      </div>
      {banner && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[140%] font-display text-3xl font-semibold tracking-[0.2em] text-fg">
          {banner}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg/70 px-2 py-1 font-display text-[0.65rem] tabular-nums tracking-wide text-accent">
      {children}
    </span>
  );
}

function PauseFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      data-ui
      type="button"
      onClick={onClick}
      className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-20 flex size-11 items-center justify-center rounded-md border border-border bg-surface/80 text-fg"
      aria-label="Pause"
    >
      <Pause className="size-4" />
    </button>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface/92 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      {children}
    </section>
  );
}

function Primary({
  children,
  onClick,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      data-ui
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent font-display text-sm font-semibold tracking-[0.14em] text-accent-fg transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Ghost({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      data-ui
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-transparent font-display text-sm font-medium tracking-[0.12em] text-fg transition-colors duration-150 hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function ScoreBoard({ onBack }: { onBack: () => void }) {
  const scores = useHud((s) => s.highScores);
  return (
    <Panel>
      <h2 className="font-display text-2xl font-semibold tracking-tight">High scores</h2>
      <ol className="mt-4 divide-y divide-border">
        {scores.length === 0 && <li className="py-6 text-sm text-muted">No wakes recorded.</li>}
        {scores.map((row, i) => (
          <li key={`${row.at}-${i}`} className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="font-display w-6 text-xs tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-display tracking-[0.2em]">{row.name}</span>
            <span className="ml-auto font-display tabular-nums text-fg">{row.score.toLocaleString()}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted">W{row.wave}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5">
        <Ghost onClick={onBack}>Back</Ghost>
      </div>
    </Panel>
  );
}

function Joystick({
  onChange,
}: {
  onChange: (x: number, y: number, active: boolean, id: number | null) => void;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const apply = (clientX: number, clientY: number, id: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (clientX - cx) / (r.width * 0.5);
    let dy = (clientY - cy) / (r.height * 0.5);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx, dy, true, id);
  };

  return (
    <div
      data-ui
      ref={baseRef}
      className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-4 z-20 size-28 rounded-full border border-border-strong bg-surface/50"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        apply(e.clientX, e.clientY, e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) apply(e.clientX, e.clientY, e.pointerId);
      }}
      onPointerUp={(e) => {
        setKnob({ x: 0, y: 0 });
        onChange(0, 0, false, null);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        setKnob({ x: 0, y: 0 });
        onChange(0, 0, false, null);
      }}
    >
      <div
        className="absolute size-11 rounded-full border border-border bg-accent/90"
        style={{
          left: `calc(50% + ${knob.x * 36}px)`,
          top: `calc(50% + ${knob.y * 36}px)`,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
