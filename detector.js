/**
 * ==============================================================================
 * ANTIGRAVITY AUTO-DETECTOR ENGINE (Companion App)
 * ==============================================================================
 * Automatically detects game events (kills, wins) and streams alerts (subs, tips)
 * from Twitch via Streamlabs directly into the Space Overlay.
 * 
 * Supports:
 * - Fortnite OCR (Kills & Wins)
 * - Universal Custom Coordinates Screen OCR
 * - League of Legends Live Client API Poller
 * - Counter-Strike 2 Game State Integration Server
 * - Streamlabs Real-time Socket Listener (Twitch Followers, Subs, & Tips)
 * - visual bounding box calibrator
 * ==============================================================================
 */

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const readline = require("node:readline");

// Load Environment Variables manually from .env
loadEnv();

const OVERLAY_API_URL = process.env.OVERLAY_API_URL || "http://127.0.0.1:8787/api/action";

// Terminal colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  cyan: "\x1b[36m",
  gold: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgGold: "\x1b[43m\x1b[30m"
};

// Dynamic library loaded flags
let tesseract = null;
let screenshot = null;
let jimp = null;
let io = null;

function loadOptionalDependencies() {
  try { screenshot = require("screenshot-desktop"); } catch (e) {}
  try { tesseract = require("tesseract.js"); } catch (e) {}
  try { jimp = require("jimp"); } catch (e) {}
  try { io = require("socket.io-client"); } catch (e) {}
}

loadOptionalDependencies();

// Application State
let activeLoop = null;
let killsCount = 0;
let winsCount = 0;
let isFirstScan = true;
let isWinCooldown = false;

// Main Entrance
function startCLI() {
  console.clear();
  printBanner();
  showMenu();
}

function printBanner() {
  console.log(`${colors.cyan}${colors.bright}`);
  console.log("   ▲ N T I G R ▲ V I T Y   D E T E C T O R   E N G I N E");
  console.log("   =====================================================");
  console.log(`   [ Telemetry Sync Active -> ${OVERLAY_API_URL} ]`);
  console.log(`${colors.reset}`);
}

function showMenu() {
  console.log(`${colors.bright}SELECT AUTOMATED DETECTION MODE:${colors.reset}`);
  console.log(`  [1] ${colors.cyan}Fortnite OCR Mode${colors.reset} (Auto-detect Kills & Wins via Screen OCR)`);
  console.log(`  [2] ${colors.cyan}Universal OCR Mode${colors.reset} (Auto-detect customizable screen areas)`);
  console.log(`  [3] ${colors.cyan}League of Legends Mode${colors.reset} (Live Client API polling)`);
  console.log(`  [4] ${colors.cyan}CS2 / CS:GO Mode${colors.reset} (Game State Integration Server)`);
  console.log(`  [5] ${colors.magenta}Streamlabs Stream Listener${colors.reset} (Twitch Subs, Follows, & Tips)`);
  console.log(`  [6] ${colors.gold}Calibrate Screen Coordinates${colors.reset} (Visual crop debugger)`);
  console.log(`  [7] ${colors.green}Manual Event Simulator${colors.reset} (Trigger events via keyboard)`);
  console.log(`  [8] Exit`);
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(`${colors.bright}Enter choice [1-8]: ${colors.reset}`, (answer) => {
    rl.close();
    handleMenuChoice(answer.trim());
  });
}

function handleMenuChoice(choice) {
  switch (choice) {
    case "1":
      startFortniteOCR();
      break;
    case "2":
      startUniversalOCR();
      break;
    case "3":
      startLeaguePolling();
      break;
    case "4":
      startCS2GSI();
      break;
    case "5":
      startStreamlabsListener();
      break;
    case "6":
      runCalibrator();
      break;
    case "7":
      startManualSimulator();
      break;
    case "8":
      console.log("Shutting down detector. Fly safe, Commander.");
      process.exit(0);
      break;
    default:
      console.log(`${colors.red}Invalid option. Please try again.${colors.reset}\n`);
      setTimeout(startCLI, 1000);
      break;
  }
}

