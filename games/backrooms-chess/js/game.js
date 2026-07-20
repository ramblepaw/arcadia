// Backrooms Chess - procedurally generated survival roguelike on a chess-piece
// theme. Originally a single-file prototype; split to fit Arcadia's
// games/<slug>/js/ convention. Gameplay logic is unchanged from the original -
// only DOM wiring, audio levels, and the stats-reporting hook were touched.

export function initBackroomsChess({ onGameOver } = {}) {
    // --- CONSTANTS & CONFIG ---
    const CELL_SIZE = 64;
    const DASH_COOLDOWN = 10;

    const PIECES = {
        'K_b': '♚', 'K_w': '♔', 'Q_w': '♕', 'R_w': '♖', 'B_w': '♗', 'N_w': '♘', 'P_w': '♙'
    };

    const SCORES = { 'P': 10, 'N': 30, 'B': 30, 'R': 50, 'Q': 150, 'K': 500, 'TAPE': 500 };

    const BIOMES = [
        { name: "THE LOBBY", bg: '#c9b863', wall: '#2a2610', dark: '#b8a654', safeColor: 'rgba(255,255,200,0.25)' },
        { name: "POOL ROOMS", bg: '#a3d1d1', wall: '#ffffff', dark: '#7ebaba', safeColor: 'rgba(200,255,255,0.3)', hasPits: true },
        { name: "PARKING ZONE", bg: '#555555', wall: '#333333', dark: '#444444', safeColor: 'rgba(255,255,255,0.15)', large: true, flickering: true },
        { name: "PIPE DREAMS", bg: '#4a3320', wall: '#2b1d12', dark: '#3a2718', safeColor: 'rgba(255,150,50,0.2)', cramped: true },
        { name: "ABANDONED OFFICE", bg: '#8f9491', wall: '#3b403d', dark: '#767a78', safeColor: 'rgba(200,255,200,0.25)' }
    ];

    const LORE_MESSAGES = [
        "Expedition 4: The walls... they moved again.",
        "Jenkins fell into a dark tile. We didn't hear him hit the bottom.",
        "They don't move when the lights are on. Find the lights.",
        "The Queen sees in all directions. Pray you don't find her.",
        "Drink the almond water. It makes you faster.",
        "It looks like a chess game, but the rules are broken."
    ];

    // --- GAME STATE ---
    let canvas, ctx;
    let boardSize = 30;
    let currentLevel = 0;
    let score = 0;
    let highScore = parseInt(localStorage.getItem('backroomsChessHighScore')) || 0;
    let player = { x: 0, y: 0, vx: 0, vy: 0 };
    let enemies = [];
    let items = [];
    let fadingEntities = [];
    let particles = [];
    let footprints = [];
    let whiteKing = null;
    let movesCount = 0;
    let gameState = 'START'; // START, PLAYING, PAUSED, GAMEOVER

    let walls = [];
    let pits = [];
    let visibilityMap = [];
    let floorSquares = [];
    let lights = [];
    let currentBiome = BIOMES[0];

    let mouseX = 0, mouseY = 0;
    let touchStartX = 0, touchStartY = 0;
    let isTouchDevice = false;
    let selectedTile = null;

    let dashModeActive = false;
    let movesSinceDash = DASH_COOLDOWN;
    let kingRevealedTimer = 0;
    let grenades = 0;
    let flashlightTimer = 0;
    let fovRadius = 8;

    let camera = { x: 0, y: 0, shake: 0 };
    let audioCtx = null;
    let masterLimiter = null;

    // --- DOM ELEMENTS ---
    const uiLayer = document.getElementById('ui-layer');
    const startMenu = document.getElementById('start-menu');
    const endModal = document.getElementById('end-modal');
    const loreModal = document.getElementById('lore-modal');
    const btnDash = document.getElementById('btn-dash');
    const btnGrenade = document.getElementById('btn-grenade');
    const threatVignette = document.getElementById('threat-vignette');
    const reduceFlickerCheckbox = document.getElementById('reduce-flicker');

    document.getElementById('start-highscore').innerText = highScore;

    // --- ACCESSIBILITY: REDUCE FLICKER ---
    // Covers the persistent low-level CRT flicker on the whole screen and the
    // Parking Zone biome's random light-flashing - both can be genuinely
    // unpleasant or risky for photosensitive players, so this is a real
    // opt-out, not just a cosmetic toggle.
    const storedFlickerPref = localStorage.getItem('backroomsChessReduceFlicker');
    let reduceFlicker = storedFlickerPref !== null
        ? storedFlickerPref === 'true'
        : window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function applyReduceFlicker() {
        document.body.classList.toggle('crt-flicker', !reduceFlicker);
        reduceFlickerCheckbox.checked = reduceFlicker;
    }
    applyReduceFlicker();

    reduceFlickerCheckbox.addEventListener('change', () => {
        reduceFlicker = reduceFlickerCheckbox.checked;
        localStorage.setItem('backroomsChessReduceFlicker', String(reduceFlicker));
        applyReduceFlicker();
    });

    // --- INITIALIZATION ---
    // Deferred to the window 'load' event (not run inline) so the browser has
    // committed real viewport dimensions before resizeCanvas() reads
    // window.innerWidth/innerHeight - reading them too early can yield 0 and
    // leave the canvas with no drawing buffer.
    window.addEventListener('load', boot);

    function boot() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d', { alpha: false });
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        document.getElementById('btn-start').addEventListener('click', () => { currentLevel = 0; score = 0; startGame(); });
        document.getElementById('btn-restart').addEventListener('click', () => {
            endModal.classList.add('hidden');
            startMenu.classList.remove('hidden');
            document.getElementById('start-highscore').innerText = highScore;
            gameState = 'START';
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        });
        document.getElementById('btn-lore-close').addEventListener('click', () => {
            loreModal.classList.add('hidden');
            gameState = 'PLAYING';
        });

        btnDash.addEventListener('click', toggleDash);
        btnGrenade.addEventListener('click', useGrenade);

        // Input handlers
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
        });
        canvas.addEventListener('click', handleMouseClick);

        canvas.addEventListener('touchstart', e => {
            isTouchDevice = true; touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
            const rect = canvas.getBoundingClientRect();
            mouseX = touchStartX - rect.left; mouseY = touchStartY - rect.top;
        });
        canvas.addEventListener('touchend', handleSwipeOrTap);

        window.addEventListener('keydown', (e) => {
            if (gameState !== 'PLAYING') return;
            if (e.code === 'Space') { e.preventDefault(); toggleDash(); }
            if (e.code === 'KeyG') { useGrenade(); }
        });

        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (gameState === 'PLAYING') draw();
    }

    // --- AUDIO ENGINE ---
    // Routed through a shared lowpass + limiter chain and kept to modest gains
    // so effects (especially explosion/despawn) don't spike into harsh, ear-
    // fatiguing territory the way raw square/sawtooth waves at gain 1.0 would.
    function initAudio() {
        if (audioCtx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();

            const limiter = audioCtx.createDynamicsCompressor();
            limiter.threshold.value = -14;
            limiter.knee.value = 6;
            limiter.ratio.value = 12;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.15;

            const masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.55;

            limiter.connect(masterGain);
            masterGain.connect(audioCtx.destination);
            masterLimiter = limiter;

            // Base Hum
            const osc1 = audioCtx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = 60;
            const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 350;
            const gainNode = audioCtx.createGain(); gainNode.gain.value = 0.04;
            osc1.connect(filter); filter.connect(gainNode); gainNode.connect(masterLimiter);
            osc1.start();
        } catch (e) { console.log("Audio not supported."); }
    }

    function playSpatialSound(x, y, type) {
        if (!audioCtx || !masterLimiter) return;
        const dx = x - player.x;
        const pan = Math.max(-1, Math.min(1, dx / 5));

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const tone = audioCtx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 2200;
        let panner;
        try { panner = audioCtx.createStereoPanner(); } catch (e) { panner = audioCtx.createPanner(); }
        if (panner.pan) panner.pan.value = pan;

        const now = audioCtx.currentTime;

        if (type === 'step') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        } else if (type === 'glitch' || type === 'capture') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(type === 'capture' ? 400 : 200, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.3);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        } else if (type === 'despawn') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(50, now);
            osc.frequency.exponentialRampToValueAtTime(500, now + 0.8);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.8);
        } else if (type === 'explosion') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(90, now);
            osc.frequency.exponentialRampToValueAtTime(15, now + 0.5);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
        } else if (type === 'item') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        }

        osc.connect(panner); panner.connect(tone); tone.connect(gain); gain.connect(masterLimiter);
        osc.start(now); osc.stop(now + 1);
    }

    // --- MAP GENERATION & FOV ---
    function generateMap() {
        walls = Array(boardSize).fill().map(() => Array(boardSize).fill(true));
        pits = Array(boardSize).fill().map(() => Array(boardSize).fill(false));
        visibilityMap = Array(boardSize).fill().map(() => Array(boardSize).fill(0));
        floorSquares = []; lights = []; items = [];

        // Choose biome
        if (currentLevel === 0) currentBiome = BIOMES[0];
        else currentBiome = BIOMES[Math.floor(Math.random() * (BIOMES.length - 1)) + 1];

        document.getElementById('ui-biome').innerText = currentBiome.name;

        let numRooms = Math.floor((boardSize * boardSize) / 40);
        if (currentBiome.large) numRooms = Math.floor(numRooms * 0.5);
        if (currentBiome.cramped) numRooms = Math.floor(numRooms * 1.5);

        let prevCenter = null;
        let firstRoomCenter = null;
        let lastRoomCenter = null;

        for (let i = 0; i < numRooms; i++) {
            let w = Math.floor(Math.random() * 6) + 3;
            let h = Math.floor(Math.random() * 6) + 3;
            if (currentBiome.large) { w += 4; h += 4; }
            if (currentBiome.cramped) { w = Math.max(3, w - 2); h = Math.max(3, h - 2); }

            let x = Math.floor(Math.random() * (boardSize - w - 2)) + 1;
            let y = Math.floor(Math.random() * (boardSize - h - 2)) + 1;
            let centerX = Math.floor(x + w / 2);
            let centerY = Math.floor(y + h / 2);

            if (i === 0) firstRoomCenter = { x: centerX, y: centerY };
            lastRoomCenter = { x: centerX, y: centerY };

            for (let rx = x; rx < x + w; rx++) {
                for (let ry = y; ry < y + h; ry++) {
                    walls[rx][ry] = false;
                    if (currentBiome.hasPits && Math.random() < 0.05) pits[rx][ry] = true;
                }
            }

            if (prevCenter) carveCorridor(prevCenter.x, prevCenter.y, centerX, centerY);
            prevCenter = { x: centerX, y: centerY };

            if (Math.random() > 0.6) lights.push({ x: centerX, y: centerY, r: currentBiome.large ? 4 : 2, on: true });
        }

        for (let x = 0; x < boardSize; x++) {
            for (let y = 0; y < boardSize; y++) {
                if (!walls[x][y] && !pits[x][y]) floorSquares.push({ x, y });
            }
        }

        // Spawn Items
        let numItems = Math.floor(boardSize / 10);
        for (let i = 0; i < numItems; i++) {
            let spot = floorSquares[Math.floor(Math.random() * floorSquares.length)];
            let type = Math.random();
            let char = '💧'; // Dash
            if (type > 0.9) char = '📼'; // Tape
            else if (type > 0.7) char = '💣'; // Grenade
            else if (type > 0.4) char = '🔋'; // Battery
            items.push({ x: spot.x, y: spot.y, char: char });
        }

        return { start: firstRoomCenter, end: lastRoomCenter };
    }

    function carveCorridor(x1, y1, x2, y2) {
        let x = x1; let y = y1;
        while (x !== x2) { walls[x][y] = false; x += (x2 > x) ? 1 : -1; }
        while (y !== y2) { walls[x][y] = false; y += (y2 > y) ? 1 : -1; }
    }

    function calculateFOV() {
        fovRadius = flashlightTimer > 0 ? 14 : 8;
        for (let x = 0; x < boardSize; x++) {
            for (let y = 0; y < boardSize; y++) {
                if (visibilityMap[x][y] === 2) visibilityMap[x][y] = 1;
            }
        }
        visibilityMap[player.x][player.y] = 2;
        for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
            let dx = Math.cos(angle); let dy = Math.sin(angle);
            let x = player.x + 0.5; let y = player.y + 0.5;
            for (let i = 0; i < fovRadius; i++) {
                let mx = Math.floor(x); let my = Math.floor(y);
                if (mx < 0 || mx >= boardSize || my < 0 || my >= boardSize) break;
                visibilityMap[mx][my] = 2;
                if (walls[mx][my]) break;
                x += dx; y += dy;
            }
        }
    }

    function hasLOS(x1, y1, x2, y2) {
        let dx = x2 - x1; let dy = y2 - y1;
        let steps = Math.max(Math.abs(dx), Math.abs(dy));
        let xInc = dx / steps; let yInc = dy / steps;
        let x = x1 + 0.5; let y = y1 + 0.5;
        for (let i = 0; i < steps; i++) {
            let mx = Math.floor(x); let my = Math.floor(y);
            if (walls[mx][my]) return false;
            x += xInc; y += yInc;
        }
        return true;
    }

    // --- GAME FLOW ---
    function startGame() {
        initAudio();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

        if (currentLevel === 0) boardSize = parseInt(document.getElementById('board-size').value);
        else boardSize += Math.min(50, 5);

        startMenu.classList.add('hidden');
        uiLayer.classList.remove('hidden');

        movesCount = 0; enemies = []; footprints = []; fadingEntities = []; particles = [];
        gameState = 'PLAYING'; dashModeActive = false; movesSinceDash = DASH_COOLDOWN;
        kingRevealedTimer = 0; flashlightTimer = 0; selectedTile = null;

        let locations = generateMap();

        player = { x: locations.start.x, y: locations.start.y, vx: locations.start.x, vy: locations.start.y };
        camera.x = player.x; camera.y = player.y;

        whiteKing = { type: 'K', char: PIECES['K_w'], x: locations.end.x, y: locations.end.y, vx: locations.end.x, vy: locations.end.y, turns: 0 };
        enemies.push(whiteKing);

        let spawnCount = 3 + currentLevel * 2;
        for (let i = 0; i < spawnCount; i++) {
            let types = ['B', 'N', 'P'];
            if (currentLevel >= 2) types.push('R');
            if (currentLevel >= 4) types.push('Q');
            spawnEnemies([types[Math.floor(Math.random() * types.length)]]);
        }

        calculateFOV();
        updateUI();
        requestAnimationFrame(gameLoop);
    }

    function nextLevel() {
        currentLevel++; score += SCORES['K'];
        playSpatialSound(player.x, player.y, 'capture');
        createParticles(whiteKing.x, whiteKing.y, '#ffffff', 50);
        camera.shake = 20;
        setTimeout(startGame, 1000);
    }

    function isSafeZone(x, y) {
        for (let l of lights) {
            if (l.on && Math.abs(l.x - x) <= l.r && Math.abs(l.y - y) <= l.r && hasLOS(l.x, l.y, x, y)) return true;
        }
        return false;
    }

    function isEmpty(x, y, isEnemyCheck = false) {
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize || walls[x][y] || pits[x][y]) return false;
        if (isEnemyCheck && isSafeZone(x, y)) return false;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].x === x && enemies[i].y === y) return false;
        }
        return true;
    }

    function getEnemyAt(x, y) { return enemies.find(e => e.x === x && e.y === y); }
    function getItemAt(x, y) { return items.find(e => e.x === x && e.y === y); }

    function spawnEnemies(types) {
        let spots = []; let attempts = 0;
        while (spots.length < types.length && attempts < 1000) {
            let floor = floorSquares[Math.floor(Math.random() * floorSquares.length)];
            if (isEmpty(floor.x, floor.y, true) && Math.abs(floor.x - player.x) > 5) spots.push(floor);
            attempts++;
        }
        for (let i = 0; i < spots.length; i++) {
            enemies.push({ type: types[i], char: PIECES[`${types[i]}_w`], x: spots[i].x, y: spots[i].y, vx: spots[i].x, vy: spots[i].y, turns: 0 });
        }
    }

    // --- INPUT & MOVEMENT ---
    function handleMouseClick() {
        if (gameState !== 'PLAYING' || isTouchDevice) return;
        const cx = camera.x * CELL_SIZE + CELL_SIZE / 2;
        const cy = camera.y * CELL_SIZE + CELL_SIZE / 2;
        const offsetX = Math.floor(canvas.width / 2 - cx);
        const offsetY = Math.floor(canvas.height / 2 - cy);
        const tx = Math.floor((mouseX - offsetX) / CELL_SIZE);
        const ty = Math.floor((mouseY - offsetY) / CELL_SIZE);
        attemptPlayerMove(tx, ty);
    }

    function handleSwipeOrTap(e) {
        if (gameState !== 'PLAYING') return;
        let touchEndX = e.changedTouches[0].clientX; let touchEndY = e.changedTouches[0].clientY;
        let dx = touchEndX - touchStartX; let dy = touchEndY - touchStartY;

        if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
            selectedTile = null;
            let tx = player.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0);
            let ty = player.y + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0);
            attemptPlayerMove(tx, ty);
        } else {
            const cx = camera.x * CELL_SIZE + CELL_SIZE / 2;
            const cy = camera.y * CELL_SIZE + CELL_SIZE / 2;
            const offsetX = Math.floor(canvas.width / 2 - cx);
            const offsetY = Math.floor(canvas.height / 2 - cy);
            const tx = Math.floor((mouseX - offsetX) / CELL_SIZE);
            const ty = Math.floor((mouseY - offsetY) / CELL_SIZE);

            let vdx = Math.abs(tx - player.x); let vdy = Math.abs(ty - player.y);
            let isValid = false;

            if (dashModeActive) {
                isValid = (vdx === 2 && vdy === 0) || (vdx === 0 && vdy === 2) || (vdx === 2 && vdy === 2);
                if (isValid && walls[player.x + Math.sign(tx - player.x)][player.y + Math.sign(ty - player.y)]) isValid = false;
            } else {
                isValid = (vdx <= 1 && vdy <= 1 && !(vdx === 0 && vdy === 0));
            }
            if (tx < 0 || tx >= boardSize || ty < 0 || ty >= boardSize || walls[tx][ty]) isValid = false;

            if (isValid && visibilityMap[tx][ty] === 2) {
                if (selectedTile && selectedTile.x === tx && selectedTile.y === ty) attemptPlayerMove(tx, ty);
                else { selectedTile = { x: tx, y: ty }; }
            } else { selectedTile = null; }
        }
    }

    function toggleDash() {
        if (movesSinceDash >= DASH_COOLDOWN) {
            dashModeActive = !dashModeActive;
            selectedTile = null; updateUI();
        }
    }

    function useGrenade() {
        if (grenades > 0) {
            grenades--;
            playSpatialSound(player.x, player.y, 'explosion');
            camera.shake = 30;
            createParticles(player.x, player.y, '#ff0000', 100);

            let killed = 0;
            enemies = enemies.filter(e => {
                if (e.type !== 'K' && Math.abs(e.x - player.x) <= 3 && Math.abs(e.y - player.y) <= 3) {
                    score += SCORES[e.type]; killed++;
                    e.life = 1; fadingEntities.push(e);
                    return false;
                }
                return true;
            });
            if (killed > 0) updateUI();

            // Grenade counts as a turn
            playerTurnComplete();
        }
    }

    function attemptPlayerMove(tx, ty) {
        if (tx < 0 || tx >= boardSize || ty < 0 || ty >= boardSize || walls[tx][ty]) return;

        // Check pits
        if (pits[tx][ty]) {
            score = Math.max(0, score - 200);
            nextLevel();
            return;
        }

        selectedTile = null;
        let dx = Math.abs(tx - player.x); let dy = Math.abs(ty - player.y);
        let isValid = false;

        if (dashModeActive) {
            isValid = (dx === 2 && dy === 0) || (dx === 0 && dy === 2) || (dx === 2 && dy === 2);
            let midX = player.x + Math.sign(tx - player.x); let midY = player.y + Math.sign(ty - player.y);
            if (isValid && walls[midX][midY]) isValid = false;
        } else { isValid = (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)); }

        if (isValid) {
            player.x = tx; player.y = ty;
            movesCount++; movesSinceDash++;
            if (dashModeActive) { movesSinceDash = 0; dashModeActive = false; }
            if (kingRevealedTimer > 0) kingRevealedTimer--;
            if (flashlightTimer > 0) flashlightTimer--;

            // Check items
            let item = getItemAt(tx, ty);
            if (item) {
                items = items.filter(i => i !== item);
                playSpatialSound(tx, ty, 'item');
                if (item.char === '💧') { movesSinceDash = DASH_COOLDOWN; }
                else if (item.char === '🔋') { flashlightTimer = 20; }
                else if (item.char === '💣') { grenades++; }
                else if (item.char === '📼') {
                    score += SCORES['TAPE'];
                    gameState = 'PAUSED';
                    document.getElementById('lore-text').innerText = `"${LORE_MESSAGES[Math.floor(Math.random() * LORE_MESSAGES.length)]}"`;
                    loreModal.classList.remove('hidden');
                }
                createParticles(tx, ty, '#00ffff', 20);
            }

            // Check captures
            let captured = getEnemyAt(tx, ty);
            if (captured) {
                if (captured.type === 'K') { nextLevel(); return; }
                score += SCORES[captured.type];
                enemies = enemies.filter(e => e !== captured);
                captured.life = 1; fadingEntities.push(captured);
                kingRevealedTimer = 5;
                playSpatialSound(tx, ty, 'capture');
                createParticles(tx, ty, '#ff0000', 30);
                camera.shake = 15;
            } else {
                playSpatialSound(player.x, player.y, 'step');
            }

            playerTurnComplete();
        }
    }

    function playerTurnComplete() {
        // 1. Update vision based on your new position
        calculateFOV();

        // 2. Enemies react to your move FIRST (prevents unfair deaths from sudden spawns/despawns)
        executeEnemyTurn();

        if (gameState === 'GAMEOVER') return;

        // 3. Despawn logic (equilibriums around 20)
        let nonKings = enemies.filter(e => e.type !== 'K');
        if (nonKings.length > 0 && Math.random() < (nonKings.length / 25)) {
            let toRemove = nonKings[Math.floor(Math.random() * nonKings.length)];
            enemies = enemies.filter(e => e !== toRemove);
            toRemove.life = 1; fadingEntities.push(toRemove);
            playSpatialSound(toRemove.x, toRemove.y, 'despawn');
        }

        // 4. Flicker lights
        if (!reduceFlicker && currentBiome.flickering && Math.random() < 0.2) {
            lights.forEach(l => l.on = Math.random() > 0.3);
        }

        // 5. Spawn new threats
        spawnEnemies([['B', 'N', 'P'][Math.floor(Math.random() * 3)]]);

        // 6. Fade footprints
        footprints.forEach(f => f.life -= 0.1);
        footprints = footprints.filter(f => f.life > 0);

        updateUI();
    }

    // --- ENEMY AI ---
    function executeEnemyTurn() {
        for (let i = enemies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [enemies[i], enemies[j]] = [enemies[j], enemies[i]];
        }
        let closestDist = 999;

        for (let e of enemies) {
            e.turns++;
            let moves = getValidEnemyMoves(e);
            if (moves.length === 0) continue;

            let killMove = moves.find(m => m.x === player.x && m.y === player.y);
            if (killMove) { e.x = player.x; e.y = player.y; loseGame(); return; }

            let startX = e.x, startY = e.y;
            let moved = false;

            if (e.type === 'K') {
                moves.sort((a, b) => Math.max(Math.abs(b.x - player.x), Math.abs(b.y - player.y)) - Math.max(Math.abs(a.x - player.x), Math.abs(a.y - player.y)));
                e.x = moves[0].x; e.y = moves[0].y; moved = true;

                // Push dynamic footprint angle based on movement direction
                let angle = Math.atan2(e.y - startY, e.x - startX) + Math.PI / 2;
                footprints.push({ x: startX, y: startY, life: 1.0, angle: angle });
            }
            else if (e.type === 'Q') {
                moves.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
                e.x = moves[0].x; e.y = moves[0].y; moved = true;
            }
            else if (e.type === 'R') {
                if (e.x === player.x && hasLOS(e.x, e.y, player.x, player.y)) {
                    let step = Math.sign(player.y - e.y);
                    if (isEmpty(e.x, e.y + step, true)) { e.y += step; moved = true; }
                } else if (e.y === player.y && hasLOS(e.x, e.y, player.x, player.y)) {
                    let step = Math.sign(player.x - e.x);
                    if (isEmpty(e.x + step, e.y, true)) { e.x += step; moved = true; }
                } else if (Math.random() < 0.2) {
                    let m = moves[Math.floor(Math.random() * moves.length)];
                    e.x = m.x; e.y = m.y; moved = true;
                }
            }
            else if (e.type === 'B') {
                if (visibilityMap[e.x][e.y] === 2 || Math.random() < 0.1) {
                    moves.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
                    e.x = moves[0].x; e.y = moves[0].y; moved = true;
                }
            }
            else if (e.type === 'N') {
                if (e.turns % 2 === 0) {
                    moves.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
                    e.x = moves[0].x; e.y = moves[0].y; moved = true;
                }
            }
            else if (e.type === 'P') {
                if (Math.random() < 0.7) {
                    let m = moves[Math.floor(Math.random() * moves.length)];
                    e.x = m.x; e.y = m.y; moved = true;
                }
                if (e.y === boardSize - 1 && isEmpty(e.x, 0, true)) { e.y = 0; e.vy = 0; }
            }

            if (moved && visibilityMap[e.x][e.y] === 2) playSpatialSound(e.x, e.y, 'step');

            let d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < closestDist && e.type !== 'K') closestDist = d;
        }

        if (closestDist <= 5) {
            let intensity = (5 - closestDist) / 5;
            threatVignette.style.boxShadow = `inset 0 0 ${150 + intensity * 100}px rgba(255, 0, 0, ${intensity * 0.5})`;
        } else {
            threatVignette.style.boxShadow = `inset 0 0 150px rgba(255, 0, 0, 0)`;
        }
    }

    function getValidEnemyMoves(piece) {
        let moves = []; let { x, y, type } = piece;
        if (type === 'P') {
            if (y + 1 < boardSize) {
                // Fix: Pawns can no longer capture by moving straight forward
                if (isEmpty(x, y + 1, true) && !(player.x === x && player.y === y + 1)) moves.push({ x: x, y: y + 1 });

                // Diagonal captures (Respecting safe zones)
                if (player.x === x - 1 && player.y === y + 1 && !isSafeZone(x - 1, y + 1)) moves.push({ x: x - 1, y: y + 1 });
                if (player.x === x + 1 && player.y === y + 1 && !isSafeZone(x + 1, y + 1)) moves.push({ x: x + 1, y: y + 1 });
            }
        } else if (type === 'N') {
            const jumps = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
            for (let j of jumps) {
                let nx = x + j[0]; let ny = y + j[1];
                if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && !walls[nx][ny]) {
                    if (isEmpty(nx, ny, true) || (nx === player.x && ny === player.y && !isSafeZone(nx, ny))) moves.push({ x: nx, y: ny });
                }
            }
        } else if (type === 'B' || type === 'R' || type === 'Q') {
            let dirs = [];
            if (type === 'B' || type === 'Q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
            if (type === 'R' || type === 'Q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);

            for (let d of dirs) {
                let nx = x; let ny = y;
                while (true) {
                    nx += d[0]; ny += d[1];
                    if (nx < 0 || nx >= boardSize || ny < 0 || ny >= boardSize || walls[nx][ny]) break;
                    if (nx === player.x && ny === player.y) {
                        if (!isSafeZone(nx, ny)) moves.push({ x: nx, y: ny });
                        break;
                    }
                    if (!isEmpty(nx, ny, true)) break;
                    moves.push({ x: nx, y: ny });
                }
            }
        } else if (type === 'K') {
            const dirs = [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]];
            for (let d of dirs) {
                let nx = x + d[0]; let ny = y + d[1];
                if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && !walls[nx][ny]) {
                    if (isEmpty(nx, ny, true) || (nx === player.x && ny === player.y && !isSafeZone(nx, ny))) moves.push({ x: nx, y: ny });
                }
            }
        }
        return moves;
    }

    function isPathClear(x1, y1, x2, y2) {
        let dx = Math.sign(x2 - x1);
        let dy = Math.sign(y2 - y1);
        let cx = x1 + dx;
        let cy = y1 + dy;
        while (cx !== x2 || cy !== y2) {
            if (walls[cx][cy] || pits[cx][cy]) return false;
            if (getEnemyAt(cx, cy)) return false; // Path blocked by another piece
            cx += dx;
            cy += dy;
        }
        return true;
    }

    function isSquareUnderAttack(x, y) {
        // Absolute invincibility in Safe Zones
        if (isSafeZone(x, y)) return false;

        for (let e of enemies) {
            if (e.x === x && e.y === y) continue;
            if (e.type === 'P' && e.x !== x && Math.abs(e.x - x) === 1 && e.y + 1 === y) return true;
            if (e.type === 'N') { let dx = Math.abs(e.x - x); let dy = Math.abs(e.y - y); if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) return true; }
            if (e.type === 'K' && Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1) return true;
            if ((e.type === 'B' || e.type === 'Q') && Math.abs(e.x - x) === Math.abs(e.y - y) && isPathClear(e.x, e.y, x, y)) return true;
            if ((e.type === 'R' || e.type === 'Q') && (e.x === x || e.y === y) && isPathClear(e.x, e.y, x, y)) return true;
        }
        return false;
    }

    // --- WIN/LOSS/UI ---
    function loseGame() {
        gameState = 'GAMEOVER';
        uiLayer.classList.add('hidden');
        endModal.classList.remove('hidden');
        document.getElementById('end-moves').innerText = movesCount;
        document.getElementById('end-levels').innerText = currentLevel;
        document.getElementById('end-score').innerText = score;

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('backroomsChessHighScore', highScore);
        }

        playSpatialSound(player.x, player.y, 'glitch');
        threatVignette.style.boxShadow = `inset 0 0 300px rgba(255, 0, 0, 0.8)`;
        camera.shake = 30;

        if (typeof onGameOver === 'function') {
            onGameOver({ score, movesCount, levelsTraveled: currentLevel, boardSize });
        }
    }

    function updateUI() {
        document.getElementById('ui-moves').innerText = movesCount;
        document.getElementById('ui-entities').innerText = enemies.length;
        document.getElementById('ui-level').innerText = currentLevel;
        document.getElementById('ui-score').innerText = score;

        if (grenades > 0) { btnGrenade.classList.remove('hidden'); document.getElementById('ui-grenades').innerText = grenades; }
        else { btnGrenade.classList.add('hidden'); }

        if (movesSinceDash >= DASH_COOLDOWN) {
            btnDash.innerText = dashModeActive ? "CANCEL DASH" : "DASH (READY)";
            btnDash.classList.remove('cooling');
            btnDash.classList.toggle('active', dashModeActive);
            btnDash.classList.toggle('ready', !dashModeActive);
        } else {
            btnDash.innerText = `DASH (CD: ${DASH_COOLDOWN - movesSinceDash})`;
            btnDash.classList.add('cooling');
            btnDash.classList.remove('ready', 'active');
        }
    }

    function createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x + 0.5, y: y + 0.5,
                vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
                life: 1.0, maxLife: Math.random() * 0.5 + 0.5,
                color: color, size: Math.random() * 4 + 2
            });
        }
    }

    // --- RENDERING ---
    function gameLoop() {
        if (gameState === 'PLAYING' || gameState === 'GAMEOVER') {
            draw(); requestAnimationFrame(gameLoop);
        } else if (gameState === 'PAUSED') {
            requestAnimationFrame(gameLoop);
        }
    }

    function draw() {
        const now = Date.now();

        // Camera Lerp & Shake
        camera.x += (player.x - camera.x) * 0.1;
        camera.y += (player.y - camera.y) * 0.1;
        let cx = camera.x * CELL_SIZE + CELL_SIZE / 2;
        let cy = camera.y * CELL_SIZE + CELL_SIZE / 2;

        if (camera.shake > 0) {
            cx += (Math.random() - 0.5) * camera.shake;
            cy += (Math.random() - 0.5) * camera.shake;
            camera.shake *= 0.9;
            if (camera.shake < 0.5) camera.shake = 0;
        }

        const offsetX = Math.floor(canvas.width / 2 - cx);
        const offsetY = Math.floor(canvas.height / 2 - cy);

        ctx.fillStyle = '#050503'; ctx.fillRect(0, 0, canvas.width, canvas.height);

        const startX = Math.max(0, Math.floor(-offsetX / CELL_SIZE));
        const startY = Math.max(0, Math.floor(-offsetY / CELL_SIZE));
        const endX = Math.min(boardSize, Math.ceil((canvas.width - offsetX) / CELL_SIZE));
        const endY = Math.min(boardSize, Math.ceil((canvas.height - offsetY) / CELL_SIZE));

        // Draw Base Floor
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const vis = visibilityMap[x][y];
                if (vis > 0) {
                    const px = x * CELL_SIZE + offsetX; const py = y * CELL_SIZE + offsetY;
                    if (walls[x][y]) {
                        ctx.fillStyle = vis === 2 ? currentBiome.wall : '#111005'; ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                        if (vis === 2) { ctx.strokeStyle = '#1a180b'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2); }
                    } else if (pits[x][y]) {
                        ctx.fillStyle = '#000'; ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                    } else {
                        ctx.fillStyle = vis === 2 ? currentBiome.bg : currentBiome.dark; ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                        if (vis === 2 && (x + y * 7) % 5 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE); }
                        if (vis === 2) { ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE); }
                    }
                }
            }
        }

        // Draw Footprints (Staggered Shoes)
        for (let f of footprints) {
            if (visibilityMap[f.x] && visibilityMap[f.x][f.y] === 2) {
                ctx.save();
                ctx.translate(f.x * CELL_SIZE + offsetX + CELL_SIZE / 2, f.y * CELL_SIZE + offsetY + CELL_SIZE / 2);
                ctx.rotate(f.angle);
                ctx.fillStyle = `rgba(255, 0, 0, ${f.life * 0.4})`;

                // Left shoe (Offset behind)
                ctx.beginPath();
                ctx.ellipse(-6, 4, 3, 7, 0, 0, Math.PI * 2);
                ctx.fill();

                // Right shoe (Offset ahead)
                ctx.beginPath();
                ctx.ellipse(6, -4, 3, 7, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        }

        // Draw Safe Zones
        for (let l of lights) {
            if (l.on && visibilityMap[l.x] && visibilityMap[l.x][l.y] > 0) {
                let grad = ctx.createRadialGradient(
                    l.x * CELL_SIZE + offsetX + CELL_SIZE / 2, l.y * CELL_SIZE + offsetY + CELL_SIZE / 2, 0,
                    l.x * CELL_SIZE + offsetX + CELL_SIZE / 2, l.y * CELL_SIZE + offsetY + CELL_SIZE / 2, l.r * CELL_SIZE * 1.5
                );
                grad.addColorStop(0, currentBiome.safeColor); grad.addColorStop(1, 'rgba(255,255,200,0)');
                ctx.fillStyle = grad;
                ctx.fillRect((l.x - l.r) * CELL_SIZE + offsetX, (l.y - l.r) * CELL_SIZE + offsetY, (l.r * 2 + 1) * CELL_SIZE, (l.r * 2 + 1) * CELL_SIZE);
            }
        }

        // Draw Items
        ctx.font = `${CELL_SIZE * 0.6}px "Courier New", Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let item of items) {
            if (visibilityMap[item.x][item.y] === 2) {
                ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
                ctx.fillText(item.char, item.x * CELL_SIZE + offsetX + CELL_SIZE / 2, item.y * CELL_SIZE + offsetY + CELL_SIZE / 2 + Math.sin(now / 200) * 3);
                ctx.shadowBlur = 0;
            }
        }

        // Persistent Valid Capture Highlights
        for (let e of enemies) {
            if (visibilityMap[e.x][e.y] === 2) {
                let dx = Math.abs(e.x - player.x); let dy = Math.abs(e.y - player.y);
                let isValid = false;
                if (dashModeActive) {
                    isValid = (dx === 2 && dy === 0) || (dx === 0 && dy === 2) || (dx === 2 && dy === 2);
                    if (isValid && walls[player.x + Math.sign(e.x - player.x)][player.y + Math.sign(e.y - player.y)]) isValid = false;
                } else { isValid = (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)); }

                if (isValid) {
                    ctx.fillStyle = isSquareUnderAttack(e.x, e.y) ? 'rgba(255, 50, 50, 0.4)' : 'rgba(50, 255, 50, 0.4)';
                    ctx.fillRect(e.x * CELL_SIZE + offsetX, e.y * CELL_SIZE + offsetY, CELL_SIZE, CELL_SIZE);
                }
            }
        }

        // Mouse Hover Highlight
        let hoverX = Math.floor((mouseX - offsetX) / CELL_SIZE);
        let hoverY = Math.floor((mouseY - offsetY) / CELL_SIZE);

        if (hoverX >= 0 && hoverX < boardSize && hoverY >= 0 && hoverY < boardSize && !walls[hoverX][hoverY] && !isTouchDevice) {
            let dx = Math.abs(hoverX - player.x); let dy = Math.abs(hoverY - player.y);
            let isValid = false;
            if (dashModeActive) {
                isValid = (dx === 2 && dy === 0) || (dx === 0 && dy === 2) || (dx === 2 && dy === 2);
                if (isValid && walls[player.x + Math.sign(hoverX - player.x)][player.y + Math.sign(hoverY - player.y)]) isValid = false;
            } else { isValid = (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)); }

            if (isValid && visibilityMap[hoverX][hoverY] === 2) {
                // Fill color
                if (!getEnemyAt(hoverX, hoverY)) {
                    ctx.fillStyle = isSquareUnderAttack(hoverX, hoverY) ? 'rgba(255,50,50,0.4)' : 'rgba(255,255,255,0.2)';
                    ctx.fillRect(hoverX * CELL_SIZE + offsetX, hoverY * CELL_SIZE + offsetY, CELL_SIZE, CELL_SIZE);
                }
                // Selection Border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2;
                ctx.strokeRect(hoverX * CELL_SIZE + offsetX + 1, hoverY * CELL_SIZE + offsetY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            }
        }

        // Mobile Selected Tile
        if (selectedTile) {
            ctx.fillStyle = isSquareUnderAttack(selectedTile.x, selectedTile.y) ? 'rgba(255,50,50,0.4)' : (getEnemyAt(selectedTile.x, selectedTile.y) ? 'rgba(50,255,50,0.4)' : 'rgba(255,255,255,0.2)');
            ctx.fillRect(selectedTile.x * CELL_SIZE + offsetX, selectedTile.y * CELL_SIZE + offsetY, CELL_SIZE, CELL_SIZE);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(now / 150) * 0.5})`; ctx.lineWidth = 3;
            ctx.strokeRect(selectedTile.x * CELL_SIZE + offsetX + 2, selectedTile.y * CELL_SIZE + offsetY + 2, CELL_SIZE - 4, CELL_SIZE - 4);
        }

        // Draw Entities
        ctx.font = `bold ${CELL_SIZE * 0.75}px "Courier New", Consolas, monospace`; ctx.lineWidth = 1;

        for (let e of enemies) {
            e.vx += (e.x - e.vx) * 0.2; e.vy += (e.y - e.vy) * 0.2; // Lerp
            if (visibilityMap[e.x][e.y] === 2) {
                const px = e.vx * CELL_SIZE + offsetX + CELL_SIZE / 2, py = e.vy * CELL_SIZE + offsetY + CELL_SIZE / 2;
                ctx.shadowColor = (e.type === 'K' || e.type === 'Q') ? '#ff3333' : '#ffffcc'; ctx.shadowBlur = (e.type === 'K' || e.type === 'Q') ? 25 : 8;
                const bob = Math.sin(now / 300 + e.x) * 2;
                ctx.strokeStyle = '#000'; ctx.strokeText(e.char, px, py + bob);
                ctx.fillStyle = '#f4f4dc'; ctx.fillText(e.char, px, py + bob);
                ctx.shadowBlur = 0;
            }
        }

        // Fading/Despawning Entities
        for (let i = fadingEntities.length - 1; i >= 0; i--) {
            let e = fadingEntities[i];
            e.life -= 0.05;
            if (e.life <= 0) { fadingEntities.splice(i, 1); continue; }
            if (visibilityMap[e.x] && visibilityMap[e.x][e.y] === 2) {
                const px = e.vx * CELL_SIZE + offsetX + CELL_SIZE / 2, py = e.vy * CELL_SIZE + offsetY + CELL_SIZE / 2;
                ctx.globalAlpha = e.life;
                const shiftX = (Math.random() - 0.5) * 20 * (1 - e.life); const shiftY = (Math.random() - 0.5) * 20 * (1 - e.life);
                ctx.strokeStyle = `rgba(0, 0, 0, ${e.life})`; ctx.strokeText(e.char, px + shiftX, py + shiftY);
                ctx.fillStyle = '#aaaaaa'; ctx.fillText(e.char, px + shiftX, py + shiftY);
                ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'; ctx.fillText(e.char, px + shiftX - 3, py + shiftY);
                ctx.fillStyle = 'rgba(0, 255, 255, 0.6)'; ctx.fillText(e.char, px + shiftX + 3, py + shiftY);
                ctx.globalAlpha = 1;
            }
        }

        // Player Piece
        player.vx += (player.x - player.vx) * 0.2; player.vy += (player.y - player.vy) * 0.2;
        const ppx = player.vx * CELL_SIZE + offsetX + CELL_SIZE / 2, ppy = player.vy * CELL_SIZE + offsetY + CELL_SIZE / 2;

        if (dashModeActive) { ctx.shadowColor = '#fde047'; ctx.shadowBlur = 15; }
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(PIECES['K_b'], ppx + 3, ppy + 3); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeText(PIECES['K_b'], ppx, ppy);
        ctx.fillStyle = '#111'; ctx.fillText(PIECES['K_b'], ppx, ppy);

        // Arrow Tracker
        if (kingRevealedTimer > 0 && whiteKing) {
            let angle = Math.atan2(whiteKing.y - player.y, whiteKing.x - player.x);
            ctx.save(); ctx.translate(ppx, ppy); ctx.rotate(angle); ctx.translate(CELL_SIZE * 0.55, 0);
            const pulse = 1 + Math.sin(now / 100) * 0.2; ctx.scale(pulse, pulse);
            ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, 7); ctx.lineTo(-6, -7); ctx.closePath();
            ctx.fillStyle = 'rgba(255, 50, 50, 0.9)'; ctx.shadowColor = 'rgba(255, 50, 50, 1)'; ctx.shadowBlur = 15; ctx.fill();
            ctx.restore();
        }

        // Draw Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.life -= 0.02;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.x += p.vx; p.y += p.vy;
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillRect(p.x * CELL_SIZE + offsetX, p.y * CELL_SIZE + offsetY, p.size, p.size);
            ctx.globalAlpha = 1.0;
        }

        // Render Fog Layer
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                if (visibilityMap[x][y] === 0) {
                    ctx.fillStyle = '#050503';
                    ctx.fillRect(x * CELL_SIZE + offsetX - 1, y * CELL_SIZE + offsetY - 1, CELL_SIZE + 2, CELL_SIZE + 2);
                }
            }
        }
    }

    return {
        getUnfinishedState() {
            if (gameState !== 'PLAYING' && gameState !== 'PAUSED') return null;
            return { score, movesCount, levelsTraveled: currentLevel, boardSize };
        },
    };
}
