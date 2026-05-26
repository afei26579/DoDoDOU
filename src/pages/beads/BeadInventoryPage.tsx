import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteInventoryItem,
  filterInventoryItems,
  listInventoryItems,
  saveInventoryItem,
  type BeadInventoryItem,
} from '../../features/beads/model/inventoryStore';
import {
  createRemoteInventoryItem,
  deleteRemoteInventoryItem,
  listRemoteInventoryItems,
  syncRemoteInventoryItems,
  updateRemoteInventoryItem,
} from '../../features/beads/model/inventoryApi';
import { useAuth } from '../../features/auth/model/AuthProvider';
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

const emptyForm: InventoryFormState = {
  brandKey: 'MARD',
  code: '',
  quantity: '',
  lowStockThreshold: '',
  location: '',
  note: '',
  favorite: false,
};

function formatNumber(value: number) {
  return value.toLocaleString();
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BeadInventoryPage() {
  const navigate = useNavigate();
  const { status: authStatus, user, isAuthenticated } = useAuth();
  const [allItems, setAllItems] = useState<BeadInventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('ALL');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [form, setForm] = useState<InventoryFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localInventoryCount, setLocalInventoryCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const brandPalette = useMemo(() => getBrandPalette(form.brandKey), [form.brandKey]);
  const resolvedColor = useMemo(() => getColorByBrandCode(form.brandKey, form.code), [form.brandKey, form.code]);
  const items = useMemo(
    () => filterInventoryItems(allItems, { search, brandKey: brandFilter, favoriteOnly }),
    [allItems, brandFilter, favoriteOnly, search],
  );
  const totalQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockCount = allItems.filter((item) => item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold).length;
  const migrationStorageKey = user ? `dodoudou.inventory.migration.completed.${user.id}` : '';

  const loadItems = useCallback(async () => {
    if (authStatus === 'loading') return;
    setIsLoading(true);
    try {
      setAllItems(isAuthenticated ? await listRemoteInventoryItems() : await listInventoryItems());
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
    setForm(emptyForm);
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const code = form.code.trim();
    const quantity = Number(form.quantity);

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
          ? await createRemoteInventoryItem(input)
          : await saveInventoryItem(input);

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

  const handleDelete = async (item: BeadInventoryItem) => {
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

  const handleSyncLocalInventory = async () => {
    if (!migrationStorageKey || isSyncing) return;

    setIsSyncing(true);
    try {
      const localItems = await listInventoryItems();
      if (!localItems.length) {
        localStorage.setItem(migrationStorageKey, 'true');
        setLocalInventoryCount(0);
        return;
      }

      const response = await syncRemoteInventoryItems(localItems);
      localStorage.setItem(migrationStorageKey, 'true');
      setLocalInventoryCount(0);
      setAllItems(response.items);
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
          <span>色号</span>
          <strong>{formatNumber(allItems.length)}</strong>
        </div>
        <div className="inventory-summary__item">
          <span>总颗数</span>
          <strong>{formatNumber(totalQuantity)}</strong>
        </div>
        <div className="inventory-summary__item">
          <span>低库存</span>
          <strong>{formatNumber(lowStockCount)}</strong>
        </div>
      </section>

      <section className="inventory-editor" aria-label="录入库存">
        <form className="inventory-form" onSubmit={handleSubmit}>
          <div className="inventory-form__topline">
            <div>
              <h2>{editingId ? '修改库存' : '录入色号'}</h2>
              <p>{resolvedColor ? `${getBeadBrandLabel(form.brandKey)} ${resolvedColor.code}` : '选择品牌并输入色号'}</p>
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
            <button type="submit" className="inventory-primary-button" disabled={isSaving || authStatus === 'loading'}>
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
                  <button type="button" onClick={() => handleDelete(item)}>
                    删除
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="inventory-empty">还没有符合条件的库存色号</div>
          )}
        </div>
      </section>
    </main>
  );
}