// ==============================================================================
// 1. FORTNITE OCR MODE
// ==============================================================================
async function startFortniteOCR() {
  if (!checkOCRDeps()) return;

  console.clear();
  printBanner();
  console.log(`${colors.bright}${colors.bgCyan}  FORTNITE OCR DETECTOR ACTIVE  ${colors.reset}\n`);
  console.log(`  Watching for kills in top-right HUD...`);
  console.log(`  Watching for "VICTORY ROYALE" popup on screen...`);
  console.log(`  (Press Ctrl+C to stop and return to menu)`);
  console.log("-----------------------------------------------------");

  killsCount = 0;
  winsCount = 0;
  isFirstScan = true;

  const killsRoi = {
    x: parseInt(process.env.FORTNITE_KILLS_ROI_X || 1720, 10),
    y: parseInt(process.env.FORTNITE_KILLS_ROI_Y || 70, 10),
    width: parseInt(process.env.FORTNITE_KILLS_ROI_W || 140, 10),
    height: parseInt(process.env.FORTNITE_KILLS_ROI_H || 60, 10)
  };

  const winsRoi = {
    x: parseInt(process.env.FORTNITE_WINS_ROI_X || 400, 10),
    y: parseInt(process.env.FORTNITE_WINS_ROI_Y || 200, 10),
    width: parseInt(process.env.FORTNITE_WINS_ROI_W || 1120, 10),
    height: parseInt(process.env.FORTNITE_WINS_ROI_H || 250, 10)
  };

  runOCRScanner(killsRoi, winsRoi);
}

// ==============================================================================
// 2. UNIVERSAL OCR MODE
// ==============================================================================
function startUniversalOCR() {
  if (!checkOCRDeps()) return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.clear();
  printBanner();
  console.log(`${colors.bright}${colors.bgCyan}  UNIVERSAL OCR SCANNER SETUP  ${colors.reset}\n`);

  rl.question(`Enter Bounding Box X [Default ${process.env.UNIVERSAL_OCR_ROI_X || 1720}]: `, (xVal) => {
    rl.question(`Enter Bounding Box Y [Default ${process.env.UNIVERSAL_OCR_ROI_Y || 70}]: `, (yVal) => {
      rl.question(`Enter Bounding Box Width [Default ${process.env.UNIVERSAL_OCR_ROI_W || 140}]: `, (wVal) => {
        rl.question(`Enter Bounding Box Height [Default ${process.env.UNIVERSAL_OCR_ROI_H || 60}]: `, (hVal) => {
          rl.close();

          const roi = {
            x: parseInt(xVal || process.env.UNIVERSAL_OCR_ROI_X || 1720, 10),
            y: parseInt(yVal || process.env.UNIVERSAL_OCR_ROI_Y || 70, 10),
            width: parseInt(wVal || process.env.UNIVERSAL_OCR_ROI_W || 140, 10),
            height: parseInt(hVal || process.env.UNIVERSAL_OCR_ROI_H || 60, 10)
          };

          console.clear();
          printBanner();
          console.log(`${colors.bright}${colors.bgCyan}  UNIVERSAL OCR SCANNER RUNNING  ${colors.reset}\n`);
          console.log(`  Scanning Screen Area: X:${roi.x} Y:${roi.y} W:${roi.width} H:${roi.height}`);
          console.log(`  (Press Ctrl+C to return to menu)`);
          console.log("-----------------------------------------------------");

          killsCount = 0;
          isFirstScan = true;
          runOCRScanner(roi, null);
        });
      });
    });
  });
}

