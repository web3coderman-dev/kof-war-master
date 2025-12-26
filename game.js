/**
 * game.js - Enterprise Grade KOF Engine v3.0
 * Features: State-driven Animation, synthesized SFX, HD Stage
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1024;
canvas.height = 576;

const GRAVITY = 0.6;
const GROUND_Y = 500;

// 游戏难度配置 (v38.0 被动格挡)
const DIFFICULTY_SETTINGS = {
    EASY: { reactionDelay: 40, attackChance: 0.05, moveSpeed: 3, comboChance: 0.2, counterChance: 0.1, blockChance: 0.15 },
    MEDIUM: { reactionDelay: 20, attackChance: 0.15, moveSpeed: 5, comboChance: 0.5, counterChance: 0.4, blockChance: 0.35 },
    HARD: { reactionDelay: 5, attackChance: 0.35, moveSpeed: 7, comboChance: 0.8, counterChance: 0.9, blockChance: 0.60 }
};

// 角色注册表 (v40.1 精简名单)
const CHARACTER_REGISTRY = {
    RYO: {
        name: 'RYO SAKAZAKI',
        imageSrc: new URL('./assets/textures/character.png', import.meta.url).href,
        superColor: '#ff4500', // 火焰橙
        counterColor: '#ff00ff',
        spritePivotX: 185
    },
    TECH: {
        name: 'TECH-STRIKER',
        imageSrc: new URL('./assets/textures/character_tech.png', import.meta.url).href,
        superColor: '#00ccff', // 冰晶蓝
        counterColor: '#ffffff',
        spritePivotX: 190
    }
};

// 核心引擎状态
let currentDifficulty = 'MEDIUM';
let gameStarted = false;
let particles = [];
let screenShake = 0;

/**
 * 军用级音频引擎 (v5.0 分层合成)
 */
const AudioEngine = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),

    // 合成打击音 (Transient + Body + Tail)
    playHit() {
        const now = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // 冲击波 (低频)
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(150, now);
        osc1.frequency.exponentialRampToValueAtTime(40, now + 0.1);

        // 噪音碰撞 (高频散列)
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(400, now);
        osc2.frequency.exponentialRampToValueAtTime(10, now + 0.05);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(); osc2.start();
        osc1.stop(now + 0.2); osc2.stop(now + 0.2);
    },

    // 合成挥拳音 (BPF Filtered White Noise)
    playSwing() {
        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.12;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.1);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    },

    // 必杀技音效 (Frequency Sweep)
    playSuper() {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(20, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 0.6);
    }
};

/**
 * 粒子实体类
 */
class Particle {
    constructor({ x, y, vx, vy, color, life, size }) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.alpha = 1;
        this.life = life;
        this.size = size;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.globalCompositeOperation = 'screen';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= 1 / this.life;
        this.size *= 0.96;
    }
}

function createParticleBurst(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle({
            x, y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            color,
            life: 20 + Math.random() * 20,
            size: 2 + Math.random() * 5
        }));
    }
}

const keys = {
    a: { pressed: false },
    d: { pressed: false },
    w: { pressed: false },
    j: { pressed: false },
    k: { pressed: false },
    l: { pressed: false }
};

/**
 * 行为树节点状态枚举 (v36.0 Behavior Tree Architecture)
 */
const NodeStatus = { SUCCESS: 'SUCCESS', FAILURE: 'FAILURE' };

/**
 * 选择器节点：按优先级遍历子节点，返回第一个成功的结果
 */
class SelectorNode {
    constructor(children) { this.children = children; }
    execute(context) {
        for (const child of this.children) {
            const status = child.execute(context);
            if (status === NodeStatus.SUCCESS) return status;
        }
        return NodeStatus.FAILURE;
    }
}

/**
 * 动作节点：执行具体行为
 */
class ActionNode {
    constructor(action) { this.action = action; }
    execute(context) { return this.action(context); }
}

/**
 * 军用级 AI 管理器 (v38.0 被动格挡架构)
 */
class AIManager {
    constructor(fighter, target, difficulty) {
        this.fighter = fighter;
        this.target = target;
        this.config = DIFFICULTY_SETTINGS[difficulty];
        this.tick = 0;
        this.currentPlan = 'NEUTRAL';
        this.behaviorTree = this.buildBehaviorTree();
    }

