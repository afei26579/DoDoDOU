import { useEffect, useMemo, useState } from 'react';
import { beadBrandKeys, getBeadBrandLabel, type BeadBrandKey } from '../../../lib/pattern/brand';
import { getPalettePreviewColors } from '../../../features/palettes/model/officialPresets';
import type { ColorPaletteCreateDraft, OfficialColorPalettePreset } from '../../../features/palettes/model/types';

type ColorPaletteCreateSheetProps = {
  open: boolean;
  presets: OfficialColorPalettePreset[];
  presetsLoading: boolean;
  onClose: () => void;
  onOpenDraft: (draft: ColorPaletteCreateDraft) => void;
};

function getDefaultTemplateName(preset: OfficialColorPalettePreset) {
  return `${preset.name} 副本`;
}

export function ColorPaletteCreateSheet({
  open,
  presets,
  presetsLoading,
  onClose,
  onOpenDraft,
}: ColorPaletteCreateSheetProps) {
  const [templateBrand, setTemplateBrand] = useState<BeadBrandKey>('MARD');

  const templatePresets = useMemo(
    () => presets.filter((preset) => preset.baseBrand === templateBrand),
    [presets, templateBrand],
  );

  useEffect(() => {
    if (!open) return;
    setTemplateBrand('MARD');
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const handleOpenBlankDraft = () => {
    onOpenDraft({
      mode: 'create',
      name: '空白色盘',
      baseBrand: templateBrand,
      colorIds: [],
    });
  };

  const handleOpenPresetDraft = (preset: OfficialColorPalettePreset) => {
    onOpenDraft({
      mode: 'create',
      name: getDefaultTemplateName(preset),
      baseBrand: preset.baseBrand,
      colorIds: [...preset.colorIds],
      sourcePresetId: preset.id,
    });
  };

  return (
    <div className="workshop-create-settings-mask show" role="presentation" onClick={onClose}>
      <section
        className="workshop-create-settings-sheet show my-palette-create-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="新建色盘"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workshop-create-settings-sheet__handle" aria-hidden="true" />
        <div className="workshop-create-settings-sheet__head">
          <div>
            <p className="my-palette-create-sheet__eyebrow">COLOR PALETTE</p>
            <h3>新建色盘</h3>
          </div>
          <button type="button" className="workshop-create-settings-sheet__close" aria-label="关闭新建色盘" onClick={onClose}>
            x
          </button>
        </div>

        <div className="workshop-create-settings-sheet__body">
          <button
            type="button"
            className="my-palette-create-option"
            onClick={handleOpenBlankDraft}
          >
            <span className="my-palette-create-option__icon" aria-hidden="true">+</span>
            <span className="my-palette-create-option__copy">
              <strong>空白色盘</strong>
              <em>基于 {getBeadBrandLabel(templateBrand)} 从零开始</em>
            </span>
            <span className="my-palette-create-option__action">开始编辑</span>
          </button>

          <div className="workshop-create-settings-sheet__section">
            <div className="workshop-create-settings-sheet__label">品牌模板</div>
            <div className="my-palette-brand-tabs my-palette-brand-tabs--simple" role="tablist" aria-label="官方模板品牌">
              {beadBrandKeys.map((brandKey) => (
                <button
                  key={brandKey}
                  type="button"
                  role="tab"
                  aria-selected={templateBrand === brandKey}
                  className={templateBrand === brandKey ? 'is-active' : ''}
                  onClick={() => setTemplateBrand(brandKey)}
                >
                  {getBeadBrandLabel(brandKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="workshop-create-settings-sheet__section">
            <div className="workshop-create-settings-sheet__label">官方预设</div>
            {presetsLoading ? (
              <div className="my-empty my-empty--inline">正在读取官方色盘模板...</div>
            ) : templatePresets.length ? (
              <div className="my-palette-template-list">
                {templatePresets.map((preset) => {
                  const previewColors = getPalettePreviewColors(preset, 10);
                  const hiddenColorCount = Math.max(0, preset.colorIds.length - previewColors.length);
                  return (
                    <article key={preset.id} className="my-palette-template-card">
                      <div className="my-palette-template-card__main">
                        <span className="my-palette-template-card__mark" aria-hidden="true">*</span>
                        <div className="my-palette-template-card__body">
                          <strong>{preset.name}</strong>
                          <span>{preset.colorIds.length} 色 · {getBeadBrandLabel(preset.baseBrand)}</span>
                        </div>
                        <button
                          type="button"
                          className="my-palette-template-card__action"
                          onClick={() => handleOpenPresetDraft(preset)}
                        >
                          编辑此模板
                        </button>
                      </div>
                      <div className="my-palette-template-card__swatches" aria-label={`${preset.name} 色卡预览`}>
                        {previewColors.map((color) => (
                          <span
                            key={`${preset.id}-${color.code}`}
                            className={color.hex === '#FFFFFF' ? 'is-white' : ''}
                            style={{ backgroundColor: color.hex }}
                            title={`${getBeadBrandLabel(preset.baseBrand)} ${color.code}`}
                          />
                        ))}
                        {hiddenColorCount > 0 ? <em>+{hiddenColorCount}</em> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="my-empty my-empty--inline">当前品牌暂无可用模板。</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
