import { createGame } from "./runtime/game.js";

const preventedKeys = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
window.addEventListener(
  "keydown",
  (event) => {
    if (preventedKeys.has(event.code)) {
      event.preventDefault();
    }
    if (event.code === "Escape" && hasStarted) {
      const openedModal = menuLayer.querySelector("[data-modal]");
      if (openedModal) {
        closeModal();
      } else {
        renderPauseMenu();
      }
    }
  },
  { passive: false },
);

const canvasElement = document.getElementById("game-canvas");
const hudElement = document.getElementById("hud-panel");
const overlayElement = document.getElementById("overlay-root");
const menuElement = document.getElementById("menu-layer");

if (!(canvasElement instanceof HTMLCanvasElement) || !(hudElement instanceof HTMLDivElement) || !(overlayElement instanceof HTMLDivElement) || !(menuElement instanceof HTMLDivElement)) {
  throw new Error("Game shell DOM is incomplete.");
}

const canvas = canvasElement;
const hudRoot = hudElement;
const overlayRoot = overlayElement;
const menuLayer = menuElement;

interface LaunchOptions {
  startWave: number;
  debugNoDamage: boolean;
}

const launchOptions: LaunchOptions = {
  startWave: 1,
  debugNoDamage: false,
};

let hasStarted = false;
let activeGame: ReturnType<typeof createGame> | null = null;

function escapeHtml(value: string): string {
  return value
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}