    buildBehaviorTree() {
        return new SelectorNode([
            new ActionNode((ctx) => this.tryAntiAir(ctx)),    // 优先级 1: 防空
            new ActionNode((ctx) => this.tryCounter(ctx)),    // 优先级 2: 反击
            new ActionNode((ctx) => this.trySuper(ctx)),      // 优先级 3: 必杀
            new ActionNode((ctx) => this.tryPressure(ctx)),   // 优先级 4: 连招压制
            new ActionNode((ctx) => this.tryAttack(ctx)),     // 优先级 5: 进攻
            new ActionNode((ctx) => this.tryMove(ctx)),       // 优先级 6: 移动
            new ActionNode((ctx) => this.fallbackAttack(ctx)) // 优先级 7: 保底
        ]);
    }

    update() {
        if (this.fighter.isDead || this.target.isDead) return;
        this.tick++;

        // v38.0 格挡反击窗口处理 (每帧检测)
        if (this.fighter.counterWindow > 0) {
            this.fighter.counterWindow--;
            if (this.fighter.counterWindow === 12) { // 格挡后 6 帧发动反击
                this.fighter.attack('PUNCH');
            }
        }

        if (this.tick % this.config.reactionDelay !== 0) return;

        const context = {
            dist: this.target.position.x - this.fighter.position.x,
            absDist: Math.abs(this.target.position.x - this.fighter.position.x),
            playerIsAttacking: ['PUNCH', 'KICK', 'SUPER'].includes(this.target.state),
            playerIsAerial: this.target.position.y < GROUND_Y - 200,
            isGrounded: this.fighter.velocity.y === 0
        };

        this.behaviorTree.execute(context);
    }

    // 优先级 1: 防空拦截
    tryAntiAir(ctx) {
        if (ctx.playerIsAerial && ctx.absDist < 200 && ctx.isGrounded) {
            if (Math.random() < 0.6) {
                this.fighter.velocity.y = -18;
                this.fighter.attack('KICK');
                return NodeStatus.SUCCESS;
            }
        }
        return NodeStatus.FAILURE;
    }

    // 优先级 2: 读帧反击 (v38.0 简化版)
    tryCounter(ctx) {
        if (ctx.playerIsAttacking && ctx.absDist < 250) {
            if (Math.random() < this.config.counterChance) {
                if (ctx.absDist < 120) {
                    this.fighter.attack('PUNCH');
                } else if (ctx.absDist < 200) {
                    this.fighter.attack('KICK');
                } else if (this.target.state === 'SUPER' && this.fighter.sp >= this.fighter.maxSp) {
                    this.fighter.attack('SUPER');
                }
                return NodeStatus.SUCCESS;
            } else if (Math.random() < 0.4 && ctx.isGrounded) {
                this.fighter.velocity.y = -15;
                this.currentPlan = 'RETREAT';
                return NodeStatus.SUCCESS;
            }
        }
        return NodeStatus.FAILURE;
    }

    // 优先级 3: SP 资源必杀
    trySuper(ctx) {
        if (this.fighter.sp >= this.fighter.maxSp && ctx.absDist < 250 && !ctx.playerIsAttacking) {
            if (Math.random() < 0.7) {
                this.fighter.attack('SUPER');
                return NodeStatus.SUCCESS;
            }
        }
        return NodeStatus.FAILURE;
    }

    // 优先级 4: 连招压制
    tryPressure(ctx) {
        if (this.currentPlan === 'PRESSURE' && !this.fighter.isAttacking && ctx.absDist < 200) {
            this.fighter.attack('KICK');
            this.currentPlan = 'NEUTRAL';
            return NodeStatus.SUCCESS;
        }
        return NodeStatus.FAILURE;
    }

    // 优先级 5: 进攻判定
    tryAttack(ctx) {
        if (ctx.absDist >= 120 && ctx.absDist <= 240 && !this.fighter.isAttacking) {
            if (Math.random() < this.config.attackChance) {
                const rand = Math.random();
                if (rand < 0.6) this.fighter.attack('PUNCH');
                else this.fighter.attack('KICK');

                if (Math.random() < this.config.comboChance) {
                    this.currentPlan = 'PRESSURE';
                }
                return NodeStatus.SUCCESS;
            }
        }
        return NodeStatus.FAILURE;
    }

