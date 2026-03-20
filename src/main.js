import { createGame } from "./runtime/game.js";

const canvas = document.getElementById("game-canvas");
const hudRoot = document.getElementById("hud-panel");
const overlayRoot = document.getElementById("overlay-root");

createGame({ canvas, hudRoot, overlayRoot }).start();
