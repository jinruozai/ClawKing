import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, FastForward, Rewind, FileText, Home, ChevronLeft, ChevronRight, ChevronDown, SkipForward, Volume2, VolumeX, Code, X, Trophy, Copy, Zap, Eye, EyeOff, Navigation, Dices } from 'lucide-react';
import type { Lang } from '../i18n';
import { t } from '../i18n';
import { BattleRenderer } from '../game/renderer/PixiRenderer';
import { ReplayEngine } from '../game/ReplayEngine';
import { simulateMatchAsync } from '../game/simulateMatch';
import { fetchLobsterSprites, fetchScriptNFT } from '../services/dataStore';
import { BGM } from '../audio/BGM';
import { SFX } from '../audio/SoundFX';
import type { GameEvent } from '../game/types';
import { calcLevel } from '../engine/combat';
import { parseSkillEffects, SKILL_EFFECT_BITS, scriptDisplayName } from '../config/game';
import { EXPOSURE_DMG_PCT, EXPOSURE_ATK_PCT, BLINK_RANGE, BLINK_COOLDOWN, ATTACK_EXP } from '../config/constants';
import type { MatchEvent, SettlementResult } from '../types';
import { PlayerNameTag } from './PlayerNameTag';



interface Props {
  matchEvent: MatchEvent;
  settlement: SettlementResult | null;
  onBack: () => void;
  lang: Lang;
  roomId?: string;
  playerAddress?: string;
}

interface LogEntry {
  turn: number;
  text: string;
  color: string;
}

import ScriptPanel from './ScriptPanel';

