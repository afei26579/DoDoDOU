import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { WorkshopColorPaletteSelection, WorkshopFlowState } from '../../../features/workshop/model/types';
import { useAuth } from '../../../features/auth/model/AuthProvider';
import { getColorPaletteOwnerKey, listColorPaletteSeries } from '../../../features/palettes/model/paletteStore';
import { loadOfficialColorPalettePresets } from '../../../features/palettes/model/officialPresets';
import type { ColorPaletteSeries, OfficialColorPalettePreset } from '../../../features/palettes/model/types';
import { beadBrandKeys, getBeadBrandLabel } from '../../../lib/pattern/brand';
import type { ParameterTagId } from './WorkshopParameterTabs';

const styleOptions = ['写实', '动漫', '极简'] as const;
const SIZE_MIN = 24;
const SIZE_MAX = 300;
const SIZE_PRESETS = [52, 104, 156, 208, 260] as const;
const COLOR_MERGE_MIN = 0;
const COLOR_MERGE_MAX = 50;

type ColorPaletteOption = WorkshopColorPaletteSelection & {
  key: string;
};

type WorkshopParameterPanelProps = {
  activeTag: ParameterTagId;
  config: WorkshopFlowState['config'];
  onConfigChange: (patch: Partial<WorkshopFlowState['config']>) => void;
};

function normalizePaletteOption(palette: OfficialColorPalettePreset | ColorPaletteSeries): ColorPaletteOption {
  return {
    key: `${palette.source}:${palette.id}`,
    id: palette.id,
    name: palette.name,
    source: palette.source === 'official' ? 'official' : 'custom',
    baseBrand: palette.baseBrand,
    colorIds: palette.colorIds,
  };
}

function getSelectedPaletteKey(colorPalette: WorkshopFlowState['config']['colorPalette']) {
  return colorPalette ? `${colorPalette.source}:${colorPalette.id}` : 'all';
}

function getPaletteSourceLabel(source: ColorPaletteOption['source']) {
  return source === 'official' ? '官方' : '我的';
}

type ParameterRangeControlProps = {
  min: number;
  max: number;
  value: number;
  displayValue: string;
  ariaLabel: string;
  presets?: readonly number[];
  onChange: (value: number) => void;
};

