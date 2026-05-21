const ROUND_SECONDS = 45;

const punches = {
  jab: { power: 12, heat: 7, label: "啪！", glove: "left" },
  hook: { power: 18, heat: 10, label: "砰！", glove: "right" },
  uppercut: { power: 26, heat: 14, label: "嘭！", glove: "left" },
};

const state = {
  score: 0,
  combo: 0,
  best: Number(localStorage.getItem("zounimen-best-score") || 0),
  heat: 0,
  timeLeft: ROUND_SECONDS,
  activeIndex: 1,
  running: false,
  sound: true,
  targets: [100, 100, 100],
  comboTimer: null,
  clockTimer: null,
  activeTimer: null,
  audioContext: null,
};

const elements = {
  stage: document.querySelector("#stage"),
  targets: [...document.querySelectorAll(".target")],
  score: document.querySelector("#score"),
  combo: document.querySelector("#combo"),
  timeLeft: document.querySelector("#timeLeft"),
  bestScore: document.querySelector("#bestScore"),
  heatFill: document.querySelector("#heatFill"),
  impactLayer: document.querySelector("#impactLayer"),
  banner: document.querySelector("#roundBanner"),
  liveStatus: document.querySelector("#liveStatus"),
  resetButton: document.querySelector("#resetButton"),
  soundToggle: document.querySelector("#soundToggle"),
  leftGlove: document.querySelector(".glove-left"),
  rightGlove: document.querySelector(".glove-right"),
  strikeButtons: [...document.querySelectorAll("[data-strike]")],
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function getTargetCenter(target) {
  const stageRect = elements.stage.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  return {
    x: targetRect.left - stageRect.left + targetRect.width / 2,
    y: targetRect.top - stageRect.top + targetRect.height * 0.46,
  };
}

function updateHud() {
  elements.score.textContent = state.score.toLocaleString("zh-Hant");
  elements.combo.textContent = state.combo.toString();
  elements.timeLeft.textContent = state.timeLeft.toString();
  elements.bestScore.textContent = state.best.toLocaleString("zh-Hant");
  elements.heatFill.style.width = `${state.heat}%`;
  elements.targets.forEach((target, index) => {
    target.classList.toggle("is-active", index === state.activeIndex);
    target.style.setProperty("--mood", `${state.targets[index]}%`);
  });
}

function setActiveTarget(index) {
  state.activeIndex = index;
  updateHud();
}

function pickNextTarget() {
  const nextIndex = (state.activeIndex + 1 + Math.floor(Math.random() * 2)) % elements.targets.length;
  setActiveTarget(nextIndex);
}

function showBanner(message) {
  elements.banner.textContent = message;
  elements.banner.classList.remove("is-visible");
  void elements.banner.offsetWidth;
  elements.banner.classList.add("is-visible");
}

function playPunchSound(power) {
  if (!state.sound) return;

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;

  if (!state.audioContext) {
    state.audioContext = new AudioContextConstructor();
  }

  const context = state.audioContext;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const now = context.currentTime;

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(130 + power * 6, now);
  oscillator.frequency.exponentialRampToValueAtTime(46, now + 0.11);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(720, now);
  filter.frequency.exponentialRampToValueAtTime(150, now + 0.12);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.15);
}

function animateGlove(side) {
  const glove = side === "right" ? elements.rightGlove : elements.leftGlove;
  glove.classList.remove("is-punching");
  void glove.offsetWidth;
  glove.classList.add("is-punching");
}

function shakeStage() {
  elements.stage.classList.remove("is-shaking");
  void elements.stage.offsetWidth;
  elements.stage.classList.add("is-shaking");
}

function createBurst(x, y, label, scoreGain) {
  const burst = document.createElement("span");
  burst.className = "burst";
  burst.textContent = `${label} +${scoreGain}`;
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  burst.style.setProperty("--spin", `${randomBetween(-8, 8)}deg`);
  elements.impactLayer.append(burst);
  burst.addEventListener("animationend", () => burst.remove(), { once: true });
}

function createParticles(x, y, amount) {
  const colors = ["#ffd84d", "#ff5d4d", "#14b8a6", "#6d5dfc", "#ffffff"];

  for (let index = 0; index < amount; index += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.background = colors[index % colors.length];
    particle.style.setProperty("--x", `${randomBetween(-120, 120)}px`);
    particle.style.setProperty("--y", `${randomBetween(-96, 40)}px`);
    elements.impactLayer.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function resetComboTimer() {
  window.clearTimeout(state.comboTimer);
  state.comboTimer = window.setTimeout(() => {
    state.combo = 0;
    updateHud();
  }, 1300);
}

function bindTapAction(element, action) {
  let lastTouchActionAt = 0;

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;

    if (event.cancelable) {
      event.preventDefault();
    }

    lastTouchActionAt = Date.now();
    action(event);
  });

  element.addEventListener("click", (event) => {
    if (Date.now() - lastTouchActionAt < 450) {
      event.preventDefault();
      return;
    }

    action(event);
  });
}

