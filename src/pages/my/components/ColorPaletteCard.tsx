import { getBeadBrandLabel } from '../../../lib/pattern/brand';
import { getPalettePreviewColors } from '../../../features/palettes/model/officialPresets';
import type { ColorPaletteSeries, OfficialColorPalettePreset } from '../../../features/palettes/model/types';

type ColorPaletteCardProps = {
  palette: ColorPaletteSeries | OfficialColorPalettePreset;
  actionLabel?: string;
  badge?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export function ColorPaletteCard({
  palette,
  actionLabel,
  badge,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: ColorPaletteCardProps) {
  const previewColors = getPalettePreviewColors(palette, 20);
  const hiddenColorCount = Math.max(0, palette.colorIds.length - previewColors.length);
  const sourceLabel = badge ?? (palette.sourcePresetId ? '来自模板' : palette.source === 'official' ? '官方预设' : '自定义');

  return (
    <article className={`my-palette-card ${palette.colorIds.length === 0 ? 'is-empty' : ''}`}>
      <div className="my-palette-card__head">
        <div>
          <span>{sourceLabel}</span>
          <h4>{palette.name}</h4>
        </div>
        <strong>{palette.colorIds.length}色</strong>
      </div>

      <div className="my-palette-card__swatches" aria-label={`${palette.name} 色卡预览`}>
        {previewColors.length ? previewColors.map((color) => (
          <span
            key={`${palette.id}-${color.code}`}
            className={`my-palette-card__swatch ${color.hex === '#FFFFFF' ? 'is-white' : ''}`}
            style={{ backgroundColor: color.hex }}
            title={`${getBeadBrandLabel(palette.baseBrand)} ${color.code}`}
          />
        )) : (
          <span className="my-palette-card__empty-preview">空白色卡</span>
        )}
        {hiddenColorCount > 0 ? <em>+{hiddenColorCount}</em> : null}
      </div>

      <div className="my-palette-card__meta">
        <span>{getBeadBrandLabel(palette.baseBrand)}</span>
        <span>{palette.sourcePresetId ? '可继续扩展' : palette.colorIds.length ? '可作为个人体系' : '等待添加色号'}</span>
      </div>

      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <div className="my-palette-card__actions">
          {actionLabel && onAction ? (
            <button type="button" className="my-palette-card__action" onClick={onAction}>
              {actionLabel}
            </button>
          ) : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <button type="button" className="my-palette-card__action my-palette-card__action--secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
