import { useEffect } from 'react';
import { getBeadBrandLabel } from '../../../lib/pattern/brand';
import type { ColorPaletteSeries } from '../../../features/palettes/model/types';

type ColorPaletteLibrarySheetProps = {
  open: boolean;
  palettes: ColorPaletteSeries[];
  loading: boolean;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (palette: ColorPaletteSeries) => void;
  onDelete: (palette: ColorPaletteSeries) => void;
};

export function ColorPaletteLibrarySheet({
  open,
  palettes,
  loading,
  onClose,
  onCreate,
  onEdit,
  onDelete,
}: ColorPaletteLibrarySheetProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="workshop-create-settings-mask show" role="presentation" onClick={onClose}>
      <section
        className="workshop-create-settings-sheet show my-palette-library-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="我的色盘"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workshop-create-settings-sheet__handle" aria-hidden="true" />
        <div className="workshop-create-settings-sheet__head">
          <div>
            <p className="my-palette-create-sheet__eyebrow">MY PALETTES</p>
            <h3>我的色盘</h3>
          </div>
          <button type="button" className="workshop-create-settings-sheet__close" aria-label="关闭我的色盘" onClick={onClose}>
            x
          </button>
        </div>

        <div className="workshop-create-settings-sheet__body">
          <button type="button" className="my-palette-new-card" onClick={onCreate}>
            <span className="my-palette-new-card__icon" aria-hidden="true">+</span>
            <span className="my-palette-new-card__copy">
              <strong>新建色盘</strong>
              <em>从空白色盘或官方模板开始</em>
            </span>
          </button>

          {loading ? <div className="my-empty my-empty--inline">正在读取色盘...</div> : null}

          {!loading && palettes.length ? (
            <section className="my-palette-list-section" aria-label="色盘列表">
              <div className="workshop-create-settings-sheet__label">色盘列表</div>
              <div className="my-palette-list">
                {palettes.map((palette) => (
                  <article key={palette.id} className="my-palette-list-row">
                    <div className="my-palette-list-row__body">
                      <strong>{palette.name}</strong>
                      <span>
                        <b>{palette.colorIds.length} 色</b>
                        <em>{getBeadBrandLabel(palette.baseBrand)}</em>
                      </span>
                    </div>
                    <div className="my-palette-list-row__actions">
                      <button type="button" onClick={() => onEdit(palette)}>
                        编辑
                      </button>
                      <button type="button" className="is-danger" onClick={() => onDelete(palette)}>
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
