import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listInventoryItems,
  mergeInventoryWithRequirements,
  type BeadInventoryItem,
} from '../../../features/beads/model/inventoryStore';
import type { ColorSystem, PatternCell, PatternResult } from '../../../features/workshop/model/types';
import { getBeadBrandLabel } from '../../../lib/pattern/brand';
import { buildPatternColorRequirements } from '../../../lib/pattern/color-requirements';
import { getBrandPalette, type BrandColor } from '../../../lib/pattern/color-system';
import { ALL_PALETTE_GROUP, buildPaletteGroups, getPaletteGroupForCode } from '../../../lib/pattern/palette-groups';
import { cleanupSelectedPatternColors } from '../../../lib/pattern/single-cell-color-cleanup';

const CLEANUP_TOAST_DURATION_MS = 1600;

type WorkshopResultStatsSheetProps = {
  patternResult: PatternResult;
  brand: ColorSystem;
  onClose: () => void;
  onOpenInventory?: () => void;
  onPatternResultChange?: (patternResult: PatternResult) => void;
};

type RemovedCleanupColor = {
  key: string;
  code: string;
  hex: string;
  cells: PatternCell[];
};

function formatBeads(count: number) {
  return count.toLocaleString();
}

function getStatusLabel(status: 'enough' | 'missing' | 'unknown') {
  if (status === 'enough') return '够用';
  if (status === 'missing') return '缺少';
  return '';
}

function getRequirementKey(entry: { colorId: string; code: string; hex: string }) {
  return `${entry.colorId}-${entry.code}-${entry.hex}`;
}

function getUsedPaletteColorKey(entry: { code: string; hex: string }) {
  return `${entry.code.trim().toUpperCase()}-${entry.hex.trim().toUpperCase()}`;
}

function isPureWhite(hex: string) {
  return hex.trim().toUpperCase() === '#FFFFFF';
}

function getCellCoordinateKey(cell: Pick<PatternCell, 'x' | 'y'>) {
  return `${cell.x}-${cell.y}`;
}

function isDrawableCell(cell: PatternCell) {
  return !cell.isExternal && cell.hex !== 'transparent';
}

function doesCellMatchRequirement(cell: PatternCell, entry: { code: string; hex: string }) {
  if (!isDrawableCell(cell)) return false;
  if (cell.hex.trim().toUpperCase() !== entry.hex.trim().toUpperCase()) return false;

  const code = entry.code.trim().toUpperCase();
  return !code || code === '?' || cell.vendorCode.trim().toUpperCase() === code;
}

function rebuildPatternResult(patternResult: PatternResult, cells: PatternCell[]): PatternResult {
  const paletteMap = new Map<string, { colorId: string; vendorCode: string; hex: string; count: number }>();

  cells.forEach((cell) => {
    if (!isDrawableCell(cell)) return;
    const key = `${cell.hex.toUpperCase()}-${cell.vendorCode}`;
    const current = paletteMap.get(key);
    if (current) {
      current.count += 1;
      return;
    }

    paletteMap.set(key, {
      colorId: cell.colorId,
      vendorCode: cell.vendorCode,
      hex: cell.hex.toUpperCase(),
      count: 1,
    });
  });

  const nextPalette = [...paletteMap.values()].sort((a, b) => b.count - a.count);
  return {
    ...patternResult,
    cells,
    palette: nextPalette,
    stats: {
      ...patternResult.stats,
      colorCount: nextPalette.length,
      totalCells: nextPalette.reduce((sum, item) => sum + item.count, 0),
    },
  };
}

function replacePatternColor(patternResult: PatternResult, from: { code: string; hex: string }, to: BrandColor): PatternResult {
  const fromHex = from.hex.toUpperCase();
  const nextCells = patternResult.cells.map((cell) => {
    if (cell.hex.toUpperCase() !== fromHex || (from.code && cell.vendorCode !== from.code)) return cell;

    return {
      ...cell,
      colorId: to.hex,
      vendorCode: to.code,
      hex: to.hex,
    };
  });

  return rebuildPatternResult(patternResult, nextCells);
}

function collectRemovedCleanupColors(
  patternResult: PatternResult,
  selectedColors: Array<{ colorId: string; code: string; hex: string }>,
): RemovedCleanupColor[] {
  return selectedColors.flatMap((entry) => {
    const cells = patternResult.cells
      .filter((cell) => doesCellMatchRequirement(cell, entry))
      .map((cell) => ({ ...cell }));

    if (!cells.length) return [];

    return {
      key: getRequirementKey(entry),
      code: entry.code,
      hex: entry.hex,
      cells,
    };
  });
}