// CORE OCR LOOP
async function runOCRScanner(killsRoi, winsRoi) {
  let isScanning = false;

  activeLoop = setInterval(async () => {
    if (isScanning) return;
    isScanning = true;

    try {
      // 1. Capture Desktop Screenshot as Buffer
      const imgBuffer = await screenshot({ format: "png" });
      
      // 2. Scan Kills
      const killsJimp = await jimp.read(imgBuffer);
      killsJimp.crop(killsRoi.x, killsRoi.y, killsRoi.width, killsRoi.height);
      
      // Optimize image for Tesseract (grayscale, scale up, higher contrast, invert)
      killsJimp.grayscale().contrast(0.8).resize(killsRoi.width * 2, jimp.AUTO).invert();
      const processedKillsBuffer = await killsJimp.getBufferAsync(jimp.MIME_PNG);
      
      const killsTextResult = await tesseract.recognize(processedKillsBuffer, "eng", {
        tessedit_char_whitelist: "0123456789"
      });
      
      const parsedText = killsTextResult.data.text.trim();
      const numericKills = parseInt(parsedText.replace(/[^0-9]/g, ""), 10);

      if (Number.isFinite(numericKills)) {
        if (isFirstScan) {
          killsCount = numericKills;
          isFirstScan = false;
          console.log(`${colors.cyan}[INFO]${colors.reset} Initial Kill Count Calibrated: ${colors.cyan}${killsCount}${colors.reset}`);
        } else if (numericKills > killsCount) {
          const diff = numericKills - killsCount;
          killsCount = numericKills;
          console.log(`💥 ${colors.green}KILL DETECTED!${colors.reset} Count: ${colors.green}${killsCount}${colors.reset} (+${diff})`);
          triggerOverlayAction({ type: "kills:add", amount: diff });
        } else if (numericKills < killsCount) {
          // Player joined a new match, reset local baseline
          console.log(`${colors.cyan}[INFO]${colors.reset} Stats reset/New match detected. Adjusting baseline: ${numericKills}`);
          killsCount = numericKills;
        }
      }

      // 3. Scan Wins (Fortnite Victory Royale check)
      if (winsRoi && !isWinCooldown) {
        const winsJimp = await jimp.read(imgBuffer);
        winsJimp.crop(winsRoi.x, winsRoi.y, winsRoi.width, winsRoi.height);
        winsJimp.grayscale().contrast(0.7).invert();
        
        const processedWinsBuffer = await winsJimp.getBufferAsync(jimp.MIME_PNG);
        const winsTextResult = await tesseract.recognize(processedWinsBuffer, "eng");
        
        const winText = winsTextResult.data.text.toUpperCase();
        
        if (winText.includes("VICTORY") || winText.includes("ROYALE") || winText.includes("WINNER") || winText.includes("#1")) {
          isWinCooldown = true;
          winsCount += 1;
          console.log(`🏆 ${colors.gold}${colors.bright}VICTORY ROYALE DETECTED!${colors.reset} Updating overlay wins tracker!`);
          triggerOverlayAction({ type: "wins:add", amount: 1 });

          // Prevent double trigger by cooling down for 60 seconds
          setTimeout(() => {
            isWinCooldown = false;
          }, 60000);
        }
      }

    } catch (err) {
      console.log(`${colors.red}[ERROR] Loop failed:${colors.reset}`, err.message);
    } finally {
      isScanning = false;
    }
  }, 1800);

  // Catch Ctrl+C to cleanly stop loop and exit to menu
  process.on("SIGINT", () => {
    clearInterval(activeLoop);
    console.log(`\n${colors.cyan}[INFO]${colors.reset} OCR Loop stopped.\n`);
    setTimeout(startCLI, 1000);
  });
}

function checkOCRDeps() {
  if (!tesseract || !screenshot || !jimp) {
    console.clear();
    printBanner();
    console.log(`${colors.red}${colors.bright}CRITICAL: OCR Dependencies Missing!${colors.reset}\n`);
    console.log("Please install the required pure JS screen recording libraries:");
    console.log(`  ${colors.bright}npm install tesseract.js screenshot-desktop jimp${colors.reset}\n`);
    console.log("Press any key to return to main menu...");
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      startCLI();
    });
    return false;
  }
  return true;
}

