import { PLAYER_MAX_HP, PLAYER_MAX_MANA } from "./config";

export interface DeveloperState {
  invincible: boolean;
  startWave: number;
  showHitboxes: boolean;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
}

export interface SessionState {
  developer: DeveloperState;
  player: PlayerState;
  wave: number;
}

export const createDefaultSession = (): SessionState => ({
  developer: {
    invincible: false,
    startWave: 1,
    showHitboxes: false,
  },
  player: {
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    mana: 0,
    maxMana: PLAYER_MAX_MANA,
  },
  wave: 1,
});