function renderMenu(): void {
  menuLayer.innerHTML = `
    <div class="menu-screen">
      <div class="menu-card">
        <div class="menu-grid">
          <div>
            <h1 class="menu-title">轮骰生存</h1>
            <p class="menu-subtitle">旧原型的完整主循环已经重新接回到新的大游戏窗口里。现在会优先保住玩法完整度，再继续逐步替换底层。</p>
            <div class="menu-actions">
              <button type="button" class="menu-button" data-action="start">开始测试</button>
              <button type="button" class="menu-button" data-action="help">操作说明</button>
              <button type="button" class="menu-button" data-action="developer">开发者面板</button>
            </div>
          </div>
          <div class="info-list">
            <div class="dev-stat">
              <div class="chip">当前试玩入口</div>
              <p class="info-text">WASD 移动，Q/E 选择技能，Z/C 释放技能，商店阶段用 1/2/3 购买，= 切换测试无敌。</p>
            </div>
            <div class="dev-stat">
              <div class="chip">本轮目标</div>
              <p class="info-text">把之前的 23 波主线、商店、宝箱房、休息房、精英/Boss、地形伤害和无尽试炼先全部搬回这个新窗口里。</p>
            </div>
            <div class="dev-stat">
              <div class="chip">当前启动配置</div>
              <p class="info-text">起始波次：${launchOptions.startWave}<br />默认无敌：${launchOptions.debugNoDamage ? "开启" : "关闭"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  menuLayer.querySelector('[data-action="start"]')?.addEventListener("click", startGame);
  menuLayer.querySelector('[data-action="help"]')?.addEventListener("click", renderHelpModal);
  menuLayer.querySelector('[data-action="developer"]')?.addEventListener("click", renderDeveloperModal);
}

function ensureHamburgerButton(): void {
  if (document.getElementById("hud-menu-button")) return;
  const button = document.createElement("button");
  button.id = "hud-menu-button";
  button.className = "hud-menu-button";
  button.type = "button";
  button.setAttribute("aria-label", "打开菜单");
  button.innerHTML = "<span></span><span></span><span></span>";
  button.addEventListener("click", renderPauseMenu);
  document.getElementById("game-frame")?.appendChild(button);
}

function renderModal(title: string, body: string): void {
  menuLayer.insertAdjacentHTML(
    "beforeend",
    `
    <div class="modal-screen" data-modal>
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(title)}</h2>
          <button type="button" class="modal-close" data-close-modal>×</button>
        </div>
        ${body}
      </div>
    </div>
    `,
  );

  menuLayer.querySelector("[data-close-modal]")?.addEventListener("click", closeModal);
  menuLayer.querySelector("[data-modal]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  });
}

function closeModal(): void {
  menuLayer.querySelector("[data-modal]")?.remove();
}

function renderHelpModal(): void {
  renderModal(
    "操作说明",
    `
      <div class="info-list">
        <div class="dev-stat"><div class="chip">基础操作</div><p class="modal-copy">WASD 移动，Q / E 选择候选技能，Z / C 释放已装备技能。</p></div>
        <div class="dev-stat"><div class="chip">商店与奖励</div><p class="modal-copy">商店阶段按 1 / 2 / 3 购买，左右方向键切换当前滚筒，X 售出当前滚筒。宝箱房按提示拾取或选择奖励。</p></div>
        <div class="dev-stat"><div class="chip">调试快捷键</div><p class="modal-copy">= 切换测试无敌，R 在失败或胜利后重开。</p></div>
      </div>
    `,
  );
}

function renderDeveloperModal(): void {
  renderModal(
    "开发者面板",
    `
      <div class="dev-grid">
        <button type="button" class="dev-button" data-toggle-invincible>默认无敌：${launchOptions.debugNoDamage ? "开启" : "关闭"}</button>
        <div class="dev-stat">
          <div class="chip">起始波次</div>
          <p class="modal-copy">当前从第 ${launchOptions.startWave} 波开始。</p>
          <div class="menu-actions">
            <button type="button" class="dev-button" data-wave-minus>-1 波</button>
            <button type="button" class="dev-button" data-wave-plus>+1 波</button>
          </div>
        </div>
      </div>
    `,
  );

  menuLayer.querySelector('[data-toggle-invincible]')?.addEventListener("click", () => {
    launchOptions.debugNoDamage = !launchOptions.debugNoDamage;
    closeModal();
    renderDeveloperModal();
  });
  menuLayer.querySelector('[data-wave-minus]')?.addEventListener("click", () => {
    launchOptions.startWave = Math.max(1, launchOptions.startWave - 1);
    closeModal();
    renderDeveloperModal();
  });
  menuLayer.querySelector('[data-wave-plus]')?.addEventListener("click", () => {
    launchOptions.startWave = Math.min(24, launchOptions.startWave + 1);
    closeModal();
    renderDeveloperModal();
  });
}

function renderPauseMenu(): void {
  if (!hasStarted) {
    return;
  }
  renderModal(
    "游戏菜单",
    `
      <div class="info-list">
        <div class="dev-grid">
          <button type="button" class="dev-button" data-open-settings>设置</button>
          <button type="button" class="dev-button" data-open-dev>开发者</button>
          <button type="button" class="dev-button" data-restart-run>重新开局</button>
          <button type="button" class="dev-button" data-exit-run>退出到主菜单</button>
        </div>
      </div>
    `,
  );

  menuLayer.querySelector('[data-open-settings]')?.addEventListener("click", () => {
    closeModal();
    renderSettingsModal();
  });
  menuLayer.querySelector('[data-open-dev]')?.addEventListener("click", () => {
    closeModal();
    renderInGameDeveloperModal();
  });
  menuLayer.querySelector('[data-restart-run]')?.addEventListener("click", () => {
    activeGame?.restart();
    closeModal();
  });
  menuLayer.querySelector('[data-exit-run]')?.addEventListener("click", exitToMainMenu);
}

function renderSettingsModal(): void {
  renderModal(
    "设置",
    `
      <div class="info-list">
        <div class="dev-stat">
          <div class="chip">界面</div>
          <p class="modal-copy">当前版本已切换为精简 HUD。音频、画质和键位设置会在后续版本补充。</p>
        </div>
        <div class="dev-stat">
          <div class="chip">操作</div>
          <p class="modal-copy">ESC 可打开或关闭菜单。空格不会再滚动页面。</p>
        </div>
      </div>
    `,
  );
}

function renderInGameDeveloperModal(): void {
  renderModal(
    "开发者选项",
    `
      <div class="dev-grid">
        <button type="button" class="dev-button" data-dev-invincible>切换无敌</button>
        <button type="button" class="dev-button" data-dev-heal>生命回满</button>
        <button type="button" class="dev-button" data-dev-gold>+10 金币</button>
        <button type="button" class="dev-button" data-dev-skip>跳过当前房间</button>
        <button type="button" class="dev-button" data-dev-skills>强制生成技能候选</button>
      </div>
    `,
  );

  menuLayer.querySelector('[data-dev-invincible]')?.addEventListener("click", () => activeGame?.toggleDebugNoDamage());
  menuLayer.querySelector('[data-dev-heal]')?.addEventListener("click", () => activeGame?.healFull());
  menuLayer.querySelector('[data-dev-gold]')?.addEventListener("click", () => activeGame?.addGold(10));
  menuLayer.querySelector('[data-dev-skip]')?.addEventListener("click", () => activeGame?.skipRoom());
  menuLayer.querySelector('[data-dev-skills]')?.addEventListener("click", () => activeGame?.forceSkillChoices());
}

function exitToMainMenu(): void {
  activeGame?.stop();
  activeGame = null;
  hasStarted = false;
  hudRoot.innerHTML = "";
  overlayRoot.innerHTML = "";
  closeModal();
  renderMenu();
}

function startGame(): void {
  if (hasStarted) {
    return;
  }
  hasStarted = true;
  menuLayer.innerHTML = "";
  ensureHamburgerButton();
  activeGame = createGame({
    canvas,
    hudRoot,
    overlayRoot,
    options: {
      startWave: launchOptions.startWave,
      debugNoDamage: launchOptions.debugNoDamage,
    },
  });
  activeGame.start();
}

renderMenu();