document.addEventListener(
  "dblclick",
  (event) => {
    if (event.target instanceof Element && event.target.closest(".app-shell") && event.cancelable) {
      event.preventDefault();
    }
  },
  { passive: false },
);

function beginRound() {
  if (state.running || state.timeLeft <= 0) return;

  state.running = true;
  showBanner("Go");
  startTimers();
  updateHud();
}

function enterRushMode() {
  state.heat = 0;
  state.timeLeft = Math.min(ROUND_SECONDS, state.timeLeft + 3);
  elements.stage.classList.add("is-rush");
  showBanner("火力全開");
  window.setTimeout(() => elements.stage.classList.remove("is-rush"), 1400);
}

function staggerTarget(target, index) {
  target.classList.add("is-staggered");
  state.targets[index] = 100;
  state.score += 120 + state.combo * 4;
  showBanner("擊退煩惱");
  window.setTimeout(() => target.classList.remove("is-staggered"), 620);
}

function strikeTarget(index, punchName = "hook") {
  if (!state.running) {
    beginRound();
  }

  if (!state.running) return;

  const target = elements.targets[index];
  const punch = punches[punchName] || punches.hook;
  const isActive = index === state.activeIndex;
  const comboBonus = Math.min(state.combo * 2, 80);
  const scoreGain = punch.power + comboBonus + (isActive ? 28 : 0);
  const center = getTargetCenter(target);

  state.combo += 1;
  state.score += scoreGain;
  state.heat = clamp(state.heat + punch.heat + (isActive ? 4 : 0), 0, 100);
  state.targets[index] = clamp(state.targets[index] - punch.power - (isActive ? 8 : 0), 0, 100);

  target.classList.remove("is-hit");
  void target.offsetWidth;
  target.classList.add("is-hit");
  window.setTimeout(() => target.classList.remove("is-hit"), 230);

  createBurst(center.x, center.y, punch.label, scoreGain);
  createParticles(center.x, center.y, isActive ? 13 : 8);
  animateGlove(punch.glove);
  shakeStage();
  playPunchSound(punch.power);
  resetComboTimer();

  if (state.targets[index] <= 0) {
    staggerTarget(target, index);
    pickNextTarget();
  }

  if (state.heat >= 100) {
    enterRushMode();
  }

  elements.liveStatus.textContent = `連擊 ${state.combo}，分數 ${state.score}`;
  updateHud();
}

function finishRound() {
  state.running = false;
  window.clearInterval(state.clockTimer);
  window.clearInterval(state.activeTimer);
  window.clearTimeout(state.comboTimer);

  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem("zounimen-best-score", String(state.best));
    showBanner("新紀錄");
  } else {
    showBanner("收工");
  }

  updateHud();
}

function startTimers() {
  window.clearInterval(state.clockTimer);
  window.clearInterval(state.activeTimer);

  state.clockTimer = window.setInterval(() => {
    if (!state.running) return;

    state.timeLeft -= 1;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      finishRound();
    }

    updateHud();
  }, 1000);

  state.activeTimer = window.setInterval(() => {
    if (state.running) pickNextTarget();
  }, 1500);
}

function resetGame() {
  window.clearInterval(state.clockTimer);
  window.clearInterval(state.activeTimer);
  window.clearTimeout(state.comboTimer);

  state.score = 0;
  state.combo = 0;
  state.heat = 0;
  state.timeLeft = ROUND_SECONDS;
  state.running = false;
  state.targets = [100, 100, 100];
  setActiveTarget(1);
  showBanner("Ready");
  updateHud();
}

elements.targets.forEach((target, index) => {
  bindTapAction(target, () => strikeTarget(index, "hook"));
});

elements.strikeButtons.forEach((button) => {
  bindTapAction(button, () => {
    strikeTarget(state.activeIndex, button.dataset.strike);
  });
});

bindTapAction(elements.resetButton, resetGame);

bindTapAction(elements.soundToggle, () => {
  state.sound = !state.sound;
  elements.soundToggle.classList.toggle("is-muted", !state.sound);
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;

  const keyMap = {
    a: 0,
    s: 1,
    d: 2,
  };

  if (event.key.toLowerCase() in keyMap) {
    strikeTarget(keyMap[event.key.toLowerCase()], "jab");
  }

  if (event.code === "Space") {
    event.preventDefault();
    strikeTarget(state.activeIndex, "uppercut");
  }

  if (event.key.toLowerCase() === "r") {
    resetGame();
  }
});

updateHud();
showBanner("Ready");