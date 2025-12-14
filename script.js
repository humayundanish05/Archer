/**
 * Archer Evolution - Core Script
 * Phase 4: Enemy Evolution & Psycho-Pressure
 */

(() => {
    // --- Constants & Config ---
    const CONFIG = {
        DPR: window.devicePixelRatio || 1,
        STORAGE_KEY: 'archer_evo_v1',
        GRAVITY: 640,
        BASE_SPAWN_RATE: 1400,
    };

    // --- Asset Definitions ---
    const BOWS = {
        standard: { id: 'standard', name: 'Ranger', speed: 1.0, power: 1.0, desc: 'Reliable. No downsides.' },
        heavy: { id: 'heavy', name: 'Greatbow', speed: 0.6, power: 1.8, desc: 'Slow draw, pierces wind.' },
        tech: { id: 'tech', name: 'Tech Comp', speed: 1.2, power: 0.7, ability: 'ANCHOR', desc: 'Fast. [SHIFT] Anchors arrows.' }
    };

    const PERKS = {
        wind: { id: 'wind', name: 'Wind Walker', desc: 'Ignore all wind effects.' },
        thief: { id: 'thief', name: 'Time Thief', desc: 'Kills trigger brief slow-motion.' },
        precision: { id: 'precision', name: 'Deadeye', desc: 'Arrows are 2x faster.' }
    };

    const MODIFIERS = [
        { id: 'gale', name: 'Gale Force', desc: 'Wind is 200% stronger.', apply: (s) => s.windMult = 2 },
        { id: 'rush', name: 'Bird Rush', desc: 'Spawn rate +40%.', apply: (s) => s.spawnRateMult = 1.4 },
        { id: 'heavy_air', name: 'Heavy Air', desc: 'Arrows fly 25% slower.', apply: (s) => s.arrowSpeedMult = 0.75 },
        { id: 'explosive', name: 'Volatile', desc: 'Birds explode on death.', apply: (s) => s.explosiveBirds = true }
    ];

    const BIRD_TYPES = [
        { id: 'normal', prob: 0.7, color: '#FFD166', ai: 'fly', score: 10 },
        { id: 'fast', prob: 0.15, color: '#EF476F', ai: 'weave', score: 20 },
        { id: 'diver', prob: 0.08, color: '#118AB2', ai: 'dive', score: 30 },
        { id: 'forbidden', prob: 0.07, color: '#FFF', ai: 'float', score: -500, penalty: true }
    ];

    // --- Utilities ---
    function mulberry32(a) {
        return function () {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    }

    // --- Systems ---

    class MetaSystem {
        constructor() {
            this.data = this.load();
        }

        load() {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            return raw ? JSON.parse(raw) : {
                bestScore: 0,
                totalKills: 0,
                runs: 0,
                unlockedBows: ['standard', 'heavy', 'tech'],
                unlockedPerks: ['wind', 'thief', 'precision']
            };
        }

        save() {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.data));
        }

        recordRun(score, kills) {
            this.data.bestScore = Math.max(this.data.bestScore, score);
            this.data.totalKills += kills;
            this.data.runs++;
            this.save();
        }
    }

    class DailySystem {
        constructor() {
            const today = new Date();
            const seedStr = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
            this.seedVal = parseInt(seedStr);
            this.rng = mulberry32(this.seedVal);
            this.modifiers = [];
            const modIndex = Math.floor(this.rng() * MODIFIERS.length);
            this.modifiers.push(MODIFIERS[modIndex]);
            this.idString = `OP-${seedStr.substring(2)}-${this.modifiers[0].id.toUpperCase()}`;
        }
    }

    class WeatherSystem {
        constructor() {
            this.reset();
        }

        reset() {
            this.wind = (Math.random() - 0.5) * 50;
            this.targetWind = this.wind;
            this.stormLevel = 0;
            this.lightningTimer = 10;
            this.activeLightning = null;
            this.windParticles = [];
        }

        update(dt, score, mult = 1) {
            if (Math.random() < 0.02) {
                this.targetWind = (Math.random() - 0.5) * 150;
            }
            this.wind += (this.targetWind - this.wind) * dt * 0.5;

            const targetStorm = Math.min(1, score / 800);
            this.stormLevel += (targetStorm - this.stormLevel) * dt * 0.1;

            if (this.stormLevel > 0.45) { // Slightly harder storm threshold
                if (!this.activeLightning) {
                    this.lightningTimer -= dt;
                    if (this.lightningTimer <= 0) {
                        this.activeLightning = {
                            x: Math.random() * 1000,
                            width: 60,
                            stage: 'WARNING',
                            timer: 2.0
                        };
                    }
                } else {
                    this.activeLightning.timer -= dt;
                    if (this.activeLightning.stage === 'WARNING' && this.activeLightning.timer <= 0) {
                        this.activeLightning.stage = 'STRIKE';
                        this.activeLightning.timer = 0.4;
                    } else if (this.activeLightning.stage === 'STRIKE' && this.activeLightning.timer <= 0) {
                        this.activeLightning = null;
                        this.lightningTimer = 8 + Math.random() * 10;
                    }
                }
            } else {
                this.activeLightning = null;
            }

            const particleCount = (20 + this.stormLevel * 50) * mult;
            if (this.windParticles.length < particleCount) {
                this.windParticles.push({
                    x: Math.random() * 2000 - 500,
                    y: Math.random() * 600 - 100,
                    vx: 0,
                    vy: 20 + Math.random() * 40,
                    life: 2 + Math.random() * 3,
                    size: 1 + Math.random() * 2
                });
            }

            for (let i = this.windParticles.length - 1; i >= 0; i--) {
                const p = this.windParticles[i];
                p.x += (p.vx + this.wind * 2 * mult) * dt;
                p.y += p.vy * dt;
                p.life -= dt;
                if (p.life <= 0) this.windParticles.splice(i, 1);
            }
        }
    }

    // --- Visual Assets (Realistic Bird Definitions) ---
    const SPECIES = {
        normal: { name: 'Sparrow', size: 1.0, bodyStops: ['#8b6b4a', '#d0b89a'], wingColor: '#7b5b3f', beak: '#e09b3d', eye: '#000' },
        fast: { name: 'Swallow', size: 0.9, bodyStops: ['#1b3a70', '#7aa7ff'], wingColor: '#12305a', beak: '#f2c14e', eye: '#000' },
        diver: { name: 'Falcon', size: 1.3, bodyStops: ['#4a4e69', '#9a8c98'], wingColor: '#22223b', beak: '#f2e9e4', eye: '#111' },
        forbidden: { name: 'Dove', size: 1.1, bodyStops: ['#ffffff', '#f0f0f0'], wingColor: '#e0e0e0', beak: '#ffb703', eye: '#000' }
    };

    class RenderSystem {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this.shake = 0;
            this.logicalWidth = 640;
            this.scale = 1;
            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            const wrap = document.getElementById('gameWrap');
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const rect = wrap.getBoundingClientRect();

            this.canvas.style.width = rect.width + 'px';
            this.canvas.style.height = rect.height + 'px';

            this.canvas.width = Math.floor(rect.width * dpr);
            this.canvas.height = Math.floor(rect.height * dpr);

            // Scale game to fit logical width (640) into physical width
            this.scale = rect.width / this.logicalWidth;

            // Set Transform: Scale everything
            this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);

            // Logical Dimensions
            this.width = this.logicalWidth;
            this.height = rect.height / this.scale;

            this.dpr = dpr;
        }

        applyShake() {
            if (this.shake > 0) {
                const dx = (Math.random() - 0.5) * this.shake;
                const dy = (Math.random() - 0.5) * this.shake;
                this.ctx.save();
                this.ctx.translate(dx, dy);
                this.shake *= 0.9;
                if (this.shake < 0.5) this.shake = 0;
                return true;
            }
            return false;
        }

        drawEnvironment(weather, width, height) {
            // Optimized: Static colors if possible, but gradient is okay
            const r1 = 26 - (weather.stormLevel * 16);
            const g1 = 42 - (weather.stormLevel * 30);
            const b1 = 58 - (weather.stormLevel * 40);
            const topColor = `rgb(${r1},${g1},${b1})`;
            const botColor = weather.stormLevel > 0.5 ? '#202025' : '#3b5b70';

            const grad = this.ctx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, topColor);
            grad.addColorStop(1, botColor);
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(0, 0, width, height);

            const groundLum = 30 - weather.stormLevel * 20;
            this.ctx.fillStyle = `hsl(120, 20%, ${groundLum}%)`;
            this.ctx.fillRect(0, height - 60, width, 60);

            if (weather.activeLightning) {
                const l = weather.activeLightning;
                if (l.stage === 'WARNING') {
                    this.ctx.fillStyle = `rgba(255, 50, 50, ${0.1 + Math.sin(Date.now() / 100) * 0.1})`;
                    this.ctx.fillRect(l.x - l.width / 2, 0, l.width, height);
                } else if (l.stage === 'STRIKE') {
                    if (Math.random() < 0.3) {
                        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                        this.ctx.fillRect(0, 0, width, height);
                    }
                    this.ctx.fillStyle = '#fff';
                    // Performance: REMOVED shadowBlur
                    this.ctx.fillRect(l.x - 10, 0, 20, height);
                    // Additive fake glow
                    this.ctx.globalCompositeOperation = 'lighter';
                    this.ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
                    this.ctx.fillRect(l.x - 30, 0, 60, height);
                    this.ctx.globalCompositeOperation = 'source-over';
                }
            }
        }

        drawTrajectory(player, wind, gravity) {
            if (!player) return;
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);

            let x = player.x + 18;
            let y = player.y;
            let vx = 0;
            let vy = -600;

            // Simulation
            this.ctx.moveTo(x, y);
            for (let i = 0; i < 20; i++) { // Reduced iterations for perf
                x += (vx + wind) * 0.05;
                y += vy * 0.05;
                // vy += gravity * 0.05; // No gravity on arrows currently in main loop logic?
                // Wait, previous loop didn't have gravity on arrows?
                // Line 24 in loop: a.y += a.vy * dt. No gravity!
                // So trajectory is straightish line affected by wind.
                this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        drawWeatherParticles(weather) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            // Optimization: Batch draw? Context switching is expensive
            // But fillRect is fast enough for <100 particles usually
            weather.windParticles.forEach(p => {
                this.ctx.fillRect(p.x, p.y, p.size * 2, p.size);
            });
        }

        drawFloatingText(texts) {
            this.ctx.font = 'bold 24px sans-serif';
            this.ctx.textAlign = 'center';
            texts.forEach(t => {
                this.ctx.fillStyle = t.color; // e.g. '#FFD166'
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 2;
                this.ctx.globalAlpha = t.life;
                this.ctx.strokeText(t.text, t.x, t.y);
                this.ctx.fillText(t.text, t.x, t.y);
            });
            this.ctx.globalAlpha = 1;
        }

        drawRealisticBird(b) {
            const ctx = this.ctx;
            const sp = SPECIES[b.typeId] || SPECIES.normal;
            const bw = b.w;
            const bh = b.h;

            ctx.save();
            ctx.translate(b.x + bw / 2, b.y + bh / 2);
            if (b.vx < 0) ctx.scale(-1, 1);
            const angle = Math.atan2(b.vy, Math.abs(b.vx)) * 0.5;
            ctx.rotate(angle);

            // Optimization: Removed gradient for solid color on old devices option?
            // Keeping gradient but ensuring no shadow
            const g = ctx.createLinearGradient(-bw * 0.4, -bh * 0.5, bw * 0.4, bh * 0.5);
            g.addColorStop(0, sp.bodyStops[0]);
            g.addColorStop(1, sp.bodyStops[1]);

            ctx.beginPath();
            ctx.ellipse(0, 0, bw * 0.55, bh * 0.6, 0, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();

            const flap = Math.sin(Date.now() / (b.typeId === 'fast' ? 40 : 80)) * 0.8;

            ctx.save();
            ctx.translate(-bw * 0.1, -bh * 0.1);
            ctx.rotate(-0.2 + flap * 0.5);
            ctx.fillStyle = sp.wingColor;
            ctx.beginPath();
            ctx.ellipse(bw * 0.2, -bh * 0.2, bw * 0.4, bh * 0.25, -0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(0, 0);
            ctx.rotate(0.1 + flap * 0.6);
            ctx.fillStyle = sp.wingColor;
            ctx.beginPath();
            ctx.ellipse(bw * 0.2, -bh * 0.2, bw * 0.4, bh * 0.25, -0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Simplified details (circles are fast)
            ctx.beginPath();
            ctx.arc(bw * 0.35, -bh * 0.15, 2, 0, Math.PI * 2);
            ctx.fillStyle = sp.eye;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(bw * 0.45, -bh * 0.1);
            ctx.lineTo(bw * 0.65, 0);
            ctx.lineTo(bw * 0.45, bh * 0.1);
            ctx.fillStyle = sp.beak;
            ctx.fill();

            // Tail
            ctx.fillStyle = sp.wingColor;
            ctx.beginPath();
            ctx.moveTo(-bw * 0.4, 0);
            ctx.lineTo(-bw * 0.6, -bh * 0.2);
            ctx.lineTo(-bw * 0.6, bh * 0.2);
            ctx.fill();

            // Forbidden Glow collision
            if (b.penalty) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.restore();
        }

        drawBox(b) {
            const isMimic = b.isMimic;
            const size = b.w;
            this.ctx.save();
            this.ctx.translate(b.x + size / 2, b.y + size / 2);
            this.ctx.rotate(Math.sin(Date.now() / 200) * 0.2);

            this.ctx.fillStyle = isMimic ? '#d32f2f' : '#f6c85f';
            this.ctx.fillRect(-size / 2, -size / 2, size, size);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 20px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(isMimic ? '!' : '?', 0, 2);

            this.ctx.restore();
        }
    }

    class GameState {
        constructor() {
            this.meta = new MetaSystem();
            this.daily = new DailySystem();
            this.renderer = new RenderSystem('game');
            this.weather = new WeatherSystem();
            this.ctx = this.renderer.ctx;

            // Modifiers State
            this.modifiers = {
                windMult: 1,
                spawnRateMult: 1,
                arrowSpeedMult: 1,
                explosiveBirds: false
            };

            this.mode = 'MENU';
            this.loadout = { bow: 'standard', perk: 'wind' };

            this.player = null;
            this.arrows = [];
            this.birds = [];
            this.boxes = [];
            this.particles = [];

            // New Fun Stuff
            this.floatingTexts = [];
            this.combo = 0;
            this.comboTimer = 0;

            this.timeScale = 1.0;
            this.slowMoTimer = 0;

            this.lastTime = 0;
            this.score = 0;
            this.lives = 20;
            this.boxSpawnTimer = 0;

            this.bindUI();
            this.showMenu();

            requestAnimationFrame(t => this.loop(t));
        }

        bindUI() {
            document.getElementById('startBtn').onclick = () => this.startGame();
            document.getElementById('restartBtn').onclick = () => this.startGame();
            document.getElementById('menuBtn').onclick = () => this.showMenu();

            this.keys = { left: false, right: false, shoot: false, anchor: false };

            const onKey = (e, state) => {
                if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = state;
                if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = state;
                if (e.key === ' ' || e.key === 'ArrowUp') this.keys.shoot = state;
                if (e.key === 'Shift') this.keys.anchor = state;
            };

            window.addEventListener('keydown', e => onKey(e, true));
            window.addEventListener('keyup', e => onKey(e, false));

            const btn = (id, key) => {
                const el = document.getElementById(id);
                el.onmousedown = el.ontouchstart = (e) => { e.preventDefault(); this.keys[key] = true; };
                el.onmouseup = el.ontouchend = (e) => { e.preventDefault(); this.keys[key] = false; };
            };
            btn('leftBtn', 'left');
            btn('rightBtn', 'right');

            const anchorBtn = document.getElementById('anchorBtn');
            anchorBtn.onmousedown = anchorBtn.ontouchstart = (e) => {
                e.preventDefault();
                this.keys.anchor = true;
            };
            anchorBtn.onmouseup = anchorBtn.ontouchend = (e) => {
                e.preventDefault();
                this.keys.anchor = false;
            };

            const shootBtn = document.getElementById('shootBtn');
            shootBtn.onmousedown = shootBtn.ontouchstart = (e) => {
                e.preventDefault();
                this.keys.shoot = true;
                setTimeout(() => this.keys.shoot = false, 150);
            };

            window.addEventListener('contextmenu', e => {
                e.preventDefault();
            });

            // Android Back Button Handler
            window.addEventListener('popstate', (e) => {
                if (this.mode === 'GAME' || this.mode === 'OVER') {
                    this.showMenu();
                }
            });
        }

        showMenu() {
            this.mode = 'MENU';
            document.getElementById('startPanel').style.display = 'flex';
            document.getElementById('gameOver').style.display = 'none';
            document.getElementById('overlay').style.pointerEvents = 'auto';
            document.getElementById('runStatsPreview').textContent = `Best: ${this.meta.data.bestScore} | ${this.daily.idString}`;

            const dailyLabel = document.getElementById('dailySeed');
            dailyLabel.innerHTML = `${this.daily.idString}<br><span style="color:#FFD166">${this.daily.modifiers[0].desc}</span>`;
            this.renderLoadoutOptions();
        }

        renderLoadoutOptions() {
            const bowCont = document.getElementById('bowOptions');
            bowCont.innerHTML = '';
            Object.values(BOWS).forEach(b => {
                if (!this.meta.data.unlockedBows.includes(b.id)) return;
                const div = document.createElement('div');
                div.className = `option-card ${this.loadout.bow === b.id ? 'selected' : ''}`;
                div.innerHTML = `<div><strong>${b.name}</strong></div><div style="font-size:11px;opacity:0.7">${b.desc}</div>`;
                div.onclick = () => { this.loadout.bow = b.id; this.renderLoadoutOptions(); };
                bowCont.appendChild(div);
            });

            const perkCont = document.getElementById('perkOptions');
            perkCont.innerHTML = '';
            Object.values(PERKS).forEach(p => {
                if (!this.meta.data.unlockedPerks.includes(p.id)) return;
                const div = document.createElement('div');
                div.className = `option-card ${this.loadout.perk === p.id ? 'selected' : ''}`;
                div.innerHTML = `<div><strong>${p.name}</strong></div><div style="font-size:11px;opacity:0.7">${p.desc}</div>`;
                div.onclick = () => { this.loadout.perk = p.id; this.renderLoadoutOptions(); };
                perkCont.appendChild(div);
            });

            const anchorBtn = document.getElementById('anchorBtn');
            anchorBtn.style.display = (BOWS[this.loadout.bow].ability === 'ANCHOR') ? 'block' : 'none';
        }

        startGame() {
            // Push history state to capture Back button
            history.pushState({ page: 'game' }, 'Game', '#game');

            this.mode = 'GAME';
            document.getElementById('startPanel').style.display = 'none';
            document.getElementById('gameOver').style.display = 'none';
            document.getElementById('overlay').style.pointerEvents = 'none';

            this.score = 0;
            this.lives = 20;
            this.arrows = [];
            this.birds = [];
            this.boxes = [];
            this.particles = [];
            this.floatingTexts = [];
            this.combo = 0;
            this.comboTimer = 0;
            this.boxSpawnTimer = 0;

            this.modifiers = {
                windMult: 1,
                spawnRateMult: 1,
                arrowSpeedMult: 1,
                explosiveBirds: false
            };
            this.daily.modifiers.forEach(m => m.apply(this.modifiers));

            const bowStats = BOWS[this.loadout.bow];
            this.player = {
                x: this.renderer.width / 2,
                y: this.renderer.height - 70,
                w: 40, h: 50,
                speed: 300 * (1.2 - (bowStats.speed - 1) * 0.3),
                cooldown: 0,
                maxCooldown: 400 / bowStats.speed,
                anchored: false,
                energy: 100
            };

            this.weather.reset();
            this.updateHUD();
        }

        endGame() {
            this.mode = 'OVER';
            document.getElementById('gameOver').style.display = 'flex';
            document.getElementById('overlay').style.pointerEvents = 'auto';
            document.getElementById('finalScore').textContent = Math.floor(this.score);
            document.getElementById('finalKills').textContent = Math.floor(this.score / 10);
            this.meta.recordRun(this.score, Math.floor(this.score / 10));
        }

        spawnFloatingText(x, y, text, color = '#fff') {
            this.floatingTexts.push({
                x, y, text, color,
                vy: -50,
                life: 1.0
            });
        }

        update(dt) {
            if (this.mode !== 'GAME') return;

            // Slow Mo
            let updateDt = dt;
            if (this.slowMoTimer > 0) {
                this.slowMoTimer -= dt;
                this.timeScale = 0.3;
            } else {
                this.timeScale = 1.0;
            }
            const worldDt = dt * this.timeScale;

            // Combo Decay
            if (this.comboTimer > 0) {
                this.comboTimer -= worldDt;
                if (this.comboTimer <= 0) {
                    this.combo = 0;
                    // Maybe show "Combo Lost" text?
                }
            }

            this.weather.update(worldDt, this.score, this.modifiers.windMult);
            const speed = Math.round(this.weather.wind * this.modifiers.windMult);
            const wStatus = document.getElementById('windStatus');
            wStatus.textContent = `Wind: ${speed > 0 ? '>>' : '<<'} ${Math.abs(speed)} ${this.combo > 1 ? `| x${this.combo}` : ''}`;

            // Lightning
            if (this.weather.activeLightning && this.weather.activeLightning.stage === 'STRIKE') {
                const l = this.weather.activeLightning;
                const lx = l.x - l.width / 2;
                const lw = l.width;
                for (let i = this.birds.length - 1; i >= 0; i--) {
                    const b = this.birds[i];
                    if (b.x + b.w > lx && b.x < lx + lw) {
                        this.createParticles(b.x + b.w / 2, b.y + b.h / 2, '#fff', 15);
                        this.birds.splice(i, 1);
                    }
                }
                if (this.player.x + this.player.w > lx && this.player.x < lx + lw) {
                    this.lives -= 10 * dt;
                    this.createParticles(this.player.x + 20, this.player.y + 20, '#f00', 2);
                    if (this.lives <= 0) this.endGame();
                    this.updateHUD();
                }
            }

            // Player Move
            if (this.keys.left) this.player.x -= this.player.speed * dt;
            if (this.keys.right) this.player.x += this.player.speed * dt;
            this.player.x = Math.max(10, Math.min(this.renderer.width - 50, this.player.x));

            // Shooting
            this.player.cooldown -= dt * 1000;
            if (this.keys.shoot && this.player.cooldown <= 0) {
                this.shoot();
                this.player.cooldown = this.player.maxCooldown;
            }

            // Arrows
            for (let i = this.arrows.length - 1; i >= 0; i--) {
                const a = this.arrows[i];
                if (a.state === 'FLYING') {
                    let drift = this.weather.wind * this.modifiers.windMult;
                    if (this.loadout.perk === 'wind') drift = 0;

                    const spdMult = this.modifiers.arrowSpeedMult;
                    a.x += (a.vx + drift) * worldDt * spdMult;
                    a.y += a.vy * worldDt * spdMult;

                    if (a.y < -50 || a.x < -100 || a.x > this.renderer.width + 100) {
                        this.arrows.splice(i, 1);
                        continue;
                    }

                    if (this.keys.anchor && BOWS[this.loadout.bow].ability === 'ANCHOR' && a.y < this.renderer.height * 0.6) {
                        a.state = 'ANCHORED';
                    }
                } else if (a.state === 'ANCHORED') {
                    a.x += (Math.random() - 0.5);
                    a.y += (Math.random() - 0.5);
                    if (!this.keys.anchor) {
                        a.state = 'FLYING';
                        a.vy = -900;
                        a.vx = (Math.random() - 0.5) * 80;
                    }
                }
            }

            // Spawn Logic
            if (Math.random() * 1000 < worldDt * CONFIG.BASE_SPAWN_RATE * this.modifiers.spawnRateMult) {
                this.spawnBird();
            }

            // Spawn Boxes / Mimics
            this.boxSpawnTimer += worldDt;
            if (this.boxSpawnTimer > 15) {
                if (Math.random() < 0.2) {
                    this.spawnBox();
                    this.boxSpawnTimer = 0;
                }
            }

            // Update Birds
            for (let i = this.birds.length - 1; i >= 0; i--) {
                const b = this.birds[i];

                // AI Movement
                let vx = b.vx;
                if (b.type === 'weave') {
                    b.y += Math.sin(Date.now() / 200) * 2;
                } else if (b.type === 'dive') {
                    if (!b.diving && Math.abs(b.x - this.renderer.width / 2) < 100 && b.y < 150) {
                        b.diving = true;
                        b.vy = 200;
                    }
                    if (b.diving) {
                        b.y += b.vy * worldDt;
                    }
                }

                b.x += vx * worldDt;

                let hit = false;
                // ARCADE MODE: Larger Collision
                const HIT_PADDING = 15;

                for (let j = this.arrows.length - 1; j >= 0; j--) {
                    const a = this.arrows[j];
                    if (this.rectIntersect(a.x - HIT_PADDING, a.y - HIT_PADDING, a.w + HIT_PADDING * 2, a.h + HIT_PADDING * 2, b.x, b.y, b.w, b.h)) {
                        this.arrows.splice(j, 1);
                        hit = true;
                        break;
                    }
                }

                if (hit) {
                    if (b.penalty) {
                        this.score -= 200;
                        this.lives -= 1;
                        this.combo = 0; // Reset Combo
                        this.spawnFloatingText(b.x, b.y, "X", "#f00");
                        this.createParticles(b.x, b.y, '#f00', 30);
                        document.getElementById('score').style.color = 'red';
                        setTimeout(() => document.getElementById('score').style.color = 'white', 500);
                        this.renderer.shake = 10;
                    } else {
                        // Combo Logic
                        this.combo++;
                        this.comboTimer = 2.5; // seconds to keep combo
                        const mult = Math.min(5, 1 + Math.floor(this.combo / 5)); // Max 5x multiplier
                        const finalScore = b.score * mult;

                        this.score += finalScore;
                        this.spawnFloatingText(b.x, b.y, `+${finalScore}${mult > 1 ? ' x' + mult : ''}`, '#FFD166');

                        this.createParticles(b.x, b.y, b.color, 15);
                        if (this.modifiers.explosiveBirds) {
                            this.createParticles(b.x, b.y, '#f50', 25);
                        }
                        if (this.loadout.perk === 'thief') {
                            this.slowMoTimer = 1.0;
                        }
                        this.renderer.shake = 5;
                    }
                    this.birds.splice(i, 1);
                    this.updateHUD();
                    continue;
                }

                if (b.x < -100 || b.x > this.renderer.width + 100 || b.y > this.renderer.height) {
                    this.birds.splice(i, 1);
                    if (!b.penalty) {
                        this.lives--;
                        this.combo = 0; // Reset Combo on miss
                        if (this.lives <= 0) this.endGame();
                        this.updateHUD();
                    }
                    continue;
                }
            }

            // Update Boxes
            for (let i = this.boxes.length - 1; i >= 0; i--) {
                const b = this.boxes[i];
                b.x += b.vx * worldDt;
                let hit = false;
                for (let j = this.arrows.length - 1; j >= 0; j--) {
                    const a = this.arrows[j];
                    if (this.rectIntersect(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) {
                        this.arrows.splice(j, 1);
                        hit = true;
                        break;
                    }
                }
                if (hit) {
                    if (b.isMimic) {
                        this.lives -= 3;
                        this.createParticles(b.x + 20, b.y + 20, '#d32f2f', 20);
                        this.renderer.shake = 15;
                    } else {
                        this.lives = Math.min(20, this.lives + 5);
                        this.createParticles(b.x + 20, b.y + 20, '#ffd700', 20);
                        this.renderer.shake = 5;
                    }
                    this.boxes.splice(i, 1);
                    if (this.lives <= 0) this.endGame();
                    this.updateHUD();
                    continue;
                }
                if (b.x > this.renderer.width + 100) this.boxes.splice(i, 1);
            }

            // Update Floating Texts
            for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
                const t = this.floatingTexts[i];
                t.y += t.vy * dt; // move up
                t.life -= dt * 1.5;
                if (t.life <= 0) this.floatingTexts.splice(i, 1);
            }

            // Update Particles (Limit count)
            if (this.particles.length > 200) {
                this.particles.splice(0, this.particles.length - 200);
            }
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.life -= worldDt;
                p.x += p.vx * worldDt;
                p.y += p.vy * worldDt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }

        draw() {
            const ctx = this.ctx;
            const shook = this.renderer.applyShake();

            this.renderer.drawEnvironment(this.weather, this.renderer.width, this.renderer.height);
            this.renderer.drawWeatherParticles(this.weather);

            // ARCADE: Draw Trajectory
            if (this.mode === 'GAME') {
                let w = this.weather.wind * this.modifiers.windMult;
                if (this.loadout.perk === 'wind') w = 0;
                this.renderer.drawTrajectory(this.player, w, CONFIG.GRAVITY);
            }

            if (this.timeScale < 1.0) {
                ctx.save();
                ctx.globalAlpha = 0.1;
                ctx.fillStyle = '#0ff';
                ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);
                ctx.restore();
            }

            this.birds.forEach(b => this.renderer.drawRealisticBird(b));
            this.boxes.forEach(b => this.renderer.drawBox(b));

            this.arrows.forEach(a => {
                ctx.fillStyle = (a.state === 'ANCHORED') ? '#0ff' : '#eee';
                if (a.state === 'ANCHORED') {
                    // Optimized: Removed heavy shadow blur
                    ctx.globalAlpha = 0.8;
                }
                ctx.fillRect(a.x, a.y, a.w, a.h);
                ctx.globalAlpha = 1;
            });

            if (this.player) {
                if (this.lives < 10 && Math.random() < 0.1) ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#dcb';
                ctx.fillRect(this.player.x, this.player.y, this.player.w, this.player.h);
                ctx.globalAlpha = 1;

                ctx.strokeStyle = '#853';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.player.x + 20, this.player.y + 25, 25, -0.5, 0.5);
                ctx.stroke();
            }

            this.particles.forEach(p => {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.fillRect(p.x, p.y, p.size, p.size);
            });
            ctx.globalAlpha = 1;

            // Draw Floating Text
            this.renderer.drawFloatingText(this.floatingTexts);

            if (shook) ctx.restore();
        }

        loop(now) {
            const dt = Math.min(0.05, (now - this.lastTime) / 1000);
            this.lastTime = now;

            this.update(dt);
            this.draw();

            requestAnimationFrame(t => this.loop(t));
        }

        shoot() {
            const bow = BOWS[this.loadout.bow];
            let vy = -600;
            if (this.loadout.perk === 'precision') vy = -1200;

            // ARCADE: Triple Shot (Unless Tech Bow - it needs precision for Anchor)
            const isTech = this.loadout.bow === 'tech';

            const createArrow = (vxOffset) => {
                this.arrows.push({
                    x: this.player.x + 18,
                    y: this.player.y,
                    vx: vxOffset,
                    vy: vy,
                    w: 4, h: 20,
                    damage: 10 * bow.power,
                    state: 'FLYING'
                });
            };

            createArrow(0); // Center

            if (!isTech) {
                createArrow(-100); // Left Spread
                createArrow(100); // Right Spread
            }

            this.renderer.shake = 2; // Recoil shake
        }

        spawnBird() {
            // Pick Types
            let r = Math.random();
            let type = BIRD_TYPES[0];
            let acc = 0;
            for (let t of BIRD_TYPES) {
                acc += t.prob;
                if (r < acc) { type = t; break; }
            }

            const y = Math.random() * (this.renderer.height * 0.5) + 50;
            const left = Math.random() < 0.5;
            this.birds.push({
                x: left ? -50 : this.renderer.width + 50,
                y: y,
                vx: (left ? 1 : -1) * (100 + Math.random() * 100),
                vy: 0,
                w: 30, h: 20,
                typeId: type.id,
                color: type.color,
                type: type.ai,
                score: type.score,
                penalty: type.penalty,
                diving: false
            });
        }

        spawnBox() {
            // Box logic
            const isMimic = Math.random() < 0.35;
            const y = Math.random() * (this.renderer.height * 0.4) + 60;
            this.boxes.push({
                x: -50,
                y: y,
                vx: 120,
                w: 30, h: 30,
                isMimic: isMimic
            });
        }

        rectIntersect(r1x, r1y, r1w, r1h, r2x, r2y, r2w, r2h) {
            return !(r2x > r1x + r1w || r2x + r2w < r1x || r2y > r1y + r1h || r2y + r2h < r1y);
        }

        createParticles(x, y, color, count) {
            // Limit creation to prevent lag
            const safeCount = Math.min(count, 15);
            for (let i = 0; i < safeCount; i++) {
                this.particles.push({
                    x, y,
                    vx: (Math.random() - 0.5) * 200,
                    vy: (Math.random() - 0.5) * 200,
                    life: 0.5 + Math.random() * 0.5,
                    color,
                    size: Math.random() * 3 + 1
                });
            }
        }

        updateHUD() {
            document.getElementById('score').textContent = Math.floor(this.score);
            document.getElementById('lives').textContent = Math.floor(this.lives);
            const energyBar = document.getElementById('energyBar');
            if (energyBar) energyBar.style.width = this.player ? Math.max(0, this.player.cooldown / this.player.maxCooldown * 100) + '%' : '0%';
        }
    }

    if (document.readyState === 'complete') {
        new GameState();
    } else {
        window.onload = () => new GameState();
    }

})();