    // 优先级 6: 移动逻辑
    tryMove(ctx) {
        if (this.currentPlan === 'RETREAT') {
            const retreatDir = ctx.dist > 0 ? -1 : 1;
            this.fighter.velocity.x = retreatDir * this.config.moveSpeed;
            if (ctx.absDist > 380) this.currentPlan = 'NEUTRAL';
            return NodeStatus.SUCCESS;
        } else if (ctx.absDist > 240) {
            this.fighter.velocity.x = ctx.dist > 0 ? this.config.moveSpeed : -this.config.moveSpeed;
            return NodeStatus.SUCCESS;
        } else if (ctx.absDist < 120 && Math.random() < 0.3) {
            this.fighter.velocity.x = ctx.dist > 0 ? -this.config.moveSpeed : this.config.moveSpeed;
            return NodeStatus.SUCCESS;
        } else {
            const wobble = Math.sin(this.tick * 0.1) * 2;
            this.fighter.velocity.x = wobble;
        }
        return NodeStatus.FAILURE;
    }

    // 优先级 7: 保底攻击 (永远成功)
    fallbackAttack(ctx) {
        if (!this.fighter.isAttacking && ctx.absDist < 200 && ctx.absDist > 50) {
            this.fighter.attack('PUNCH');
            return NodeStatus.SUCCESS;
        }
        // 即使不满足攻击条件，也返回成功以结束树遍历
        return NodeStatus.SUCCESS;
    }
}

/**
 * 战绩排行榜管理器 (v15.0 模拟云端持久化)
 */
class LeaderboardManager {
    static STORAGE_KEY = 'KOF_LEADERBOARD';

    static submitScore(name, score, difficulty) {
        const board = this.getScores();
        board.push({ name: name || 'ANONYMOUS', score, difficulty, date: new Date().toLocaleDateString() });
        board.sort((a, b) => b.score - a.score);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(board.slice(0, 10))); // 仅保留前10名
        this.render();
    }

    static getScores() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    static render() {
        const container = document.querySelector('#leaderboard-list');
        if (!container) return;
        const scores = this.getScores();
        container.innerHTML = scores.map((s, i) => `
            <div class="rank-item">
                <span>#${i + 1} ${s.name}</span>
                <span>${s.score} [${s.difficulty}]</span>
            </div>
        `).join('');
    }
}

/**
 * 状态驱动格斗家类
 */
class Fighter {
    constructor({ position, velocity, color, characterType = 'RYO' }) {
        this.position = position;
        this.velocity = velocity;
        this.width = 80;
        this.height = 160;
        this.maxHealth = 500;
        this.health = 500;
        this.sp = 0;
        this.maxSp = 100;
        this.isDead = false;
        this.isAttacking = false;
        this.color = color;

        // VSA (Visual Superposition Architecture) 扩展 (v29.0)
        this.ghosts = []; // 残影数组
        this.hitShake = 0; // 受击震动幅度
        this.counterWindow = 0; // v38.0 格挡反击窗口
        this.blockChance = 0; // v38.0 格挡概率 (由 AI 设置)

        // 绑定英雄元数据
        const charData = CHARACTER_REGISTRY[characterType];
        this.characterType = characterType;
        this.name = charData.name;
        this.superColor = charData.superColor;
        this.counterColor = charData.counterColor;
        this.spritePivotX = charData.spritePivotX || 160; // 默认中心

        // 状态定义 (v38.0 被动格挡)
        this.state = 'IDLE';
        this.frames = {
            IDLE: { start: 0, end: 3, hold: 12 },    // 呼吸待机
            PUNCH: { start: 4, end: 7, hold: 5 },   // 快速出拳
            KICK: { start: 8, end: 11, hold: 6 },   // 重型踢击
            SUPER: { start: 12, end: 14, hold: 8 }, // 必杀大招
            HIT: { start: 14, end: 14, hold: 10 },  // 受击停顿
            BLOCK: { start: 14, end: 14, hold: 6 }, // v38.0 格挡姿态
            DEAD: { start: 15, end: 15, hold: 1 }   // 倒地
        };

        this.rawImage = new Image();
        this.rawImage.src = charData.imageSrc;
        this.framesMax = 16;
        this.framesCurrent = 0;
        this.framesElapsed = 0;

        this.attackBox = {
            position: { x: this.position.x, y: this.position.y },
            width: 160,
            height: 50
        };
        this.shouldFlip = (this.color === 'blue'); // 默认初始设定
    }