export default function ReplayView({ matchEvent, settlement, onBack, lang, roomId, playerAddress }: Props) {
  // 找到当前玩家的 slot index
  // 始终标绿 index 0（比赛发起者），无论谁在看回放
  const mySlotIdx = 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BattleRenderer | null>(null);
  const engineRef = useRef<ReplayEngine | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [selectedEid, setSelectedEid] = useState<number | null>(null);
  const selectedEidRef = useRef<number | null>(null);
  const [currentTurn, setCurrentTurn] = useState(0);
  const progressRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const activeEidRef = useRef<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [muted, setMuted] = useState(false);
  const [fogEnabled, setFogEnabled] = useState(false);
  const [autoFollow, setAutoFollow] = useState(false);
  const fogEnabledRef = useRef(false);
  const autoFollowRef = useRef(false);
  const [entityVersion, setEntityVersion] = useState(0);  // bumped on every entity-changing event
  // Filter removed in v4
  const [hoverInfo, setHoverInfo] = useState<string>('');
  const [fpsVal, setFpsVal] = useState(0);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [scriptModalLabel, setScriptModalLabel] = useState('');

  const matchedRuleIdx = -1; // TODO: track from engine script_match events
  const [settlementOpen, setSettlementOpen] = useState(false);
  // v4: all 8 slots are always shown (no separate player/AI toggle)
  const [replayFinished, setReplayFinished] = useState(false);
  const [hashMismatch, setHashMismatch] = useState(false);
  const [versionMismatch, setVersionMismatch] = useState(false);
  const [ready, setReady] = useState(false);

  // Bump version to trigger re-render (throttled to ~60fps to avoid blocking main thread)
  const bumpPendingRef = useRef(false);
  const bumpEntities = () => {
    if (bumpPendingRef.current) return;
    bumpPendingRef.current = true;
    requestAnimationFrame(() => {
      bumpPendingRef.current = false;
      setEntityVersion(v => v + 1);
    });
  };

  // Build deathTurn lookup from rankings (populated after simulateMatch runs)
  const deathTurnMap = useRef(new Map<number, number>());
  useEffect(() => {
    if (!matchEvent.rankings) return;
    const m = new Map<number, number>();
    for (const r of matchEvent.rankings) {
      m.set(r.idx, r.deathTurn);
    }
    deathTurnMap.current = m;
  }, [matchEvent]);

  // Read live entity data directly from renderer.entities (single source of truth)
  // entityVersion dependency ensures re-render when data changes
  const sortedEntities = useMemo(() => {
    const renderer = rendererRef.current;
    if (!renderer) return [];
    const all = Array.from(renderer.entities.values());
    // Sort: alive by action order (turnOrder), dead by deathTurn desc
    const turnOrder = engineRef.current?.turnOrder || [];
    const orderMap = new Map(turnOrder.map((eid, i) => [eid, i]));
    all.sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      if (!a.visible && !b.visible) {
        return (deathTurnMap.current.get(b.eid) ?? 0) - (deathTurnMap.current.get(a.eid) ?? 0);
      }
      return (orderMap.get(a.eid) ?? a.eid) - (orderMap.get(b.eid) ?? b.eid);
    });
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityVersion]);

  // Initialize renderer and engine
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new BattleRenderer(canvas);
    rendererRef.current = renderer;

    const engine = new ReplayEngine(renderer);
    engineRef.current = engine;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Batch log updates for performance
    const logBuffer: LogEntry[] = [];
    let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushLog = () => {
      if (logBuffer.length > 0) {
        const batch = logBuffer.splice(0);
        setLog(prev => [...prev, ...batch]);
      }
      logFlushTimer = null;
    };

    engine.onTurn = (turn) => {
      setCurrentTurn(turn);
      logBuffer.push({ turn, text: `── ${t('replay.turn')} ${turn} ──`, color: '#fbbf24' });
      if (!logFlushTimer) logFlushTimer = setTimeout(flushLog, 100);
    };

    const PRIMARY_ACTIONS = new Set(['move', 'blink', 'attack', 'skill', 'defend']);
    engine.onEvent = (ev, idx) => {
      progressRef.current = idx / engine.totalEvents;
      if (progressBarRef.current) progressBarRef.current.style.width = `${progressRef.current * 100}%`;
      if (ev.eid != null && PRIMARY_ACTIONS.has(ev.type)) {
        activeEidRef.current = ev.eid;
        renderer.activeEid = ev.eid;
      }
      bumpEntities();
      const entry = formatLogEntry(ev, renderer);
      if (entry) {
        logBuffer.push(entry);
        if (!logFlushTimer) logFlushTimer = setTimeout(flushLog, 100);
      }
    };

    engine.onFocus = (eid) => {
      activeEidRef.current = eid;
      renderer.activeEid = eid;
      // Auto-pan camera if enabled and no entity is selected
      if (autoFollowRef.current && selectedEidRef.current == null) {
        const entity = renderer.entities.get(eid);
        if (entity) renderer.smoothFocusOn(entity.col, entity.row, 3.5);
      }
      bumpEntities();
    };

    engine.onFinish = () => {
      setIsPlaying(false);
      setReplayFinished(true);
      BGM.play('victory');
      // Auto-open settlement panel after a short delay
      setTimeout(() => setSettlementOpen(true), 800);
    };

    renderer.onHover = (col, row, _tileType, entityOnTile) => {
      let info = `[${col},${row}]`;
      if (entityOnTile) info += ` | ${entityOnTile.name}`;
      setHoverInfo(info);
    };
    renderer.onHoverLeave = () => setHoverInfo('');
    renderer.onClick = (_col, _row, entity) => {
      if (entity) {
        setSelectedEid(entity.eid);
        setIsRightPanelOpen(true);
      } else {
        // Click on empty tile or outside map → deselect
        setSelectedEid(null);
      }
    };
    renderer.onDblClick = (_col, _row, entity) => {
      if (entity) {
        setSelectedEid(entity.eid);
        setIsRightPanelOpen(true);
        renderer.smoothFocusOn(entity.col, entity.row, 4.0);
      }
    };

    // Async: fetch NFT data + run engine, then load replay
    let aborted = false;
    let fpsInterval: ReturnType<typeof setInterval> | undefined;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const simResult = await simulateMatchAsync(matchEvent);
      if (aborted) return;
      if (!simResult.versionMatch) setVersionMismatch(true);
      if (simResult.hashMatch === false) setHashMismatch(true);

      // matchEvent.events 已经是老格式 GameEvent[]（含 init），直接加载
      engine.load(matchEvent.events as any);
      renderer.myEid = mySlotIdx;

      // 从 dataStore sprite 缓存填充 BattleRenderer（TransitionScreen 已预加载）
      const heroTokenIds: number[] = (matchEvent as any).heroTokenIds || [];
      for (let i = 0; i < heroTokenIds.length; i++) {
        if (aborted) return;
        try {
          const sprites = await fetchLobsterSprites(heroTokenIds[i]);
          renderer.entitySprites.set(i, sprites);
        } catch { /* fallback to circle */ }
      }

      if (aborted) return;
      bumpEntities();
      await renderer.start();
      if (aborted) return;
      setReady(true);

      fpsInterval = setInterval(() => {
        if (rendererRef.current) setFpsVal(rendererRef.current.fps);
      }, 1000);

      startTimer = setTimeout(() => {
        if (aborted) return;
        engine.togglePlay();
        setIsPlaying(true);
        BGM.play('battle');
      }, 500);
    })();

    return () => {
      aborted = true;
      clearTimeout(startTimer);
      engine.pause();
      renderer.stop();
      ro.disconnect();
      clearInterval(fpsInterval);
      BGM.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLogOpen) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [log, isLogOpen]);

  // 进度条用独立RAF循环驱动，避免React reconciliation清除inline style
  // Progress bar updated directly in onEvent (no separate RAF loop needed)

  useEffect(() => {
    engineRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.fogEnabled = fogEnabled;
  }, [fogEnabled]);

  useEffect(() => {
    selectedEidRef.current = selectedEid;
    if (rendererRef.current) {
      rendererRef.current.selectedEid = selectedEid ?? -1;
    }
  }, [selectedEid]);

  const togglePlay = () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.isFinished) {
      eng.jumpTo(1);
      setLog([]);
      setCurrentTurn(0);
    }
    eng.togglePlay();
    setIsPlaying(eng.playing);
  };

  const stepFwd = () => {
    engineRef.current?.stepForward();
    bumpEntities();
  };

  const toggleMute = () => {
    const m = BGM.toggleMute();
    SFX.toggleMute();
    setMuted(m);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const eng = engineRef.current;
    if (eng) {
      const idx = Math.floor(pct * eng.totalEvents);
      eng.jumpTo(idx);
      progressRef.current = pct;
      bumpEntities();
    }
  };

  // Read selected entity directly from renderer (single source of truth)
  const selected = useMemo(() => {
    const renderer = rendererRef.current;
    if (!renderer) return undefined;
    if (selectedEid != null) return renderer.entities.get(selectedEid);
    // Default to first entity
    const first = renderer.entities.values().next();
    return first.done ? undefined : first.value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEid, entityVersion]);
  const showRightPanel = isRightPanelOpen && selected != null;
  const selectedScript = selected && matchEvent.scripts ? matchEvent.scripts[selected.eid] : null;

  // Progressive leveling: compute cumulative exp thresholds
  // Level N needs: 10, 15, 20, 25, ... (base=10, step=5)
  // Cumulative: L1=10, L2=25, L3=45, L4=70, ...
  function getCumulativeExp(level: number): number {
    let total = 0, need = 10;
    for (let i = 0; i < level; i++) { total += need; need += 5; }
    return total;
  }
  const selectedCumExp = selected ? getCumulativeExp(selected.level) : 0;
  const selectedNextExp = selected ? getCumulativeExp(selected.level + 1) : 10;

  // Log height for smooth transition
  const logH = isLogOpen ? 192 : 0;

  return (
    <div className="h-screen bg-[#050505] text-white font-sans overflow-hidden flex flex-col">
      {/* Loading overlay — hides UI until renderer + data fully ready */}
      <AnimatePresence>
        {!ready && (
          <motion.div
            key="loading-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-[200] bg-[#050505] flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-400 text-sm font-tech tracking-wider">{t('replay.enteringArena')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Engine version mismatch warning */}
      {versionMismatch && (
        <div className="bg-yellow-900/80 border-b border-yellow-500/50 px-4 py-2 text-sm text-yellow-200 flex items-center gap-2 shrink-0 z-50">
          <span className="text-yellow-400 font-bold">!</span>
          {t('replay.versionMismatch')}
        </div>
      )}
      {/* Replay hash mismatch warning */}
      {hashMismatch && (
        <div className="bg-red-900/80 border-b border-red-500/50 px-4 py-2 text-sm text-red-200 flex items-center gap-2 shrink-0 z-50">
          <span className="text-red-400 font-bold">!</span>
          {t('replay.hashMismatch')}
        </div>
      )}
      {/* Top Toolbar */}
      <header className="h-12 bg-[#0a0a0a] border-b border-white/10 flex items-center justify-between px-3 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white">
            <Home className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button onClick={() => setSpeed(s => Math.max(1, s - 1))} className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white">
              <Rewind className="w-3.5 h-3.5" />
            </button>
            <button onClick={togglePlay} className="p-1.5 hover:bg-white/10 rounded-md text-orange-400">
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setSpeed(s => Math.min(8, s + 1))} className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white">
              <FastForward className="w-3.5 h-3.5" />
            </button>
            <button onClick={stepFwd} className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white">
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-tech font-bold w-10 text-center text-zinc-300">{speed}x</span>
          </div>
          {roomId && (
            <>
              <div className="w-px h-5 bg-white/10" />
              <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1 border border-white/10">
                <span className="text-[10px] font-tech text-zinc-500">Room</span>
                <span className="text-xs font-tech text-zinc-300 font-mono">{roomId.length > 10 ? roomId.slice(0, 6) + '...' + roomId.slice(-4) : roomId}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(roomId); }}
                  className="p-0.5 hover:bg-white/10 rounded text-zinc-500 hover:text-white transition-colors"
                  title="Copy Room ID"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </>
          )}
          {hoverInfo && (
            <div className="text-xs font-tech text-zinc-400 ml-2 bg-white/5 px-2 py-0.5 rounded border border-white/10">{hoverInfo}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-tech text-zinc-600">{rendererRef.current ? rendererRef.current.zoom.toFixed(2) : '1.00'}x | {fpsVal} FPS</span>
          <button
            onClick={() => { setFogEnabled(v => { fogEnabledRef.current = !v; return !v; }); }}
            title={fogEnabled ? 'Hide Fog of War' : 'Show Fog of War'}
            className={`p-1.5 rounded-lg transition-colors ${fogEnabled ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
          >
            {fogEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { setAutoFollow(v => { autoFollowRef.current = !v; return !v; }); }}
            title={autoFollow ? 'Disable Auto Follow' : 'Enable Auto Follow'}
            className={`p-1.5 rounded-lg transition-colors ${autoFollow ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
          >
            <Navigation className="w-4 h-4" />
          </button>
          <button onClick={toggleMute} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {replayFinished && (
            <button
              onClick={() => setSettlementOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
            >
              <Trophy className="w-3.5 h-3.5" /> {t('replay.matchResults')}
            </button>
          )}
          <button
            onClick={() => setIsLogOpen(!isLogOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${isLogOpen ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border border-white/10'}`}
          >
            <FileText className="w-3.5 h-3.5" /> {t('replay.battleLog')}
          </button>
          {(matchEvent as any).matchId && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/?replay=${(matchEvent as any).matchId}`);
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 2000);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${
                shareCopied
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border-white/10'
              }`}
            >
              <Copy className="w-3.5 h-3.5" /> {t('matches.share')}
            </button>
          )}
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1 bg-black cursor-pointer shrink-0" onClick={handleProgressClick}>
        <div ref={progressBarRef} className="h-full bg-orange-500" />
      </div>
      {/* Main Content */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        {/* Game area + side panels — smoothly shrinks when log opens */}
        <motion.div
          className="relative flex overflow-hidden"
          animate={{ height: `calc(100% - ${logH}px)` }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          style={{ minHeight: 0 }}
        >
          {/* Left Panel (absolute overlay) */}
          <AnimatePresence>
            {isLeftPanelOpen && (
              <motion.div
                initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                className="w-60 bg-[#0a0a0a]/90 backdrop-blur-md border-r border-white/10 flex flex-col z-40 absolute inset-y-0 left-0"
              >
                <div className="p-3 border-b border-white/10">
                  <h3 className="font-display tracking-wider text-sm text-zinc-300">{t('replay.characters')} <span className="text-zinc-500 font-tech text-xs">({sortedEntities.filter(e => e.visible).length}/{sortedEntities.length})</span></h3>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {sortedEntities.map((c, ci) => {
                    const turnOrder = engineRef.current?.turnOrder;
                    const firstActorEid = turnOrder && turnOrder.length > 0 ? turnOrder[0] : -1;
                    const showTurnLine = c.visible && c.eid === firstActorEid;
                    return (<React.Fragment key={c.eid}>
                      {showTurnLine && (
                        <div className="flex items-center my-1.5 px-0.5">
                          <Dices className="w-3 h-3 text-yellow-400 shrink-0 mr-1" />
                          <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] border-l-yellow-400" />
                          <div className="flex-1 h-[2px] bg-yellow-400" />
                          <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[5px] border-r-yellow-400" />
                        </div>
                      )}
                      <div
                        onClick={() => { setSelectedEid(c.eid); setIsRightPanelOpen(true); }}
                        onDoubleClick={() => {
                          setSelectedEid(c.eid);
                          setIsRightPanelOpen(true);
                          rendererRef.current?.smoothFocusOn(c.col, c.row, 4.0);
                        }}
                        className={`p-2 rounded-lg border-2 cursor-pointer transition-all ${selectedEid === c.eid ? 'bg-orange-500/20 border-orange-400' : 'bg-white/5 border-transparent hover:border-white/20'} ${!c.visible ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {activeEidRef.current === c.eid && <Play className="w-3 h-3 text-orange-400 fill-orange-400 shrink-0" />}
                            {c.isPlayer && matchEvent.players?.[c.eid] ? (
                              <PlayerNameTag address={matchEvent.players[c.eid]} className={`font-bold text-xs truncate max-w-[160px] ${c.eid === mySlotIdx ? '[&_span]:text-green-400' : selectedEid === c.eid ? '[&_span]:text-orange-400' : ''}`} />
                            ) : (
                              <span className={`font-bold text-xs truncate max-w-[160px] ${c.eid === mySlotIdx ? 'text-green-400' : selectedEid === c.eid ? 'text-orange-400' : 'text-zinc-200'}`}>{c.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-tech text-white">Lv.{c.level + 1}</span>
                          </div>
                        </div>
                        <div className="w-full h-1 bg-black rounded-full overflow-hidden">
                          <div className={`h-full transition-all ${c.hp > c.maxHp * 0.5 ? 'bg-green-500' : c.hp > c.maxHp * 0.25 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.max(0, (c.hp / c.maxHp) * 100)}%` }} />
                        </div>
                        {!c.visible && <div className="text-[10px] text-red-500 font-bold mt-1">{t('replay.eliminated')}</div>}
                      </div>
                    </React.Fragment>);
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Left panel toggle */}
          <button
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            className={`absolute top-1/2 -translate-y-1/2 z-40 bg-[#0a0a0a] border border-white/10 p-1.5 rounded-r-lg text-zinc-400 hover:text-white transition-all ${isLeftPanelOpen ? 'left-60' : 'left-0'}`}
          >
            {isLeftPanelOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* Center - BattleMap Canvas (flex-1 stays in flow) */}
          <div ref={containerRef} className="flex-1 relative">
            {/* Turn indicator above map */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg">
              <span className="text-sm font-tech font-bold text-orange-400 tracking-wider">{t('replay.turn')} {currentTurn}</span>
            </div>
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>

          {/* Right panel toggle */}
          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className={`absolute top-1/2 -translate-y-1/2 z-40 bg-[#0a0a0a] border border-white/10 p-1.5 rounded-l-lg text-zinc-400 hover:text-white transition-all ${showRightPanel ? 'right-80' : 'right-0'}`}
          >
            {isRightPanelOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          {/* Right Panel (absolute overlay) */}
          <AnimatePresence>
            {showRightPanel && selected && (
              <motion.div
                initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                className="w-80 bg-[#0a0a0a]/90 backdrop-blur-md border-l border-white/10 flex flex-col z-40 absolute inset-y-0 right-0"
              >
                {/* Header: Name + PWR */}
                <div className="p-5 border-b border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400 font-tech font-bold text-sm shrink-0">Lv.{selected.level + 1}</span>
                      <h2 className={`font-display text-lg tracking-wider truncate ${selected.eid === mySlotIdx ? 'text-green-400' : 'text-white'}`}>{selected.name}</h2>
                      {!selected.visible && <span className="text-red-500 text-xs font-bold ml-2 shrink-0">{t('replay.dead')}</span>}
                      <span className="text-zinc-500 text-[10px] font-tech ml-auto shrink-0">EXP {selected.exp}/{selectedNextExp}</span>
                    </div>
                  </div>

                  {/* HP bar (same style as EXP bar, text inside) */}
                  {selected.maxHp > 0 && (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-zinc-400 font-tech font-bold shrink-0">HP</span>
                      <div className="flex-1 h-4 bg-black rounded-full overflow-hidden border border-white/5 relative">
                        <div className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all" style={{ width: `${Math.max(0, (selected.hp / selected.maxHp) * 100)}%` }} />
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-tech font-bold text-white/80">{selected.hp} / {selected.maxHp}</div>
                      </div>
                    </div>
                  )}

                  {/* Mana bar */}
                  {selected.maxMana > 0 && (
                    <div className="flex items-center gap-3 text-sm mt-2">
                      <span className="text-zinc-400 font-tech font-bold shrink-0">MP</span>
                      <div className="flex-1 h-4 bg-black rounded-full overflow-hidden border border-white/5 relative">
                        <div className={`h-full transition-all ${selected.mana >= selected.maxMana ? 'bg-gradient-to-r from-fuchsia-600 to-fuchsia-400' : 'bg-gradient-to-r from-blue-600 to-cyan-400'}`} style={{ width: `${Math.max(0, (selected.mana / selected.maxMana) * 100)}%` }} />
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-tech font-bold text-white/80">{selected.mana} / {selected.maxMana}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info rows + Attributes + Growth */}
                <div className="flex-1 p-5 overflow-y-auto">
                  {/* Kills */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-zinc-500">{t('replay.kills')}</span>
                    <span className="text-xs font-tech text-zinc-300 font-bold">{selected.kills}</span>
                  </div>

                  {/* Exposure */}
                  <div className="mb-5 p-3 bg-white/5 rounded-lg border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-red-400 uppercase tracking-widest">{t('replay.exposure')}</span>
                      <span className={`text-sm font-tech font-bold ${(selected.exposure ?? 0) > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{selected.exposure ?? 0}/5</span>
                      <div className="flex items-center gap-1 ml-auto">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <svg key={i} width="12" height="12" viewBox="-4 -4 8 8" className={i < (selected.exposure ?? 0) ? 'drop-shadow-[0_0_4px_#ef4444]' : ''}>
                            <polygon points="0,-3.5 3,-0.5 0,2.5 -3,-0.5" fill={i < (selected.exposure ?? 0) ? '#ef4444' : '#3f3f46'} />
                          </svg>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      {lang === 'zh' ? `攻击 +1 破绽。每点破绽：受伤 +${EXPOSURE_DMG_PCT}%，伤害 -${EXPOSURE_ATK_PCT}%，被发现距离 -1。击杀拉满破绽。移动/闪现 -1。防御清空。`
                       : lang === 'tw' ? `攻擊 +1 破綻。每點破綻：受傷 +${EXPOSURE_DMG_PCT}%，傷害 -${EXPOSURE_ATK_PCT}%，被發現距離 -1。擊殺拉滿破綻。移動/閃現 -1。防禦清空。`
                       : `Attack +1. Each point: +${EXPOSURE_DMG_PCT}% damage taken, -${EXPOSURE_ATK_PCT}% damage dealt, detection -1. Kill = max. Move/Blink -1. Defend clears all.`}
                    </p>
                  </div>

                  {/* Attributes (v4: atk, range, speed, mana, blinkCd) */}
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('replay.attributes')}</h3>
                  <div className="space-y-1.5">
                    {[
                      { label: t('replay.attack'), value: selected.atk, color: 'text-red-400' },
                      { label: t('replay.range'), value: selected.atkRange, color: 'text-yellow-400' },
                      { label: t('replay.speed'), value: selected.speed, color: 'text-green-400' },
                      { label: t('replay.mana'), value: `${selected.mana}/${selected.maxMana}`, color: 'text-blue-400' },
                      { label: t('skill.power' as any), value: selected.skillPower, color: 'text-fuchsia-400' },
                      { label: t('replay.blinkCd'), value: (selected.blinkCooldown ?? 0) === 0 ? t('replay.blinkReady') : selected.blinkCooldown, color: (selected.blinkCooldown ?? 0) === 0 ? 'text-green-400' : 'text-zinc-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between py-1.5 px-3 bg-white/5 rounded-lg border border-white/5">
                        <span className={`text-xs ${color}`}>{label}</span>
                        <span className={`text-sm font-tech font-bold ${color}`}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Skill effects */}
                  {selected.skillEffect > 0 && (
                    <div className="mt-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('replay.skill')}</h3>
                      <div className="space-y-1.5">
                        {parseSkillEffects(selected.skillEffect).map(se => (
                          <div key={se.key} className="py-1.5 px-3 bg-white/5 rounded-lg border border-white/5">
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${se.type === 'debuff' ? 'text-red-400' : 'text-cyan-400'}`}>{t(`skill.${se.key}` as any)}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${se.type === 'debuff' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>{t(se.type === 'debuff' ? 'skill.debuff' : 'skill.buff')}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 mt-0.5 block">{t(`skill.${se.key}.desc` as any).replace('{p}', String(selected.skillPower)).replace('{d}', String(100 + selected.skillPower * 10))}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-2">
                        {lang === 'zh' ? '每次攻击充能 +1 蓝量。蓝量满时，下次攻击自动释放技能。'
                         : lang === 'tw' ? '每次攻擊充能 +1 藍量。藍量滿時，下次攻擊自動釋放技能。'
                         : 'Each attack charges +1 mana. When full, next attack triggers skill automatically.'}
                      </p>
                    </div>
                  )}

                  {/* Current buff/debuff status */}
                  {(() => {
                    const flags = selected.statusFlags || 0;
                    const active = SKILL_EFFECT_BITS.filter(se => (flags & se.bit) !== 0);
                    const buffs = active.filter(se => se.type === 'buff');
                    const debuffs = active.filter(se => se.type === 'debuff');
                    if (active.length === 0) return null;
                    return (
                      <div className="mt-4">
                        {debuffs.length > 0 && (
                          <>
                            <h3 className="text-xs font-bold text-red-400/70 uppercase tracking-widest mb-2">{t('replay.statusDebuff')}</h3>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {debuffs.map(se => (
                                <span key={se.key} className="text-[10px] px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-bold">
                                  {t(`skill.${se.key}` as any)}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                        {buffs.length > 0 && (
                          <>
                            <h3 className="text-xs font-bold text-cyan-400/70 uppercase tracking-widest mb-2">{t('replay.statusBuff')}</h3>
                            <div className="flex flex-wrap gap-1.5">
                              {buffs.map(se => (
                                <span key={se.key} className="text-[10px] px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 font-bold">
                                  {t(`skill.${se.key}` as any)}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Strategy Script button */}
                {selectedScript && (
                  <div className="p-4 border-t border-white/10 bg-black/20">
                    <button
                      onClick={() => {
                        const scriptTokenId = (matchEvent as any).scriptTokenIds?.[selected.eid] ?? 0;
                        const quick = scriptDisplayName(scriptTokenId);
                        setScriptModalLabel(quick);
                        setScriptModalOpen(true);
                        if (quick.startsWith('Script #')) {
                          fetchScriptNFT(scriptTokenId).then(nft => {
                            setScriptModalLabel(scriptDisplayName(scriptTokenId, nft.name));
                          }).catch(() => {});
                        }
                      }}
                      className="w-full py-3 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-xl font-bold uppercase tracking-widest text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <Code className="w-4 h-4" /> {t('replay.strategyScript')}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Log Panel (bottom, smooth height animation) */}
        <motion.div
          animate={{ height: logH }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/10 flex flex-col shrink-0 overflow-hidden"
          style={{ height: 0 }}
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-white/5 shrink-0">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{t('replay.battleLog')}</span>
            <button onClick={() => setIsLogOpen(false)} className="p-0.5 hover:bg-white/10 rounded text-zinc-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-tech text-xs">
            {log.map((entry, i) => (
              <div key={i} style={{ color: entry.color }}>{entry.text}</div>
            ))}
            {log.length === 0 && (
              <div className="text-zinc-600 italic">{t('replay.pressPlay')}</div>
            )}
            <div ref={logEndRef} />
          </div>
        </motion.div>
      </div>

      {/* Script Modal */}
      {scriptModalOpen && selectedScript && selected && (
        <ScriptPanel
          script={selectedScript as { slots: unknown[]; rules: unknown[] }}
          label={scriptModalLabel}
          color={selected.color}
          matchedRuleIdx={matchedRuleIdx}
          lang={lang}
          onClose={() => setScriptModalOpen(false)}
        />
      )}

      {/* Settlement Panel */}
      <AnimatePresence>
        {settlementOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setSettlementOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }}
              className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl h-[70vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-orange-500/10 to-transparent">
                <h2 className="font-display text-xl tracking-wider text-white">{t('replay.matchResults')}</h2>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSettlementOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Player summary (if settlement data available) */}
              {settlement && (
                <div className="px-5 py-3 border-b border-white/10 flex items-center gap-6 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs">{t('replay.rank')}</span>
                    <span className="text-2xl font-tech font-bold text-orange-400">#{settlement.rank8 + 1}</span>
                    <span className="text-zinc-600 text-xs">/ {matchEvent.players?.filter(a => a).length || matchEvent.isPlayer.filter(Boolean).length}</span>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs">{t('replay.rating')}</span>
                    <span className={`text-lg font-tech font-bold ${settlement.ratingChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {settlement.ratingChange >= 0 ? '+' : ''}{settlement.ratingChange}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs">{t('replay.coins')}</span>
                    <span className="text-lg font-tech font-bold text-yellow-400">+{settlement.coinsEarned}</span>
                  </div>
                  {settlement.firstBlood && (
                    <>
                      <div className="w-px h-8 bg-white/10" />
                      <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">{t('replay.firstBlood')}</span>
                    </>
                  )}
                </div>
              )}

              {/* Rankings table */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#0a0a0a] border-b border-white/10">
                    <tr className="text-xs text-zinc-500 uppercase tracking-wider">
                      <th className="py-2 px-3 text-left w-12">#</th>
                      <th className="py-2 px-3 text-left">{t('replay.name')}</th>
                      <th className="py-2 px-2 text-center w-14">{t('replay.lv')}</th>
                      <th className="py-2 px-2 text-center w-16">{t('replay.turnCol')}</th>
                      <th className="py-2 px-2 text-center w-14">{t('replay.killsCol')}</th>
                      <th className="py-2 px-3 text-right">{t('replay.special')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const allRanked = [...(matchEvent.rankings || [])].sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99));
                      if (allRanked.length === 0) return <tr><td colSpan={6} className="text-center text-zinc-500 py-4">{t('replay.noData')}</td></tr>;

                      return allRanked.map((r, i) => {
                        const isMe = r.idx === mySlotIdx;
                        const playerAddr = matchEvent.players?.[r.idx] || '';
                        // v4: 所有参与者都是注册玩家（含 AI 预注册）
                        const displayRank = i + 1;
                        const level = calcLevel(r.exp) + 1;
                        const survivalTurn = r.alive ? matchEvent.turn : r.deathTurn;
                        const specials: { key: string; text: string }[] = [];
                        if (r.firstBlood) specials.push({ key: 'fb', text: t('replay.firstBlood') });
                        if (r.alive) specials.push({ key: 'sv', text: t('replay.survivor') });
                        if (r.kills >= 5) specials.push({ key: 'lg', text: t('replay.legendary') });
                        else if (r.kills >= 3) specials.push({ key: 'tk', text: t('replay.tripleKill') });

                        return (
                          <tr key={r.idx} className={`border-b border-white/5 transition-colors ${isMe ? 'bg-orange-500/10' : 'hover:bg-white/[0.02]'}`}>
                            <td className="py-2.5 px-3">
                              <span className={`font-tech font-bold text-sm ${displayRank <= 3 ? 'text-orange-400' : 'text-zinc-400'}`}>{displayRank}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold truncate ${isMe ? 'text-green-400' : 'text-zinc-300'}`}>
                                  <PlayerNameTag address={playerAddr} showNameplate={true} className="inline" />
                                </span>
                                {isMe && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20">{t('replay.you')}</span>}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className="text-sm font-tech text-zinc-300">{level}</span>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-sm font-tech ${r.alive ? 'text-green-400' : 'text-zinc-500'}`}>{r.alive ? '✓' : survivalTurn}</span>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-sm font-tech font-bold ${r.kills > 0 ? 'text-red-400' : 'text-zinc-600'}`}>{r.kills}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {specials.map((s) => (
                                  <span key={s.key} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.key === 'fb' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : s.key === 'sv' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                                    {s.text}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/10 flex justify-center">
                <button
                  onClick={onBack}
                  className="px-8 py-3 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-400 rounded-xl font-bold uppercase tracking-widest text-sm transition-colors flex items-center gap-2"
                >
                  <Home className="w-4 h-4" /> {t('replay.backToHome')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatLogEntry(ev: GameEvent, renderer: BattleRenderer): LogEntry | null {
  const getName = (eid?: number) => {
    if (eid == null) return '?';
    return renderer.entities.get(eid)?.name || `#${eid}`;
  };

  switch (ev.type) {
    case 'move':
      return { turn: 0, text: `${getName(ev.eid)} → (${ev.col},${ev.row})`, color: '#6b7280' };
    case 'blink':
      return { turn: 0, text: `${getName(ev.eid)} BLINK → (${ev.col},${ev.row})`, color: '#60a5fa' };
    case 'attack':
      return { turn: 0, text: `${getName(ev.eid)} → ${getName(ev.target)}`, color: '#f97316' };
    case 'hurt':
      return { turn: 0, text: `  ${getName(ev.eid)} -${ev.damage} HP (${ev.hp})`, color: '#ef4444' };
    case 'death':
      return { turn: 0, text: `  ☠ ${getName(ev.eid)} eliminated${ev.killer != null ? ` by ${getName(ev.killer)}` : ''}`, color: '#dc2626' };
    case 'ring_kill':
      return { turn: 0, text: `  ☠ ${getName(ev.eid)} killed by ring`, color: '#9333ea' };
    case 'first_blood':
      return { turn: 0, text: `🩸 FIRST BLOOD — ${getName(ev.eid)}`, color: '#ef4444' };
    case 'streak':
      return { turn: 0, text: `🔥 ${ev.label} — ${getName(ev.eid)} (${ev.kills} kills)`, color: '#fbbf24' };
    case 'heal':
      return { turn: 0, text: `${getName(ev.eid)} +${ev.amount} HP (${ev.hp})`, color: '#4ade80' };
    case 'evolve':
      return { turn: 0, text: `★ ${getName(ev.eid)} → Lv.${ev.level + 1}`, color: '#fbbf24' };
    case 'shrink':
      return { turn: 0, text: `⚡ Ring shrinks → radius ${ev.ringRadius}`, color: '#9333ea' };
    case 'gameover':
      return { turn: 0, text: `🏆 ${getName(ev.winner)} WINS!`, color: '#fbbf24' };
    default:
      return null;
  }
}
