/* ==========================================================
   STEEL DINO RUN
   ========================================================== */

/* ---------- КОНСТАНТЫ ---------- */
const FIREBASE_DB_URL = "https://steal-dino-run-default-rtdb.firebaseio.com";

const CANVAS_W = 800;
const CANVAS_H = 250;
const GROUND_Y = 200;
const PLAYER_START_Y = 155;
const BASE_SPEED = 6;
const SCORE_RATE = 0.15;
const GRAVITY = 0.6;
const JUMP_VELOCITY = -11.5;
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 45;

const LEADERBOARD_LIMIT = 10;

/* ---------- FIREBASE ---------- */
let db = null;
try {
    firebase.initializeApp({
        apiKey: "AIzaSyAmTW5mRhW3qtm5IkCnQylpClhgBUJpsVk",
        projectId: "steal-dino-run",
        databaseURL: FIREBASE_DB_URL
    });
    db = firebase.database();
} catch (err) {
    console.error("Firebase не инициализирован (проверь SDK и конфиг):", err);
}

/* ---------- DOM ---------- */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const nicknameScreen = document.getElementById("nickname-screen");
const nicknameInput = document.getElementById("nickname-input");
const btnSaveNick = document.getElementById("btn-save-nick");
const displayNickname = document.getElementById("display-nickname");
const btnChangeNick = document.getElementById("btn-change-nick");

const mainMenu = document.getElementById("main-menu");
const gameScreen = document.getElementById("game-screen");
const btnStart = document.getElementById("btn-start");
const btnChar = document.getElementById("btn-char");
const btnMaps = document.getElementById("btn-maps");
const btnBackMenu = document.getElementById("btn-back-menu");

const skinsModal = document.getElementById("skins-modal");
const btnCloseSkins = document.getElementById("btn-close-skins");
const skinItems = document.querySelectorAll(".skin-item");

const mapsModal = document.getElementById("maps-modal");
const btnCloseMaps = document.getElementById("btn-close-maps");
const mapItems = document.querySelectorAll(".map-item");

const leaderboardModal = document.getElementById("leaderboard-modal");
const btnLeaderboard = document.getElementById("btn-leaderboard");
const btnCloseLeader = document.getElementById("btn-close-leader");
const btnClearLeader = document.getElementById("btn-clear-leader");
const leaderboardBody = document.getElementById("leaderboard-body");

const creditsModal = document.getElementById("credits-modal");
const btnCredits = document.getElementById("btn-credits");
const btnCloseCredits = document.getElementById("btn-close-credits");

/* ---------- МУЛЬТИПЛЕЕР (может отсутствовать в DOM) ---------- */
const btnMultiplayer = document.getElementById("btn-multiplayer");
const mpModal = document.getElementById("mp-modal");
const btnCreateRoom = document.getElementById("btn-create-room");
const btnJoinRoom = document.getElementById("btn-join-room");
const btnCloseMp = document.getElementById("btn-close-mp");
const roomCodeInput = document.getElementById("room-code-input");
const mpStatus = document.getElementById("mp-status");

/* ---------- СОСТОЯНИЕ ---------- */
let score = 0;
let gameSpeed = BASE_SPEED;
let isGameStarted = false;
let isGameOver = false;
let currentCharacter = "dino";
let currentMap = "devils";
let playerNickname = localStorage.getItem("dino_player_nick") || "";
let highScore = Number(localStorage.getItem(highScoreKey())) || 0;
let leaderboard = [];

let seedValue = Math.random() * 10000;
let isMultiplayer = false;
let currentRoomId = null;
let roomRef = null;
let opponentData = null;
let mpSyncTimer = 0;

let skyDunes = [];
let farDunes = [];
let nearDunes = [];
let particles = [];
let windLines = [];
let obstacles = [];

let spawnTimer = 0;
let nextSpawnInterval = 90;
let spinAngle = 0;
let animationId = null;

/* ---------- УТИЛИТЫ ---------- */
function highScoreKey() {
    return `dino_high_${playerNickname || "guest"}`;
}

function seededRandom() {
    seedValue = (seedValue * 9301 + 49297) % 233280;
    return seedValue / 233280;
}

/* ---------- НИКНЕЙМ ---------- */
if (playerNickname) {
    nicknameInput.value = playerNickname;
    displayNickname.textContent = playerNickname;
}

function confirmNickname() {
    const cleanNick = nicknameInput.value.trim();
    if (!cleanNick) {
        nicknameInput.classList.add("input-error");
        nicknameInput.focus();
        return;
    }
    nicknameInput.classList.remove("input-error");
    playerNickname = cleanNick;
    localStorage.setItem("dino_player_nick", playerNickname);
    displayNickname.textContent = playerNickname;
    highScore = Number(localStorage.getItem(highScoreKey())) || 0;

    nicknameScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
}

btnSaveNick.addEventListener("click", confirmNickname);
nicknameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmNickname();
});

btnChangeNick.addEventListener("click", () => {
    mainMenu.classList.add("hidden");
    nicknameScreen.classList.remove("hidden");
    nicknameInput.focus();
});

/* ---------- ЛИДЕРБОРД ---------- */
async function saveScoreToLeaderboard(name, finalScore) {
    if (!db) return;
    const cleanScore = Math.floor(finalScore);
    if (cleanScore <= 0 || !name) return;

    const safeKey = name.trim().toLowerCase().replace(/[.#$\[\]\/]/g, "_");
    const playerUrl = `${FIREBASE_DB_URL}/leaderboard/${safeKey}.json`;

    try {
        const res = await fetch(playerUrl);
        const existingData = await res.json();

        if (!existingData || cleanScore > existingData.score) {
            await fetch(playerUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    score: cleanScore,
                    updatedAt: Date.now()
                })
            });
        }
    } catch (err) {
        console.error("Ошибка сохранения в Firebase:", err);
    }
}