function mergeRemovedCleanupColors(current: RemovedCleanupColor[], next: RemovedCleanupColor[]) {
  const nextByKey = new Map(next.map((item) => [item.key, item]));
  const merged = current.map((item) => nextByKey.get(item.key) ?? item);
  const existingKeys = new Set(merged.map((item) => item.key));

  next.forEach((item) => {
    if (!existingKeys.has(item.key)) merged.push(item);
  });

  return merged;
}

function restoreRemovedCleanupColor(patternResult: PatternResult, removedColor: RemovedCleanupColor) {
  const cellsByCoordinate = new Map(removedColor.cells.map((cell) => [getCellCoordinateKey(cell), cell]));
  const nextCells = patternResult.cells.map((cell) => cellsByCoordinate.get(getCellCoordinateKey(cell)) ?? cell);
  return rebuildPatternResult(patternResult, nextCells);
}

export function WorkshopResultStatsSheet({
  patternResult,
  brand,
  onClose,
  onOpenInventory,
  onPatternResultChange,
}: WorkshopResultStatsSheetProps) {
  const [inventoryItems, setInventoryItems] = useState<BeadInventoryItem[]>([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [activeReplaceKey, setActiveReplaceKey] = useState<string | null>(null);
  const [activeReplacementGroup, setActiveReplacementGroup] = useState(ALL_PALETTE_GROUP);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [cleanupToast, setCleanupToast] = useState('');
  const [selectedCleanupColorKeys, setSelectedCleanupColorKeys] = useState<Set<string>>(() => new Set());
  const [removedCleanupColors, setRemovedCleanupColors] = useState<RemovedCleanupColor[]>([]);
  const cleanupToastTimerRef = useRef<number | null>(null);
  const gridSize = `${patternResult.width}x${patternResult.height}网格`;
  const totalBeads = patternResult.stats.totalCells.toLocaleString();
  const totalColors = patternResult.stats.colorCount;
  const brandPalette = useMemo(() => getBrandPalette(brand), [brand]);
  const replacementPaletteGroups = useMemo(
    () => buildPaletteGroups(brand, brandPalette, (color) => color.code),
    [brand, brandPalette],
  );
  const baseRequirements = useMemo(() => buildPatternColorRequirements(patternResult, brand), [brand, patternResult]);
  const usedReplacementColorKeys = useMemo(() => {
    const usedKeys = new Set<string>();

    baseRequirements.forEach((entry) => {
      const code = entry.code.trim().toUpperCase();
      if (!code || code === '?') return;
      usedKeys.add(getUsedPaletteColorKey(entry));
    });

    return usedKeys;
  }, [baseRequirements]);
  const visibleReplacementPalette = useMemo(() => {
    return brandPalette
      .map((color, index) => ({ color, index }))
      .filter(({ color }) => {
        if (activeReplacementGroup === ALL_PALETTE_GROUP) return true;
        return getPaletteGroupForCode(brand, color.code).key === activeReplacementGroup;
      })
      .sort((a, b) => {
        const aIsUsed = usedReplacementColorKeys.has(getUsedPaletteColorKey(a.color));
        const bIsUsed = usedReplacementColorKeys.has(getUsedPaletteColorKey(b.color));

        if (aIsUsed !== bIsUsed) return aIsUsed ? -1 : 1;
        return a.index - b.index;
      })
      .map(({ color }) => color);
  }, [activeReplacementGroup, brand, brandPalette, usedReplacementColorKeys]);
  const requirements = useMemo(
    () => mergeInventoryWithRequirements(baseRequirements, inventoryItems),
    [baseRequirements, inventoryItems],
  );
  const enoughCount = requirements.filter((entry) => entry.status === 'enough').length;
  const missingCount = requirements.filter((entry) => entry.status === 'missing').length;
  const hasInventory = inventoryItems.length > 0;
  const selectedCleanupColors = useMemo(
    () => requirements.filter((entry) => selectedCleanupColorKeys.has(getRequirementKey(entry))),
    [requirements, selectedCleanupColorKeys],
  );

  useEffect(() => {
    let alive = true;
    setInventoryLoaded(false);

    listInventoryItems()
      .then((items) => {
        if (!alive) return;
        setInventoryItems(items);
      })
      .catch(() => {
        if (alive) setInventoryItems([]);
      })
      .finally(() => {
        if (alive) setInventoryLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => {
    if (cleanupToastTimerRef.current) {
      window.clearTimeout(cleanupToastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!replacementPaletteGroups.some((group) => group.key === activeReplacementGroup)) {
      setActiveReplacementGroup(ALL_PALETTE_GROUP);
    }
  }, [activeReplacementGroup, replacementPaletteGroups]);

  useEffect(() => {
    const validKeys = new Set(requirements.map(getRequirementKey));

    setSelectedCleanupColorKeys((current) => {
      let changed = false;
      const next = new Set<string>();

      current.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
          return;
        }

        changed = true;
      });

      return changed ? next : current;
    });
  }, [requirements]);

  const showCleanupToast = (message: string) => {
    setCleanupToast(message);

    if (cleanupToastTimerRef.current) {
      window.clearTimeout(cleanupToastTimerRef.current);
    }

    cleanupToastTimerRef.current = window.setTimeout(() => {
      setCleanupToast('');
      cleanupToastTimerRef.current = null;
    }, CLEANUP_TOAST_DURATION_MS);
  };

  const handleToggleCleanupColor = (requirementKey: string) => {
    setCleanupMessage(null);
    setSelectedCleanupColorKeys((current) => {
      const next = new Set(current);

      if (next.has(requirementKey)) {
        next.delete(requirementKey);
      } else {
        next.add(requirementKey);
      }

      return next;
    });
  };

  const handleSelectReplacement = (entry: (typeof requirements)[number], color: BrandColor) => {
    if (!onPatternResultChange) return;
    onPatternResultChange(replacePatternColor(patternResult, { code: entry.code, hex: entry.hex }, color));
    setActiveReplaceKey(null);
    setCleanupMessage(null);
    setSelectedCleanupColorKeys(new Set());
  };

  const handleRestoreCleanupColor = (removedColor: RemovedCleanupColor) => {
    if (!onPatternResultChange) return;

    onPatternResultChange(restoreRemovedCleanupColor(patternResult, removedColor));
    setRemovedCleanupColors((current) => current.filter((item) => item.key !== removedColor.key));
    setCleanupMessage(`已复原 ${removedColor.code || '未匹配'}`);
  };

  const handleCleanupSingleCellColors = () => {
    if (!onPatternResultChange) return;

    if (selectedCleanupColors.length === 0) {
      showCleanupToast('请选择需要去除的杂色');
      return;
    }

    const removedColors = collectRemovedCleanupColors(patternResult, selectedCleanupColors);
    const result = cleanupSelectedPatternColors(patternResult, selectedCleanupColors);
    if (result.skippedReason === 'pattern-too-small') {
      setCleanupMessage('图纸尺寸大于 50 时才会去除杂色');
      return;
    }
    if (result.skippedReason === 'no-selected-colors') {
      showCleanupToast('请选择需要去除的杂色');
      return;
    }
    if (result.skippedReason === 'no-target-colors') {
      setCleanupMessage('没有可替换的其他颜色');
      return;
    }

    onPatternResultChange(result.newPatternResult);
    setActiveReplaceKey(null);
    setSelectedCleanupColorKeys(new Set());
    setRemovedCleanupColors((current) => mergeRemovedCleanupColors(current, removedColors));
    setCleanupMessage(`已合并 ${result.replacedCellCount.toLocaleString()} 颗，减少 ${result.removedColorCount.toLocaleString()} 个色号`);
  };

  return (
    <div className="workshop-stats-sheet__backdrop" role="presentation" onClick={onClose}>
      <section
        className="workshop-stats-sheet card-surface"
        role="dialog"
        aria-modal="true"
        aria-label="物料统计"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workshop-stats-sheet__handle" aria-hidden="true" />

        <header className="workshop-stats-sheet__header">
          <div>
            <h3>物料清单</h3>
            <p>
              {gridSize}，{getBeadBrandLabel(brand)}，共 {totalColors} 种颜色，{totalBeads} 颗豆子
            </p>
          </div>
          <button type="button" className="workshop-stats-sheet__close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        <div className={`workshop-stats-sheet__inventory-summary ${hasInventory ? 'has-inventory' : ''} ${cleanupMessage ? 'has-cleanup-message' : ''}`}>
          {cleanupMessage ? (
            <>
              <span>去除杂色</span>
              <strong>{cleanupMessage}</strong>
            </>
          ) : hasInventory ? (
            <>
              <span>库存检查</span>
              <strong>{enoughCount} 个够用 · {missingCount} 个缺少</strong>
            </>
          ) : (
            <>
              <span>{inventoryLoaded ? '未录库存' : '正在读取库存'}</span>
              <strong>{inventoryLoaded ? '可先按物料清单使用' : '稍等一下'}</strong>
            </>
          )}
        </div>

        <div className="workshop-stats-sheet__list">
          {requirements.map((entry) => {
            const requirementKey = getRequirementKey(entry);
            const isReplacing = activeReplaceKey === requirementKey;
            const isSelectedForCleanup = selectedCleanupColorKeys.has(requirementKey);

            return (
              <div key={requirementKey} className="workshop-stats-sheet__item-wrap">
                <div className="workshop-stats-sheet__item">
                  <button
                    type="button"
                    className={`workshop-stats-sheet__swatch-button ${isSelectedForCleanup ? 'is-selected' : ''}`}
                    aria-pressed={isSelectedForCleanup}
                    aria-label={`${isSelectedForCleanup ? '取消选择' : '选择'} ${entry.code || '未匹配'} 去除杂色`}
                    onClick={() => handleToggleCleanupColor(requirementKey)}
                  >
                    <span
                      className={`workshop-stats-sheet__swatch ${isPureWhite(entry.hex) ? 'is-white' : ''}`}
                      style={{ backgroundColor: entry.hex }}
                      aria-hidden="true"
                    />
                  </button>
                  <div className="workshop-stats-sheet__meta">
                    <strong>{entry.code || '未匹配'}</strong>
                    <span>拥有 {formatBeads(entry.ownedQuantity ?? 0)}</span>
                  </div>
                  <div className="workshop-stats-sheet__count">
                    <strong>{formatBeads(entry.requiredQuantity)}</strong>
                    {entry.status === 'unknown' ? (
                      <button
                        type="button"
                        className="workshop-stats-sheet__replace-button"
                        aria-expanded={isReplacing}
                        onClick={() => {
                          setActiveReplaceKey(isReplacing ? null : requirementKey);
                          if (!isReplacing) setActiveReplacementGroup(ALL_PALETTE_GROUP);
                        }}
                      >
                        替换
                      </button>
                    ) : (
                      <span className={`workshop-stats-sheet__status is-${entry.status}`}>
                        {getStatusLabel(entry.status)}
                        {entry.status === 'missing' ? ` ${formatBeads(entry.missingQuantity ?? 0)}` : ''}
                        {entry.status === 'enough' ? ` · 有 ${formatBeads(entry.ownedQuantity ?? 0)}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {isReplacing ? (
                  <div className="workshop-stats-sheet__palette-panel" aria-label={`${entry.code || '未匹配'} 可替换色卡`}>
                    <nav className="workshop-stats-sheet__palette-nav" aria-label="色号系列">
                      {replacementPaletteGroups.map((group) => (
                        <button
                          key={group.key}
                          type="button"
                          className={`workshop-stats-sheet__palette-nav-button ${activeReplacementGroup === group.key ? 'is-active' : ''}`}
                          onClick={() => setActiveReplacementGroup(group.key)}
                        >
                          {group.label}
                        </button>
                      ))}
                    </nav>
                    <div className="workshop-stats-sheet__palette">
                      {visibleReplacementPalette.map((color) => {
                        const isUsedInPattern = usedReplacementColorKeys.has(getUsedPaletteColorKey(color));

                        return (
                          <button
                            type="button"
                            key={color.id}
                            className={`workshop-stats-sheet__palette-color ${isUsedInPattern ? 'is-used' : ''}`}
                            onClick={() => handleSelectReplacement(entry, color)}
                            title={`${getBeadBrandLabel(brand)} ${color.code}`}
                          >
                            <span
                              className={`workshop-stats-sheet__palette-swatch ${isPureWhite(color.hex) ? 'is-white' : ''} ${isUsedInPattern ? 'is-used' : ''}`}
                              style={{ backgroundColor: color.hex }}
                              aria-hidden="true"
                            >
                              {isUsedInPattern ? <span className="workshop-stats-sheet__palette-check">&#10003;</span> : null}
                            </span>
                            <span>{color.code}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {removedCleanupColors.length > 0 ? (
          <section className="workshop-stats-sheet__cleanup-selection" aria-label="已作为杂色去除的色号，点击复原">
            <div className="workshop-stats-sheet__cleanup-divider">
              <span>已作为杂色去除</span>
            </div>
            <div className="workshop-stats-sheet__cleanup-colors">
              {removedCleanupColors.map((entry) => (
                <button
                  type="button"
                  key={entry.key}
                  className="workshop-stats-sheet__cleanup-color"
                  onClick={() => handleRestoreCleanupColor(entry)}
                  title="点击复原"
                >
                  <span
                    className={`workshop-stats-sheet__cleanup-swatch ${isPureWhite(entry.hex) ? 'is-white' : ''}`}
                    style={{ backgroundColor: entry.hex }}
                    aria-hidden="true"
                  />
                  <strong>{entry.code || '未匹配'}</strong>
                  <span>{formatBeads(entry.cells.length)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="workshop-stats-sheet__actions">
          {onOpenInventory ? (
            <button
              type="button"
              className="workshop-stats-sheet__secondary-action"
              onClick={() => {
                onClose();
                onOpenInventory();
              }}
            >
              管理库存
            </button>
          ) : null}
          <button
            type="button"
            className="workshop-stats-sheet__action"
            onClick={handleCleanupSingleCellColors}
            disabled={!onPatternResultChange}
          >
            去除杂色
          </button>
        </div>
        {cleanupToast ? (
          <div className="workshop-stats-sheet__toast" role="status" aria-live="polite">
            {cleanupToast}
          </div>
        ) : null}
      </section>
    </div>
  );
}
