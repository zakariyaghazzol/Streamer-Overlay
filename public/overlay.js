const overlayState = {
  data: null,
  connected: false
};

const overlayEls = {
  statusText: document.getElementById("statusText"),
  streamerName: document.getElementById("streamerName"),
  gameTitle: document.getElementById("gameTitle"),
  killsValue: document.getElementById("killsValue"),
  winsValue: document.getElementById("winsValue"),
  timerMode: document.getElementById("timerMode"),
  timerValue: document.getElementById("timerValue"),
  subLabel: document.getElementById("subLabel"),
  subsCurrent: document.getElementById("subsCurrent"),
  subsTarget: document.getElementById("subsTarget"),
  subProgress: document.getElementById("subProgress"),
  timerPanel: document.getElementById("timerPanel")
};

let warpFactor = 1.0;
const shockwaves = [];
const nebulae = [];

if (new URLSearchParams(window.location.search).has("demo")) {
  document.body.classList.add("demo-mode");
}

connectEvents();
loadInitialState();
startTimerLoop();
startStarfield();

async function loadInitialState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    updateState(await response.json());
  } catch {
    setTimeout(loadInitialState, 1500);
  }
}

function connectEvents() {
  const events = new EventSource("/events");

  events.addEventListener("open", () => {
    overlayState.connected = true;
  });

  events.addEventListener("state", (event) => {
    updateState(JSON.parse(event.data));
  });

  events.addEventListener("error", () => {
    overlayState.connected = false;
  });
}

function updateState(nextState) {
  const previousState = overlayState.data;
  overlayState.data = nextState;
  
  overlayEls.statusText.textContent = nextState.statusText;
  overlayEls.streamerName.textContent = nextState.streamerName;
  overlayEls.gameTitle.textContent = nextState.gameTitle;
  overlayEls.killsValue.textContent = nextState.kills;
  overlayEls.winsValue.textContent = nextState.wins;
  overlayEls.subLabel.textContent = nextState.subLabel;
  overlayEls.subsCurrent.textContent = nextState.subsCurrent;
  overlayEls.subsTarget.textContent = nextState.subsTarget;
  overlayEls.timerMode.textContent = nextState.timer.mode === "countdown" ? "COUNTDOWN" : "COUNT UP";

  const percent = Math.min(100, Math.round((nextState.subsCurrent / Math.max(1, nextState.subsTarget)) * 100));
  overlayEls.subProgress.style.width = `${percent}%`;

  // Detect state increments to trigger amazing space-warp and shockwave reactions!
  if (previousState) {
    if (nextState.kills > previousState.kills) {
      const panel = document.getElementById("killPanel");
      if (panel) {
        panel.classList.remove("state-flash");
        void panel.offsetWidth; // Force CSS reflow
        panel.classList.add("state-flash");
      }
      const center = getPanelCenter("killPanel");
      triggerShockwave(center.x, center.y, "#00f0ff");
      warpFactor = 7.5;
    }

    if (nextState.wins > previousState.wins) {
      const panel = document.getElementById("winPanel");
      if (panel) {
        panel.classList.remove("state-flash");
        void panel.offsetWidth; // Force CSS reflow
        panel.classList.add("state-flash");
      }
      const center = getPanelCenter("winPanel");
      triggerShockwave(center.x, center.y, "#ffb700");
      warpFactor = 18.0;
    }

    if (nextState.subsCurrent > previousState.subsCurrent) {
      const panel = document.getElementById("goalPanel");
      if (panel) {
        panel.classList.remove("state-flash");
        void panel.offsetWidth; // Force CSS reflow
        panel.classList.add("state-flash");
      }
      const center = getPanelCenter("goalPanel");
      triggerShockwave(center.x, center.y, "#ff007f");
      warpFactor = 10.0;
    }
  }

  renderTimer();
}