async function renderLeaderboard() {
    leaderboardBody.innerHTML = `<tr><td colspan="3" class="leaderboard-empty">Загрузка рекордов из облака...</td></tr>`;

    if (!db) {
        leaderboardBody.innerHTML = `<tr><td colspan="3" class="leaderboard-empty">Firebase не подключён</td></tr>`;
        return;
    }

    try {
        const res = await fetch(`${FIREBASE_DB_URL}/leaderboard.json`);
        const data = await res.json();

        if (!data) {
            leaderboardBody.innerHTML = `<tr><td colspan="3" class="leaderboard-empty">Пока нет рекордов. Сыграйте первый заезд!</td></tr>`;
            return;
        }

        leaderboard = Object.values(data)
            .sort((a, b) => b.score - a.score)
            .slice(0, LEADERBOARD_LIMIT);

        leaderboardBody.innerHTML = "";
        leaderboard.forEach((entry, index) => {
            const tr = document.createElement("tr");
            if (index === 0) tr.classList.add("rank-1");
            else if (index === 1) tr.classList.add("rank-2");
            else if (index === 2) tr.classList.add("rank-3");

            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
            tr.innerHTML = `
                <td>${medal}</td>
                <td>${entry.name}</td>
                <td>${String(entry.score).padStart(5, "0")}</td>
            `;
            leaderboardBody.appendChild(tr);
        });
    } catch (err) {
        leaderboardBody.innerHTML = `<tr><td colspan="3" class="leaderboard-empty">Не удалось загрузить таблицу. Проверьте интернет.</td></tr>`;
        console.error("Ошибка загрузки из Firebase:", err);
    }
}

btnLeaderboard.addEventListener("click", () => {
    renderLeaderboard();
    leaderboardModal.classList.remove("hidden");
});

btnCloseLeader.addEventListener("click", () => leaderboardModal.classList.add("hidden"));
leaderboardModal.addEventListener("click", (e) => {
    if (e.target === leaderboardModal) leaderboardModal.classList.add("hidden");
});

btnClearLeader.addEventListener("click", async () => {
    if (!db) return;
    if (!confirm("Точно сбросить всю таблицу лидеров? Это действие необратимо.")) return;
    try {
        await fetch(`${FIREBASE_DB_URL}/leaderboard.json`, { method: "DELETE" });
        leaderboard = [];
        renderLeaderboard();
    } catch (err) {
        console.error("Ошибка очистки базы:", err);
    }
});

/* ---------- МОДАЛКИ: СКИНЫ / КАРТЫ / CREDITS ---------- */
btnChar.addEventListener("click", () => skinsModal.classList.remove("hidden"));
btnCloseSkins.addEventListener("click", () => skinsModal.classList.add("hidden"));
skinsModal.addEventListener("click", (e) => {
    if (e.target === skinsModal) skinsModal.classList.add("hidden");
});

skinItems.forEach(item => {
    item.addEventListener("click", () => {
        skinItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        currentCharacter = item.getAttribute("data-skin");
    });
});

btnMaps.addEventListener("click", () => mapsModal.classList.remove("hidden"));
btnCloseMaps.addEventListener("click", () => mapsModal.classList.add("hidden"));
mapsModal.addEventListener("click", (e) => {
    if (e.target === mapsModal) mapsModal.classList.add("hidden");
});

mapItems.forEach(item => {
    item.addEventListener("click", () => {
        mapItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        currentMap = item.getAttribute("data-map");
    });
});

btnCredits.addEventListener("click", () => creditsModal.classList.remove("hidden"));
btnCloseCredits.addEventListener("click", () => creditsModal.classList.add("hidden"));
creditsModal.addEventListener("click", (e) => {
    if (e.target === creditsModal) creditsModal.classList.add("hidden");
});

/* ---------- МУЛЬТИПЛЕЕР ---------- */
if (btnMultiplayer && mpModal) {
    btnMultiplayer.addEventListener("click", () => {
        mpStatus.textContent = "Создайте комнату или введите код друга";
        mpModal.classList.remove("hidden");
    });

    btnCloseMp.addEventListener("click", () => {
        leaveMultiplayerRoom();
        mpModal.classList.add("hidden");
    });

    btnCreateRoom.addEventListener("click", async () => {
        if (!db) { mpStatus.textContent = "Firebase недоступен"; return; }
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const startSeed = Math.floor(Math.random() * 99999);
        currentRoomId = code;
        mpStatus.textContent = `КОД КОМНАТЫ: ${code} — Ждём соперника...`;

        await db.ref(`rooms/${code}`).set({
            seed: startSeed,
            status: "waiting",
            players: {
                [playerNickname]: { y: PLAYER_START_Y, skin: currentCharacter, alive: true, score: 0 }
            }
        });

        listenRoom(code);
    });

    btnJoinRoom.addEventListener("click", async () => {
        if (!db) { mpStatus.textContent = "Firebase недоступен"; return; }
        const code = roomCodeInput.value.trim();
        if (code.length !== 4) {
            mpStatus.textContent = "Введите 4-значный код!";
            return;
        }

        const snap = await db.ref(`rooms/${code}`).once("value");
        const room = snap.val();
        if (!room) {
            mpStatus.textContent = "Комната не найдена!";
            return;
        }

        currentRoomId = code;
        await db.ref(`rooms/${code}/players/${playerNickname}`).set({
            y: PLAYER_START_Y, skin: currentCharacter, alive: true, score: 0
        });
        await db.ref(`rooms/${code}/status`).set("playing");

        listenRoom(code);
    });
}

function leaveMultiplayerRoom() {
    if (roomRef) {
        roomRef.off();
        if (currentRoomId && db) db.ref(`rooms/${currentRoomId}`).remove();
    }
    isMultiplayer = false;
    currentRoomId = null;
    opponentData = null;
}

function listenRoom(code) {
    if (!db) return;
    roomRef = db.ref(`rooms/${code}`);
    roomRef.on("value", (snap) => {
        const room = snap.val();
        if (!room) return;

        if (room.players) {
            for (const name in room.players) {
                if (name !== playerNickname) {
                    opponentData = { name, ...room.players[name] };
                }
            }
        }

        if (room.status === "playing" && !isGameStarted) {
            seedValue = room.seed;
            isMultiplayer = true;
            mpModal.classList.add("hidden");
            mainMenu.classList.add("hidden");
            gameScreen.classList.remove("hidden");
            isGameStarted = true;
            resetGame(true);
        }
    });
}

