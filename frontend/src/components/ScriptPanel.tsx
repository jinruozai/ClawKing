/**
 * ScriptPanel — Unified strategy script panel (view + edit)
 *
 * Uses the engine's native { slots, rules } format directly.
 * Slots define target selection strategies, rules define conditions → actions.
 *
 * Used in three contexts:
 * - Player script editor (editable=true): add/delete/reorder/edit slots+rules, save
 * - Replay script viewer (editable=false): read-only with matched rule highlight
 * - Admin queue viewer (editable=false): read-only inspection
 *
 * Two tabs: UI mode (visual slots+rules) and Raw JSON mode.
 */

import React, { useState, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Code, ChevronUp, ChevronDown, Trash2, Plus, RotateCcw, Save, ChevronDown as ChevronDownIcon, XCircle, Copy, ClipboardPaste } from 'lucide-react';
import { t, type Lang } from '../i18n';
import * as D from '../game/engineData';
import { SUB_NAMES, PROP_NAMES, GPROP_NAMES, OP_SYMBOLS, ACTION_NAMES, ATARGET_NAMES, SORT_NAMES, MOVE_ARG_NAMES } from '../game/scriptLabels';

// ── Types matching engine format exactly ──

interface CondData {
  lSub: number; lProp: number; lOp: number; lVal: number;
  cmp: number;
  rSub: number; rProp: number; rOp: number; rVal: number;
}
interface SlotData {
  sortBy: number; order: number;
  filterProp: number; filterOp: number;
  filterRSub: number; filterRProp: number; filterVal: number;
}
interface RuleData {
  c0: CondData; c1: CondData; c2: CondData; c3?: CondData;
  action: number; actionArg: number; actionTarget: number;
}
export interface ScriptDataType {
  slots: SlotData[];
  rules: RuleData[];
}

const EMPTY_COND: CondData = { lSub: 0, lProp: 0, lOp: 0, lVal: 0, cmp: 0, rSub: 0, rProp: 0, rOp: 0, rVal: 0 };

function makeDefaultSlot(): SlotData {
  return { sortBy: 8, order: 0, filterProp: 0, filterOp: 0, filterRSub: 255, filterRProp: 0, filterVal: 0 };
}

function makeDefaultRule(): RuleData {
  return {
    c0: { ...EMPTY_COND }, c1: { ...EMPTY_COND }, c2: { ...EMPTY_COND },
    action: 0, actionArg: 0, actionTarget: 2, // default to T0
  };
}

// ── Shared description helpers ──

function describeCondition(cond: CondData): string {
  if (cond.cmp === 0) return '';
  const lName = cond.lSub === 1 ? GPROP_NAMES()[cond.lProp] ?? `G${cond.lProp}` : `${SUB_NAMES()[cond.lSub] ?? '?'}.${PROP_NAMES()[cond.lProp] ?? cond.lProp}`;
  const op = OP_SYMBOLS[cond.cmp] ?? '?';
  const rName = cond.rSub === 255 ? `${cond.rVal}` : cond.rSub === 1 ? GPROP_NAMES()[cond.rProp] ?? `G${cond.rProp}` : `${SUB_NAMES()[cond.rSub] ?? '?'}.${PROP_NAMES()[cond.rProp] ?? cond.rProp}`;
  return `${lName} ${op} ${rName}`;
}

function describeSlot(slot: SlotData): string {
  const sort = `${t('sl.sort')}: ${SORT_NAMES()[slot.sortBy] ?? `P${slot.sortBy}`} ${slot.order === 0 ? '\u2191' : '\u2193'}`;
  let filter = '';
  if (slot.filterOp !== 0) {
    const fProp = PROP_NAMES()[slot.filterProp] ?? '?';
    const fOpSym = OP_SYMBOLS[slot.filterOp] ?? '?';
    const fVal = slot.filterRSub === 255 ? `${slot.filterVal}` : `${SUB_NAMES()[slot.filterRSub] ?? '?'}.${PROP_NAMES()[slot.filterRProp] ?? '?'}`;
    filter = ` ${t('sl.filter')}: ${fProp} ${fOpSym} ${fVal}`;
  }
  return `${sort}${filter}`;
}