function getRangePercent(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function ParameterRangeControl({ min, max, value, displayValue, ariaLabel, presets, onChange }: ParameterRangeControlProps) {
  const rangePercent = getRangePercent(value, min, max);

  return (
    <div className="workshop-control workshop-control--range">
      <div className="workshop-control__range-labels" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <div className="workshop-range-stage" style={{ '--range-percent': `${rangePercent}%` } as CSSProperties}>
        <output className="workshop-range-value" aria-live="polite">
          {displayValue}
        </output>
        <input
          className="workshop-range"
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={ariaLabel}
        />
        {presets?.length ? (
          <div className="workshop-range-presets" aria-label="尺寸预设">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`workshop-range-preset ${value === preset ? 'is-active' : ''}`}
                style={{ '--preset-percent': `${getRangePercent(preset, min, max)}%` } as CSSProperties}
                onClick={() => onChange(preset)}
                aria-label={`设置为 ${preset}`}
                title={`${preset}`}
              >
                <span className="workshop-range-preset__dot" aria-hidden="true" />
                <span className="workshop-range-preset__label">{preset}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WorkshopParameterPanel({ activeTag, config, onConfigChange }: WorkshopParameterPanelProps) {
  const { user, isAuthenticated } = useAuth();
  const [colorPaletteOptions, setColorPaletteOptions] = useState<ColorPaletteOption[]>([]);
  const [colorPalettesLoading, setColorPalettesLoading] = useState(false);
  const ownerKey = getColorPaletteOwnerKey(isAuthenticated ? user?.id : null);

  useEffect(() => {
    let alive = true;
    setColorPalettesLoading(true);

    Promise.all([
      loadOfficialColorPalettePresets().catch(() => []),
      listColorPaletteSeries(ownerKey).catch(() => []),
    ])
      .then(([officialPresets, customPalettes]) => {
        if (!alive) return;
        setColorPaletteOptions([
          ...officialPresets.map(normalizePaletteOption),
          ...customPalettes.map(normalizePaletteOption),
        ]);
      })
      .finally(() => {
        if (alive) setColorPalettesLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [ownerKey]);

  const visibleColorPaletteOptions = useMemo(
    () => colorPaletteOptions.filter((palette) => palette.baseBrand === config.brand),
    [colorPaletteOptions, config.brand],
  );

  if (activeTag === 'size') {
    const sizeValue = Math.max(SIZE_MIN, Math.min(SIZE_MAX, config.canvasSize));

    return (
      <ParameterRangeControl
        min={SIZE_MIN}
        max={SIZE_MAX}
        value={sizeValue}
        displayValue={`${sizeValue} x ${sizeValue}`}
        presets={SIZE_PRESETS}
        onChange={(value) => onConfigChange({ canvasSize: value })}
        ariaLabel="尺寸范围，最低 24，最高 300"
      />
    );
  }

  if (activeTag === 'brand') {
    return (
      <div className="workshop-control">
        <div className="workshop-pill-row">
          {beadBrandKeys.map((brand) => (
            <button
              key={brand}
              className={`workshop-pill ${config.brand === brand ? 'is-active' : ''}`}
              type="button"
              onClick={() => onConfigChange({
                brand,
                colorPalette: config.colorPalette?.baseBrand === brand ? config.colorPalette : null,
              })}
            >
              {getBeadBrandLabel(brand)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeTag === 'colorCard') {
    const selectedPaletteKey = getSelectedPaletteKey(config.colorPalette);

    return (
      <div className="workshop-control workshop-control--color-card">
        <div className="workshop-color-card-row">
          <button
            type="button"
            className={`workshop-color-card ${selectedPaletteKey === 'all' ? 'is-active' : ''}`}
            onClick={() => onConfigChange({ colorPalette: null })}
          >
            <span>
              <strong>全部色号</strong>
              <em>{getBeadBrandLabel(config.brand)} 全色库</em>
            </span>
            <b>ALL</b>
          </button>

          {visibleColorPaletteOptions.map((palette) => (
            <button
              key={palette.key}
              type="button"
              className={`workshop-color-card ${selectedPaletteKey === palette.key ? 'is-active' : ''}`}
              onClick={() => onConfigChange({
                brand: palette.baseBrand,
                colorPalette: {
                  id: palette.id,
                  name: palette.name,
                  source: palette.source,
                  baseBrand: palette.baseBrand,
                  colorIds: [...palette.colorIds],
                },
              })}
            >
              <span>
                <strong>{palette.name}</strong>
                <em>{getPaletteSourceLabel(palette.source)} · {getBeadBrandLabel(palette.baseBrand)}</em>
              </span>
              <b>{palette.colorIds.length}色</b>
            </button>
          ))}

          {colorPalettesLoading ? <span className="workshop-color-card__state">读取色卡中...</span> : null}
          {!colorPalettesLoading && visibleColorPaletteOptions.length === 0 ? (
            <span className="workshop-color-card__state">当前品牌还没有可用色卡</span>
          ) : null}
        </div>
      </div>
    );
  }

  if (activeTag === 'style') {
    return (
      <div className="workshop-control">
        <div className="workshop-pill-row">
          {styleOptions.map((style) => (
            <button key={style} className={`workshop-pill ${config.style === style ? 'is-active' : ''}`} type="button" onClick={() => onConfigChange({ style })}>
              {style}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const colorMergeValue = Math.max(COLOR_MERGE_MIN, Math.min(COLOR_MERGE_MAX, config.colorMergeThreshold));

  return (
    <ParameterRangeControl
      min={COLOR_MERGE_MIN}
      max={COLOR_MERGE_MAX}
      value={colorMergeValue}
      displayValue={`${colorMergeValue}`}
      onChange={(value) => onConfigChange({ colorMergeThreshold: value })}
      ariaLabel="容色范围，最低 0，最高 50"
    />
  );
}
