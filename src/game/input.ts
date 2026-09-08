export type InputActions = {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  hasAim: boolean;
  pointerDown: boolean;
  pausePressed: boolean;
};

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Escape",
  "KeyP",
]);

function radial(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = ((m - dz) / (1 - dz)) / m;
  return { x: x * scale, y: y * scale };
}

export class Input {
  keys = new Set<string>();
  injected = new Set<string>();
  aimX = 0;
  aimY = 0;
  hasAim = false;
  pointerDown = false;
  stickX = 0;
  stickY = 0;
  stickActive = false;
  private pauseEdge = false;
  private prevPause = false;
  private canvas: HTMLCanvasElement | null = null;
  private onKeyDown = (e: KeyboardEvent) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.pointerDown = false;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.canvas) return;
    if (e.pointerType === "touch" && !this.pointerDown && e.pointerId !== this.stickId) return;
    this.updateAimFromEvent(e);
  };
  private onPointerDown = (e: PointerEvent) => {
    if (!this.canvas) return;
    if ((e.target as HTMLElement | null)?.closest("[data-ui]")) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointerDown = true;
    this.updateAimFromEvent(e);
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.canvas?.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.pointerDown = false;
  };

  stickId: number | null = null;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
    this.canvas?.removeEventListener("pointermove", this.onPointerMove);
    this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas?.removeEventListener("pointerup", this.onPointerUp);
    this.canvas?.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas = null;
  }

  setStick(x: number, y: number, active: boolean, id: number | null) {
    const v = radial(x, y);
    this.stickX = v.x;
    this.stickY = v.y;
    this.stickActive = active;
    this.stickId = id;
  }

  setKeys(codes: string[]) {
    this.injected = new Set(codes);
  }

  sample(playerX: number, playerY: number): InputActions {
    const down = (code: string) => this.keys.has(code) || this.injected.has(code);
    let mx = 0;
    let my = 0;
    if (down("KeyA") || down("ArrowLeft")) mx -= 1;
    if (down("KeyD") || down("ArrowRight")) mx += 1;
    if (down("KeyW") || down("ArrowUp")) my -= 1;
    if (down("KeyS") || down("ArrowDown")) my += 1;
    if (this.stickActive) {
      mx += this.stickX;
      my += this.stickY;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    const pauseHeld = down("Escape") || down("KeyP");
    this.pauseEdge = pauseHeld && !this.prevPause;
    this.prevPause = pauseHeld;

    return {
      moveX: mx,
      moveY: my,
      aimX: this.hasAim ? this.aimX : playerX,
      aimY: this.hasAim ? this.aimY : playerY - 80,
      hasAim: this.hasAim,
      pointerDown: this.pointerDown,
      pausePressed: this.pauseEdge,
    };
  }

  clientToWorld(clientX: number, clientY: number) {
    if (!this.canvas) return { x: 0, y: 0 };
    const r = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / r.width;
    const sy = this.canvas.height / r.height;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }

  private updateAimFromEvent(e: PointerEvent) {
    const p = this.clientToWorld(e.clientX, e.clientY);
    this.aimX = p.x;
    this.aimY = p.y;
    this.hasAim = true;
  }
}
