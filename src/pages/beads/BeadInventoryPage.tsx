import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  bulkSaveInventoryItems,
  createInventory,
  deleteInventory,
  deleteInventoryItem,
  filterInventoryItems,
  listInventoryItems,
  listInventoryRecords,
  saveInventoryItemToInventory,
  type BeadInventory,
  type BeadInventoryItem,
  type BeadInventoryMode,
  type BeadInventoryPaletteSource,
  type SaveBeadInventoryItemInput,
} from '../../features/beads/model/inventoryStore';
import {
  bulkSaveRemoteInventoryItems,
  createRemoteInventory,
  createRemoteInventoryItemInInventory,
  deleteRemoteInventory,
  deleteRemoteInventoryItem,
  listRemoteInventoryRecords,
  syncRemoteInventoryItems,
  updateRemoteInventoryItem,
} from '../../features/beads/model/inventoryApi';
import { useAuth } from '../../features/auth/model/AuthProvider';
import { getColorPaletteOwnerKey, listColorPaletteSeries } from '../../features/palettes/model/paletteStore';
import { loadOfficialColorPalettePresets } from '../../features/palettes/model/officialPresets';
import type { ColorPaletteSeries, OfficialColorPalettePreset } from '../../features/palettes/model/types';
import { beadBrandKeys, getBeadBrandLabel, type BeadBrandKey } from '../../lib/pattern/brand';
import { getBrandPalette, getColorByBrandCode } from '../../lib/pattern/color-system';

type BrandFilter = BeadBrandKey | 'ALL';

type InventoryFormState = {
  brandKey: BeadBrandKey;
  code: string;
  quantity: string;
  lowStockThreshold: string;
  location: string;
  note: string;
  favorite: boolean;
};

type InventoryCreateFormState = {
  name: string;
  mode: BeadInventoryMode;
  baseBrand: BeadBrandKey;
  paletteKey: string;
  batchQuantity: string;
};

type PaletteOption = {
  key: string;
  id: string;
  name: string;
  source: BeadInventoryPaletteSource;
  baseBrand: BeadBrandKey;
  colorIds: string[];
};

const emptyForm: InventoryFormState = {
  brandKey: 'MARD',
  code: '',
  quantity: '',
  lowStockThreshold: '',
  location: '',
  note: '',
  favorite: false,
};

const emptyCreateForm: InventoryCreateFormState = {
  name: '',
  mode: 'palette',
  baseBrand: 'MARD',
  paletteKey: '',
  batchQuantity: '1000',
};

