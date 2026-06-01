import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createLoginRedirectPath } from '../../features/auth/model/redirect';
import { fetchGalleryDetail } from '../../features/gallery/model/api';
import type { GalleryItemDetail } from '../../features/gallery/model/types';
import { useCapability } from '../../features/subscription/model/EntitlementProvider';
import { createWorkshopProject, findWorkshopProjectBySource, markWorkshopProjectOpened, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import type { PatternResult } from '../../features/workshop/model/types';
import { waitForLoadingPaint } from '../../lib/imageFile';
import { downloadPatternImage, renderDownloadPatternCanvas } from '../../lib/pattern/download';
import { LoadingOverlay } from '../../shared/ui/LoadingOverlay';

const GO_BACK_ICON = '/assets/system_icons/go_back.png';
const LOGIN_REQUIRED_MESSAGE = '登录后可下载图纸';

function toPatternResult(item: GalleryItemDetail): PatternResult | null {
  const payload = item.pattern?.patternPayload;
  if (!payload) return null;

  return {
    width: item.pattern.width,
    height: item.pattern.height,
    cells: payload.cells,
    palette: payload.palette,
    stats: payload.stats,
  };
}

function createGalleryProjectId(itemId: string) {
  return `gallery-${itemId}`;
}

function fitCanvasToContainer(canvas: HTMLCanvasElement | null, container: HTMLElement | null) {
  if (!canvas || !container || canvas.width <= 0 || canvas.height <= 0) return;

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  if (containerWidth <= 0 || containerHeight <= 0) return;

  const scale = Math.min(1, containerWidth / canvas.width, containerHeight / canvas.height);
  canvas.style.width = `${Math.max(1, Math.floor(canvas.width * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(canvas.height * scale))}px`;
}

export function CollectionDetailPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const canDownload = useCapability('export.download');
  const canExportHd = useCapability('export.hd');
  const canRemoveWatermark = useCapability('export.no_watermark');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasShellRef = useRef<HTMLElement | null>(null);
  const [item, setItem] = useState<GalleryItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!itemId) {
      setError('图纸不存在');
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchGalleryDetail(itemId)
      .then((response) => {
        if (!alive) return;
        setItem(response.item);
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '加载图纸失败');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [itemId]);

  const patternResult = useMemo(() => (item ? toPatternResult(item) : null), [item]);

  useEffect(() => {
    if (!item || !patternResult || !canvasRef.current) return;

    renderDownloadPatternCanvas(canvasRef.current, {
      authorName: item.author.name,
      patternName: item.title,
      showGrid: true,
      gridGap: 10,
      gridColor: '#b8ad9d',
      showSymbol: true,
      showSymbolStats: true,
      addWatermark: false,
      brand: item.pattern.config.brand,
      patternResult,
    });
    requestAnimationFrame(() => fitCanvasToContainer(canvasRef.current, canvasShellRef.current));
  }, [item, patternResult]);

  useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell) return;

    const resizeObserver = new ResizeObserver(() => {
      fitCanvasToContainer(canvasRef.current, shell);
    });
    resizeObserver.observe(shell);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const saveAsWorkshopProject = async () => {
    if (!item || !patternResult) return null;
    const existingProject = await findWorkshopProjectBySource('gallery', item.id);
    if (existingProject) {
      await saveWorkshopProject(existingProject.projectId, {
        sourceType: 'gallery',
        sourceItemId: item.id,
      });
      await markWorkshopProjectOpened(existingProject.projectId);
      return existingProject.projectId;
    }

    const projectId = createGalleryProjectId(item.id);
    await createWorkshopProject(projectId, {
      title: item.title,
      sourceType: 'gallery',
      sourceItemId: item.id,
      uploadedImage: null,
      cropTransform: { scale: 1, x: 0, y: 0, rotate: 0 },
      config: item.pattern.config,
      patternResult,
      viewMode: 'pattern',
      kind: 'pattern',
      status: 'ready',
      beadingState: 'idle',
      lastOpenedAt: new Date().toISOString(),
    });
    return projectId;
  };

  const handleDownload = async () => {
    if (!item || !patternResult || isDownloading) return;
    if (!canDownload) {
      setActionMessage(LOGIN_REQUIRED_MESSAGE);
      return;
    }

    setActionMessage('');
    setIsDownloading(true);
    try {
      await waitForLoadingPaint();
      await downloadPatternImage({
        authorName: item.author.name,
        patternName: item.title,
        showGrid: true,
        gridGap: 10,
        gridColor: '#b8ad9d',
        showSymbol: true,
        showSymbolStats: true,
        addWatermark: !canRemoveWatermark,
        highDefinition: canExportHd,
        brand: item.pattern.config.brand,
        patternResult,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleEdit = async () => {
    const projectId = await saveAsWorkshopProject();
    if (projectId) navigate(`/workshop/editor/${projectId}`);
  };

  const handleFocus = async () => {
    const projectId = await saveAsWorkshopProject();
    if (projectId) navigate(`/workshop/focus/${projectId}`, { state: { returnTo: `/collection/${encodeURIComponent(item?.id ?? itemId ?? '')}` } });
  };

  const isActionDisabled = !item || !patternResult || patternResult.cells.length === 0 || isDownloading;
  const showLoginAction = !canDownload && actionMessage === LOGIN_REQUIRED_MESSAGE;

  return (
    <main className="gallery-detail-page" aria-busy={isDownloading}>
      <LoadingOverlay
        open={isDownloading}
        title="正在生成图纸"
        message="正在整理画册图纸，请稍等..."
      />
      <header className="gallery-detail__topbar">
        <button type="button" className="gallery-detail__back" onClick={() => navigate('/collection')} aria-label="返回画册">
          <img src={GO_BACK_ICON} alt="" />
        </button>
        <div className="gallery-detail__actions" aria-label="图纸操作">
          <button type="button" onClick={handleDownload} disabled={isActionDisabled}>下载</button>
          <button type="button" onClick={handleEdit} disabled={isActionDisabled}>编辑</button>
          <button type="button" onClick={handleFocus} disabled={isActionDisabled}>拼豆</button>
        </div>
      </header>

      {loading ? <div className="gallery-detail__state">正在加载图纸...</div> : null}
      {error ? <div className="gallery-detail__state">{error}</div> : null}
      {actionMessage ? (
        <div className="gallery-detail__state gallery-detail__state--actionable">
          <span>{actionMessage}</span>
          {showLoginAction ? (
            <button type="button" onClick={() => navigate(createLoginRedirectPath(location))}>
              去登录
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && !patternResult ? <div className="gallery-detail__state">这张作品还没有可查看的图纸数据</div> : null}
      {!loading && !error && patternResult && patternResult.cells.length === 0 ? <div className="gallery-detail__state">这张作品缺少图纸格子数据，暂时只能查看封面</div> : null}

      <section ref={canvasShellRef} className="gallery-detail__canvas-shell" aria-label="图纸预览">
        <div className="gallery-detail__canvas-scroll">
          <canvas ref={canvasRef} className="gallery-detail__canvas" />
        </div>
      </section>
    </main>
  );
}
