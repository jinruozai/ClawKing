/**
 * ReplayEngine — Processes game events and drives BattleRenderer
 * v2: 12 lobsters FFA (8 players + 4 AI bots), no items/chests/orbs
 */

import type { GameEvent, RenderEntity, InitEntity } from './types';
import { TYPE_PLAYER } from './types';
import { BattleRenderer } from './renderer/PixiRenderer';
import { SFX } from '../audio/SoundFX';
import { SkillSFX } from '../audio/SkillSFX';
import { t } from '../i18n';
import { parseSkillEffects } from '../config/game';

// Entity scale based on level: L0=0.5, L6=1.3, linear interpolation
function levelScale(level: number): number {
  return Math.min(0.5 + level * (2.0 / 6), 2.5);
}

// Base delays (ms) at 1x speed, per event type
const DELAY_DEFAULT = 1000;
const DELAY_MOVE    = 1000;
const DELAY_ATTACK  = 1000;
const DELAY_SKILL   = 1000;
const DELAY_HURT    = 1000;
const DELAY_DEATH   = 1000;
const DELAY_TURN    = 1000;
const DELAY_FOCUS   = 500;  // pause before a new entity acts, so vision shifts first
const PRIMARY_ACTIONS = new Set(['move', 'blink', 'attack', 'skill', 'defend']);

export class ReplayEngine {
  renderer: BattleRenderer;
  events: GameEvent[] = [];
  index = 0;
  playing = false;
  speed = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private lastActiveEid = -1;
  private firstBlood = false;
  private killStats = new Map<number, number>(); // eid → player kills
  turnOrder: number[] = []; // current turn's action order (entity indices)

  onTurn?: (turn: number) => void;
  onEvent?: (event: GameEvent, index: number) => void;
  onFocus?: (eid: number) => void;
  onFinish?: () => void;

  constructor(renderer: BattleRenderer) {
    this.renderer = renderer;
  }

  load(events: GameEvent[]) {
    this.events = events;
    this.index = 0;
    this.playing = false;
    this.firstBlood = false;
    this.killStats.clear();

    // Process init event
    if (events[0]?.type === 'init') {
      this.processInit(events[0]);
      this.index = 1;
    }
  }

  private processInit(ev: GameEvent) {
    const r = this.renderer;
    r.mapSize = ev.mapSize || 15; // Use actual game map size as default
    r.entities.clear();
    r.tiles.clear();
    r.floaters = [];
    r.vfx = [];
    r.poisonRadius = Math.floor(r.mapSize / 2) + 2; // initially no poison

    // Tiles
    if (ev.tiles) {
      for (const t of ev.tiles) {
        r.tiles.set(`${t.col},${t.row}`, t.type);
      }
    }

    // Entities
    if (ev.entities) {
      for (const ie of ev.entities) {
        r.entities.set(ie.eid, this.makeRenderEntity(ie));
      }
    }

    // Focus on center (0,0 in center-based coords)
    r.focusOn(0, 0);
  }

  private makeRenderEntity(ie: InitEntity): RenderEntity {
    const color = ie.color;
    return {
      eid: ie.eid,
      type: ie.type,
      name: ie.name,
      color,
      col: ie.col,
      row: ie.row,
      renderCol: ie.col,
      renderRow: ie.row,
      hp: ie.hp,
      maxHp: ie.maxHp,
      level: ie.level || 0,
      exp: ie.exp || 0,
      kills: ie.kills || 0,
      baseAtk: ie.atk || 0,
      baseDef: ie.def || 0,
      baseHpMax: ie.maxHp,
      atk: (ie.atk || 0) + (ie.level || 0) * (ie.atkGrowth || 0),
      def: (ie.def || 0) + (ie.level || 0) * (ie.defGrowth || 0),
      atkRange: ie.atkRange || 1,
      vision: ie.vision || 3,
      hpGrowth: ie.hpGrowth || 0,
      atkGrowth: ie.atkGrowth || 0,
      defGrowth: ie.defGrowth || 0,
      visible: true,
      scale: levelScale(ie.level || 0),
      alpha: 1,
      flashColor: '#ffffff',
      flashAlpha: 0,
      heroId: ie.heroId || 0,
      isPlayer: ie.isPlayer || false,
      exposure: 0,
      blinkCooldown: 0,
      mana: 0,
      maxMana: ie.maxMana || 0,
      frozen: 0,
      statusFlags: 0,
      skillCasts: 0,
      skillName: ie.skillName || '',
      facing: Math.PI * 0.25, // default: down-right
      targetFacing: Math.PI * 0.25,
      attackAnim: 0,
      attackTargetEid: -1,
      evolveBounce: 0,
      displayExp: ie.exp || 0,
      speed: ie.speed || 0,
      skillEffect: ie.skillEffect || 0,
      skillPower: ie.skillPower || 0,
    };
  }