/* ---------- СТАРТ / ВЫХОД ---------- */
btnStart.addEventListener("click", () => {
    mainMenu.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    isGameStarted = true;
    resetGame();
});

btnBackMenu.addEventListener("click", returnToMenu);

function returnToMenu() {
    leaveMultiplayerRoom();
    isGameStarted = false;
    isGameOver = false;
    if (animationId) cancelAnimationFrame(animationId);
    gameScreen.classList.add("hidden");
    mainMenu.classList.remove("hidden");
}

/* ---------- УПРАВЛЕНИЕ ---------- */
function handleActionInput() {
    if (!isGameStarted) return;
    if (isGameOver) {
        if (!isMultiplayer) resetGame();
    } else {
        player.jump();
    }
}

document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if ((e.key === " " || e.key === "ArrowUp") && isGameStarted) {
        handleActionInput();
        e.preventDefault();
    } else if (e.key === "Escape" && isGameStarted) {
        returnToMenu();
    }
});

canvas.addEventListener("mousedown", handleActionInput);
canvas.addEventListener("touchstart", (e) => {
    handleActionInput();
    e.preventDefault();
}, { passive: false });

/* ---------- ФОН ---------- */
class Dune {
    constructor(layer, startX = null) {
        this.layer = layer;
        this.x = startX !== null ? startX : canvas.width + Math.random() * 150;

        if (currentMap === "devils") {
            this.width = Math.random() * 80 + 60;
            if (layer === "sky") { this.height = Math.random() * 60 + 60; this.speed = 0.2; this.color = "#84532c"; }
            else if (layer === "far") { this.height = Math.random() * 50 + 40; this.speed = 0.5; this.color = "#a16b3d"; }
            else { this.height = Math.random() * 30 + 20; this.speed = 1.2; this.color = "#be834e"; }
        } else if (currentMap === "sandiego") {
            this.width = Math.random() * 240 + 180;
            if (layer === "sky") { this.height = Math.random() * 20 + 15; this.speed = 0.3; this.color = "#2980b9"; }
            else if (layer === "far") { this.height = Math.random() * 25 + 10; this.speed = 0.6; this.color = "#eccc68"; }
            else { this.height = Math.random() * 15 + 8; this.speed = 1.3; this.color = "#ffdd59"; }
        } else {
            this.width = Math.random() * 120 + 90;
            if (layer === "sky") { this.height = Math.random() * 90 + 70; this.speed = 0.15; this.color = "#57606f"; }
            else if (layer === "far") { this.height = Math.random() * 65 + 45; this.speed = 0.45; this.color = "#747d8c"; }
            else { this.height = Math.random() * 35 + 20; this.speed = 1.1; this.color = "#a4b0be"; }
        }
    }

    update() {
        this.x -= this.speed * (gameSpeed / BASE_SPEED);
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x, GROUND_Y);
        if (currentMap === "rocky") {
            ctx.lineTo(this.x + this.width * 0.5, GROUND_Y - this.height);
            ctx.lineTo(this.x + this.width, GROUND_Y);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(this.x + this.width * 0.5, GROUND_Y - this.height);
            ctx.lineTo(this.x + this.width * 0.35, GROUND_Y - this.height * 0.7);
            ctx.lineTo(this.x + this.width * 0.65, GROUND_Y - this.height * 0.7);
            ctx.fill();
        } else {
            ctx.quadraticCurveTo(this.x + this.width / 2, GROUND_Y - this.height * 1.6, this.x + this.width, GROUND_Y);
            ctx.fill();
        }
    }
}

class Obstacle {
    constructor() {
        this.x = canvas.width + 20;
        const variant = isMultiplayer ? seededRandom() : Math.random();
        if (variant < 0.4) {
            this.width = 22;
            this.height = 38;
        } else if (variant < 0.8) {
            this.width = 34;
            this.height = 46;
        } else {
            this.width = 48;
            this.height = 30;
        }
        this.y = GROUND_Y - this.height;
    }

    update() {
        this.x -= gameSpeed;
    }

    draw() {
        if (currentMap === "devils") {
            ctx.fillStyle = "#27ae60";
            ctx.fillRect(this.x + 6, this.y, this.width - 12, this.height);
            ctx.fillRect(this.x, this.y + 10, 6, 14);
            ctx.fillRect(this.x + this.width - 6, this.y + 6, 6, 14);
            ctx.fillStyle = "#1e8449";
            ctx.fillRect(this.x + this.width / 2 - 1, this.y + 4, 2, this.height - 6);
        } else if (currentMap === "sandiego") {
            ctx.fillStyle = "#ee5253";
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2 + 4, this.width / 2, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(this.x + 2, this.y + this.height / 2 + 4, this.width - 4, this.height / 2 - 4);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(this.x + 8, this.y + 10, 4, 4);
            ctx.fillRect(this.x + this.width - 12, this.y + 10, 4, 4);
        } else {
            ctx.fillStyle = "#48dbfb";
            ctx.beginPath();
            ctx.moveTo(this.x, GROUND_Y);
            ctx.lineTo(this.x + this.width * 0.3, this.y);
            ctx.lineTo(this.x + this.width * 0.6, this.y + 12);
            ctx.lineTo(this.x + this.width * 0.8, this.y + 4);
            ctx.lineTo(this.x + this.width, GROUND_Y);
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

/* ---------- ЧАСТИЦЫ ---------- */
function spawnJumpParticles() {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: player.x + player.width / 2,
            y: GROUND_Y - 2,
            vx: (Math.random() - 0.5) * 4,
            vy: -Math.random() * 3,
            life: 20
        });
    }
}