// ==============================================================================
// 3. LEAGUE OF LEGENDS API MODE
// ==============================================================================
function startLeaguePolling() {
  console.clear();
  printBanner();
  console.log(`${colors.bright}${colors.bgCyan}  LEAGUE OF LEGENDS LIVE API POLLER  ${colors.reset}\n`);
  console.log(`  Connecting to local client API (https://127.0.0.1:2999/liveclientdata/allgamedata)...`);
  console.log(`  (Make sure League of Legends is running in a live match!)`);
  console.log(`  (Press Ctrl+C to return to menu)`);
  console.log("-----------------------------------------------------");

  let localKills = 0;
  let hasInitedLoL = false;

  // Accept self-signed certificates since League client runs HTTPS locally
  const agent = new https.Agent({ rejectUnauthorized: false });

  activeLoop = setInterval(() => {
    https.get("https://127.0.0.1:2999/liveclientdata/allgamedata", { agent }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          const activePlayer = data.activePlayer;
          const scores = activePlayer && data.allPlayers.find(p => p.summonerName === activePlayer.summonerName)?.scores;
          
          if (scores) {
            const currentKills = scores.kills;
            
            if (!hasInitedLoL) {
              localKills = currentKills;
              hasInitedLoL = true;
              console.log(`${colors.green}[CONNECTED]${colors.reset} League API connected. Baseline kills: ${localKills}`);
            } else if (currentKills > localKills) {
              const diff = currentKills - localKills;
              localKills = currentKills;
              console.log(`💥 ${colors.green}KILL CONFIRMED!${colors.reset} LoL Kills: ${colors.green}${localKills}${colors.reset}`);
              triggerOverlayAction({ type: "kills:add", amount: diff });
            }
          }
        } catch (e) {
          // Parser failed / game hasn't started yet
        }
      });
    }).on("error", () => {
      // League client not running
    });
  }, 1000);

  process.on("SIGINT", () => {
    clearInterval(activeLoop);
    console.log(`\n${colors.cyan}[INFO]${colors.reset} League poller stopped.\n`);
    setTimeout(startCLI, 1000);
  });
}

// ==============================================================================
// 4. CS2 GAME STATE INTEGRATION (GSI)
// ==============================================================================
function startCS2GSI() {
  console.clear();
  printBanner();
  console.log(`${colors.bright}${colors.bgCyan}  CS2 / CS:GO GSI SERVER ACTIVE  ${colors.reset}\n`);
  console.log(`  Listening for HTTP POST events on port ${colors.bright}3000${colors.reset}...`);
  console.log(`  GSI CONFIG INSTRUCTIONS:`);
  console.log(`  1. Place 'gamestate_integration_space.cfg' inside your CS2 'cfg' folder:`);
  console.log(`     (Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg)`);
  console.log(`  2. Set 'uri' inside the config file to: "http://127.0.0.1:3000"`);
  console.log(`  (Press Ctrl+C to stop server and return to menu)`);
  console.log("-----------------------------------------------------");

  let localKills = 0;
  let hasInitedCS2 = false;

  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const player = data.player;
          
          if (player && player.match_stats) {
            const currentKills = player.match_stats.kills;
            
            if (!hasInitedCS2) {
              localKills = currentKills;
              hasInitedCS2 = true;
              console.log(`${colors.green}[GSI CONNECTED]${colors.reset} First payload received. Kills baseline: ${localKills}`);
            } else if (currentKills > localKills) {
              const diff = currentKills - localKills;
              localKills = currentKills;
              console.log(`💥 ${colors.green}FRAG RECORDED!${colors.reset} CS2 Kills: ${colors.green}${localKills}${colors.reset}`);
              triggerOverlayAction({ type: "kills:add", amount: diff });
            }
          }
        } catch (e) {}
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end();
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(3000, "127.0.0.1", () => {
    console.log(`${colors.green}[SUCCESS]${colors.reset} local GSI relay server is listening!`);
  });

  process.on("SIGINT", () => {
    server.close(() => {
      console.log(`\n${colors.cyan}[INFO]${colors.reset} CS2 GSI server shut down.\n`);
      setTimeout(startCLI, 1000);
    });
  });
}

