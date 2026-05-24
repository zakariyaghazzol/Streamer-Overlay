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
const asteroids = [];
const planetsList = [];

if (new URLSearchParams(window.location.search).has("demo")) {
  document.body.classList.add("demo-mode");
}

connectEvents();
loadInitialState();
startTimerLoop();
startStarfield();

// Enable Drag and Drop immediately if loaded inside an iframe (Mission Control preview)
if (window.self !== window.top) {
  initDragAndDrop();
}

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

  // Dynamically load coordinates layout positions from state
  if (nextState.layout) {
    updatePositions(nextState.layout);
  }

  // Detect state increments to trigger amazing space-warp, comets, and planet zooms!
  if (previousState) {
    if (nextState.kills > previousState.kills) {
      const panel = document.getElementById("killPanel");
      if (panel) {
        panel.classList.remove("state-flash");
        void panel.offsetWidth; // Force CSS reflow
        panel.classList.add("state-flash");
      }
      const center = getPanelCenter("killPanel");
      triggerShockwave(center.x, center.y, "#00ffaa");
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
      triggerShockwave(center.x, center.y, "#ffd200");
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

function updatePositions(layout) {
  const mappings = {
    topHud: "topHudPanel",
    kill: "killPanel",
    win: "winPanel",
    timer: "timerPanel",
    goal: "goalPanel"
  };
  
  for (const [key, elementId] of Object.entries(mappings)) {
    const el = document.getElementById(elementId);
    if (el && layout[key]) {
      el.style.left = `${layout[key].x}%`;
      el.style.top = `${layout[key].y}%`;
    }
  }
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
    maxRadius: window.innerWidth * 0.28,
    speed: 8,
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

/* ========================================================
   NO MAN'S SKY DYNAMIC 3D PLANETS CANVAS ENGINE (WARP)
   ======================================================== */

function startStarfield() {
  const canvas = document.getElementById("starfield");
  const context = canvas.getContext("2d");
  const stars = [];
  const colors = ["#00ffaa", "#ffd200", "#ffffff", "#ff007f", "#00f0ff"];

  // Initialize atmospheric colored nebulae
  nebulae.length = 0;
  nebulae.push(
    { x: window.innerWidth * 0.18, y: window.innerHeight * 0.22, radius: 480, color: "rgba(0, 255, 170, 0.08)", targetX: window.innerWidth * 0.18, targetY: window.innerHeight * 0.22 }, // Toxic Emerald
    { x: window.innerWidth * 0.82, y: window.innerHeight * 0.72, radius: 520, color: "rgba(255, 0, 127, 0.06)", targetX: window.innerWidth * 0.82, targetY: window.innerHeight * 0.72 }, // Stellar Pink
    { x: window.innerWidth * 0.5, y: window.innerHeight * 0.45, radius: 600, color: "rgba(0, 112, 255, 0.05)", targetX: window.innerWidth * 0.5, targetY: window.innerHeight * 0.45 }  // Deep Cobalt
  );

  // Initialize detailed 3D background planets
  planetsList.length = 0;
  planetsList.push(
    {
      id: "saturn",
      pctX: 0.72, pctY: 0.42, // target percentages
      x: 0, y: 0,
      radius: 120,
      baseRadius: 120,
      driftX: 0, driftY: 0,
      colorStart: "#00f0ff", colorEnd: "#020713",
      rings: true,
      volcanoes: false,
      opacity: 1.0,
      fadingIn: false
    },
    {
      id: "toxic",
      pctX: 0.18, pctY: 0.28,
      x: 0, y: 0,
      radius: 76,
      baseRadius: 76,
      driftX: 0, driftY: 0,
      colorStart: "#00ffaa", colorEnd: "#02120b",
      rings: false,
      volcanoes: true,
      opacity: 1.0,
      fadingIn: false
    }
  );

  const resize = () => {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * scale);
    canvas.height = Math.floor(window.innerHeight * scale);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    
    // Distribute slow & fast stars
    stars.length = 0;
    const count = Math.min(180, Math.floor((window.innerWidth * window.innerHeight) / 11000));
    for (let index = 0; index < count; index += 1) {
      stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        radius: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.2 + 0.03,
        alpha: Math.random() * 0.7 + 0.15,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    // Distribute floating asteroid space rocks
    asteroids.length = 0;
    const astCount = Math.min(14, Math.floor(window.innerWidth / 130));
    for (let index = 0; index < astCount; index += 1) {
      const size = Math.random() * 24 + 6;
      asteroids.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size,
        speed: Math.random() * 0.15 + 0.03,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.006,
        points: generateAsteroidPoints(size),
        color: ["#101a2d", "#1c2538", "#243147"][Math.floor(Math.random() * 3)]
      });
    }

    // Positions initial reset
    for (const planet of planetsList) {
      planet.x = window.innerWidth * planet.pctX;
      planet.y = window.innerHeight * planet.pctY;
    }
  };

  const draw = () => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // 1. Draw glowing space nebula dust gas
    context.globalCompositeOperation = "screen";
    for (const neb of nebulae) {
      neb.x += (neb.targetX - neb.x) * 0.003 + (Math.sin(Date.now() * 0.0003) * 0.08);
      neb.y += (neb.targetY - neb.y) * 0.003 + (Math.cos(Date.now() * 0.0003) * 0.08);
      
      const grad = context.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
      grad.addColorStop(0, neb.color);
      grad.addColorStop(0.5, neb.color.replace("0.0", "0.02"));
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      
      context.fillStyle = grad;
      context.beginPath();
      context.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2);
      context.fill();
    }

    // 2. Draw glowing slanted planetary ring sheets (No Man's Sky Sheet Beam)
    drawPlanetaryRings(context);
    context.globalCompositeOperation = "source-over";

    // 3. Draw drifting stars (warp acceleration lines on stat changes)
    for (const star of stars) {
      const currentSpeed = star.speed * warpFactor;
      star.y += currentSpeed;
      star.x += currentSpeed * 0.08; // slight diagonal drift

      if (star.y > window.innerHeight + 25) {
        star.y = -25;
        star.x = Math.random() * window.innerWidth;
      }

      context.beginPath();
      context.fillStyle = hexToRgba(star.color, star.alpha);
      context.shadowColor = star.color;

      if (warpFactor > 1.8) {
        context.strokeStyle = hexToRgba(star.color, star.alpha * 0.85);
        context.lineWidth = star.radius * 0.9;
        context.shadowBlur = 12;
        context.beginPath();
        context.moveTo(star.x, star.y);
        context.lineTo(star.x + currentSpeed * 0.16, star.y + currentSpeed * 1.8);
        context.stroke();
      } else {
        context.shadowBlur = 5;
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    // 4. Draw detailed Gaseous Planets with 3D ring wraps & hyperdrive warp zoom!
    for (const planet of planetsList) {
      // Slow orbital drift
      planet.driftX = Math.sin(Date.now() * 0.0003 + planet.baseRadius) * 6;
      planet.driftY = Math.cos(Date.now() * 0.0003 + planet.baseRadius) * 6;

      const targetX = window.innerWidth * planet.pctX + planet.driftX;
      const targetY = window.innerHeight * planet.pctY + planet.driftY;

      // Drifting translation towards target
      planet.x += (targetX - planet.x) * 0.008;
      planet.y += (targetY - planet.y) * 0.008;

      // Hyperdrive camera travel zoom calculations
      if (warpFactor > 1.2) {
        // Accelerate planet radius scaling
        const growth = planet.baseRadius * (warpFactor - 1.0) * 0.65;
        planet.radius += (growth - planet.radius + planet.baseRadius) * 0.08;
        
        // Push coordinate distance exponentially off-screen
        const dx = planet.x - window.innerWidth * 0.5;
        const dy = planet.y - window.innerHeight * 0.5;
        planet.x += dx * 0.05 * (warpFactor - 1.0);
        planet.y += dy * 0.05 * (warpFactor - 1.0);

        // Fade out as planet flies past camera
        if (planet.radius > planet.baseRadius * 1.5) {
          planet.opacity = Math.max(0, 1 - (planet.radius - planet.baseRadius * 1.5) / (window.innerWidth * 0.25));
        }
      } else {
        // Smoothly settle back to base values
        planet.radius += (planet.baseRadius - planet.radius) * 0.05;
        if (planet.fadingIn) {
          planet.opacity += (1.0 - planet.opacity) * 0.03;
          if (planet.opacity > 0.95) {
            planet.opacity = 1.0;
            planet.fadingIn = false;
          }
        }
      }

      // If planet has zoomed fully off-screen/faded, reset its sector!
      if (planet.opacity <= 0 && !planet.fadingIn) {
        planet.radius = 0;
        planet.opacity = 0;
        planet.fadingIn = true;
        // Shift its position slightly to simulate entering a new stellar quadrant!
        planet.pctX = Math.random() * 0.5 + (planet.id === "saturn" ? 0.45 : 0.1);
        planet.pctY = Math.random() * 0.4 + 0.15;
        planet.x = window.innerWidth * 0.5;
        planet.y = window.innerHeight * 0.5;
      }

      // Render the planet if visible
      if (planet.opacity > 0) {
        context.save();
        context.globalAlpha = planet.opacity;

        if (planet.rings) {
          // A. Draw back half of Saturn rings (ellipse drawn PI to 2*PI)
          context.beginPath();
          context.shadowBlur = 12;
          context.shadowColor = "rgba(0, 240, 255, 0.45)";
          context.strokeStyle = "rgba(180, 255, 245, 0.4)";
          context.lineWidth = planet.radius * 0.09;
          context.ellipse(planet.x, planet.y, planet.radius * 1.7, planet.radius * 0.28, -Math.PI / 10, Math.PI, Math.PI * 2);
          context.stroke();
        }

        // B. Draw gaseous planetary sphere (radial gradient with offset highlight shadow)
        const highlightX = planet.x - planet.radius * 0.2;
        const highlightY = planet.y - planet.radius * 0.2;
        const radGrad = context.createRadialGradient(
          highlightX, highlightY, planet.radius * 0.1,
          planet.x, planet.y, planet.radius
        );
        radGrad.addColorStop(0, planet.colorStart);
        radGrad.addColorStop(0.3, hexToRgba(planet.colorStart, 0.6));
        radGrad.addColorStop(0.85, planet.colorEnd);
        radGrad.addColorStop(1, "#010204");

        context.shadowBlur = planet.rings ? 25 : 15;
        context.shadowColor = planet.colorStart;
        context.fillStyle = radGrad;
        context.beginPath();
        context.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        context.fill();

        // If volcanic planet: draw active boiling magma spots
        if (planet.volcanoes) {
          context.shadowBlur = 8;
          context.shadowColor = "#ff7200";
          const volcanoOffsets = [
            { x: -0.3, y: -0.2, r: 0.1 },
            { x: 0.1, y: 0.3, r: 0.08 },
            { x: 0.4, y: -0.1, r: 0.07 }
          ];
          for (const offset of volcanoOffsets) {
            const vx = planet.x + planet.radius * offset.x;
            const vy = planet.y + planet.radius * offset.y;
            const vr = planet.radius * offset.r;
            const vgrad = context.createRadialGradient(vx, vy, 0, vx, vy, vr);
            vgrad.addColorStop(0, "#ffd200");
            vgrad.addColorStop(0.5, "#ff7200");
            vgrad.addColorStop(1, "rgba(0,0,0,0)");
            context.fillStyle = vgrad;
            context.beginPath();
            context.arc(vx, vy, vr, 0, Math.PI * 2);
            context.fill();
          }
        }

        if (planet.rings) {
          // C. Draw front half of Saturn rings overlapping sphere (ellipse drawn 0 to PI)
          context.beginPath();
          context.shadowBlur = 12;
          context.shadowColor = "rgba(0, 240, 255, 0.45)";
          context.strokeStyle = "rgba(180, 255, 245, 0.4)";
          context.lineWidth = planet.radius * 0.09;
          context.ellipse(planet.x, planet.y, planet.radius * 1.7, planet.radius * 0.28, -Math.PI / 10, 0, Math.PI);
          context.stroke();
        }

        context.restore();
      }
    }

    // 5. Draw drifting, rotating asteroid rocks
    for (const ast of asteroids) {
      ast.y += ast.speed * warpFactor;
      ast.x += ast.speed * warpFactor * 0.04;
      ast.rotation += ast.rotationSpeed;

      if (ast.y > window.innerHeight + 40) {
        ast.y = -40;
        ast.x = Math.random() * window.innerWidth;
      }

      context.save();
      context.translate(ast.x, ast.y);
      context.rotate(ast.rotation);
      
      context.beginPath();
      context.fillStyle = ast.color;
      context.strokeStyle = "rgba(0, 255, 170, 0.2)";
      context.lineWidth = 1;
      context.shadowBlur = 4;
      context.shadowColor = "rgba(0, 255, 170, 0.12)";
      
      context.moveTo(ast.points[0].x, ast.points[0].y);
      for (let index = 1; index < ast.points.length; index += 1) {
        context.lineTo(ast.points[index].x, ast.points[index].y);
      }
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }

    // 6. Draw glowing plasma ring shockwaves on increments
    for (let index = shockwaves.length - 1; index >= 0; index -= 1) {
      const wave = shockwaves[index];
      wave.radius += wave.speed * (1 + warpFactor * 0.12);
      wave.alpha = Math.max(0, 1 - wave.radius / wave.maxRadius);

      if (wave.alpha <= 0) {
        shockwaves.splice(index, 1);
        continue;
      }

      context.beginPath();
      context.strokeStyle = hexToRgba(wave.color, wave.alpha);
      context.lineWidth = 3;
      context.shadowColor = wave.color;
      context.shadowBlur = 20;
      context.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      context.stroke();
    }

    // Smooth warp factor deceleration
    warpFactor = warpFactor * 0.95 + 1.0 * 0.05;

    requestAnimationFrame(draw);
  };

  window.addEventListener("resize", resize);
  resize();
  draw();
}

function generateAsteroidPoints(size) {
  const points = [];
  const sides = Math.floor(Math.random() * 4) + 6; // 6 to 9 sided polygons
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    const offset = (Math.random() * 0.35 + 0.7) * size;
    points.push({
      x: Math.cos(angle) * offset,
      y: Math.sin(angle) * offset
    });
  }
  return points;
}