    drawShadow() {
        // 动态投影：基于地平线锁定的偏移锚点算法 (v22.0)
        const groundDist = GROUND_Y - (this.position.y + this.height);
        const shadowScale = Math.max(0.3, 1 - (groundDist / 400));

        // 计算基于渲染偏移的锚点中心
        // 逻辑中心是 x + width/2，但素材不对称，需要应用 shadowOffset
        const offset = this.shouldFlip ? -this.shadowOffset : this.shadowOffset;
        const centerX = this.position.x + this.width / 2 + offset;

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
            centerX,
            GROUND_Y,
            this.width * 0.9 * shadowScale,
            15 * shadowScale,
            0, 0, Math.PI * 2
        );
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; // 柔和半透明黑
        ctx.fill();
        ctx.restore();
    }

    draw() {
        if (!this.rawImage.complete) return;
        this.drawShadow();

        const sw = this.rawImage.width / 4;
        const sh = this.rawImage.height / 4;
        const col = this.framesCurrent % 4;
        const row = Math.floor(this.framesCurrent / 4);
        const sx = Math.floor(col * sw) + 3;
        const sy = Math.floor(row * sh) + 3;
        const sWidth = Math.floor(sw) - 6;
        const sHeight = Math.floor(sh) - 6;

        // 1. 绘制残影 (Ghosting Pass)
        this.ghosts.forEach((g, i) => {
            ctx.save();
            ctx.globalAlpha = g.alpha * (i / this.ghosts.length);
            const gRenderX = g.x + this.width / 2;
            ctx.translate(gRenderX, g.y + this.height);
            if (this.shouldFlip) ctx.scale(-1, 1);

            const gCol = g.frame % 4;
            const gRow = Math.floor(g.frame / 4);
            const gSx = Math.floor(gCol * sw) + 3;
            const gSy = Math.floor(gRow * sh) + 3;

            ctx.drawImage(this.rawImage, gSx, gSy, sWidth, sHeight, -this.spritePivotX, -320 + 60, 320, 320);
            ctx.restore();
            g.alpha *= 0.8;
        });

        // 2. 绘制主体 (Main Sprite Pass)
        ctx.save();

        // 抖动与震屏应用
        let shakeX = 0;
        if (this.hitShake > 0) {
            shakeX = (Math.random() - 0.5) * this.hitShake;
            this.hitShake *= 0.8;
        }
        if (screenShake > 0) {
            ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        }

        const renderX = this.position.x + this.width / 2;
        ctx.translate(renderX + shakeX, this.position.y + this.height);

        if (this.shouldFlip) ctx.scale(-1, 1);

        ctx.drawImage(this.rawImage, sx, sy, sWidth, sHeight, -this.spritePivotX, -320 + 60, 320, 320);

        // SUPER 发光叠加
        if (this.state === 'SUPER') {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.3;
            ctx.drawImage(this.rawImage, sx, sy, sWidth, sHeight, -this.spritePivotX, -320 + 60, 320, 320);
        }

        ctx.restore();
    }

    animate() {
        const config = this.frames[this.state];
        this.framesElapsed++;

        // 必杀技动态粒子流 (火花)
        if (this.state === 'SUPER' && this.framesElapsed % 2 === 0) {
            const px = this.position.x + (this.shouldFlip ? -40 : 120);
            const py = this.position.y + 60 + (Math.random() - 0.5) * 60;
            createParticleBurst(px, py, this.superColor, 3);
            createParticleBurst(px, py, '#ffffff', 2);
        }

        if (this.framesElapsed % config.hold === 0) {
            if (this.framesCurrent < config.end) {
                this.framesCurrent++;
            } else {
                if (['PUNCH', 'KICK', 'SUPER', 'HIT'].includes(this.state)) {
                    this.state = 'IDLE';
                    this.isAttacking = false;
                    this.framesCurrent = this.frames['IDLE'].start;
                } else if (this.state !== 'DEAD') {
                    this.framesCurrent = config.start;
                }
            }
        }
    }

    update(opponent) {
        // 核心：动态朝向逻辑 (v9.0 位移优先)
        if (Math.abs(this.velocity.x) > 0.1) {
            // 移动中：脸部方向与水平移动方向一致
            this.shouldFlip = this.velocity.x < 0;
        } else if (!this.isAttacking && opponent) {
            // 静止且未在攻击：恢复对峙视角，锁定对手
            this.shouldFlip = opponent.position.x < this.position.x;
        }

        // 1. 程序化动作插值 (Squash & Stretch) -> 已移除 v33.0 为了防止形变

        // 2. 残影序列管理 (Ghosting)
        if (Math.abs(this.velocity.x) > 8 || this.state === 'SUPER') {
            this.ghosts.push({
                x: this.position.x,
                y: this.position.y,
                frame: this.framesCurrent,
                alpha: 0.6
            });
            if (this.ghosts.length > 5) this.ghosts.shift();
        } else {
            if (this.ghosts.length > 0) this.ghosts.shift();
        }

        // 3. 基础逻辑更新
        this.draw();
        this.animate();

        // 攻击盒位置根据朝向动态镜像
        const boxOffset = this.shouldFlip ? -130 : 50;
        this.attackBox.position.x = this.position.x + boxOffset;
        this.attackBox.position.y = this.position.y + 40;

        // 根据招式调整攻击距离与判定深度
        if (this.state === 'KICK') this.attackBox.width = 180;
        else if (this.state === 'SUPER') this.attackBox.width = 240;
        else this.attackBox.width = 160;

        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        if (this.position.y + this.height + this.velocity.y >= GROUND_Y) {
            this.velocity.y = 0;
            this.position.y = GROUND_Y - this.height;
        } else {
            this.velocity.y += GRAVITY;
        }

        if (this.position.x < 0) this.position.x = 0;
        if (this.position.x > canvas.width - this.width) this.position.x = canvas.width - this.width;
    }

    attack(type = 'PUNCH') {
        if (['PUNCH', 'KICK', 'SUPER'].includes(this.state) || this.isDead) return;

        // 大招资源检查
        if (type === 'SUPER' && this.sp < this.maxSp) return;

        this.state = type;
        this.framesCurrent = this.frames[type].start;
        this.isAttacking = true;

        if (type === 'SUPER') {
            this.sp = 0; // 消耗所有能量
            AudioEngine.playSuper();
            screenShake = 10;
        } else {
            AudioEngine.playSwing();
        }

        // 位移推力 (根据镜像动态调整)
        const power = type === 'PUNCH' ? 2 : (type === 'KICK' ? 3 : 0);
        this.velocity.x += this.shouldFlip ? -power : power;
    }

    takeHit(isCounter = false, damageMult = 1) {
        if (this.isDead) return;

        // v38.0 被动格挡判定
        if (this.blockChance > 0 && Math.random() < this.blockChance) {
            // 格挡成功！
            this.state = 'BLOCK';
            this.framesCurrent = this.frames['BLOCK'].start;
            this.hitShake = 5; // 轻微震动

            // 伤害减至 20%
            const baseDamage = isCounter ? 25 : 15;
            const reducedDamage = Math.floor(baseDamage * damageMult * 0.2);
            this.health -= reducedDamage;

            // 激活反击窗口 (18帧 ≈ 0.3秒)
            this.counterWindow = 18;

            // 格挡特效
            screenShake = 5;
            createParticleBurst(this.position.x + 40, this.position.y + 60, '#00ffff', 15); // 防御粒子
            createParticleBurst(this.position.x + 40, this.position.y + 60, '#ffffff', 10);

            if (this.health <= 0) {
                this.health = 0;
                this.state = 'DEAD';
                this.framesCurrent = this.frames['DEAD'].start;
                this.isDead = true;
            }
            return; // 格挡后跳过正常受击逻辑
        }

        // 正常受击逻辑
        this.state = 'HIT';
        this.framesCurrent = this.frames['HIT'].start;

        // VSA 受击反馈
        this.hitShake = isCounter ? 30 : 15;

        // 受击回气逻辑
        this.sp = Math.min(this.maxSp, this.sp + 10);

        // 反击判定逻辑 (Counter Hit) 收益翻倍，加上招式倍率
        const baseDamage = isCounter ? 25 : 15;
        const damage = baseDamage * damageMult;
        this.health -= damage;

        if (isCounter) {
            screenShake = 30; // 强力震屏
            createParticleBurst(this.position.x + 40, this.position.y + 60, this.counterColor, 40);
            createParticleBurst(this.position.x + 40, this.position.y + 60, '#ffffff', 20);
            AudioEngine.playSuper();
        } else {
            screenShake = 15;
            createParticleBurst(this.position.x + 40, this.position.y + 60, '#ffffff', 25);
            createParticleBurst(this.position.x + 40, this.position.y + 60, '#ffd700', 15);
            AudioEngine.playHit();
        }

        if (this.health <= 0) {
            this.health = 0;
            this.state = 'DEAD';
            this.framesCurrent = this.frames['DEAD'].start;
            this.isDead = true;
        }
    }
}