function formatNumber(value: number) {
  return value.toLocaleString();
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNonNegativeInteger(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function createPaletteOption(palette: OfficialColorPalettePreset | ColorPaletteSeries): PaletteOption {
  return {
    key: `${palette.source}:${palette.id}`,
    id: palette.id,
    name: palette.name,
    source: palette.source === 'official' ? 'official' : 'custom',
    baseBrand: palette.baseBrand,
    colorIds: palette.colorIds,
  };
}

function getInventoryModeLabel(mode: BeadInventoryMode) {
  return mode === 'palette' ? '绑定色卡' : '自定义';
}

function getInventorySourceLabel(inventory: BeadInventory) {
  if (inventory.mode === 'custom') return '手动维护';
  return inventory.sourcePaletteName ?? '色卡库存';
}

function buildPaletteInventoryItems(palette: PaletteOption, quantity: number): SaveBeadInventoryItemInput[] {
  return palette.colorIds.flatMap((code) => {
    const color = getColorByBrandCode(palette.baseBrand, code);
    if (!color) return [];

    return [{
      brandKey: palette.baseBrand,
      code: color.code,
      hex: color.hex,
      quantity,
    }];
  });
}

export function BeadInventoryPage() {
  const navigate = useNavigate();
  const { status: authStatus, user, isAuthenticated } = useAuth();
  const [inventories, setInventories] = useState<BeadInventory[]>([]);
  const [allItems, setAllItems] = useState<BeadInventoryItem[]>([]);
  const [activeInventoryId, setActiveInventoryId] = useState('');
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('ALL');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [form, setForm] = useState<InventoryFormState>(emptyForm);
  const [createForm, setCreateForm] = useState<InventoryCreateFormState>(emptyCreateForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingInventory, setIsCreatingInventory] = useState(false);
  const [localInventoryCount, setLocalInventoryCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [paletteOptions, setPaletteOptions] = useState<PaletteOption[]>([]);
  const [palettesLoading, setPalettesLoading] = useState(false);

  const colorPaletteOwnerKey = getColorPaletteOwnerKey(isAuthenticated ? user?.id : null);
  const migrationStorageKey = user ? `dodoudou.inventory.migration.completed.${user.id}` : '';
  const activeInventory = useMemo(
    () => inventories.find((item) => item.id === activeInventoryId) ?? inventories[0] ?? null,
    [activeInventoryId, inventories],
  );
  const selectedPalette = useMemo(
    () => paletteOptions.find((item) => item.key === createForm.paletteKey) ?? null,
    [createForm.paletteKey, paletteOptions],
  );
  const brandPalette = useMemo(() => getBrandPalette(form.brandKey), [form.brandKey]);
  const resolvedColor = useMemo(() => getColorByBrandCode(form.brandKey, form.code), [form.brandKey, form.code]);
  const activeInventoryItems = useMemo(
    () => allItems.filter((item) => item.inventoryId === activeInventory?.id),
    [activeInventory?.id, allItems],
  );
  const items = useMemo(
    () => filterInventoryItems(activeInventoryItems, { search, brandKey: brandFilter, favoriteOnly }),
    [activeInventoryItems, brandFilter, favoriteOnly, search],
  );
  const totalQuantity = activeInventoryItems.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockCount = activeInventoryItems.filter((item) => item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold).length;
  const allInventoryQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);

  const loadItems = useCallback(async () => {
    if (authStatus === 'loading') return;
    setIsLoading(true);
    try {
      const records = isAuthenticated ? await listRemoteInventoryRecords() : await listInventoryRecords();
      setInventories(records.inventories);
      setAllItems(records.items);
      setActiveInventoryId((current) => (
        current && records.inventories.some((item) => item.id === current)
          ? current
          : records.inventories[0]?.id ?? ''
      ));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '库存读取失败，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  }, [authStatus, isAuthenticated]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    let alive = true;
    setPalettesLoading(true);

    Promise.all([
      loadOfficialColorPalettePresets().catch(() => []),
      listColorPaletteSeries(colorPaletteOwnerKey).catch(() => []),
    ])
      .then(([officialPresets, customPalettes]) => {
        if (!alive) return;
        const nextOptions = [
          ...officialPresets.map(createPaletteOption),
          ...customPalettes.map(createPaletteOption),
        ];
        setPaletteOptions(nextOptions);
        setCreateForm((current) => ({
          ...current,
          paletteKey: current.paletteKey || nextOptions[0]?.key || '',
          baseBrand: nextOptions[0]?.baseBrand ?? current.baseBrand,
        }));
      })
      .finally(() => {
        if (alive) setPalettesLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [colorPaletteOwnerKey]);

  useEffect(() => {
    if (!activeInventory || editingId) return;
    setForm((current) => ({
      ...current,
      brandKey: activeInventory.baseBrand,
      code: '',
    }));
  }, [activeInventory?.id, editingId]);

  useEffect(() => {
    if (!isAuthenticated || !migrationStorageKey) {
      setLocalInventoryCount(0);
      return;
    }

    if (localStorage.getItem(migrationStorageKey) === 'true') {
      setLocalInventoryCount(0);
      return;
    }

    let cancelled = false;
    void listInventoryItems().then((localItems) => {
      if (!cancelled) setLocalInventoryCount(localItems.length);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, migrationStorageKey]);

  const resetForm = () => {
    setForm(activeInventory ? { ...emptyForm, brandKey: activeInventory.baseBrand } : emptyForm);
    setEditingId(null);
    setMessage('');
  };

  const handleEdit = (item: BeadInventoryItem) => {
    setEditingId(item.id);
    setForm({
      brandKey: item.brandKey,
      code: item.code,
      quantity: String(item.quantity),
      lowStockThreshold: item.lowStockThreshold == null ? '' : String(item.lowStockThreshold),
      location: item.location ?? '',
      note: item.note ?? '',
      favorite: Boolean(item.favorite),
    });
    setMessage('');
  };

  const handleCreateInventory = async (event: FormEvent) => {
    event.preventDefault();
    const palette = createForm.mode === 'palette' ? selectedPalette : null;
    const batchQuantity = createForm.mode === 'palette' ? toNonNegativeInteger(createForm.batchQuantity) : 0;

    if (createForm.mode === 'palette' && !palette) {
      setMessage('请选择要绑定的色卡');
      return;
    }

    if (createForm.mode === 'palette' && batchQuantity === null) {
      setMessage('批量数量需要是 0 或更大的整数');
      return;
    }

    const inventoryName = createForm.name.trim()
      || (palette ? `${palette.name} 库存` : '自定义库存');
    const input = {
      name: inventoryName,
      mode: createForm.mode,
      baseBrand: palette?.baseBrand ?? createForm.baseBrand,
      sourcePaletteId: palette?.id,
      sourcePaletteName: palette?.name,
      sourcePaletteType: palette?.source,
      colorCount: palette?.colorIds.length ?? 0,
    };

    setIsCreatingInventory(true);
    try {
      const created = isAuthenticated ? await createRemoteInventory(input) : await createInventory(input);
      const batchItems = palette ? buildPaletteInventoryItems(palette, batchQuantity ?? 0) : [];
      if (batchItems.length) {
        if (isAuthenticated) {
          await bulkSaveRemoteInventoryItems(created.id, batchItems);
        } else {
          await bulkSaveInventoryItems(created.id, batchItems);
        }
      }

      setActiveInventoryId(created.id);
      setCreateForm({
        ...emptyCreateForm,
        paletteKey: createForm.paletteKey || paletteOptions[0]?.key || '',
        baseBrand: palette?.baseBrand ?? createForm.baseBrand,
      });
      setMessage(palette ? `已创建 ${inventoryName}，导入 ${batchItems.length} 个色号` : `已创建 ${inventoryName}`);
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '库存创建失败，请稍后再试');
    } finally {
      setIsCreatingInventory(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const code = form.code.trim();
    const quantity = Number(form.quantity);

    if (!activeInventory) {
      setMessage('请先创建或选择一个库存');
      return;
    }

    if (!code) {
      setMessage('请先输入色号');
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      setMessage('库存数量需要是 0 或更大的数字');
      return;
    }

    const color = getColorByBrandCode(form.brandKey, code);
    if (!color) {
      setMessage(`没有找到 ${getBeadBrandLabel(form.brandKey)} ${code}`);
      return;
    }

    const input = {
      inventoryId: activeInventory.id,
      brandKey: form.brandKey,
      code: color.code,
      hex: color.hex,
      quantity,
      lowStockThreshold: toOptionalNumber(form.lowStockThreshold),
      location: form.location,
      note: form.note,
      favorite: form.favorite,
    };

    setIsSaving(true);
    try {
      const saved = isAuthenticated && editingId
        ? await updateRemoteInventoryItem(editingId, input)
        : isAuthenticated
          ? await createRemoteInventoryItemInInventory(activeInventory.id, input)
          : await saveInventoryItemToInventory(activeInventory.id, input);

      if (!isAuthenticated && editingId && editingId !== saved.id) {
        await deleteInventoryItem(editingId);
      }

      setMessage(editingId ? '库存已更新' : '库存已录入');
      setEditingId(null);
      setForm({
        ...emptyForm,
        brandKey: form.brandKey,
      });
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '库存保存失败，请稍后再试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (item: BeadInventoryItem) => {
    try {
      if (isAuthenticated) {
        await deleteRemoteInventoryItem(item.id);
      } else {
        await deleteInventoryItem(item.id);
      }
      if (editingId === item.id) resetForm();
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '库存删除失败，请稍后再试');
    }
  };

  const handleDeleteInventory = async (inventory: BeadInventory) => {
    const confirmed = window.confirm(`删除「${inventory.name}」会同时删除里面的库存色号，确定继续吗？`);
    if (!confirmed) return;

    try {
      if (isAuthenticated) {
        await deleteRemoteInventory(inventory.id);
      } else {
        await deleteInventory(inventory.id);
      }
      if (activeInventoryId === inventory.id) {
        setActiveInventoryId('');
        resetForm();
      }
      setMessage(`已删除 ${inventory.name}`);
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '库存删除失败，请稍后再试');
    }
  };

  const handleSyncLocalInventory = async () => {
    if (!migrationStorageKey || isSyncing) return;

    setIsSyncing(true);
    try {
      const localRecords = await listInventoryRecords();
      if (!localRecords.items.length) {
        localStorage.setItem(migrationStorageKey, 'true');
        setLocalInventoryCount(0);
        return;
      }

      const response = await syncRemoteInventoryItems(localRecords.items, localRecords.inventories);
      localStorage.setItem(migrationStorageKey, 'true');
      setLocalInventoryCount(0);
      setInventories(response.inventories ?? []);
      setAllItems(response.items);
      setActiveInventoryId((current) => (
        current && response.inventories?.some((item) => item.id === current)
          ? current
          : response.inventories?.[0]?.id ?? ''
      ));
      setMessage(`已同步 ${response.stats.created + response.stats.updated} 条库存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '库存同步失败，请稍后再试');
    } finally {
      setIsSyncing(false);
    }
  };

  const dismissLocalSync = () => {
    if (!migrationStorageKey) return;
    localStorage.setItem(migrationStorageKey, 'true');
    setLocalInventoryCount(0);
  };

  return (
    <main className="inventory-page">
      <header className="inventory-page__header">
        <button type="button" className="inventory-page__back" onClick={() => navigate(-1)} aria-label="返回">
          ‹
        </button>
        <div>
          <p>拼豆库存</p>
          <h1>我的库存</h1>
        </div>
      </header>

      <section className={`inventory-sync-panel ${isAuthenticated ? 'is-remote' : ''}`} aria-label="库存同步状态">
        <div>
          <strong>{isAuthenticated ? '云端库存' : '本地库存'}</strong>
          <span>
            {authStatus === 'loading'
              ? '正在读取账号状态'
              : isAuthenticated
                ? user?.email ?? user?.username ?? user?.name ?? '当前账号'
                : '登录后可同步到账号'}
          </span>
        </div>
        {isAuthenticated && localInventoryCount > 0 ? (
          <div className="inventory-sync-panel__actions">
            <button type="button" onClick={handleSyncLocalInventory} disabled={isSyncing}>
              {isSyncing ? '同步中...' : `同步本地 ${localInventoryCount} 条`}
            </button>
            <button type="button" onClick={dismissLocalSync}>
              暂不处理
            </button>
          </div>
        ) : !isAuthenticated && authStatus !== 'loading' ? (
          <button type="button" onClick={() => navigate('/login?redirect=/workshop/inventory')}>
            登录
          </button>
        ) : null}
      </section>

      <section className="inventory-summary" aria-label="库存概览">
        <div className="inventory-summary__item">
          <span>库存数</span>
          <strong>{formatNumber(inventories.length)}</strong>
        </div>
        <div className="inventory-summary__item">
          <span>当前色号</span>
          <strong>{formatNumber(activeInventoryItems.length)}</strong>
        </div>
        <div className="inventory-summary__item">
          <span>当前颗数</span>
          <strong>{formatNumber(totalQuantity)}</strong>
        </div>
        <div className="inventory-summary__item">
          <span>总颗数</span>
          <strong>{formatNumber(allInventoryQuantity)}</strong>
        </div>
      </section>

      <section className="inventory-sets" aria-label="库存档案">
        <div className="inventory-section-heading">
          <div>
            <h2>库存档案</h2>
            <p>{activeInventory ? `${activeInventory.name} · ${getInventorySourceLabel(activeInventory)}` : '请选择库存'}</p>
          </div>
          <span>{lowStockCount ? `${lowStockCount} 个低库存` : getInventoryModeLabel(activeInventory?.mode ?? 'custom')}</span>
        </div>
        <div className="inventory-set-list">
          {isLoading && !inventories.length ? <div className="inventory-empty">正在读取库存</div> : null}
          {inventories.map((inventory) => {
            const inventoryItems = allItems.filter((item) => item.inventoryId === inventory.id);
            const quantity = inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
            return (
              <button
                key={inventory.id}
                type="button"
                className={`inventory-set-card ${activeInventory?.id === inventory.id ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveInventoryId(inventory.id);
                  setEditingId(null);
                  setMessage('');
                }}
              >
                <span>
                  <strong>{inventory.name}</strong>
                  <em>{getInventoryModeLabel(inventory.mode)} · {getInventorySourceLabel(inventory)}</em>
                </span>
                <b>{formatNumber(inventoryItems.length)} 色</b>
                <small>{formatNumber(quantity)} 颗</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="inventory-editor" aria-label="创建库存">
        <form className="inventory-form" onSubmit={handleCreateInventory}>
          <div className="inventory-form__topline">
            <div>
              <h2>创建库存</h2>
              <p>{createForm.mode === 'palette' ? '选择官方模板或自己的色卡，并批量设置初始数量' : '创建空库存后手动维护每个色号'}</p>
            </div>
          </div>

          <div className="inventory-form__grid">
            <label className="inventory-field">
              <span>库存名称</span>
              <input
                value={createForm.name}
                placeholder={selectedPalette ? `${selectedPalette.name} 库存` : '如 48 色补货库存'}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <label className="inventory-field">
              <span>类型</span>
              <select
                value={createForm.mode}
                onChange={(event) => setCreateForm((current) => ({ ...current, mode: event.target.value as BeadInventoryMode }))}
              >
                <option value="palette">绑定色卡</option>
                <option value="custom">自定义</option>
              </select>
            </label>

            {createForm.mode === 'palette' ? (
              <>
                <label className="inventory-field inventory-field--wide">
                  <span>色卡</span>
                  <select
                    value={createForm.paletteKey}
                    disabled={palettesLoading || !paletteOptions.length}
                    onChange={(event) => {
                      const palette = paletteOptions.find((item) => item.key === event.target.value);
                      setCreateForm((current) => ({
                        ...current,
                        paletteKey: event.target.value,
                        baseBrand: palette?.baseBrand ?? current.baseBrand,
                      }));
                    }}
                  >
                    {paletteOptions.map((palette) => (
                      <option key={palette.key} value={palette.key}>
                        {palette.source === 'official' ? '官方' : '我的'} · {palette.name} · {getBeadBrandLabel(palette.baseBrand)} · {palette.colorIds.length} 色
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inventory-field">
                  <span>每个色号数量</span>
                  <input
                    value={createForm.batchQuantity}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="1000"
                    onChange={(event) => setCreateForm((current) => ({ ...current, batchQuantity: event.target.value }))}
                  />
                </label>
              </>
            ) : (
              <label className="inventory-field">
                <span>默认品牌</span>
                <select
                  value={createForm.baseBrand}
                  onChange={(event) => setCreateForm((current) => ({ ...current, baseBrand: event.target.value as BeadBrandKey }))}
                >
                  {beadBrandKeys.map((brandKey) => (
                    <option key={brandKey} value={brandKey}>
                      {getBeadBrandLabel(brandKey)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="inventory-form__actions">
            <button type="submit" className="inventory-primary-button" disabled={isCreatingInventory || authStatus === 'loading'}>
              {isCreatingInventory ? '创建中...' : '创建库存'}
            </button>
          </div>
        </form>
      </section>

      <section className="inventory-editor" aria-label="录入库存">
        <form className="inventory-form" onSubmit={handleSubmit}>
          <div className="inventory-form__topline">
            <div>
              <h2>{editingId ? '修改库存色号' : '录入色号'}</h2>
              <p>{activeInventory ? `当前库存：${activeInventory.name}` : '先创建或选择库存'}</p>
            </div>
            <span className="inventory-form__swatch" style={{ backgroundColor: resolvedColor?.hex ?? '#F2ECE5' }} aria-hidden="true" />
          </div>

          <div className="inventory-form__grid">
            <label className="inventory-field">
              <span>品牌</span>
              <select
                value={form.brandKey}
                onChange={(event) => setForm((current) => ({ ...current, brandKey: event.target.value as BeadBrandKey, code: '' }))}
              >
                {beadBrandKeys.map((brandKey) => (
                  <option key={brandKey} value={brandKey}>
                    {getBeadBrandLabel(brandKey)}
                  </option>
                ))}
              </select>
            </label>

            <label className="inventory-field">
              <span>色号</span>
              <input
                value={form.code}
                list="inventory-code-options"
                placeholder="如 R13"
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
              <datalist id="inventory-code-options">
                {brandPalette.map((color) => (
                  <option key={color.id} value={color.code} />
                ))}
              </datalist>
            </label>

            <label className="inventory-field">
              <span>数量</span>
              <input
                value={form.quantity}
                type="number"
                min={0}
                step={1}
                placeholder="0"
                onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
              />
            </label>

            <label className="inventory-field">
              <span>低库存提醒</span>
              <input
                value={form.lowStockThreshold}
                type="number"
                min={0}
                step={1}
                placeholder="可选"
                onChange={(event) => setForm((current) => ({ ...current, lowStockThreshold: event.target.value }))}
              />
            </label>

            <label className="inventory-field">
              <span>位置</span>
              <input
                value={form.location}
                placeholder="盒子 / 抽屉"
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
              />
            </label>

            <label className="inventory-field">
              <span>备注</span>
              <input
                value={form.note}
                placeholder="可选"
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              />
            </label>
          </div>

          <label className="inventory-favorite-toggle">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(event) => setForm((current) => ({ ...current, favorite: event.target.checked }))}
            />
            <span>常用色</span>
          </label>

          {message ? <p className="inventory-message">{message}</p> : null}

          <div className="inventory-form__actions">
            {editingId ? (
              <button type="button" className="inventory-secondary-button" onClick={resetForm}>
                取消
              </button>
            ) : null}
            {activeInventory ? (
              <button type="button" className="inventory-secondary-button" onClick={() => handleDeleteInventory(activeInventory)}>
                删除当前库存
              </button>
            ) : null}
            <button type="submit" className="inventory-primary-button" disabled={isSaving || authStatus === 'loading' || !activeInventory}>
              {isSaving ? '保存中...' : editingId ? '保存修改' : '加入库存'}
            </button>
          </div>
        </form>
      </section>

      <section className="inventory-list-section" aria-label="库存列表">
        <div className="inventory-filterbar">
          <input
            value={search}
            placeholder="搜索色号、位置、备注"
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value as BrandFilter)}>
            <option value="ALL">全部品牌</option>
            {beadBrandKeys.map((brandKey) => (
              <option key={brandKey} value={brandKey}>
                {getBeadBrandLabel(brandKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`inventory-filterbar__favorite ${favoriteOnly ? 'is-active' : ''}`}
            onClick={() => setFavoriteOnly((current) => !current)}
            aria-pressed={favoriteOnly}
          >
            常用
          </button>
        </div>

        <div className="inventory-list">
          {isLoading ? (
            <div className="inventory-empty">正在读取库存</div>
          ) : items.length ? (
            items.map((item) => (
              <article key={item.id} className="inventory-item">
                <span className="inventory-item__swatch" style={{ backgroundColor: item.hex }} aria-hidden="true" />
                <div className="inventory-item__body">
                  <strong>
                    {getBeadBrandLabel(item.brandKey)} {item.code}
                  </strong>
                  <p>
                    {formatNumber(item.quantity)} 颗
                    {item.lowStockThreshold != null ? ` · 低于 ${formatNumber(item.lowStockThreshold)} 提醒` : ''}
                    {item.location ? ` · ${item.location}` : ''}
                  </p>
                  {item.note ? <span>{item.note}</span> : null}
                </div>
                <div className="inventory-item__actions">
                  {item.favorite ? <span className="inventory-item__favorite">常用</span> : null}
                  <button type="button" onClick={() => handleEdit(item)}>
                    修改
                  </button>
                  <button type="button" onClick={() => handleDeleteItem(item)}>
                    删除
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="inventory-empty">当前库存还没有符合条件的色号</div>
          )}
        </div>
      </section>
    </main>
  );
}
