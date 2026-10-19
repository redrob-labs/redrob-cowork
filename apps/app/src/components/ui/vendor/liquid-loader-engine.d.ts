export interface LiquidLoaderOptions {
  /** CSS px, square. Brand minimum for the animated symbol: 96. Default 160. */
  size?: number;
  /** Default Redrob Blue #2B52FF. Use #FFFFFF on dark or brand grounds. */
  color?: string;
  /** Default true. */
  autoplay?: boolean;
  /** 'auto' follows the OS "reduce motion" setting. Default 'auto'. */
  reducedMotion?: 'auto' | 'always' | 'never';
  /** Playback rate. Keep 1 for the brand rhythm. */
  speed?: number;
}

export interface LiquidLoader {
  start(): void;
  stop(): void;
  /** New size in CSS px (re-reads devicePixelRatio). */
  resize(size?: number): void;
  /** Stop and draw a fixed moment, in seconds into the loop. */
  renderAt(t: number): void;
  setColor(color: string): void;
  readonly time: number;
  destroy(): void;
}

/** Mount the liquid loader on a canvas. */
export function createLiquidLoader(canvas: HTMLCanvasElement, opts?: LiquidLoaderOptions): LiquidLoader;
/** Warm the one-time precomputation (about 0.3-0.6 s) before the first loader appears. */
export function preload(): void;
/** 8.64 s: 32 steps of 0.27 s, 8 Loader beats. */
export const LOOP_SECONDS: number;

export interface EngineState { mode: 'mark' | 'bars' | 'field'; s?: number; f?: (x: number, y: number) => number; }
/** Engine access for tests and tooling. */
export const engine: {
  T: Record<string, number>;
  stateAt(t: number): EngineState;
  fieldAt(s: number, back: boolean, t: number, ev: unknown): (x: number, y: number) => number;
  events(): { fa: number; ba: number; snap: number; land: number[] };
  light(t: number, i: number, t0: number): number;
  landing(t: number, tl: number): number;
  levels(): Float32Array[];
};