/* ---------- ОТРИСОВКА СКИНОВ (разбито по функциям) ---------- */
const SKIN_DRAWERS = {
    dino: function drawJohnnyDino() {
        const gallop = this.isJumping ? -3 : Math.sin(spinAngle * 2.5) * 4;

        ctx.fillStyle = "#b2bec3";
        ctx.beginPath();
        ctx.moveTo(this.x + 2, this.y + 24);
        ctx.quadraticCurveTo(this.x - 10, this.y + 26 + gallop * 0.5, this.x - 6, this.y + 36);
        ctx.lineTo(this.x + 4, this.y + 28);
        ctx.fill();

        ctx.strokeStyle = "#dfe6e9";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.x + 7, this.y + 33);
        ctx.lineTo(this.x + 3 - gallop, this.y + 44);
        ctx.moveTo(this.x + 27, this.y + 33);
        ctx.lineTo(this.x + 33 + gallop, this.y + 43);
        ctx.stroke();

        ctx.fillStyle = "#2d3436";
        ctx.fillRect(this.x + 1 - gallop, this.y + 42, 4, 3);
        ctx.fillRect(this.x + 31 + gallop, this.y + 41, 4, 3);

        ctx.fillStyle = "#f5f6fa";
        ctx.beginPath();
        ctx.ellipse(this.x + 17, this.y + 29, 15, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7f8fa6";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#f5f6fa";
        ctx.beginPath();
        ctx.moveTo(this.x + 26, this.y + 27);
        ctx.lineTo(this.x + 33, this.y + 13);
        ctx.lineTo(this.x + 42, this.y + 20);
        ctx.lineTo(this.x + 38, this.y + 24);
        ctx.lineTo(this.x + 31, this.y + 31);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#95a5a6";
        ctx.beginPath();
        ctx.moveTo(this.x + 32, this.y + 13);
        ctx.lineTo(this.x + 24, this.y + 22);
        ctx.lineTo(this.x + 28, this.y + 24);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#2f3640";
        ctx.fillRect(this.x + 35, this.y + 16, 2, 2);

        ctx.fillStyle = "#3498db";
        ctx.fillRect(this.x + 15, this.y + 11, 8, 11);

        ctx.fillStyle = "#f1c40f";
        ctx.beginPath();
        ctx.arc(this.x + 20, this.y + 8, 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(this.x + 20, this.y + 5.5, 4.5, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = "#2980b9";
        ctx.lineWidth = 1.2;
        ctx.stroke();
    },

    gyro: function drawGyro() {
        const gallop = this.isJumping ? -3 : Math.sin(spinAngle * 2.5) * 4;
        const capeWave = Math.sin(spinAngle * 2) * 3;

        ctx.fillStyle = "#c8a165";
        ctx.beginPath();
        ctx.moveTo(this.x + 2, this.y + 24);
        ctx.quadraticCurveTo(this.x - 11, this.y + 25 + gallop * 0.5, this.x - 7, this.y + 35);
        ctx.lineTo(this.x + 4, this.y + 28);
        ctx.fill();

        ctx.strokeStyle = "#8e441d";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.x + 7, this.y + 33);
        ctx.lineTo(this.x + 3 - gallop, this.y + 44);
        ctx.moveTo(this.x + 27, this.y + 33);
        ctx.lineTo(this.x + 33 + gallop, this.y + 43);
        ctx.stroke();

        ctx.fillStyle = "#1abc9c";
        ctx.fillRect(this.x + 2 - gallop, this.y + 38, 4, 3.5);
        ctx.fillRect(this.x + 30 + gallop, this.y + 37, 4, 3.5);

        ctx.fillStyle = "#1e272e";
        ctx.fillRect(this.x + 1 - gallop, this.y + 42, 4, 3);
        ctx.fillRect(this.x + 31 + gallop, this.y + 41, 4, 3);

        const horseGrad = ctx.createLinearGradient(this.x + 5, this.y + 22, this.x + 30, this.y + 36);
        horseGrad.addColorStop(0, "#e67e22");
        horseGrad.addColorStop(0.5, "#b84b14");
        horseGrad.addColorStop(1, "#6e2c00");
        ctx.fillStyle = horseGrad;
        ctx.beginPath();
        ctx.ellipse(this.x + 17, this.y + 29, 15, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#b2bec3";
        ctx.beginPath();
        ctx.moveTo(this.x + 6, this.y + 23);
        ctx.lineTo(this.x + 15, this.y + 23);
        ctx.lineTo(this.x + 13, this.y + 30);
        ctx.lineTo(this.x + 4, this.y + 29);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#b84b14";
        ctx.beginPath();
        ctx.moveTo(this.x + 26, this.y + 27);
        ctx.lineTo(this.x + 33, this.y + 13);
        ctx.lineTo(this.x + 42, this.y + 20);
        ctx.lineTo(this.x + 38, this.y + 24);
        ctx.lineTo(this.x + 31, this.y + 31);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#c0392b";
        ctx.beginPath();
        ctx.moveTo(this.x + 32, this.y + 13);
        ctx.lineTo(this.x + 39, this.y + 17);
        ctx.lineTo(this.x + 36, this.y + 22);
        ctx.lineTo(this.x + 30, this.y + 19);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#eab543";
        ctx.beginPath();
        ctx.arc(this.x + 40, this.y + 21, 2.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#1abc9c";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(this.x + 21, this.y + 23);
        ctx.lineTo(this.x + 25, this.y + 35);
        ctx.moveTo(this.x + 23, this.y + 29);
        ctx.lineTo(this.x + 33, this.y + 27);
        ctx.stroke();

        ctx.fillStyle = "#2980b9";
        ctx.beginPath();
        ctx.moveTo(this.x + 17, this.y + 13);
        ctx.quadraticCurveTo(this.x + 4, this.y + 12 + capeWave, this.x - 7, this.y + 15 - capeWave);
        ctx.lineTo(this.x - 4, this.y + 21 - capeWave);
        ctx.quadraticCurveTo(this.x + 7, this.y + 18, this.x + 17, this.y + 17);
        ctx.fill();

        ctx.fillStyle = "#d4ac0d";
        ctx.beginPath();
        ctx.moveTo(this.x + 17, this.y + 21);
        ctx.lineTo(this.x + 21, this.y + 30);
        ctx.lineTo(this.x + 17, this.y + 31);
        ctx.lineTo(this.x + 14, this.y + 23);
        ctx.fill();

        ctx.fillStyle = "#5b2c6f";
        ctx.fillRect(this.x + 16, this.y + 11, 8, 10);

        ctx.fillStyle = "#2ecc71";
        ctx.beginPath();
        ctx.arc(this.x + 27, this.y + 15, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#196f3d";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#f5d76e";
        ctx.beginPath();
        ctx.moveTo(this.x + 19, this.y + 7);
        ctx.lineTo(this.x + 13, this.y + 11);
        ctx.lineTo(this.x + 18, this.y + 12);
        ctx.fill();

        ctx.fillStyle = "#fad390";
        ctx.beginPath();
        ctx.arc(this.x + 21, this.y + 8, 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#4e342e";
        ctx.beginPath();
        ctx.ellipse(this.x + 21, this.y + 5.5, 9, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(this.x + 17, this.y + 2, 8, 3.5);

        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(this.x + 18, this.y + 4.5, 1.5, 1.5);
        ctx.fillRect(this.x + 21, this.y + 4.5, 1.5, 1.5);
        ctx.fillRect(this.x + 24, this.y + 4.5, 1.5, 1.5);
    },

    diego: function drawDiego() {
        const runCycle = this.isJumping ? 4 : Math.sin(spinAngle * 2.8) * 6;
        const jawOpen = this.isJumping ? 4 : Math.abs(Math.sin(spinAngle * 1.5)) * 2.5;

        ctx.fillStyle = "#0abde3";
        ctx.beginPath();
        ctx.moveTo(this.x + 12, this.y + 23);
        ctx.quadraticCurveTo(this.x - 6, this.y + 20 + runCycle * 0.3, this.x - 14, this.y + 25);
        ctx.quadraticCurveTo(this.x - 4, this.y + 28, this.x + 12, this.y + 31);
        ctx.fill();

        ctx.strokeStyle = "#f1c40f";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.x - 10, this.y + 25);
        ctx.lineTo(this.x + 8, this.y + 28);
        ctx.stroke();

        ctx.strokeStyle = "#192a56";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.x + 15, this.y + 30);
        ctx.lineTo(this.x + 11 - runCycle, this.y + 38);
        ctx.lineTo(this.x + 15 - runCycle, this.y + 44);
        ctx.stroke();

        const bodyGrad = ctx.createLinearGradient(this.x + 10, this.y + 10, this.x + 30, this.y + 35);
        bodyGrad.addColorStop(0, "#48dbfb");
        bodyGrad.addColorStop(0.6, "#0abde3");
        bodyGrad.addColorStop(1, "#273c75");
        ctx.fillStyle = bodyGrad;

        ctx.beginPath();
        ctx.moveTo(this.x + 10, this.y + 24);
        ctx.lineTo(this.x + 21, this.y + 11);
        ctx.lineTo(this.x + 29, this.y + 15);
        ctx.lineTo(this.x + 26, this.y + 32);
        ctx.lineTo(this.x + 12, this.y + 33);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#a3e4d7";
        ctx.beginPath();
        ctx.moveTo(this.x + 25, this.y + 16);
        ctx.lineTo(this.x + 29, this.y + 24);
        ctx.lineTo(this.x + 23, this.y + 32);
        ctx.lineTo(this.x + 22, this.y + 18);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#f1c40f";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(this.x + 23, this.y + 20);
        ctx.lineTo(this.x + 28, this.y + 22);
        ctx.moveTo(this.x + 23, this.y + 25);
        ctx.lineTo(this.x + 27, this.y + 27);
        ctx.stroke();

        ctx.strokeStyle = "#192a56";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(this.x + 19, this.y + 14);
        ctx.lineTo(this.x + 23, this.y + 16);
        ctx.moveTo(this.x + 16, this.y + 18);
        ctx.lineTo(this.x + 21, this.y + 20);
        ctx.moveTo(this.x + 13, this.y + 22);
        ctx.lineTo(this.x + 18, this.y + 24);
        ctx.stroke();

        ctx.strokeStyle = "#f39c12";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(this.x + 14, this.y + 28, 3.5, -0.5, Math.PI * 1.1);
        ctx.stroke();

        ctx.strokeStyle = "#273c75";
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(this.x + 16, this.y + 29);
        ctx.lineTo(this.x + 12 + runCycle, this.y + 37);
        ctx.lineTo(this.x + 18 + runCycle, this.y + 44);
        ctx.stroke();

        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(this.x + 18 + runCycle, this.y + 42, 4, 2.5);

        ctx.strokeStyle = "#0abde3";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(this.x + 25, this.y + 21);
        ctx.lineTo(this.x + 32, this.y + 25);
        ctx.lineTo(this.x + 30, this.y + 29);
        ctx.stroke();
        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(this.x + 29, this.y + 28, 3, 2);

        ctx.fillStyle = "#48dbfb";
        ctx.beginPath();
        ctx.moveTo(this.x + 21, this.y + 11);
        ctx.lineTo(this.x + 25, this.y + 3);
        ctx.lineTo(this.x + 42, this.y + 7);
        ctx.lineTo(this.x + 40, this.y + 12);
        ctx.lineTo(this.x + 27, this.y + 13);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#192a56";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#0abde3";
        ctx.beginPath();
        ctx.moveTo(this.x + 26, this.y + 13);
        ctx.lineTo(this.x + 39, this.y + 13 + jawOpen);
        ctx.lineTo(this.x + 37, this.y + 16 + jawOpen);
        ctx.lineTo(this.x + 25, this.y + 16);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        for (let t = 0; t < 4; t++) {
            ctx.fillRect(this.x + 29 + t * 3, this.y + 11.5, 1.5, 2);
        }

        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(this.x + 27, this.y + 6, 3, 2.5);
    },

    hotpants: function drawHotPants() {
        const gallop = this.isJumping ? -3 : Math.sin(spinAngle * 2.5) * 4;

        ctx.fillStyle = "#2d3436";
        ctx.beginPath();
        ctx.moveTo(this.x + 2, this.y + 24);
        ctx.quadraticCurveTo(this.x - 10, this.y + 26 + gallop * 0.5, this.x - 6, this.y + 36);
        ctx.lineTo(this.x + 4, this.y + 28);
        ctx.fill();

        ctx.strokeStyle = "#b2bec3";
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.x + 7, this.y + 33);
        ctx.lineTo(this.x + 3 - gallop, this.y + 44);
        ctx.moveTo(this.x + 27, this.y + 33);
        ctx.lineTo(this.x + 33 + gallop, this.y + 43);
        ctx.stroke();

        ctx.fillStyle = "#2d3436";
        ctx.fillRect(this.x + 1 - gallop, this.y + 42, 4, 3);
        ctx.fillRect(this.x + 31 + gallop, this.y + 41, 4, 3);

        ctx.fillStyle = "#dfe6e9";
        ctx.beginPath();
        ctx.ellipse(this.x + 17, this.y + 29, 15, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#636e72";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#dfe6e9";
        ctx.beginPath();
        ctx.moveTo(this.x + 26, this.y + 27);
        ctx.lineTo(this.x + 33, this.y + 13);
        ctx.lineTo(this.x + 42, this.y + 20);
        ctx.lineTo(this.x + 38, this.y + 24);
        ctx.lineTo(this.x + 31, this.y + 31);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#2d3436";
        ctx.beginPath();
        ctx.moveTo(this.x + 32, this.y + 13);
        ctx.lineTo(this.x + 25, this.y + 21);
        ctx.lineTo(this.x + 29, this.y + 23);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#8d6e63";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(this.x + 21, this.y + 23);
        ctx.lineTo(this.x + 25, this.y + 35);
        ctx.moveTo(this.x + 34, this.y + 16);
        ctx.lineTo(this.x + 40, this.y + 21);
        ctx.stroke();

        ctx.fillStyle = "#81ecec";
        ctx.beginPath();
        ctx.moveTo(this.x + 13, this.y + 22);
        ctx.lineTo(this.x + 6, this.y + 31);
        ctx.lineTo(this.x + 12, this.y + 31);
        ctx.fill();

        ctx.fillStyle = "#d1ccc0";
        ctx.fillRect(this.x + 9, this.y + 17, 6, 6);
        ctx.strokeStyle = "#636e72";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(this.x + 9, this.y + 17, 6, 6);

        ctx.fillStyle = "#e84393";
        ctx.beginPath();
        ctx.moveTo(this.x + 17, this.y + 21);
        ctx.lineTo(this.x + 21, this.y + 31);
        ctx.lineTo(this.x + 18, this.y + 32);
        ctx.lineTo(this.x + 14, this.y + 23);
        ctx.fill();

        ctx.fillStyle = "#fd79a8";
        ctx.fillRect(this.x + 16, this.y + 11, 8, 11);

        ctx.fillStyle = "#dfe6e9";
        ctx.fillRect(this.x + 21, this.y + 13, 6, 3);

        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(this.x + 16, this.y + 19, 8, 2);
        ctx.fillRect(this.x + 21, this.y + 13, 2.5, 2.5);

        ctx.fillStyle = "#fd79a8";
        ctx.fillRect(this.x + 16, this.y + 6, 4, 5);

        ctx.fillStyle = "#fad390";
        ctx.beginPath();
        ctx.arc(this.x + 21, this.y + 8, 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#2d3436";
        ctx.beginPath();
        ctx.arc(this.x + 20.5, this.y + 6.5, 5, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(this.x + 21, this.y + 5.5, 6.5, 1.8);

        ctx.fillStyle = "#f1c40f";
        ctx.beginPath();
        ctx.arc(this.x + 22.5, this.y + 5, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(this.x + 19.5, this.y + 0.5, 2, 2);
    },

    wildhunt: function drawWildHunt() {
        const gallop = this.isJumping ? -3.5 : Math.sin(spinAngle * 2.6) * 4.5;
        const smoke = Math.sin(spinAngle * 3.2) * 2.5;

        // 1. Рваный призрачный хвост и дымный шлейф коня
        ctx.fillStyle = "#111215";
        ctx.beginPath();
        ctx.moveTo(this.x + 5, this.y + 23);
        ctx.quadraticCurveTo(this.x - 10, this.y + 18 + smoke, this.x - 20, this.y + 26 - smoke);
        ctx.lineTo(this.x - 15, this.y + 31 + smoke);
        ctx.lineTo(this.x - 22, this.y + 36 - smoke);
        ctx.quadraticCurveTo(this.x - 8, this.y + 37, this.x + 7, this.y + 29);
        ctx.closePath();
        ctx.fill();

        // 2. Дальние ноги коня
        ctx.strokeStyle = "#0d0e11";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.x + 10, this.y + 32);
        ctx.lineTo(this.x + 14 + gallop, this.y + 44);
        ctx.moveTo(this.x + 26, this.y + 32);
        ctx.lineTo(this.x + 22 - gallop, this.y + 44);
        ctx.stroke();

        // 3. Витражный меч за спиной
        ctx.save();
        ctx.translate(this.x + 16, this.y + 16);
        ctx.rotate(-0.62);

        ctx.fillStyle = "#18191c";
        ctx.fillRect(11, -1.5, 11, 3);
        ctx.fillRect(14, -3, 1.5, 6);
        ctx.fillRect(18, -3, 1.5, 6);
        ctx.beginPath();
        ctx.arc(22.5, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#636e72";
        ctx.beginPath();
        ctx.moveTo(9, -6);
        ctx.lineTo(12, -3);
        ctx.lineTo(12, 3);
        ctx.lineTo(9, 6);
        ctx.lineTo(7, 2);
        ctx.lineTo(7, -2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#2d3436";
        ctx.beginPath();
        ctx.moveTo(8, -3.5);
        ctx.lineTo(-22, -4);
        ctx.lineTo(-27, 0);
        ctx.lineTo(-22, 4);
        ctx.lineTo(8, 3.5);
        ctx.closePath();
        ctx.fill();

        const glassColors = ["#c0392b", "#e67e22", "#8e44ad", "#d63031", "#f1c40f"];
        for (let g = 0; g < 5; g++) {
            ctx.fillStyle = glassColors[g];
            ctx.fillRect(-19 + g * 5.2, -2.2, 4, 4.4);
        }
        ctx.strokeStyle = "#1e272e";
        ctx.lineWidth = 0.9;
        ctx.strokeRect(-20, -2.5, 27, 5);
        ctx.restore();

        // 4. Тело коня
        ctx.fillStyle = "#18191c";
        ctx.beginPath();
        ctx.ellipse(this.x + 18, this.y + 28, 15, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#57606f";
        ctx.beginPath();
        ctx.moveTo(this.x + 24, this.y + 22);
        ctx.lineTo(this.x + 32, this.y + 24);
        ctx.lineTo(this.x + 30, this.y + 31);
        ctx.lineTo(this.x + 22, this.y + 29);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#2f3542";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // 5. Шея Дуллахана
        ctx.fillStyle = "#18191c";
        ctx.beginPath();
        ctx.moveTo(this.x + 27, this.y + 25);
        ctx.lineTo(this.x + 32, this.y + 14);
        ctx.lineTo(this.x + 39, this.y + 17);
        ctx.lineTo(this.x + 33, this.y + 30);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#0d0e11";
        ctx.beginPath();
        ctx.moveTo(this.x + 31, this.y + 16);
        ctx.lineTo(this.x + 28, this.y + 10 + smoke * 0.5);
        ctx.lineTo(this.x + 34, this.y + 14);
        ctx.fill();

        ctx.fillStyle = "#96281b";
        ctx.beginPath();
        ctx.ellipse(this.x + 35.5, this.y + 15.5, 3.8, 2, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e74c3c";
        ctx.beginPath();
        ctx.arc(this.x + 35.5, this.y + 15.5, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 6. Ближние ноги
        ctx.strokeStyle = "#22262c";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(this.x + 8, this.y + 32);
        ctx.lineTo(this.x + 3 - gallop, this.y + 44);
        ctx.moveTo(this.x + 28, this.y + 32);
        ctx.lineTo(this.x + 34 + gallop, this.y + 43);
        ctx.stroke();

        ctx.fillStyle = "#18191c";
        ctx.fillRect(this.x + 1 - gallop, this.y + 41, 5, 4);
        ctx.fillRect(this.x + 32 + gallop, this.y + 40, 5, 4);

        // 7. Всадник: плащ
        ctx.fillStyle = "#141518";
        ctx.beginPath();
        ctx.moveTo(this.x + 15, this.y + 13);
        ctx.quadraticCurveTo(this.x + 6, this.y + 18 + smoke, this.x + 1, this.y + 27 - smoke);
        ctx.lineTo(this.x + 15, this.y + 28);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#22262c";
        ctx.fillRect(this.x + 15, this.y + 11, 8, 12);
        ctx.strokeStyle = "#57606f";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x + 15, this.y + 13);
        ctx.lineTo(this.x + 23, this.y + 18);
        ctx.moveTo(this.x + 15, this.y + 19);
        ctx.lineTo(this.x + 23, this.y + 19);
        ctx.stroke();

        ctx.fillStyle = "#3d3d3d";
        ctx.fillRect(this.x + 15, this.y + 10.5, 8.5, 2.5);

        // 8. Голова и волосы
        ctx.fillStyle = "#d7ccc8";
        ctx.beginPath();
        ctx.arc(this.x + 19.5, this.y + 7.5, 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#3b2316";
        ctx.beginPath();
        ctx.arc(this.x + 19, this.y + 7, 5.2, Math.PI * 0.9, Math.PI * 0.1);
        ctx.lineTo(this.x + 23.5, this.y + 13);
        ctx.lineTo(this.x + 21.5, this.y + 9);
        ctx.lineTo(this.x + 18, this.y + 10);
        ctx.lineTo(this.x + 16, this.y + 14.5);
        ctx.lineTo(this.x + 13.5, this.y + 12);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#2c1608";
        ctx.fillRect(this.x + 19.5, this.y + 6.5, 3.5, 0.9);
        ctx.fillStyle = "#c0392b";
        ctx.fillRect(this.x + 21, this.y + 7.5, 1.5, 1.3);
    },

    /* Фолбэк для skin="john" — в оригинале его не было в SKIN_DRAWERS,
       но он был в HTML. Рисуем как dino, чтобы не падать. */
    john: function drawJohn() {
        SKIN_DRAWERS.dino.call(this);
    }
};

/* ---------- ИГРОК ---------- */
const player = {
    x: 60,
    y: PLAYER_START_Y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    velocityY: 0,
    gravity: GRAVITY,
    isJumping: false,
    jump() {
        if (!this.isJumping) {
            this.velocityY = JUMP_VELOCITY;
            this.isJumping = true;
            spawnJumpParticles();
        }
    },
    update() {
        this.y += this.velocityY;
        if (this.y + this.height < GROUND_Y) {
            this.velocityY += this.gravity;
        } else {
            this.y = GROUND_Y - this.height;
            this.velocityY = 0;
            this.isJumping = false;
        }
        spinAngle += 0.15 * (gameSpeed / BASE_SPEED);
    },
    draw() {
        ctx.save();
        const drawer = SKIN_DRAWERS[currentCharacter] || SKIN_DRAWERS.dino;
        drawer.call(this);
        ctx.restore();
    }
};

/* ---------- ФОН: ИНИЦИАЛИЗАЦИЯ И РИСОВАНИЕ ---------- */
function initBackground() {
    skyDunes = [];
    farDunes = [];
    nearDunes = [];
    windLines = [];
    for (let i = 0; i < 6; i++) {
        skyDunes.push(new Dune("sky", i * 160));
        farDunes.push(new Dune("far", i * 150));
        nearDunes.push(new Dune("near", i * 140));
    }
    for (let i = 0; i < 5; i++) {
        windLines.push({
            x: Math.random() * canvas.width,
            y: Math.random() * 170 + 10,
            len: Math.random() * 40 + 20,
            speed: Math.random() * 3 + 2
        });
    }
}

function drawBackground() {
    if (currentMap === "devils") {
        ctx.fillStyle = "#f7ca84";
        ctx.fillRect(0, 0, canvas.width, GROUND_Y);
        ctx.fillStyle = "#ff793f";
        ctx.beginPath();
        ctx.arc(680, 70, 32, 0, Math.PI * 2);
        ctx.fill();
    } else if (currentMap === "sandiego") {
        ctx.fillStyle = "#70a1ff";
        ctx.fillRect(0, 0, canvas.width, GROUND_Y);
        ctx.fillStyle = "#ffeaa7";
        ctx.beginPath();
        ctx.arc(680, 55, 28, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = "#ced6e0";
        ctx.fillRect(0, 0, canvas.width, GROUND_Y);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(680, 60, 24, 0, Math.PI * 2);
        ctx.fill();
    }

    [skyDunes, farDunes, nearDunes].forEach((layerArr, idx) => {
        const layerName = idx === 0 ? "sky" : idx === 1 ? "far" : "near";
        layerArr.forEach(d => {
            d.update();
            d.draw();
        });
        if (layerArr.length > 0 && layerArr[0].x + layerArr[0].width < 0) {
            layerArr.shift();
            layerArr.push(new Dune(layerName));
        }
    });

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 2;
    windLines.forEach(w => {
        w.x -= w.speed * (gameSpeed / BASE_SPEED);
        if (w.x + w.len < 0) {
            w.x = canvas.width + 20;
            w.y = Math.random() * 170 + 10;
        }
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x + w.len, w.y);
        ctx.stroke();
    });

    if (currentMap === "devils") {
        ctx.fillStyle = "#c07d34";
    } else if (currentMap === "sandiego") {
        ctx.fillStyle = "#f6e58d";
    } else {
        ctx.fillStyle = "#dfe4ea";
    }
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

    ctx.strokeStyle = "#755a2f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();
}

/* ---------- КОЛЛИЗИИ ---------- */
function checkCollision(p, obs) {
    const pad = 5;
    return (
        p.x + pad < obs.x + obs.width - pad &&
        p.x + p.width - pad > obs.x + pad &&
        p.y + pad < obs.y + obs.height - pad &&
        p.y + p.height - pad > obs.y + pad
    );
}

/* ---------- UI НА CANVAS ---------- */
function drawUI() {
    ctx.fillStyle = "#5c3619";
    ctx.font = "bold 18px Courier New";

    ctx.textAlign = "left";
    ctx.fillText(`PILOT: ${playerNickname}`, 20, 32);

    ctx.textAlign = "right";
    const formattedScore = String(Math.floor(score)).padStart(5, "0");
    const formattedHigh = String(Math.floor(highScore)).padStart(5, "0");
    ctx.fillText(`HI ${formattedHigh}  ${formattedScore}`, canvas.width - 20, 32);

    if (isGameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#fffaf0";
        ctx.textAlign = "center";
        ctx.font = "bold 32px Courier New";
        ctx.fillText("GAME OVER", canvas.width / 2, 110);

        ctx.font = "bold 16px Courier New";
        ctx.fillText(`${playerNickname}, нажмите ПРОБЕЛ или КЛИК для рестарта`, canvas.width / 2, 145);
    }
}

/* ---------- СБРОС / ЦИКЛ ---------- */
function resetGame(keepSeed = false) {
    if (animationId) cancelAnimationFrame(animationId);
    score = 0;
    gameSpeed = BASE_SPEED;
    isGameOver = false;
    obstacles = [];
    particles = [];
    spawnTimer = 0;
    nextSpawnInterval = 80;
    if (!keepSeed) seedValue = Math.random() * 10000;
    player.y = PLAYER_START_Y;
    player.velocityY = 0;
    player.isJumping = false;
    initBackground();
    gameLoop();
}

function gameLoop() {
    if (!isGameStarted) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    if (!isGameOver) {
        player.update();

        score += SCORE_RATE * (gameSpeed / BASE_SPEED);
        gameSpeed = BASE_SPEED + Math.floor(score / 100) * 0.4;

        spawnTimer++;
        if (spawnTimer >= nextSpawnInterval) {
            obstacles.push(new Obstacle());
            spawnTimer = 0;
            const rnd = isMultiplayer ? seededRandom() : Math.random();
            nextSpawnInterval = Math.max(45, Math.floor(rnd * 55 + 65 - gameSpeed * 2));
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            obstacles[i].update();
            if (checkCollision(player, obstacles[i])) {
                isGameOver = true;
                saveScoreToLeaderboard(playerNickname, score);
                if (score > highScore) {
                    highScore = Math.floor(score);
                    localStorage.setItem(highScoreKey(), highScore);
                }
                if (isMultiplayer && currentRoomId && db) {
                    db.ref(`rooms/${currentRoomId}/players/${playerNickname}`).update({
                        y: Math.round(player.y),
                        alive: false,
                        score: Math.floor(score)
                    });
                }
            }
            if (obstacles[i].x + obstacles[i].width < 0) {
                obstacles.splice(i, 1);
            }
        }
    }

    obstacles.forEach(obs => obs.draw());
    player.draw();

    if (isMultiplayer && opponentData) {
        const savedY = player.y;
        const savedSkin = currentCharacter;
        ctx.save();
        ctx.globalAlpha = opponentData.alive ? 0.5 : 0.2;
        player.y = opponentData.y;
        currentCharacter = opponentData.skin || "dino";
        player.draw();
        ctx.fillStyle = "#5c3619";
        ctx.font = "bold 12px Courier New";
        ctx.textAlign = "center";
        ctx.fillText(opponentData.name, player.x + 20, player.y - 8);
        ctx.restore();
        player.y = savedY;
        currentCharacter = savedSkin;

        mpSyncTimer++;
        if (mpSyncTimer >= 3 && db) {
            mpSyncTimer = 0;
            db.ref(`rooms/${currentRoomId}/players/${playerNickname}`).update({
                y: Math.round(player.y),
                alive: !isGameOver,
                score: Math.floor(score)
            });
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life--;
        ctx.fillStyle = "rgba(117, 90, 47, 0.6)";
        ctx.fillRect(pt.x, pt.y, 4, 4);
        if (pt.life <= 0) particles.splice(i, 1);
    }

    drawUI();

    animationId = requestAnimationFrame(gameLoop);
}