function describeRuleAction(rule: RuleData): string {
  const actionId = rule.action ?? 0;
  const arg = rule.actionArg ?? 0;
  const at = rule.actionTarget ?? 2;
  let action = ACTION_NAMES()[actionId] ?? `Action${actionId}`;
  if (actionId === 3 || actionId === 4) {
    // MOVE / BLINK: arg 0=toward, 1=away, 2-6=direction
    if (arg <= 1) {
      action += (arg === 0 ? t('sl.toward') : t('sl.away'));
      action += ` \u2192 ${ATARGET_NAMES()[at] ?? SUB_NAMES()[at] ?? '?'}`;
    } else {
      action += ` ${MOVE_ARG_NAMES()[arg] ?? '?'}`;
    }
  } else if (actionId === 2) {
    // ATTACK → target
    action += ` \u2192 ${ATARGET_NAMES()[at] ?? SUB_NAMES()[at] ?? '?'}`;
  }
  return action;
}

function describeRuleConditions(rule: RuleData): string[] {
  const conditions: string[] = [];
  for (const key of ['c0', 'c1', 'c2'] as const) {
    const c = rule[key] as CondData | undefined;
    if (c && c.cmp !== 0) conditions.push(describeCondition(c));
  }
  return conditions;
}

// ── Condition Editor ──

