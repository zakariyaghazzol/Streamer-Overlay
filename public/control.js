const controlState = {
  data: null,
  connected: false
};

const controlEls = {
  connectionBadge: document.getElementById("connectionBadge"),
  overlayUrl: document.getElementById("overlayUrl"),
  copyOverlayButton: document.getElementById("copyOverlayButton"),
  openOverlayButton: document.getElementById("openOverlayButton"),
  detailsForm: document.getElementById("detailsForm"),
  goalForm: document.getElementById("goalForm"),
  streamerNameInput: document.getElementById("streamerNameInput"),
  gameTitleInput: document.getElementById("gameTitleInput"),
  statusTextInput: document.getElementById("statusTextInput"),
  killsReadout: document.getElementById("killsReadout"),
  winsReadout: document.getElementById("winsReadout"),
  timerReadout: document.getElementById("timerReadout"),
  countUpButton: document.getElementById("countUpButton"),
  countDownButton: document.getElementById("countDownButton"),
  durationInput: document.getElementById("durationInput"),
  subsReadout: document.getElementById("subsReadout"),
  subLabelInput: document.getElementById("subLabelInput"),
  subsCurrentInput: document.getElementById("subsCurrentInput"),
  subsTargetInput: document.getElementById("subsTargetInput")
};

controlEls.overlayUrl.value = `${window.location.origin}/overlay`;

controlEls.copyOverlayButton.addEventListener("click", async () => {
  const originalText = controlEls.copyOverlayButton.textContent;

  try {
    await navigator.clipboard.writeText(controlEls.overlayUrl.value);
    controlEls.copyOverlayButton.textContent = "Copied";
  } catch {
    controlEls.overlayUrl.select();
    document.execCommand("copy");
    controlEls.copyOverlayButton.textContent = "Copied";
  }

  setTimeout(() => {
    controlEls.copyOverlayButton.textContent = originalText;
  }, 1400);
});

controlEls.openOverlayButton.addEventListener("click", () => {
  window.open("/overlay?demo=1", "_blank", "noopener,noreferrer");
});

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  sendAction({ type: actionButton.dataset.action });
});

controlEls.countUpButton.addEventListener("click", () => {
  sendAction({ type: "timer:mode", mode: "countup" });
});

controlEls.countDownButton.addEventListener("click", () => {
  sendAction({ type: "timer:mode", mode: "countdown" });
});

controlEls.durationInput.addEventListener("change", () => {
  const minutes = Number.parseInt(controlEls.durationInput.value, 10);
  if (Number.isFinite(minutes) && minutes > 0) {
    sendAction({ type: "timer:duration", durationMs: minutes * 60 * 1000 });
  }
});

controlEls.detailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendAction({
    type: "state:update",
    patch: {
      streamerName: controlEls.streamerNameInput.value,
      gameTitle: controlEls.gameTitleInput.value,
      statusText: controlEls.statusTextInput.value
    }
  });
});

controlEls.goalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendAction({
    type: "state:update",
    patch: {
      subLabel: controlEls.subLabelInput.value,
      subsCurrent: Number.parseInt(controlEls.subsCurrentInput.value, 10),
      subsTarget: Number.parseInt(controlEls.subsTargetInput.value, 10)
    }
  });
});

connectEvents();
loadInitialState();
startTimerLoop();

async function loadInitialState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    updateState(await response.json());
  } catch {
    setConnection(false);
    setTimeout(loadInitialState, 1500);
  }
}

function connectEvents() {
  const events = new EventSource("/events");

  events.addEventListener("open", () => {
    setConnection(true);
  });

  events.addEventListener("state", (event) => {
    setConnection(true);
    updateState(JSON.parse(event.data));
  });

  events.addEventListener("error", () => {
    setConnection(false);
  });
}

async function sendAction(payload) {
  try {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    updateState(await response.json());
  } catch {
    setConnection(false);
  }
}

function updateState(nextState) {
  const previous = controlState.data;
  controlState.data = nextState;

  controlEls.killsReadout.textContent = nextState.kills;
  controlEls.winsReadout.textContent = nextState.wins;
  controlEls.subsReadout.textContent = nextState.subsCurrent;
  controlEls.countUpButton.classList.toggle("active", nextState.timer.mode === "countup");
  controlEls.countDownButton.classList.toggle("active", nextState.timer.mode === "countdown");
  controlEls.durationInput.value = Math.max(1, Math.round(nextState.timer.durationMs / 60000));

  if (!previous || previous.streamerName !== nextState.streamerName) {
    controlEls.streamerNameInput.value = nextState.streamerName;
  }
  if (!previous || previous.gameTitle !== nextState.gameTitle) {
    controlEls.gameTitleInput.value = nextState.gameTitle;
  }
  if (!previous || previous.statusText !== nextState.statusText) {
    controlEls.statusTextInput.value = nextState.statusText;
  }
  if (!previous || previous.subLabel !== nextState.subLabel) {
    controlEls.subLabelInput.value = nextState.subLabel;
  }
  if (!previous || previous.subsCurrent !== nextState.subsCurrent) {
    controlEls.subsCurrentInput.value = nextState.subsCurrent;
  }
  if (!previous || previous.subsTarget !== nextState.subsTarget) {
    controlEls.subsTargetInput.value = nextState.subsTarget;
  }

  renderTimer();
}

function setConnection(isOnline) {
  controlState.connected = isOnline;
  controlEls.connectionBadge.textContent = isOnline ? "Online" : "Offline";
  controlEls.connectionBadge.classList.toggle("online", isOnline);
  controlEls.connectionBadge.classList.toggle("offline", !isOnline);
}

function startTimerLoop() {
  const tick = () => {
    renderTimer();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderTimer() {
  if (!controlState.data) {
    return;
  }

  const timer = controlState.data.timer;
  let elapsed = Number(timer.elapsedMs || 0);

  if (timer.running && timer.startedAt) {
    elapsed += Date.now() - Number(timer.startedAt);
  }

  const displayMs = timer.mode === "countdown"
    ? Math.max(0, Number(timer.durationMs || 0) - elapsed)
    : elapsed;

  controlEls.timerReadout.textContent = formatTime(displayMs);
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
