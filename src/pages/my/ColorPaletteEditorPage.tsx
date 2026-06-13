import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/model/AuthProvider';
import {
  createBlankColorPalette,
  deleteColorPaletteSeries,
  getColorPaletteOwnerKey,
  getColorPaletteSeries,
  updateColorPaletteSeries,
} from '../../features/palettes/model/paletteStore';
import type { ColorPaletteCreateDraft, ColorPaletteSeries } from '../../features/palettes/model/types';
import { beadBrandKeys, getBeadBrandLabel, isBeadBrandKey, type BeadBrandKey } from '../../lib/pattern/brand';
import { getBrandPalette, getColorByBrandCode, getColorMappingByHex, type BrandColor } from '../../lib/pattern/color-system';

function normalizeColorIds(colorIds: string[]) {
  return Array.from(new Set(colorIds.map((code) => code.trim().toUpperCase()).filter(Boolean)));
}

function getUniqueBrandPalette(brandKey: BeadBrandKey) {
  const colorMap = new Map<string, BrandColor>();
  getBrandPalette(brandKey).forEach((color) => {
    if (!colorMap.has(color.code)) colorMap.set(color.code, color);
  });
  return [...colorMap.values()];
}

function convertColorIdsToBrand(
  colorIds: string[],
  sourceBrand: BeadBrandKey,
  targetBrand: BeadBrandKey,
) {
  if (sourceBrand === targetBrand) return normalizeColorIds(colorIds);

  return normalizeColorIds(colorIds.flatMap((code) => {
    const sourceColor = getColorByBrandCode(sourceBrand, code);
    if (!sourceColor) return [];

    const targetCode = getColorMappingByHex(sourceColor.hex)?.[targetBrand];
    return targetCode ? [targetCode] : [];
  }));
}

function filterValidColorIds(brandKey: BeadBrandKey, colorIds: string[]) {
  return normalizeColorIds(colorIds).filter((code) => Boolean(getColorByBrandCode(brandKey, code)));
}

function getDraftFromRouteState(value: unknown): ColorPaletteCreateDraft | null {
  if (!value || typeof value !== 'object') return null;

  const draft = (value as { paletteDraft?: Partial<ColorPaletteCreateDraft> }).paletteDraft;
  if (!draft || draft.mode !== 'create' || !isBeadBrandKey(draft.baseBrand)) return null;

  return {
    mode: 'create',
    name: typeof draft.name === 'string' && draft.name.trim() ? draft.name : '空白色盘',
    baseBrand: draft.baseBrand,
    colorIds: Array.isArray(draft.colorIds) ? normalizeColorIds(draft.colorIds) : [],
    sourcePresetId: typeof draft.sourcePresetId === 'string' && draft.sourcePresetId.trim()
      ? draft.sourcePresetId
      : undefined,
  };
}