function ConditionEditor({ cond, onChange, label, numSlots }: {
  cond: CondData;
  onChange: (c: CondData) => void;
  label: string;
  numSlots: number;
}) {
  const isActive = cond.cmp !== 0;
  const subOptions = buildSubjectOptions(numSlots);
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${isActive ? '' : 'opacity-50'}`}>
      <span className="text-[10px] font-bold text-zinc-600 w-8 shrink-0">{label}</span>
      <MiniSelect value={cond.lSub} options={subOptions} onChange={v => onChange({ ...cond, lSub: v })} width="w-20" />
      <span className="text-zinc-600">.</span>
      <MiniSelect value={cond.lProp} options={cond.lSub === 1 ? GPROP_NAMES() : PROP_NAMES()} onChange={v => onChange({ ...cond, lProp: v })} width="w-20" />
      <MiniSelect value={cond.cmp} options={OP_SYMBOLS} onChange={v => onChange({ ...cond, cmp: v })} width="w-10" />
      <MiniSelect value={cond.rSub} options={subOptions} onChange={v => onChange({ ...cond, rSub: v })} width="w-20" />
      {cond.rSub === 255 ? (
        <input
          type="number"
          value={cond.rVal}
          onChange={e => onChange({ ...cond, rVal: parseInt(e.target.value) || 0 })}
          className="w-12 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-tech text-white text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      ) : (
        <>
          <span className="text-zinc-600">.</span>
          <MiniSelect value={cond.rProp} options={cond.rSub === 1 ? GPROP_NAMES() : PROP_NAMES()} onChange={v => onChange({ ...cond, rProp: v })} width="w-20" />
        </>
      )}
    </div>
  );
}

// Build subject options based on number of defined slots
function buildSubjectOptions(numSlots: number): Record<number, string> {
  const opts: Record<number, string> = { 0: t('sl.self'), 1: t('sl.game') };
  for (let i = 0; i < Math.max(numSlots, 1); i++) {
    opts[2 + i] = `T${i}`;
  }
  opts[12] = t('sl.lastAtk');
  opts[13] = t('sl.lastTgt');
  opts[255] = t('sl.const');
  return opts;
}

// Build action target options
function buildActionTargetOptions(numSlots: number): Record<number, string> {
  const opts: Record<number, string> = {};
  for (let i = 0; i < Math.max(numSlots, 1); i++) {
    opts[2 + i] = `T${i}`;
  }
  opts[12] = t('sl.lastAtk');
  opts[13] = t('sl.lastTgt');
  return opts;
}

// ── Tiny dropdown ──

function MiniSelect({ value, options, onChange, width = 'w-16' }: {
  value: number;
  options: Record<number, string>;
  onChange: (v: number) => void;
  width?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(parseInt(e.target.value))}
      className={`${width} bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] font-tech text-zinc-300 appearance-none cursor-pointer hover:border-white/20`}
    >
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k} className="bg-[#111] text-zinc-300">{v}</option>
      ))}
    </select>
  );
}

// ── Editable Slot Row ──

function EditableSlotRow({ slot, index, onUpdate, onDelete, expanded, onToggle }: {
  slot: SlotData;
  index: number;
  onUpdate: (s: SlotData) => void;
  onDelete: (() => void) | null; // null = cannot delete
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = describeSlot(slot);
  return (
    <div className="border border-white/5 rounded-lg bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-white/5" onClick={onToggle}>
        <span className="text-[10px] font-tech text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded shrink-0">T{index}</span>
        <div className="flex-1 min-w-0 text-[10px] text-zinc-400 font-tech truncate">{summary}</div>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="border-t border-white/5 p-3 space-y-3 bg-black/20">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 w-12">{t('sl.sort')}</span>
            <MiniSelect value={slot.sortBy} options={SORT_NAMES()} onChange={v => onUpdate({ ...slot, sortBy: v })} width="w-20" />
            <MiniSelect value={slot.order} options={{ 0: t('sl.asc'), 1: t('sl.desc') } as unknown as Record<number, string>} onChange={v => onUpdate({ ...slot, order: v })} width="w-20" />
          </div>

          {/* Filter: 属性 比较符 对象.属性/常量 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-zinc-500 w-12 shrink-0">{t('sl.filter')}</span>
            <MiniSelect value={slot.filterProp} options={PROP_NAMES()} onChange={v => onUpdate({ ...slot, filterProp: v })} width="w-20" />
            <MiniSelect value={slot.filterOp} options={OP_SYMBOLS} onChange={v => onUpdate({ ...slot, filterOp: v })} width="w-10" />
            {slot.filterOp !== 0 && (
              <>
                <MiniSelect value={slot.filterRSub} options={{ 0: t('sl.self'), 1: t('sl.game'), 255: t('sl.const') } as unknown as Record<number, string>} onChange={v => onUpdate({ ...slot, filterRSub: v })} width="w-20" />
                {slot.filterRSub === 255 ? (
                  <input
                    type="number"
                    value={slot.filterVal}
                    onChange={e => onUpdate({ ...slot, filterVal: parseInt(e.target.value) || 0 })}
                    className="w-12 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-tech text-white text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                ) : (
                  <>
                    <span className="text-zinc-600">.</span>
                    <MiniSelect value={slot.filterRProp} options={slot.filterRSub === 1 ? GPROP_NAMES() : PROP_NAMES()} onChange={v => onUpdate({ ...slot, filterRProp: v })} width="w-20" />
                  </>
                )}
              </>
            )}
          </div>

          {/* Delete */}
          {onDelete && (
            <div className="flex justify-end pt-1 border-t border-white/5">
              <button onClick={onDelete}
                className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Editable Rule Row ──

function EditableRuleRow({ rule, index, total, numSlots, onUpdate, onDelete, onMove, expanded, onToggle }: {
  rule: RuleData;
  index: number;
  total: number;
  numSlots: number;
  onUpdate: (r: RuleData) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const conditions = describeRuleConditions(rule);
  const action = describeRuleAction(rule);
  const subOptions = buildSubjectOptions(numSlots);
  const atOptions = buildActionTargetOptions(numSlots);

  return (
    <div className="border border-white/5 rounded-lg bg-white/[0.02] overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-white/5" onClick={onToggle}>
        <span className="text-[10px] font-tech text-zinc-600 bg-white/5 px-1.5 py-0.5 rounded shrink-0">#{index + 1}</span>
        <div className="flex-1 min-w-0">
          {conditions.length > 0 ? (
            <span className="text-[10px] text-zinc-500">
              <span className="font-bold text-zinc-600 mr-1">{t('sl.if')}</span>
              {conditions.join(` ${t('sl.and')} `)}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-zinc-600">{t('sl.always')}</span>
          )}
          <span className="text-xs font-tech text-orange-400 ml-2">{action}</span>
        </div>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-white/5 p-3 space-y-3 bg-black/20">
          {/* Conditions */}
          {(['c0', 'c1', 'c2'] as const).map((key, i) => (
            <ConditionEditor
              key={key}
              label={`${t('sl.cond')}${i + 1}`}
              cond={rule[key] ?? EMPTY_COND}
              onChange={c => onUpdate({ ...rule, [key]: c })}
              numSlots={numSlots}
            />
          ))}

          {/* Action */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 w-12">{t('sl.action')}</span>
            <MiniSelect value={rule.action} options={ACTION_NAMES()} onChange={v => onUpdate({ ...rule, action: v })} width="w-28" />
            {(rule.action === 3 || rule.action === 4) && (
              <MiniSelect value={rule.actionArg} options={MOVE_ARG_NAMES()} onChange={v => onUpdate({ ...rule, actionArg: v })} width="w-20" />
            )}
            {(rule.action === 2 || ((rule.action === 3 || rule.action === 4) && (rule.actionArg ?? 0) <= 1)) && (
              <>
                <span className="text-[10px] text-zinc-600">{'\u2192'}</span>
                <MiniSelect value={rule.actionTarget} options={atOptions} onChange={v => onUpdate({ ...rule, actionTarget: v })} width="w-24" />
              </>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
            <button onClick={() => onMove(-1)} disabled={index === 0}
              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1}
              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1" />
            <button onClick={onDelete}
              className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read-only Slot Row ──

function ReadonlySlotRow({ slot, index }: { slot: SlotData; index: number }) {
  const summary = describeSlot(slot);
  return (
    <div className="border border-white/5 rounded-lg p-2.5 bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-tech text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded shrink-0">T{index}</span>
        <span className="text-[10px] text-zinc-400 font-tech">{summary}</span>
      </div>
    </div>
  );
}

// ── Read-only Rule Row ──

function ReadonlyRuleRow({ rule, index, isMatched }: {
  rule: RuleData;
  index: number;
  isMatched: boolean;
}) {
  const conditions = describeRuleConditions(rule);
  const action = describeRuleAction(rule);
  return (
    <div className={`border rounded-lg p-3 ${isMatched ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/5'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-tech px-1.5 py-0.5 rounded shrink-0 ${isMatched ? 'text-green-400 bg-green-500/10' : 'text-zinc-600 bg-white/5'}`}>#{index + 1}</span>
        <div className="flex-1 min-w-0">
          {conditions.length > 0 ? (
            <div className="mb-1">
              <span className={`text-[10px] font-bold mr-1 ${isMatched ? 'text-green-500' : 'text-zinc-600'}`}>{t('sl.if')}</span>
              {conditions.map((c, ci) => (
                <span key={ci}>
                  {ci > 0 && <span className={`text-[10px] mx-1 ${isMatched ? 'text-green-600' : 'text-zinc-700'}`}>{t('sl.and')}</span>}
                  <span className={`text-xs font-tech ${isMatched ? 'text-green-300' : 'text-zinc-500'}`}>{c}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="mb-1">
              <span className={`text-[10px] font-bold ${isMatched ? 'text-green-500' : 'text-zinc-600'}`}>{t('sl.always')}</span>
            </div>
          )}
          <div>
            <span className={`text-[10px] font-bold mr-1 ${isMatched ? 'text-green-500' : 'text-zinc-600'}`}>{t('sl.do')}</span>
            <span className={`text-xs font-bold ${isMatched ? 'text-orange-400' : 'text-zinc-500'}`}>{action}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Validation ──

function validateScript(slots: SlotData[], rules: RuleData[]): string | null {
  if (slots.length > 8) return t('script.validation.tooManySlots');
  if (rules.length > 16) return t('script.validation.tooManyRules');
  if (rules.length === 0) return t('script.validation.noRules');

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    // Check actionTarget references a defined slot
    const at = rule.actionTarget;
    if (at >= 2 && at <= 9) {
      const slotIdx = at - 2;
      if (slotIdx >= slots.length) {
        return t('script.validation.invalidSlotRef')
          .replace('{n}', String(i + 1))
          .replace('{s}', String(slotIdx));
      }
    }
    // Check condition subjects reference defined slots
    for (const key of ['c0', 'c1', 'c2'] as const) {
      const c = rule[key];
      if (!c || c.cmp === 0) continue;
      for (const sub of [c.lSub, c.rSub]) {
        if (sub >= 2 && sub <= 9) {
          const slotIdx = sub - 2;
          if (slotIdx >= slots.length) {
            return t('script.validation.invalidSlotRef')
              .replace('{n}', String(i + 1))
              .replace('{s}', String(slotIdx));
          }
        }
      }
    }
  }
  return null;
}

// ══════════════════════════════════════════
// Main ScriptPanel Component
// ══════════════════════════════════════════

export interface ScriptPanelProps {
  script: { slots?: unknown[]; rules?: unknown[] } | null;
  lang: Lang;
  onClose: () => void;
  /** Enable editing (add/delete/reorder/save). Default: false (read-only) */
  editable?: boolean;
  /** Called when user saves edited script (editable mode only) */
  onSave?: (script: { slots: SlotData[]; rules: RuleData[] }) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  /** Entity/player label shown in header (readonly mode) */
  label?: string;
  /** Color dot in header (readonly mode) */
  color?: string;
  /** Index of the matched rule to highlight (-1 = none, readonly mode) */
  matchedRuleIdx?: number;
  /** Render inline without modal wrapper (for embedding) */
  inline?: boolean;
  /** Hide save button (when parent handles save externally) */
  noSave?: boolean;
}

export interface ScriptPanelHandle {
  /** Get current script data (parses raw JSON if in raw mode) */
  getData(): { slots: SlotData[]; rules: RuleData[] } | null;
}

const ScriptPanel = forwardRef<ScriptPanelHandle, ScriptPanelProps>(function ScriptPanel({
  script, lang, onClose, editable = false, onSave, showToast,
  label, color, matchedRuleIdx = -1, inline = false, noSave = false,
}, ref) {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [rules, setRules] = useState<RuleData[]>([]);
  const [expandedSlotIdx, setExpandedSlotIdx] = useState<number | null>(null);
  const [expandedRuleIdx, setExpandedRuleIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'ui' | 'raw'>('ui');
  const [rawJson, setRawJson] = useState('');
  const [rawError, setRawError] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    getData() {
      if (mode === 'raw') {
        try {
          const parsed = JSON.parse(rawJson);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rules)) {
            return { slots: parsed.slots ?? [], rules: parsed.rules };
          }
        } catch { /* invalid JSON */ }
        return null;
      }
      return { slots, rules };
    },
  }), [mode, rawJson, slots, rules]);

  // Init from script prop — noSave mode only inits on mount (not on writeback)
  const mountedRef = React.useRef(false);
  useEffect(() => {
    if (noSave && mountedRef.current) return; // skip writeback re-triggers
    mountedRef.current = true;
    const initSlots = script?.slots ? (script.slots as SlotData[]).map(s => ({ ...s })) : [];
    const initRules = script?.rules ? (script.rules as RuleData[]).map(r => ({ ...r })) : [];
    setSlots(initSlots);
    setRules(initRules);
    setRawJson(JSON.stringify({ slots: initSlots, rules: initRules }, null, 2));
    setDirty(false);
    setRawError(false);
    setValidationError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  // noSave 模式：数据变化时自动通知父组件（仅 UI 模式，raw 模式切回 UI 时才同步）
  useEffect(() => {
    if (noSave && dirty && mode === 'ui' && onSave) onSave({ slots, rules });
  }, [noSave, dirty, mode, slots, rules]);

  // Check which slot indices are referenced by rules
  const referencedSlots = useMemo(() => {
    const refs = new Set<number>();
    for (const rule of rules) {
      const at = rule.actionTarget;
      if (at >= 2 && at <= 9) refs.add(at - 2);
      for (const key of ['c0', 'c1', 'c2'] as const) {
        const c = rule[key];
        if (!c || c.cmp === 0) continue;
        if (c.lSub >= 2 && c.lSub <= 9) refs.add(c.lSub - 2);
        if (c.rSub >= 2 && c.rSub <= 9) refs.add(c.rSub - 2);
      }
    }
    return refs;
  }, [rules]);

  // Sync raw JSON when switching modes
  const switchMode = useCallback((newMode: 'ui' | 'raw') => {
    if (newMode === 'raw') {
      setRawJson(JSON.stringify({ slots, rules }, null, 2));
      setRawError(false);
    } else {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rules)) {
          setSlots(parsed.slots ?? []);
          setRules(parsed.rules);
        }
        setRawError(false);
      } catch { /* keep current */ }
    }
    setMode(newMode);
  }, [slots, rules, rawJson]);

  // Slot operations
  const updateSlot = useCallback((idx: number, s: SlotData) => {
    setSlots(prev => { const next = [...prev]; next[idx] = s; return next; });
    setDirty(true);
    setValidationError(null);
  }, []);

  const deleteSlot = useCallback((idx: number) => {
    setSlots(prev => prev.filter((_, i) => i !== idx));
    setExpandedSlotIdx(null);
    setDirty(true);
    setValidationError(null);
  }, []);

  const addSlot = useCallback(() => {
    setSlots(prev => [...prev, makeDefaultSlot()]);
    setExpandedSlotIdx(slots.length);
    setDirty(true);
    setValidationError(null);
  }, [slots.length]);

  // Rule operations
  const updateRule = useCallback((idx: number, r: RuleData) => {
    setRules(prev => { const next = [...prev]; next[idx] = r; return next; });
    setDirty(true);
    setValidationError(null);
  }, []);

  const deleteRule = useCallback((idx: number) => {
    setRules(prev => prev.filter((_, i) => i !== idx));
    setExpandedRuleIdx(null);
    setDirty(true);
    setValidationError(null);
  }, []);

  const moveRule = useCallback((idx: number, dir: -1 | 1) => {
    setRules(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setExpandedRuleIdx(idx + dir);
    setDirty(true);
  }, []);

  const addRule = useCallback(() => {
    setRules(prev => [...prev, makeDefaultRule()]);
    setExpandedRuleIdx(rules.length);
    setDirty(true);
    setValidationError(null);
  }, [rules.length]);

  const resetToDefault = useCallback(() => {
    const builders = (D as unknown as { SCRIPT_BUILDERS: Array<() => { slots: SlotData[]; rules: RuleData[] }> }).SCRIPT_BUILDERS;
    const defaultScript = builders ? builders[0]() : { slots: [], rules: [] };
    setSlots(defaultScript.slots ?? []);
    setRules(defaultScript.rules ?? []);
    setExpandedSlotIdx(null);
    setExpandedRuleIdx(null);
    setDirty(true);
    setValidationError(null);
    showToast?.(t('script.reset'), 'info');
  }, [lang, showToast]);

  const clearAll = useCallback(() => {
    setSlots([]);
    setRules([]);
    setRawJson('{"slots":[],"rules":[]}');
    setExpandedSlotIdx(null);
    setExpandedRuleIdx(null);
    setDirty(true);
    setValidationError(null);
    showToast?.(t('script.cleared'), 'info');
  }, [lang, showToast]);

  const [justCopied, setJustCopied] = useState(false);
  const copyJson = useCallback(() => {
    const json = JSON.stringify({ slots, rules }, null, 2);
    navigator.clipboard.writeText(json);
    showToast?.(t('script.copied'), 'success');
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1500);
  }, [slots, rules, showToast, lang]);

  const [clipboardValid, setClipboardValid] = useState(false);

  // 检测剪贴板是否有合法脚本 JSON
  const checkClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      setClipboardValid(!!(parsed && typeof parsed === 'object' && Array.isArray(parsed.rules)));
    } catch { setClipboardValid(false); }
  }, []);

  const pasteJson = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
        showToast?.(t('script.jsonError'), 'error');
        return;
      }
      setSlots(parsed.slots || []);
      setRules(parsed.rules);
      setRawJson(JSON.stringify(parsed, null, 2));
      setDirty(true);
      setRawError(false);
      showToast?.(t('script.pasted'), 'success');
    } catch {
      showToast?.(t('script.jsonError'), 'error');
    }
  }, [showToast, lang]);

  const handleSave = useCallback(() => {
    let saveSlots = slots;
    let saveRules = rules;

    if (mode === 'raw') {
      try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
          setRawError(true);
          showToast?.(t('script.jsonError'), 'error');
          return;
        }
        saveSlots = parsed.slots ?? [];
        saveRules = parsed.rules;
      } catch {
        setRawError(true);
        showToast?.(t('script.jsonError'), 'error');
        return;
      }
    }

    const error = validateScript(saveSlots, saveRules);
    if (error) {
      setValidationError(error);
      return;
    }

    onSave?.({ slots: saveSlots, rules: saveRules });
    setSlots(saveSlots);
    setRules(saveRules);
    setDirty(false);
    setValidationError(null);
    showToast?.(t('script.saved'), 'success');
  }, [slots, rules, rawJson, mode, onSave, lang, showToast]);

  const title = editable ? t('script.title') : t('replay.strategyScript');
  const rulesCountText = editable
    ? t('script.rulesCount').replace('{n}', String(rules.length))
    : t('replay.rulesCount').replace('{n}', String(rules.length));
  const slotsCountText = t('script.slotsCount').replace('{n}', String(slots.length));

  // ── 内容区域（inline 和 modal 共享） ──
  const headerBar = (
    <div className={`${inline ? 'px-2.5 py-1.5 border-b border-white/10' : 'p-4 border-b border-white/10'} flex items-center justify-between bg-white/[0.02] shrink-0`}>
      <div className="flex items-center gap-2">
        {!inline && <Code className="w-5 h-5 text-orange-500" />}
        {!inline && <span className="font-display text-lg tracking-wider text-white">{title}</span>}
        {color && <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />}
        {label && <span className="text-zinc-400 text-sm">{label}</span>}
      </div>
      <div className="flex items-center gap-2">
        {!editable && (
          <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => switchMode('ui')}
              className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${mode === 'ui' ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {t('replay.rules')}
            </button>
            <button onClick={() => switchMode('raw')}
              className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${mode === 'raw' ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {t('replay.rawJson')}
            </button>
          </div>
        )}
        {!inline && (
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );

  const bodyContent = (
    <>
          {/* Toolbar (editable only) */}
          {editable && (
            <div className={`${inline ? 'px-2.5 py-1.5' : 'px-4 py-2'} border-b border-white/10 flex items-center gap-2 bg-black/20 shrink-0`}>
              <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden shrink-0">
                <button onClick={() => switchMode('ui')}
                  className={`px-2.5 py-1.5 text-[10px] font-bold transition-colors ${mode === 'ui' ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {t('script.modeUi')}
                </button>
                <button onClick={() => switchMode('raw')}
                  className={`px-2.5 py-1.5 text-[10px] font-bold transition-colors ${mode === 'raw' ? 'bg-orange-500/20 text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {t('script.modeRaw')}
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 font-tech">{rulesCountText}</span>
              {/* 复制粘贴 — 两种模式都有 */}
              <button onClick={copyJson}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${justCopied ? 'text-green-400 bg-green-500/10 border border-green-500/30' : 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10'}`}>
                <Copy className="w-3 h-3" /> {justCopied ? '✓' : t('agent.copy')}
              </button>
              <button onClick={pasteJson} onMouseEnter={checkClipboard}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${clipboardValid ? 'text-green-400 hover:text-green-300 bg-green-500/5 hover:bg-green-500/10 border border-green-500/20' : 'text-zinc-500 bg-white/5 border border-white/10 hover:text-zinc-300'}`}>
                <ClipboardPaste className="w-3 h-3" /> {t('script.paste')}
              </button>
              {mode === 'ui' && (
                <>
                  <button onClick={clearAll}
                    className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-red-400/60 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-lg transition-colors">
                    <XCircle className="w-3 h-3" /> {t('script.clear')}
                  </button>
                  <div className="flex-1" />
                  <button onClick={addSlot} disabled={slots.length >= 8}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/20 rounded-lg transition-colors disabled:opacity-30">
                    <Plus className="w-3 h-3" /> {t('script.addSlot')}
                  </button>
                  <button onClick={addRule} disabled={rules.length >= 16}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-orange-400 hover:text-orange-300 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/20 rounded-lg transition-colors disabled:opacity-30">
                    <Plus className="w-3 h-3" /> {t('script.addRule')}
                  </button>
                </>
              )}
              {mode === 'raw' && <div className="flex-1" />}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {mode === 'ui' ? (
              <div className="p-4 space-y-3">
                {/* Slots section — 青色底板 */}
                <div className="bg-cyan-500/[0.03] border border-cyan-500/10 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">{t('script.slots')}</span>
                    <span className="text-[10px] text-zinc-500 font-tech">({slotsCountText})</span>
                    <span className="text-[10px] text-zinc-600">— {t('script.slotsHint')}</span>
                  </div>
                  <div className="space-y-1.5">
                    {slots.length === 0 && (
                      <div className="text-center py-3 text-zinc-500 text-xs">
                        {editable ? t('script.noSlots', 'No slots defined') : t('script.noSlots', 'No slots')}
                      </div>
                    )}
                    {editable
                      ? slots.map((slot, i) => (
                          <EditableSlotRow
                            key={i}
                            slot={slot}
                            index={i}
                            onUpdate={s => updateSlot(i, s)}
                            onDelete={referencedSlots.has(i) ? null : () => deleteSlot(i)}
                            expanded={expandedSlotIdx === i}
                            onToggle={() => setExpandedSlotIdx(expandedSlotIdx === i ? null : i)}
                          />
                        ))
                      : slots.map((slot, i) => (
                          <ReadonlySlotRow key={i} slot={slot as SlotData} index={i} />
                        ))
                    }
                  </div>
                </div>

                {/* Rules section — 橙色底板 */}
                <div className="bg-orange-500/[0.03] border border-orange-500/10 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">{t('replay.rules')}</span>
                    <span className="text-[10px] text-zinc-500 font-tech">({rulesCountText})</span>
                    <span className="text-[10px] text-zinc-600">— {t('script.rulesHint')}</span>
                  </div>
                  <div className="space-y-2">
                    {rules.length === 0 && (
                      <div className="text-center py-3 text-zinc-500 text-xs">
                        {t('script.empty')}
                      </div>
                    )}
                    {editable
                      ? rules.map((rule, i) => (
                          <EditableRuleRow
                            key={i}
                            rule={rule}
                            index={i}
                            total={rules.length}
                            numSlots={slots.length}
                            onUpdate={r => updateRule(i, r)}
                            onDelete={() => deleteRule(i)}
                            onMove={dir => moveRule(i, dir)}
                            expanded={expandedRuleIdx === i}
                            onToggle={() => setExpandedRuleIdx(expandedRuleIdx === i ? null : i)}
                          />
                        ))
                      : rules.map((rule, i) => (
                          <ReadonlyRuleRow key={i} rule={rule as RuleData} index={i} isMatched={i === matchedRuleIdx} />
                        ))
                    }
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 h-full">
                {editable ? (
                  <textarea
                    value={rawJson}
                    onChange={e => { setRawJson(e.target.value); setDirty(true); setRawError(false); setValidationError(null); }}
                    spellCheck={false}
                    className={`w-full h-full min-h-[400px] bg-black/40 border rounded-lg p-3 font-mono text-xs text-zinc-300 resize-none focus:outline-none transition-colors ${
                      rawError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-orange-500/50'
                    }`}
                  />
                ) : (
                  <pre className="text-xs font-tech text-zinc-300 whitespace-pre-wrap break-all">
                    {JSON.stringify({ slots, rules }, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Validation error line */}
          {validationError && editable && (
            <div className="px-4 py-2 border-t border-red-500/20 bg-red-500/5 shrink-0">
              <span className="text-xs text-red-400">{validationError}</span>
            </div>
          )}

          {/* Footer */}
          {editable ? (
            !noSave ? (
              <div className={`${inline ? 'p-2.5' : 'p-4'} border-t border-white/10 flex items-center gap-2 bg-black/20 shrink-0`}>
                <button onClick={handleSave} disabled={!dirty}
                  className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ml-auto ${
                    dirty
                      ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_10px_rgba(249,115,22,0.3)]'
                      : 'bg-white/5 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" /> {t('script.save')}
                </button>
              </div>
            ) : null
          ) : (
            <div className="px-3 py-2 border-t border-white/10 flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 font-tech">{rulesCountText}</span>
              <div className="flex-1" />
              <button onClick={copyJson}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${justCopied ? 'text-green-400 bg-green-500/10 border border-green-500/30' : 'text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10'}`}>
                <Copy className="w-3 h-3" /> {justCopied ? '✓' : t('agent.copy')}
              </button>
            </div>
          )}
    </>
  );

  // ── inline 模式：直接渲染内容 ──
  if (inline) {
    return (
      <div className="flex flex-col h-full">
        {headerBar}
        {bodyContent}
      </div>
    );
  }

  // ── modal 模式 ──
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className={`bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col ${editable ? 'h-[600px]' : 'max-h-[80vh]'}`}
          onClick={e => e.stopPropagation()}
        >
          {headerBar}
          {bodyContent}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

export default ScriptPanel;
