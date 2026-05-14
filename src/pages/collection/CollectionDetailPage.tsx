import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchGalleryDetail } from '../../features/gallery/model/api';
import type { GalleryItemDetail } from '../../features/gallery/model/types';
import { findWorkshopProjectBySource, markWorkshopProjectOpened, saveWorkshopProject } from '../../features/workshop/model/projectStore';
import type { PatternResult } from '../../features/workshop/model/types';
import { downloadPatternImage, renderDownloadPatternCanvas } from '../../lib/pattern/download';

const GO_BACK_ICON = '/assets/system_icons/go_back.png';

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

export function CollectionDetailPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [item, setItem] = useState<GalleryItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [item, patternResult]);

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
    await saveWorkshopProject(projectId, {
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

  const handleDownload = () => {
    if (!item || !patternResult) return;
    void downloadPatternImage({
      authorName: item.author.name,
      patternName: item.title,
      showGrid: true,
      gridGap: 10,
      gridColor: '#b8ad9d',
      showSymbol: true,
      showSymbolStats: true,
      addWatermark: false,
      highDefinition: true,
      brand: item.pattern.config.brand,
      patternResult,
    });
  };

  const handleEdit = async () => {
    const projectId = await saveAsWorkshopProject();
    if (projectId) navigate(`/workshop/editor/${projectId}`);
  };

  const handleFocus = async () => {
    const projectId = await saveAsWorkshopProject();
    if (projectId) navigate(`/workshop/focus/${projectId}`, { state: { returnTo: `/collection/${encodeURIComponent(item?.id ?? itemId ?? '')}` } });
  };

  const isActionDisabled = !item || !patternResult || patternResult.cells.length === 0;

  return (
    <main className="gallery-detail-page">
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
      {!loading && !error && !patternResult ? <div className="gallery-detail__state">这张作品还没有可查看的图纸数据</div> : null}
      {!loading && !error && patternResult && patternResult.cells.length === 0 ? <div className="gallery-detail__state">这张作品缺少图纸格子数据，暂时只能查看封面</div> : null}

      <section className="gallery-detail__canvas-shell" aria-label="图纸预览">
        <div className="gallery-detail__canvas-scroll">
          <canvas ref={canvasRef} className="gallery-detail__canvas" />
        </div>
      </section>
    </main>
  );
}
