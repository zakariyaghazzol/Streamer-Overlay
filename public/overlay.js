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
  subProgress: document.getElementById("subProgress")
};

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
  renderTimer();
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
  const colors = ["#64e8ff", "#ffd36e", "#ffffff", "#ff4fb8"];

  const resize = () => {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * scale);
    canvas.height = Math.floor(window.innerHeight * scale);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    stars.length = 0;

    const count = Math.min(150, Math.floor((window.innerWidth * window.innerHeight) / 15000));
    for (let index = 0; index < count; index += 1) {
      stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        radius: Math.random() * 1.8 + 0.4,
        speed: Math.random() * 0.22 + 0.05,
        alpha: Math.random() * 0.5 + 0.18,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  };

  const draw = () => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (const star of stars) {
      star.y += star.speed;
      star.x += star.speed * 0.18;

      if (star.y > window.innerHeight + 8) {
        star.y = -8;
        star.x = Math.random() * window.innerWidth;
      }

      context.beginPath();
      context.fillStyle = hexToRgba(star.color, star.alpha);
      context.shadowColor = star.color;
      context.shadowBlur = 8;
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
    }

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