// ==============================================================================
// 5. STREAMLABS STREAM EVENTS (Twitch Subs, Follows, & Tips)
// ==============================================================================
function startStreamlabsListener() {
  if (!io) {
    console.clear();
    printBanner();
    console.log(`${colors.red}${colors.bright}CRITICAL: Streamlabs Socket client library missing!${colors.reset}\n`);
    console.log("Please install socket.io-client to connect to Streamlabs:");
    console.log(`  ${colors.bright}npm install socket.io-client@4.7.2${colors.reset}\n`);
    console.log("Press any key to return to main menu...");
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      startCLI();
    });
    return;
  }

  const token = process.env.STREAMLABS_SOCKET_TOKEN;
  if (!token) {
    console.clear();
    printBanner();
    console.log(`${colors.red}${colors.bright}ERROR: STREAMLABS_SOCKET_TOKEN is empty!${colors.reset}\n`);
    console.log("Please copy the '.env' template file, paste your Streamlabs Socket token, and try again.");
    console.log("You can get your token from: https://streamlabs.com/dashboard -> Settings -> API Tokens");
    console.log("\nPress any key to return to main menu...");
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      startCLI();
    });
    return;
  }

  console.clear();
  printBanner();
  console.log(`${colors.bright}${colors.bgCyan}  STREAMLABS LIVE STREAM LISTENER ACTIVE  ${colors.reset}\n`);
  console.log(`  Connecting to Streamlabs WebSockets...`);
  console.log(`  Waiting for alerts (subscriptions, follows, donations)...`);
  console.log(`  (Press Ctrl+C to disconnect and return to menu)`);
  console.log("-----------------------------------------------------");

  const socket = io(`https://sockets.streamlabs.com?token=${token}`, {
    transports: ["websocket"]
  });

  socket.on("connect", () => {
    console.log(`${colors.green}[CONNECTED]${colors.reset} Handshake successful! Listening for real-time Twitch alerts...`);
  });

  socket.on("connect_error", (error) => {
    console.log(`${colors.red}[CONNECTION ERROR]${colors.reset}`, error.message);
  });

  socket.on("event", (eventData) => {
    if (!eventData.message || !eventData.message[0]) return;
    
    const type = eventData.type;
    const item = eventData.message[0];

    console.log(`🔔 ${colors.cyan}[ALERT]${colors.reset} Received a '${type}' event from Streamlabs!`);

    if (type === "follow") {
      console.log(`   💖 ${colors.bright}${item.name}${colors.reset} followed your channel!`);
      // Flash HUD status status bar
      flashStatus(`NEW FOLLOWER: ${item.name.toUpperCase()}`);
    } 
    else if (type === "subscription" || type === "resub") {
      console.log(`   🎉 ${colors.bgGold} NEW SUBSCRIBER: ${item.name}! ${colors.reset} (${item.months} months)`);
      // Update our subscriber count in real time!
      triggerOverlayAction({ type: "subs:add", amount: 1 });
      flashStatus(`SUB GRANTED: ${item.name.toUpperCase()}`);
    } 
    else if (type === "donation") {
      console.log(`   💰 ${colors.green}${colors.bright}TIP RECEIVED! ${colors.reset} ${item.from} tipped ${colors.green}${item.formatted_amount}${colors.reset}!`);
      // Trigger a status change and dynamic flash
      flashStatus(`TIP: ${item.from.toUpperCase()} (${item.formatted_amount})`);
    }
  });

  process.on("SIGINT", () => {
    socket.disconnect();
    console.log(`\n${colors.cyan}[INFO]${colors.reset} Streamlabs Socket disconnected.\n`);
    setTimeout(startCLI, 1000);
  });
}

// Helper to flash status text temporarily
function flashStatus(text) {
  triggerOverlayAction({
    type: "state:update",
    patch: { statusText: text }
  });
  setTimeout(() => {
    triggerOverlayAction({
      type: "state:update",
      patch: { statusText: "LIVE" }
    });
  }, 10000);
}

// ==============================================================================
// 6. SCREEN COORDINATES CALIBRATOR (Visual Debugger)
// ==============================================================================
async function runCalibrator() {
  if (!checkOCRDeps()) return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.clear();
  printBanner();
  console.log(`${colors.bright}${colors.bgGold}  SCREEN COORDINATE CALIBRATION UTILITY  ${colors.reset}\n`);
  console.log("This tool takes a screenshot, crops it to specified bounds, and saves it");
  console.log("as 'debug-crop.png' in this directory. Open the image to check if it fits");
  console.log("your game's HUD perfectly!\n");

  rl.question("Enter Crop X: ", (xVal) => {
    rl.question("Enter Crop Y: ", (yVal) => {
      rl.question("Enter Crop Width: ", (wVal) => {
        rl.question("Enter Crop Height: ", (hVal) => {
          rl.close();

          const roi = {
            x: parseInt(xVal || 1720, 10),
            y: parseInt(yVal || 70, 10),
            width: parseInt(wVal || 140, 10),
            height: parseInt(hVal || 60, 10)
          };

          captureAndDumpCrop(roi);
        });
      });
    });
  });
}