// 选人状态 (v39.0 VS Arena)
let selectedPlayer1 = 'RYO';
let selectedPlayer2 = 'TECH';
const CHARACTER_ORDER = ['RYO', 'TECH'];

let player = null;
let enemy = null;

// v39.0 箭头循环切换角色
window.cycleCharacter = function (slot, direction) {
    const current = slot === 1 ? selectedPlayer1 : selectedPlayer2;
    const idx = CHARACTER_ORDER.indexOf(current);
    const newIdx = (idx + direction + CHARACTER_ORDER.length) % CHARACTER_ORDER.length;
    const newChar = CHARACTER_ORDER[newIdx];

    if (slot === 1) {
        selectedPlayer1 = newChar;
    } else {
        selectedPlayer2 = newChar;
    }

    updatePortrait(slot, newChar);
    AudioEngine.playSwing();
};

// v39.0 更新头像显示
function updatePortrait(slot, charId) {
    const charData = CHARACTER_REGISTRY[charId];
    const portrait = document.getElementById(`p${slot}-portrait`);
    const nameEl = document.getElementById(`p${slot}-char-name`);

    portrait.src = charData.imageSrc;
    nameEl.innerText = charData.name;

    // 应用色调滤镜 (基于角色类型)
    const filterMap = {
        'RYO': '',
        'TECH': ''
    };
    portrait.style.filter = filterMap[charId] || '';
}

