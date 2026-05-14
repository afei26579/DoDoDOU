import { useEffect, useMemo, useState } from 'react';
import {
  listInventoryItems,
  mergeInventoryWithRequirements,
  type BeadInventoryItem,
} from '../../../features/beads/model/inventoryStore';
import type { ColorSystem, PatternResult } from '../../../features/workshop/model/types';
import { getBeadBrandLabel } from '../../../lib/pattern/brand';
import { buildPatternColorRequirements } from '../../../lib/pattern/color-requirements';
import { getBrandPalette, type BrandColor } from '../../../lib/pattern/color-system';

type WorkshopResultStatsSheetProps = {
  patternResult: PatternResult;
  brand: ColorSystem;
  onClose: () => void;
  onOpenInventory?: () => void;
  onPatternResultChange?: (patternResult: PatternResult) => void;
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

function isPureWhite(hex: string) {
  return hex.trim().toUpperCase() === '#FFFFFF';
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

  const paletteMap = new Map<string, { colorId: string; vendorCode: string; hex: string; count: number }>();
  nextCells.forEach((cell) => {
    if (cell.isExternal || cell.hex === 'transparent') return;
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
    cells: nextCells,
    palette: nextPalette,
    stats: {
      ...patternResult.stats,
      colorCount: nextPalette.length,
      totalCells: nextPalette.reduce((sum, item) => sum + item.count, 0),
    },
  };
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
  const gridSize = `${patternResult.width}x${patternResult.height}网格`;
  const totalBeads = patternResult.stats.totalCells.toLocaleString();
  const totalColors = patternResult.stats.colorCount;
  const brandPalette = useMemo(() => getBrandPalette(brand), [brand]);
  const baseRequirements = useMemo(() => buildPatternColorRequirements(patternResult, brand), [brand, patternResult]);
  const requirements = useMemo(
    () => mergeInventoryWithRequirements(baseRequirements, inventoryItems),
    [baseRequirements, inventoryItems],
  );
  const enoughCount = requirements.filter((entry) => entry.status === 'enough').length;
  const missingCount = requirements.filter((entry) => entry.status === 'missing').length;
  const hasInventory = inventoryItems.length > 0;

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

  const handleSelectReplacement = (entry: (typeof requirements)[number], color: BrandColor) => {
    if (!onPatternResultChange) return;
    onPatternResultChange(replacePatternColor(patternResult, { code: entry.code, hex: entry.hex }, color));
    setActiveReplaceKey(null);
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

        <div className={`workshop-stats-sheet__inventory-summary ${hasInventory ? 'has-inventory' : ''}`}>
          {hasInventory ? (
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

            return (
              <div key={requirementKey} className="workshop-stats-sheet__item-wrap">
                <div className="workshop-stats-sheet__item">
                  <span
                    className={`workshop-stats-sheet__swatch ${isPureWhite(entry.hex) ? 'is-white' : ''}`}
                    style={{ backgroundColor: entry.hex }}
                    aria-hidden="true"
                  />
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
                        onClick={() => setActiveReplaceKey(isReplacing ? null : requirementKey)}
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
                  <div className="workshop-stats-sheet__palette" aria-label={`${entry.code || '未匹配'} 可替换色卡`}>
                    {brandPalette.map((color) => (
                      <button
                        type="button"
                        key={color.id}
                        className="workshop-stats-sheet__palette-color"
                        onClick={() => handleSelectReplacement(entry, color)}
                        title={`${getBeadBrandLabel(brand)} ${color.code}`}
                      >
                        <span
                          className={`workshop-stats-sheet__palette-swatch ${isPureWhite(color.hex) ? 'is-white' : ''}`}
                          style={{ backgroundColor: color.hex }}
                          aria-hidden="true"
                        />
                        <span>{color.code}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

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
          <button type="button" className="workshop-stats-sheet__action" onClick={onClose}>
            收起
          </button>
        </div>
      </section>
    </div>
  );
}