export function ColorPaletteEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { paletteId = '' } = useParams();
  const { status: authStatus, user, isAuthenticated } = useAuth();
  const ownerKey = getColorPaletteOwnerKey(isAuthenticated ? user?.id : null);
  const isCreateMode = paletteId === 'new';
  const createDraft = useMemo(() => getDraftFromRouteState(location.state), [location.state]);
  const [palette, setPalette] = useState<ColorPaletteSeries | null>(null);
  const [name, setName] = useState('');
  const [brandKey, setBrandKey] = useState<BeadBrandKey>('MARD');
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>([]);
  const [sourcePresetId, setSourcePresetId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const brandPalette = useMemo(() => getUniqueBrandPalette(brandKey), [brandKey]);
  const selectedColorSet = useMemo(() => new Set(selectedColorIds), [selectedColorIds]);
  const filteredColors = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return brandPalette;

    return brandPalette.filter((color) => [
      color.code,
      color.hex,
      getBeadBrandLabel(color.brandKey),
      color.brandKey,
    ].join(' ').toLowerCase().includes(keyword));
  }, [brandPalette, search]);

  const selectedPreviewColors = useMemo(
    () => selectedColorIds.flatMap((code) => {
      const color = getColorByBrandCode(brandKey, code);
      return color ? [color] : [];
    }).slice(0, 18),
    [brandKey, selectedColorIds],
  );

  const loadPalette = useCallback(async () => {
    if (authStatus === 'loading') return;

    setIsLoading(true);
    try {
      if (isCreateMode) {
        const draft = createDraft ?? {
          mode: 'create',
          name: '空白色盘',
          baseBrand: 'MARD',
          colorIds: [],
        } satisfies ColorPaletteCreateDraft;
        const validColorIds = filterValidColorIds(draft.baseBrand, draft.colorIds);
        setPalette(null);
        setName(draft.name);
        setBrandKey(draft.baseBrand);
        setSelectedColorIds(validColorIds);
        setSourcePresetId(draft.sourcePresetId);
        setMessage(validColorIds.length === draft.colorIds.length ? '' : '已移除无效色号');
        return;
      }

      const item = await getColorPaletteSeries(ownerKey, paletteId);
      if (!item) {
        setPalette(null);
        setMessage('色卡不存在或已被删除');
        return;
      }

      const validColorIds = filterValidColorIds(item.baseBrand, item.colorIds);
      setPalette(item);
      setName(item.name);
      setBrandKey(item.baseBrand);
      setSelectedColorIds(validColorIds);
      setSourcePresetId(item.sourcePresetId);
      setMessage(validColorIds.length === item.colorIds.length ? '' : '已移除无效色号');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '色卡读取失败');
    } finally {
      setIsLoading(false);
    }
  }, [authStatus, createDraft, isCreateMode, ownerKey, paletteId]);

  useEffect(() => {
    void loadPalette();
  }, [loadPalette]);

  const handleSelectBrand = (nextBrand: BeadBrandKey) => {
    if (nextBrand === brandKey) return;

    const convertedColorIds = convertColorIdsToBrand(selectedColorIds, brandKey, nextBrand);
    setBrandKey(nextBrand);
    setSelectedColorIds(convertedColorIds);
    setSourcePresetId(undefined);
    setMessage(
      convertedColorIds.length === selectedColorIds.length
        ? `已切换到 ${getBeadBrandLabel(nextBrand)}`
        : `已切换到 ${getBeadBrandLabel(nextBrand)}，重复或缺失色号已合并`,
    );
  };

  const handleToggleColor = (color: BrandColor) => {
    setSelectedColorIds((current) => (
      current.includes(color.code)
        ? current.filter((code) => code !== color.code)
        : [...current, color.code]
    ));
    setMessage('');
  };

  const handleSelectFilteredColors = () => {
    setSelectedColorIds((current) => normalizeColorIds([...current, ...filteredColors.map((color) => color.code)]));
    setMessage(`已选择 ${filteredColors.length} 个当前筛选色号`);
  };

  const handleClearColors = () => {
    setSelectedColorIds([]);
    setMessage('已清空色号');
  };

  const handleSave = async () => {
    if ((!palette && !isCreateMode) || isSaving) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage('请填写色卡名称');
      return;
    }

    const validColorIds = filterValidColorIds(brandKey, selectedColorIds);
    if (validColorIds.length !== selectedColorIds.length) {
      setSelectedColorIds(validColorIds);
      setMessage('已移除不属于当前品牌的色号，请再次保存');
      return;
    }

    setIsSaving(true);
    try {
      const saved = isCreateMode
        ? await createBlankColorPalette(ownerKey, {
            name: trimmedName,
            baseBrand: brandKey,
            colorIds: validColorIds,
            sourcePresetId,
          })
        : await updateColorPaletteSeries(ownerKey, palette!.id, {
            name: trimmedName,
            baseBrand: brandKey,
            colorIds: validColorIds,
          });
      setPalette(saved);
      setName(saved.name);
      setBrandKey(saved.baseBrand);
      setSelectedColorIds(saved.colorIds);
      setSourcePresetId(saved.sourcePresetId);
      setMessage(isCreateMode ? '色盘已创建' : '色盘已保存');
      if (isCreateMode) {
        navigate(`/my/palettes/${encodeURIComponent(saved.id)}`, { replace: true });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '色卡保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!palette || isDeleting) return;

    const confirmed = window.confirm(`删除色卡「${palette.name}」？`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteColorPaletteSeries(ownerKey, palette.id);
      navigate('/my', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '色卡删除失败');
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    navigate('/my');
  };

  const canEdit = isCreateMode || Boolean(palette);
  const editorTitle = isCreateMode ? '编辑' : palette ? palette.name : '编辑色盘';

  return (
    <main className="palette-editor-page">
      <header className="palette-editor-header">
        <button type="button" className="palette-editor-back" onClick={() => navigate('/my')} aria-label="返回">
          ‹
        </button>
        <div>
          <p>COLOR PALETTE</p>
          <h1>{editorTitle}</h1>
        </div>
      </header>

      {isLoading ? (
        <div className="palette-editor-state">正在读取色卡...</div>
      ) : !canEdit ? (
        <div className="palette-editor-state">
          <strong>没有找到这个色卡</strong>
          <button type="button" onClick={() => navigate('/my')}>返回我的页面</button>
        </div>
      ) : (
        <>
          <section className="palette-editor-panel palette-editor-form" aria-label="色卡信息">
            <div className="palette-editor-form__top">
              <label className="palette-editor-field">
                <span>色卡名称</span>
                <input
                  value={name}
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div className="palette-editor-counter">
                <span>{getBeadBrandLabel(brandKey)}</span>
                <strong>{selectedColorIds.length} 色</strong>
              </div>
            </div>

            <div className="palette-editor-preview" aria-label="已选色号预览">
              {selectedPreviewColors.length ? selectedPreviewColors.map((color) => (
                <span
                  key={`${color.code}-${color.hex}`}
                  className={color.hex === '#FFFFFF' ? 'is-white' : ''}
                  style={{ backgroundColor: color.hex }}
                  title={`${getBeadBrandLabel(brandKey)} ${color.code}`}
                />
              )) : (
                <em>空白色卡</em>
              )}
              {selectedColorIds.length > selectedPreviewColors.length ? <b>+{selectedColorIds.length - selectedPreviewColors.length}</b> : null}
            </div>

            <div className="palette-editor-actions">
              <button
                type="button"
                className="palette-editor-secondary"
                onClick={isCreateMode ? handleCancel : handleDelete}
                disabled={isDeleting}
              >
                {isCreateMode ? '取消编辑' : isDeleting ? '删除中...' : '删除'}
              </button>
              <button type="button" className="palette-editor-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? '保存中...' : '保存色盘'}
              </button>
            </div>
            {message ? <p className="palette-editor-message">{message}</p> : null}
          </section>

          <section className="palette-editor-panel" aria-label="品牌与色号">
            <div className="palette-editor-brand-tabs" role="tablist" aria-label="色卡品牌">
              {beadBrandKeys.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={brandKey === item}
                  className={brandKey === item ? 'is-active' : ''}
                  onClick={() => handleSelectBrand(item)}
                >
                  {getBeadBrandLabel(item)}
                </button>
              ))}
            </div>

            <div className="palette-editor-filterbar">
              <input
                value={search}
                placeholder="搜索色号或 HEX"
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="button" onClick={handleSelectFilteredColors} disabled={!filteredColors.length}>
                全选筛选
              </button>
              <button type="button" onClick={handleClearColors} disabled={!selectedColorIds.length}>
                清空
              </button>
            </div>

            <div className="palette-editor-color-grid">
              {filteredColors.map((color) => {
                const isSelected = selectedColorSet.has(color.code);
                return (
                  <button
                    key={`${color.code}-${color.hex}`}
                    type="button"
                    className={`palette-editor-color ${isSelected ? 'is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => handleToggleColor(color)}
                  >
                    <span
                      className={color.hex === '#FFFFFF' ? 'is-white' : ''}
                      style={{ backgroundColor: color.hex }}
                      aria-hidden="true"
                    />
                    <strong>{color.code}</strong>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