function drawPlanetaryRings(context) {
  context.save();
  context.shadowBlur = 15;
  context.shadowColor = "rgba(0, 240, 255, 0.4)";
  
  const angle = -Math.PI / 5.5; // slant angle
  context.translate(window.innerWidth * 0.5, window.innerHeight * 0.5);
  context.rotate(angle);
  
  // Draw wide sheet of fine circular ring layers slanting upwards
  const numRings = 16;
  const startRad = 360;
  const ringSpacing = 7;
  
  for (let index = 0; index < numRings; index += 1) {
    context.beginPath();
    const alpha = (0.16 * (1 - index / numRings)) * (0.8 + 0.2 * Math.sin(Date.now() * 0.0006 + index));
    context.strokeStyle = `rgba(180, 255, 235, ${alpha})`;
    context.lineWidth = 1.2;
    context.ellipse(0, 0, startRad + index * ringSpacing, (startRad + index * ringSpacing) * 0.16, 0, 0, Math.PI * 2);
    context.stroke();
  }
  
  context.restore();
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/* ========================================================
   INTERACTIVE DRAG AND DROP COORDINATES WRITER (IFRAME)
   ======================================================== */

function initDragAndDrop() {
  const mappings = {
    "topHudPanel": "topHud",
    "killPanel": "kill",
    "winPanel": "win",
    "timerPanel": "timer",
    "goalPanel": "goal"
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindDragEvents();
  });
  // Also run immediately in case DOM is already loaded
  bindDragEvents();

  function bindDragEvents() {
    for (const [elementId, panelId] of Object.entries(mappings)) {
      const el = document.getElementById(elementId);
      if (!el || el.dataset.dragBound) continue;
      
      el.dataset.dragBound = "true";
      el.addEventListener("mousedown", (e) => {
        // Only trigger on left-click and inside iframe
        if (e.button !== 0 || window.self === window.top) return;

        e.preventDefault();
        el.style.transition = "none"; // Disable CSS slide transition during drag

        const rect = el.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        const onMouseMove = (moveEvent) => {
          let xPercent = ((moveEvent.clientX - offsetX) / window.innerWidth) * 100;
          let yPercent = ((moveEvent.clientY - offsetY) / window.innerHeight) * 100;

          // Clamp coordinates to keep panel comfortably on screen
          xPercent = Math.max(0, Math.min(94, xPercent));
          yPercent = Math.max(0, Math.min(94, yPercent));

          el.style.left = `${xPercent}%`;
          el.style.top = `${yPercent}%`;
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          el.style.transition = ""; // Restore transitions

          const xPercent = (el.offsetLeft / window.innerWidth) * 100;
          const yPercent = (el.offsetTop / window.innerHeight) * 100;

          sendDragAction({
            type: "layout:update",
            panelId,
            x: Math.round(xPercent),
            y: Math.round(yPercent)
          });
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    }
  }
}

async function sendDragAction(payload) {
  try {
    await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Failed to persist layout coordinate updates:", err);
  }
}