  play() {
    this.playing = true;
    this.renderer.paused = false;
    this.scheduleNext();
  }

  pause() {
    this.playing = false;
    this.renderer.paused = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    for (const t of this.pendingTimeouts) clearTimeout(t);
    this.pendingTimeouts.clear();
  }

  togglePlay() {
    if (this.playing) this.pause(); else this.play();
  }

  setSpeed(s: number) {
    this.speed = Math.max(0.25, Math.min(8, s));
  }

  stepForward() {
    if (this.index < this.events.length) {
      this.processEvent(this.events[this.index]);
      this.index++;
      // 单步模式下 renderer.paused=true，lerp 不会运行，需要立即同步渲染坐标
      for (const e of this.renderer.entities.values()) {
        e.renderCol = e.col;
        e.renderRow = e.row;
        e.facing = e.targetFacing;
      }
    }
  }

  jumpTo(idx: number) {
    // Reload from init
    this.index = 0;
    this.firstBlood = false;
    this.killStats.clear();
    if (this.events[0]?.type === 'init') {
      this.processInit(this.events[0]);
      this.index = 1;
    }
    // Silently process up to target
    const target = Math.min(idx, this.events.length);
    while (this.index < target) {
      this.applyState(this.events[this.index], true);
      this.index++;
    }
  }

  get progress() { return this.events.length > 0 ? this.index / this.events.length : 0; }
  get totalEvents() { return this.events.length; }
  get currentIndex() { return this.index; }
  get isFinished() { return this.index >= this.events.length; }

