export interface LegacyGameHandle {
  start(): void;
  stop(): void;
  restart(): void;
  toggleDebugNoDamage(force?: boolean): void;
  addGold(amount: number): void;
  healFull(): void;
  skipRoom(): void;
  forceSkillChoices(): void;
}

export interface LegacyGameOptions {
  startWave?: number;
  debugNoDamage?: boolean;
}

export function createGame(args: {
  canvas: HTMLCanvasElement;
  hudRoot: HTMLDivElement;
  overlayRoot: HTMLDivElement;
  options?: LegacyGameOptions;
}): LegacyGameHandle;
