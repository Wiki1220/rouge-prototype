export function formatElementLabel(element) {
  return {
    fire: "火",
    water: "水",
    wood: "木",
    wind: "风",
    thunder: "雷",
  }[element] ?? element;
}

export function formatElementList(elements) {
  if (!elements || elements.length === 0) return "无属性";
  return elements.map((element) => formatElementLabel(element)).join(" / ");
}

function hasUnreadableText(text) {
  return !text || /^(?:\?+|undefined|null)$/i.test(String(text).trim());
}

export function getReadableText(value, fallback) {
  return hasUnreadableText(value) ? fallback : value;
}

export function getEnemyLabel(enemy) {
  const fallbackById = {
    bruiser: "重甲怪",
    runner: "迅行怪",
    turret: "炮台怪",
    sniper: "狙击怪",
    trail: "蚀痕怪",
    ember: "余烬怪",
    eliteDash: "冲锋精英",
    eliteNest: "裂巢精英",
    eliteRevive: "复生精英",
    elite: "精英卫士",
    boss: "监察者",
    finalBoss: "王冠核心",
  };
  return getReadableText(enemy?.name, fallbackById[enemy?.id] ?? enemy?.id ?? "敌人");
}

export function getOfferLabel(offer) {
  return getReadableText(offer?.name, offer?.id ?? "未知奖励");
}

export function getOfferDescription(offer) {
  return getReadableText(offer?.description, "暂无说明");
}

export function getSkillLabel(skill) {
  const fallbackById = {
    "flare-burst": "灼焰迸发",
    "gale-step": "疾风步",
    "tidal-shell": "潮汐护壳",
    "spark-link": "雷链追击",
    "verdant-pulse": "青木脉冲",
    "monsoon-drive": "季风驱动",
    "voltaic-lattice": "伏特矩阵",
    "perfect-overdrive": "极限超载",
    "ember-echo": "余烬回响",
    "torrent-lance": "洪流穿枪",
    "storm-recital": "风暴咏叹",
    "evergreen-oath": "常青誓约",
    "frost-ward": "霜镜护场",
    "delayed-sunburst": "迟滞日珥",
    "sanctuary-ring": "回春圣环",
  };
  return getReadableText(skill?.name, fallbackById[skill?.id] ?? skill?.id ?? "空");
}

export function getSkillDescription(skill, fallback) {
  const fallbackById = {
    "flare-burst": "向周身释放 6 枚火焰爆裂弹。",
    "gale-step": "4 秒内移动速度提升 60%。",
    "tidal-shell": "恢复 2 点生命，并在 4 秒内减伤 50%。",
    "spark-link": "释放 3 枚追踪雷弹，可触发连锁。",
    "verdant-pulse": "最大生命 +1，并恢复 4 点生命。",
    "monsoon-drive": "朝前方泼洒 8 枚季风弹幕。",
    "voltaic-lattice": "8 秒内攻速提升并强化连锁概率。",
    "perfect-overdrive": "10 秒内大幅提升攻速与弹速。",
    "ember-echo": "连续两次释放环形余烬爆裂。",
    "torrent-lance": "射出可穿透并减速的洪流长枪。",
    "storm-recital": "连续生成多轮追踪风雷弹。",
    "evergreen-oath": "提升生命上限、恢复生命并短暂加速。",
    "frost-ward": "获得护盾，并在周围形成减速冰环。",
    "delayed-sunburst": "短暂延迟后爆发一圈高伤日珥。",
    "sanctuary-ring": "生成护盾与持续回复光环。",
  };
  return getReadableText(skill?.description, fallbackById[skill?.id] ?? fallback);
}

export function formatPhaseLabel(phase) {
  return {
    battle: "战斗",
    shop: "商店",
    reward: "奖励",
    gameover: "失败",
    victory: "胜利",
  }[phase] ?? phase;
}

export function formatBuffLabel(buffTag) {
  return {
    red: "红",
    blue: "蓝",
    green: "绿",
  }[buffTag] ?? buffTag;
}