function getPanelCenter(elementId) {
  const el = document.getElementById(elementId);
  if (!el) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function triggerShockwave(x, y, color) {
  shockwaves.push({
    x,
    y,
    radius: 0,
    maxRadius: window.innerWidth * 0.22,
    speed: 7,
    color,
    alpha: 1.0
  });
}

function startTimerLoop() {
  const tick = () => {
    renderTimer();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderTimer() {
  if (!overlayState.data) {
    return;
  }

  const timer = overlayState.data.timer;
  let elapsed = Number(timer.elapsedMs || 0);

  if (timer.running && timer.startedAt) {
    elapsed += Date.now() - Number(timer.startedAt);
  }

  const displayMs = timer.mode === "countdown"
    ? Math.max(0, Number(timer.durationMs || 0) - elapsed)
    : elapsed;

  overlayEls.timerValue.textContent = formatTime(displayMs);

  // If countdown timer is below 1 minute, enter high-alert danger pulse state
  if (timer.mode === "countdown" && timer.running && displayMs > 0 && displayMs < 60000) {
    overlayEls.timerPanel.classList.add("danger-alert");
  } else {
    overlayEls.timerPanel.classList.remove("danger-alert");
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function startStarfield() {
  const canvas = document.getElementById("starfield");
  const context = canvas.getContext("2d");
  const stars = [];
  const colors = ["#00f0ff", "#ffb700", "#ffffff", "#ff4fa3", "#7f00ff"];

  // Initialize nebula gas nodes
  nebulae.length = 0;
  nebulae.push(
    { x: window.innerWidth * 0.25, y: window.innerHeight * 0.35, radius: 300, color: "rgba(127, 0, 255, 0.08)", targetX: window.innerWidth * 0.25, targetY: window.innerHeight * 0.35 },
    { x: window.innerWidth * 0.75, y: window.innerHeight * 0.65, radius: 350, color: "rgba(0, 240, 255, 0.06)", targetX: window.innerWidth * 0.75, targetY: window.innerHeight * 0.65 }
  );

  const resize = () => {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * scale);
    canvas.height = Math.floor(window.innerHeight * scale);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    stars.length = 0;

    nebulae[0].targetX = window.innerWidth * 0.25;
    nebulae[0].targetY = window.innerHeight * 0.35;
    nebulae[1].targetX = window.innerWidth * 0.75;
    nebulae[1].targetY = window.innerHeight * 0.65;

    // Distribute slow & fast stars
    const count = Math.min(180, Math.floor((window.innerWidth * window.innerHeight) / 12000));
    for (let index = 0; index < count; index += 1) {
      stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        radius: Math.random() * 1.6 + 0.3,
        speed: Math.random() * 0.25 + 0.04,
        alpha: Math.random() * 0.6 + 0.15,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  };

  const draw = () => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // 1. Draw glowing space nebula dust gas
    context.globalCompositeOperation = "screen";
    for (const neb of nebulae) {
      neb.x += (neb.targetX - neb.x) * 0.004 + (Math.sin(Date.now() * 0.0004) * 0.08);
      neb.y += (neb.targetY - neb.y) * 0.004 + (Math.cos(Date.now() * 0.0004) * 0.08);
      
      const grad = context.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
      grad.addColorStop(0, neb.color);
      grad.addColorStop(0.5, neb.color.replace("0.0", "0.02"));
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      
      context.fillStyle = grad;
      context.beginPath();
      context.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = "source-over";

    // 2. Animate and draw stars (with responsive warp-stretching)
    for (const star of stars) {
      const currentSpeed = star.speed * warpFactor;
      star.y += currentSpeed;
      star.x += currentSpeed * 0.12; // drift diagonal

      if (star.y > window.innerHeight + 25) {
        star.y = -25;
        star.x = Math.random() * window.innerWidth;
      }

      context.beginPath();
      context.fillStyle = hexToRgba(star.color, star.alpha);
      context.shadowColor = star.color;

      if (warpFactor > 1.8) {
        // Warp Drive stretch lines
        context.strokeStyle = hexToRgba(star.color, star.alpha * 0.85);
        context.lineWidth = star.radius * 0.9;
        context.shadowBlur = 12;
        context.beginPath();
        context.moveTo(star.x, star.y);
        context.lineTo(star.x + currentSpeed * 0.24, star.y + currentSpeed * 1.8);
        context.stroke();
      } else {
        // High-fidelity standard glowing stars
        context.shadowBlur = 6;
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    // 3. Render glowing shockwave plasma rings on state upgrades
    for (let index = shockwaves.length - 1; index >= 0; index -= 1) {
      const wave = shockwaves[index];
      wave.radius += wave.speed * (1 + warpFactor * 0.15);
      wave.alpha = Math.max(0, 1 - wave.radius / wave.maxRadius);

      if (wave.alpha <= 0) {
        shockwaves.splice(index, 1);
        continue;
      }

      context.beginPath();
      context.strokeStyle = hexToRgba(wave.color, wave.alpha);
      context.lineWidth = 2.5;
      context.shadowColor = wave.color;
      context.shadowBlur = 20;
      context.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      context.stroke();
    }

    // Decay the warp speed factor back to standard drift
    warpFactor = warpFactor * 0.95 + 1.0 * 0.05;

    requestAnimationFrame(draw);
  };

  window.addEventListener("resize", resize);
  resize();
  draw();
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