window.selectCharacter = function (slot, charId) {
    if (slot === 1) {
        selectedPlayer1 = charId;
        document.querySelectorAll('.p1-select .char-card').forEach(c => c.classList.remove('active'));
        document.querySelector(`.p1-select .char-card[data-id="${charId}"]`)?.classList.add('active');
    } else {
        selectedPlayer2 = charId;
        document.querySelectorAll('.p2-select .char-card').forEach(c => c.classList.remove('active'));
        document.querySelector(`.p2-select .char-card[data-id="${charId}"]`)?.classList.add('active');
    }
    AudioEngine.playSwing();
};

let aiManager = null;
let timer = 99;

window.startGame = function (difficulty) {
    if (AudioEngine.ctx.state === 'suspended') AudioEngine.ctx.resume();

    // 初始化角色实例
    player = new Fighter({
        position: { x: 200, y: 100 },
        velocity: { x: 0, y: 0 },
        color: 'red',
        characterType: selectedPlayer1
    });

    enemy = new Fighter({
        position: { x: 750, y: 100 },
        velocity: { x: 0, y: 0 },
        color: 'blue',
        characterType: selectedPlayer2
    });

    // 系统同步 (v26.0 选择器更新)
    document.querySelector('.p1-hud .player-name').innerText = player.name;
    document.querySelector('.p2-hud .player-name').innerText = enemy.name;

    aiManager = new AIManager(enemy, player, difficulty);
    enemy.blockChance = DIFFICULTY_SETTINGS[difficulty].blockChance; // v38.0 设置 AI 格挡率
    currentDifficulty = difficulty; // 记录当前难度用于评分
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-message').classList.add('show');
    gameStarted = true;
    setTimeout(() => {
        document.getElementById('game-message').classList.remove('show');
        decreaseTimer();
    }, 1500);
};

function decreaseTimer() {
    if (timer > 0 && !checkEndGame()) {
        setTimeout(decreaseTimer, 1000);
        timer--;
        document.querySelector('#timer').innerHTML = timer;
    }
}

function checkEndGame() {
    if (player.isDead || enemy.isDead || timer === 0) {
        const koOverlay = document.querySelector('#ko-overlay');
        koOverlay.style.display = 'flex';

        const koText = document.querySelector('.ko-text');
        const msg = document.querySelector('#game-message');
        msg.classList.add('show');

        const lang = document.documentElement.lang || 'en';
        const dict = LANG_DICT[lang.startsWith('zh') ? 'zh' : 'en'];

        // 计算得分 (基于血量、时间、难度)
        let battleScore = 0;
        if (player.health > enemy.health) {
            const diffBonus = currentDifficulty === 'HARD' ? 5000 : (currentDifficulty === 'MEDIUM' ? 1000 : 0);
            battleScore = Math.floor((player.health * 10) + (timer * 50) + diffBonus);
            msg.innerText = 'P1 VICTORIOUS';
            koText.innerText = dict['ko-win'];
            koText.style.color = '#ffd700'; // 胜利金
            koText.style.textShadow = '0 0 20px rgba(255, 215, 0, 0.8)';

            // 显示分数结算
            document.querySelector('#final-score-val').innerText = battleScore;
            document.querySelector('#score-submission').style.display = 'block';
        } else if (player.health < enemy.health) {
            msg.innerText = 'AI VICTORIOUS';
            koText.innerText = dict['ko-lose'];
            koText.style.color = '#ff4444'; // 失败红
            koText.style.textShadow = '0 0 20px rgba(255, 68, 68, 0.8)';
            koOverlay.style.background = 'rgba(20, 0, 0, 0.85)'; // 战败暗红氛围
        } else {
            msg.innerText = 'DRAW';
            koText.innerText = dict['ko-draw'];
            koText.style.color = '#cccccc';
        }

        LeaderboardManager.render();
        return true;
    }
    return false;
}