  /** 添加一个自清理的延迟 timeout */
  private addDelayed(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.pendingTimeouts.delete(id);
      fn();
    }, ms);
    this.pendingTimeouts.add(id);
  }

  private getEventDelay(ev: GameEvent): number {
    switch (ev.type) {
      case 'move':       return DELAY_MOVE;
      case 'blink':      return DELAY_MOVE;
      case 'attack':     return DELAY_ATTACK;
      case 'skill':      return DELAY_SKILL;
      case 'hurt':       return DELAY_HURT;
      case 'death':      return DELAY_DEATH;
      case 'turn':       return DELAY_TURN;
      default:           return DELAY_DEFAULT;
    }
  }

  private scheduleNext() {
    if (!this.playing || this.index >= this.events.length) return;

    const ev = this.events[this.index];

    // If the acting entity is changing, notify the focus shift first, then wait
    const evEid = ev.eid;
    if (evEid != null && PRIMARY_ACTIONS.has(ev.type) && evEid !== this.lastActiveEid) {
      this.lastActiveEid = evEid;
      // Fire onFocus so renderer shifts vision before the action starts
      this.onFocus?.(evEid);
      this.timer = setTimeout(() => {
        // Now actually process the event after the focus pause
        this.executeAndSchedule(ev);
      }, DELAY_FOCUS / this.speed);
    } else {
      this.executeAndSchedule(ev);
    }
  }

  private executeAndSchedule(ev: GameEvent) {
    if (!this.playing) return;
    this.stepForward();
    const delay = this.getEventDelay(ev) / this.speed;
    if (this.index < this.events.length) {
      this.timer = setTimeout(() => this.scheduleNext(), delay);
    } else {
      this.timer = setTimeout(() => {
        this.playing = false;
        this.onFinish?.();
      }, delay);
    }
  }

  // ── 状态变更：processEvent 和 jumpTo 共用 ──

  /** 纯数据变更，processEvent 和 jumpTo 共用。silent=true 时跳过动画/位移lerp */
  private applyState(ev: GameEvent, silent: boolean) {
    const r = this.renderer;
    const e = ev.eid != null ? r.entities.get(ev.eid) : undefined;

    switch (ev.type) {
      case 'turn':
        if (ev.order) this.turnOrder = ev.order as number[];
        break;

      case 'move':
      case 'blink':
        if (e) {
          const dx = ev.col! - e.col;
          const dy = ev.row! - e.row;
          if (dx !== 0 || dy !== 0) {
            const f = Math.atan2(dy, dx);
            e.targetFacing = f;
            if (silent) e.facing = f;
          }
          e.col = ev.col!;
          e.row = ev.row!;
          if (silent) { e.renderCol = ev.col!; e.renderRow = ev.row!; }
          if (ev.type === 'blink') e.blinkCooldown = 7; // immediately set cooldown
        }
        break;

      case 'hurt':
        if (e) {
          if (ev.hp != null) e.hp = ev.hp;
          if (ev.maxHp != null) e.maxHp = ev.maxHp;
        }
        break;

      case 'heal':
        if (e) {
          if (ev.hp != null) e.hp = ev.hp;
          if (ev.maxHp != null) e.maxHp = ev.maxHp;
        }
        break;

      case 'death':
      case 'ring_kill':
        if (e) { e.hp = 0; e.visible = false; }
        break;

      case 'evolve':
        if (e) {
          if (ev.level != null) e.level = ev.level;
          if (ev.exp != null) e.exp = ev.exp;
          if (ev.kills != null) e.kills = ev.kills;
          // 使用引擎实际计算的升级后属性
          if (ev.atk != null) { e.atk = ev.atk; e.baseAtk = ev.atk; }
          if (ev.maxHp != null) { e.maxHp = ev.maxHp; e.baseHpMax = ev.maxHp; }
          e.hp = e.maxHp; // 升级满血（与引擎一致）
          e.scale = levelScale(e.level);
          if (silent) e.displayExp = e.exp;
        }
        break;

      case 'shrink':
        if (ev.ringRadius != null) r.poisonRadius = ev.ringRadius;
        break;

      case 'defend':
        if (e) {
          e.exposure = 0;
          if (ev.blinkCooldown != null) e.blinkCooldown = ev.blinkCooldown;
        }
        break;

      case 'status_update':
        if (e) {
          if (ev.exp != null) e.exp = ev.exp;
          if (ev.kills != null) e.kills = ev.kills;
          if (ev.exposure != null) e.exposure = ev.exposure;
          if (ev.blinkCooldown != null) e.blinkCooldown = ev.blinkCooldown;
          if (ev.mana != null) e.mana = ev.mana;
          if (ev.statusFlags != null) e.statusFlags = ev.statusFlags;
          if (silent && ev.exp != null) e.displayExp = e.exp;
        }
        break;

      case 'skill':
        if (e) {
          if (ev.mana != null) e.mana = ev.mana;
          if (ev.exposure != null) e.exposure = ev.exposure;
          e.skillCasts++;
          // 延迟命中的数据变更（silent 时立即应用）
          if (ev.skillTargets) {
            for (const st of ev.skillTargets) {
              const te = r.entities.get(st.idx);
              if (te) {
                if (silent) {
                  te.hp = st.hp;
                  if (st.frozen) te.frozen = 2;
                  if (st.exposure != null) te.exposure = st.exposure;
                }
              }
            }
          }
        }
        break;
    }
  }

  // ── 完整事件处理（数据 + VFX + 音效）──

  private processEvent(ev: GameEvent) {
    const r = this.renderer;
    const e = ev.eid != null ? r.entities.get(ev.eid) : undefined;

    // 先应用数据变更
    this.applyState(ev, false);

    // 主动行动时清除该实体的上回合 debuff（与引擎一致）
    if (ev.eid != null && PRIMARY_ACTIONS.has(ev.type)) {
      const ent = r.entities.get(ev.eid);
      if (ent) ent.statusFlags &= 0xFF00; // keep buffs, clear debuffs
    }

    // 再叠加 VFX / 音效 / 动画
    switch (ev.type) {
      case 'turn':
        this.onTurn?.(ev.turn || 0);
        break;

      case 'blink':
        if (e) {
          r.addVFX('blink_flash', e.col, e.row, e.col, e.row, '#60a5fa', 500);
          r.addFloater(e.col, e.row, t('replay.blink'), '#60a5fa', 12, 'status');
          SFX.flash();
        }
        break;

      case 'attack': {
        const target = ev.target != null ? r.entities.get(ev.target) : undefined;
        if (e && target) {
          const adx = target.col - e.col;
          const ady = target.row - e.row;
          if (adx !== 0 || ady !== 0) e.targetFacing = Math.atan2(ady, adx);
          e.attackAnim = 400;
          e.attackTargetEid = target.eid;
          const dist = Math.abs(adx) + Math.abs(ady);
          if (dist > 2) {
            r.addVFX('claw_projectile', e.col, e.row, target.col, target.row, e.color, 350);
          } else {
            r.addVFX('claw_slash', e.col, e.row, target.col, target.row, e.color, 300);
          }
          this.addDelayed(() => {
            r.addVFX('hit_vfx', target.col, target.row, target.col, target.row, e.color, 300);
            SFX.hitImpact();
          }, dist > 2 ? 200 : 100);
          SFX.attack(false);
        }
        break;
      }

      case 'hurt':
        if (e) {
          e.flashColor = '#ff0000';
          e.flashAlpha = 0.7;
          const dmg = ev.damage || 0;
          const isBigHit = dmg >= (e.maxHp * 0.3);
          const dx = (Math.random() - 0.5) * 2;
          if (isBigHit) {
            r.addFloater(e.col, e.row, `${dmg}`, '#ff6b6b', 18, 'crit', dx);
            r.shake(4, 0.85);
          } else {
            r.addFloater(e.col, e.row, `${dmg}`, '#ffffff', 14, 'damage', dx);
          }
          SFX.hurt();
        }
        break;

      case 'death':
        if (e) {
          r.addVFX('death_burst', e.col, e.row, e.col, e.row, e.color, 600);
          r.addFloater(e.col, e.row, t('replay.dead'), '#ef4444', 18, 'kill');
          r.shake(6, 0.86);
          SFX.death();
        }
        break;

      case 'first_blood':
        if (e) {
          r.announce(t('replay.firstBlood'), '#ef4444', e.name);
          SFX.firstBlood();
        }
        break;

      case 'streak':
        if (e) {
          r.announce(ev.label || t('replay.killStreak'), '#fbbf24', e.name);
          SFX.killStreak();
        }
        break;

      case 'ring_kill':
        if (e) r.addFloater(e.col, e.row, t('replay.ringKill'), '#9333ea', 16, 'kill');
        break;

      case 'heal':
        if (e) {
          r.addVFX('heal_ring', e.col, e.row, e.col, e.row, '#4ade80', 400);
          r.addFloater(e.col, e.row, `+${ev.amount}`, '#4ade80', 14, 'heal');
          SFX.heal();
        }
        break;

      case 'evolve':
        if (e) {
          e.evolveBounce = 500;
          r.addVFX('evolve_glow', e.col, e.row, e.col, e.row, '#fbbf24', 800);
          r.addFloater(e.col, e.row, `${t('replay.lv')} ${e.level}!`, '#fbbf24', 16, 'status');
          SFX.levelUp();
        }
        break;

      case 'shrink':
        if (ev.ringRadius != null) {
          SFX.shrink();
          r.announce(t('replay.ringShrink'), '#9333ea', undefined, 1500);
        }
        break;

      case 'defend':
        if (e) {
          r.addVFX('shield_flash', e.col, e.row, e.col, e.row, '#60a5fa80', 300);
          r.addFloater(e.col, e.row, t('replay.defend'), '#60a5fa', 10, 'status');
        }
        break;

      case 'skill':
        if (e) {
          const firstTarget = ev.skillTargets?.[0];
          if (firstTarget) {
            const st = r.entities.get(firstTarget.idx);
            if (st) {
              const sdx = st.col - e.col;
              const sdy = st.row - e.row;
              if (sdx !== 0 || sdy !== 0) e.targetFacing = Math.atan2(sdy, sdx);
              e.attackAnim = 500;
              e.attackTargetEid = st.eid;
            }
          }
          // Show specific skill effect name with color
          const effects = parseSkillEffects(e.skillEffect);
          const mainEffect = effects[0];
          const skillLabel = mainEffect ? t(`skill.${mainEffect.key}` as any) : t('replay.skill');
          const skillColor = mainEffect?.type === 'debuff' ? '#ef4444' : mainEffect?.type === 'buff' ? '#22d3ee' : e.color;
          r.addFloater(e.col, e.row, skillLabel, skillColor, 16, 'skill');
          r.addVFX(`skill_${e.skillEffect}`, e.col, e.row, e.col, e.row, e.color, 700);
          SkillSFX.play(e.skillEffect);
          r.shake(5, 0.87);
          // Apply self-buffs (stealth 0x0100, thorns 0x0200)
          const selfBuffs = e.skillEffect & 0xFF00;
          if (selfBuffs) e.statusFlags |= selfBuffs;
          if (ev.skillTargets) {
            for (const st of ev.skillTargets) {
              const te = r.entities.get(st.idx);
              if (te) {
                // Apply debuffs immediately (data layer) so they survive until target's next action
                const eff = e!.skillEffect;
                const debuffs = eff & 0x000F;
                if (debuffs) te.statusFlags |= debuffs;
                if (st.frozen) te.frozen = 2;
                if (st.exposure != null) te.exposure = st.exposure;

                // Delay VFX/SFX/damage display (presentation layer)
                this.addDelayed(() => {
                  r.addVFX('skill_hit_vfx', te.col, te.row, te.col, te.row, e!.color, 400);
                  SkillSFX.playBigHit();
                  if (st.damage > 0) {
                    const dx = (Math.random() - 0.5) * 2;
                    r.addFloater(te.col, te.row, `${st.damage}`, '#ff9500', 16, 'crit', dx);
                  }
                  te.hp = st.hp;
                  te.flashColor = e!.color;
                  te.flashAlpha = 0.8;
                  if (st.frozen) {
                    r.addVFX('stun_vfx', te.col, te.row, te.col, te.row, '#fbbf24', 600);
                    SFX.stun();
                  }
                }, 250);
              }
            }
          }
        }
        break;

      case 'gameover':
        if (ev.winner != null) {
          const winner = r.entities.get(ev.winner);
          r.announce(t('replay.victory'), '#fbbf24', winner?.name || '???', 4000);
          SFX.gameOver();
          this.onFinish?.();
        }
        break;
    }

    this.onEvent?.(ev, this.index);
  }
}