async function captureAndDumpCrop(roi) {
  console.log(`\n📸 Capturing screenshot...`);
  try {
    const imgBuffer = await screenshot({ format: "png" });
    const jimpImg = await jimp.read(imgBuffer);
    
    jimpImg.crop(roi.x, roi.y, roi.width, roi.height);
    
    // Save image locally
    const outputName = "debug-crop.png";
    const outputPath = path.join(__dirname, outputName);
    await jimpImg.writeAsync(outputPath);

    console.log(`${colors.green}[SUCCESS]${colors.reset} Crop successfully saved to file:`);
    console.log(`  👉 [debug-crop.png](file:///${outputPath.replace(/\\/g, "/")})`);
    console.log("  Open this image and check if it frames your numbers perfectly.");
    console.log("  Adjust coordinates in your '.env' file accordingly!");
  } catch (err) {
    console.log(`${colors.red}[ERROR] Calibration failed:${colors.reset}`, err.message);
  }

  console.log("\nPress any key to return to main menu...");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once("data", () => {
    process.stdin.setRawMode(false);
    startCLI();
  });
}

// ==============================================================================
// 7. MANUAL SIMULATOR (CLI triggers)
// ==============================================================================
function startManualSimulator() {
  console.clear();
  printBanner();
  console.log(`${colors.bright}${colors.bgCyan}  MANUAL OVERLAY SIMULATOR ACTIVE  ${colors.reset}\n`);
  console.log("  Press key bindings to manually dispatch actions instantly:");
  console.log(`    [K] - ${colors.cyan}Register a Kill${colors.reset} (+1 Kill)`);
  console.log(`    [W] - ${colors.gold}Register a Match Win${colors.reset} (+1 Win)`);
  console.log(`    [S] - ${colors.magenta}Register a Subscriber${colors.reset} (+1 Sub)`);
  console.log(`    [T] - ${colors.green}Simulate a Tip Donation${colors.reset} ($5.00 Tip)`);
  console.log(`    [ESC / Ctrl+C] - Return to Main Menu`);
  console.log("-----------------------------------------------------");

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  const onData = (key) => {
    if (key === "\u0003" || key === "\u001b") { // Ctrl+C or ESC
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onData);
      console.log(`\n${colors.cyan}[INFO]${colors.reset} Exited Simulator.\n`);
      setTimeout(startCLI, 1000);
      return;
    }

    const char = key.toLowerCase();
    if (char === "k") {
      console.log(`💥 Simulated Event: ${colors.green}KILL RECORDED${colors.reset}`);
      triggerOverlayAction({ type: "kills:add", amount: 1 });
    } else if (char === "w") {
      console.log(`🏆 Simulated Event: ${colors.gold}MATCH WIN RECORDED${colors.reset}`);
      triggerOverlayAction({ type: "wins:add", amount: 1 });
    } else if (char === "s") {
      console.log(`🎉 Simulated Event: ${colors.magenta}NEW SUBSCRIBER RECORDED${colors.reset}`);
      triggerOverlayAction({ type: "subs:add", amount: 1 });
    } else if (char === "t") {
      console.log(`💰 Simulated Event: ${colors.green}DONATION RECEIVED ($5.00)${colors.reset}`);
      flashStatus("TIP: SPACE_FARER ($5.00)");
    }
  };

  process.stdin.on("data", onData);
}

// ==============================================================================
// HTTP CLIENT TO DISPATCH OVERLAY UPDATES
// ==============================================================================
function triggerOverlayAction(payload) {
  const data = JSON.stringify(payload);
  const urlObj = new URL(OVERLAY_API_URL);

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data)
    }
  };

  const req = http.request(options, (res) => {
    // Consume response
    res.on("data", () => {});
  });

  req.on("error", (err) => {
    console.log(`${colors.red}[CONNECTION ERROR]${colors.reset} Overlay server not reachable at ${OVERLAY_API_URL}. Is your server running?`);
  });

  req.write(data);
  req.end();
}

// Utility to parse .env variables manually without dotenv package
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    process.env[key] = val;
  }
}

// Start Up
startCLI();