window.submitMyScore = function () {
    const name = document.querySelector('#player-name-input').value;
    const score = parseInt(document.querySelector('#final-score-val').innerText);
    LeaderboardManager.submitScore(name, score, currentDifficulty);
    document.querySelector('#score-submission').style.display = 'none';
    document.querySelector('#leaderboard-view').style.display = 'block';
};

function animate() {
    window.requestAnimationFrame(animate);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!player || !enemy) return;

    // 震屏衰减逻辑
    if (screenShake > 0) screenShake -= 1;

    player.update(enemy);
    enemy.update(player);

    // 粒子渲染管线 (Additive Mixing)
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw();
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    if (!gameStarted) return;

    player.velocity.x = 0;
    if (keys.a.pressed) player.velocity.x = -6;
    else if (keys.d.pressed) player.velocity.x = 6;

    if (aiManager) aiManager.update();

    // 碰撞体系与反击判定 (Counter System) - v24.0 状态感知系统
    const getActiveWindow = (state) => {
        if (state === 'PUNCH') return { start: 5, end: 7 };
        if (state === 'KICK') return { start: 8, end: 11 };
        if (state === 'SUPER') return { start: 12, end: 14 };
        return { start: -1, end: -1 };
    };

    const pWin = getActiveWindow(player.state);
    if (player.isAttacking && player.framesCurrent >= pWin.start && player.framesCurrent <= pWin.end) {
        if (collision(player, enemy)) {
            const isCounter = ['PUNCH', 'KICK', 'SUPER'].includes(enemy.state);
            player.isAttacking = false;

            // 攻击积攒能量逻辑
            player.sp = Math.min(player.maxSp, player.sp + 15);

            // SUPER 伤害增益
            const damageMult = player.state === 'SUPER' ? 2.5 : 1;
            enemy.takeHit(isCounter, damageMult);

            // 同步 UI
            const p2Percent = (enemy.health / enemy.maxHealth * 100);
            const p2Bar = document.querySelector('#p2-hp'); // Define p2Bar here
            p2Bar.style.width = p2Percent + '%';
            const p2SpPercent = (player.sp / player.maxSp * 100);
            const p1SpBar = document.querySelector('#p1-sp');
            p1SpBar.style.width = p2SpPercent + '%';
            if (p2SpPercent >= 100) p1SpBar.classList.add('full');
            else p1SpBar.classList.remove('full');
            if (p2Percent > 80) p2Bar.style.background = 'linear-gradient(to bottom, #00ff00, #008800)';
            else if (p2Percent > 60) p2Bar.style.background = 'linear-gradient(to bottom, #ffff00, #888800)';
            else if (p2Percent > 40) p2Bar.style.background = 'linear-gradient(to bottom, #ffaa00, #885500)';
            else if (p2Percent > 20) p2Bar.style.background = 'linear-gradient(to bottom, #ff5500, #882200)';
            else p2Bar.style.background = 'linear-gradient(to bottom, #ff0000, #880000)';
        }
    }

    const eWin = getActiveWindow(enemy.state);
    if (enemy.isAttacking && enemy.framesCurrent >= eWin.start && enemy.framesCurrent <= eWin.end) {
        if (collision(enemy, player)) {
            const isCounter = ['PUNCH', 'KICK', 'SUPER'].includes(player.state);
            enemy.isAttacking = false;

            // 敌方积攒能量
            enemy.sp = Math.min(enemy.maxSp, enemy.sp + 15);

            const damageMult = enemy.state === 'SUPER' ? 2.5 : 1;
            player.takeHit(isCounter, damageMult);

            const p1Percent = (player.health / player.maxHealth * 100);
            const p1Bar = document.querySelector('#p1-hp'); // Define p1Bar here
            p1Bar.style.width = p1Percent + '%';
            const p2SpPercent = (enemy.sp / enemy.maxSp * 100);
            const p2SpBar = document.querySelector('#p2-sp');
            p2SpBar.style.width = p2SpPercent + '%';
            if (p2SpPercent >= 100) p2SpBar.classList.add('full');
            else p2SpBar.classList.remove('full');
            if (p1Percent > 80) p1Bar.style.background = 'linear-gradient(to bottom, #00ff00, #008800)';
            else if (p1Percent > 60) p1Bar.style.background = 'linear-gradient(to bottom, #ffff00, #888800)';
            else if (p1Percent > 40) p1Bar.style.background = 'linear-gradient(to bottom, #ffaa00, #885500)';
            else if (p1Percent > 20) p1Bar.style.background = 'linear-gradient(to bottom, #ff5500, #882200)';
            else p1Bar.style.background = 'linear-gradient(to bottom, #ff0000, #880000)';
        }
    }
}

function collision(r1, r2) {
    return (
        r1.attackBox.position.x + r1.attackBox.width >= r2.position.x &&
        r1.attackBox.position.x <= r2.position.x + r2.width &&
        r1.attackBox.position.y + r1.attackBox.height >= r2.position.y &&
        r1.attackBox.position.y <= r2.position.y + r2.height
    );
}

animate();

// 键盘监听 (隔离输入 & 指令缓冲系统)
const inputBuffer = [];

function handleCommand(key, isPress) {
    if (!gameStarted || player.isDead) return;

    if (isPress) {
        inputBuffer.push(key);
        if (inputBuffer.length > 10) inputBuffer.shift();
    }

    switch (key) {
        case 'a': keys.a.pressed = isPress; break;
        case 'd': keys.d.pressed = isPress; break;
        case 'w': if (isPress && player.velocity.y === 0) player.velocity.y = -18; break;
        case 'j':
            if (isPress) {
                const sequence = inputBuffer.slice(-5).join('');
                if (sequence.includes('sdj')) player.attack('SUPER');
                else player.attack('PUNCH');
            }
            break;
        case 'k': if (isPress) player.attack('KICK'); break;
        case 'l': if (isPress) player.attack('SUPER'); break; // 移动端直出大招
    }
}

window.addEventListener('keydown', (e) => handleCommand(e.key.toLowerCase(), true));
window.addEventListener('keyup', (e) => handleCommand(e.key.toLowerCase(), false));

// 移动端触摸系统 (v14.0)
function bindTouchControls() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;

    document.querySelector('.mobile-hud').style.display = 'flex';

    const touchMap = {
        'btn-left': 'a',
        'btn-right': 'd',
        'btn-up': 'w',
        'btn-punch': 'j',
        'btn-kick': 'k',
        'btn-super': 'l'
    };

    Object.entries(touchMap).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handleCommand(key, true);
            if (navigator.vibrate) navigator.vibrate(20); // 触觉反馈
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleCommand(key, false);
        }, { passive: false });
    });
}

// 初始化
bindTouchControls();

/* Command Center Logic (v20.0) */
window.toggleGuide = function (show) {
    const modal = document.getElementById('guide-modal');
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';

        // 模态框打开时暂停游戏输入
        if (show) {
            gameStarted = false;
        } else if (document.getElementById('start-screen').style.display === 'none') {
            gameStarted = true;
        }
    }
}

// 快捷键监听
window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H' || e.key === 'Escape') {
        const modal = document.getElementById('guide-modal');
        if (modal && modal.style.display === 'flex') {
            toggleGuide(false);
        } else if (e.key !== 'Escape') {
            toggleGuide(true);
        }
    }
});

/* Internationalization Engine (v21.0) */
import { LANG_DICT } from './i18n.js';

class I18nEngine {
    static currentLang = 'en';

    static init() {
        const systemLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
        this.apply(systemLang);
    }

    static apply(lang) {
        if (!LANG_DICT[lang]) return;
        this.currentLang = lang;
        document.documentElement.lang = lang;

        // 翻译普通文本
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (LANG_DICT[lang][key]) {
                // 如果节点包含 HTML (如 strong 标签)，使用 innerHTML，否则 textContent
                if (el.children.length > 0 || LANG_DICT[lang][key].includes('<')) {
                    const iconSpan = el.querySelector('.icon');
                    if (iconSpan) {
                        el.innerHTML = `<span class="icon">${iconSpan.innerText}</span> ` + LANG_DICT[lang][key];
                    } else {
                        el.innerHTML = LANG_DICT[lang][key];
                    }
                } else {
                    el.textContent = LANG_DICT[lang][key];
                }
            }
        });

        // 翻译属性 (如 placeholder)
        const attrElements = document.querySelectorAll('[data-i18n-attr]');
        attrElements.forEach(el => {
            const config = el.getAttribute('data-i18n-attr');
            const [attr, key] = config.split(':');
            if (LANG_DICT[lang][key]) {
                el.setAttribute(attr, LANG_DICT[lang][key]);
            }
        });
    }
}

// 初始化语言引擎
window.addEventListener('DOMContentLoaded', () => I18nEngine.init());
