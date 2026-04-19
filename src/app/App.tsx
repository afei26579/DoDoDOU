import { useMemo, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { navItems, type NavItemId } from './navigation';
import { BottomNav } from './components/BottomNav';
import { CollectionPage } from '../pages/collection/CollectionPage';
import { CropPage } from '../pages/crop/CropPage';
import { DiscoveryPage } from '../pages/discovery/DiscoveryPage';
import { DownloadSettingsModal } from '../pages/workshop/DownloadSettingsModal';
import { FocusModePage } from '../pages/workshop/FocusModePage';
import { WorkshopEditorPage } from '../pages/workshop/WorkshopEditorPage';
import { WorkshopPage } from '../pages/workshop/WorkshopPage';
import { WorkshopPreviewPage } from '../pages/workshop/WorkshopPreviewPage';
import { WorkshopSettingsPage } from '../pages/workshop/WorkshopSettingsPage';
import { defaultCropTransform, defaultWorkshopConfig } from '../features/workshop/model/defaults';
import { saveWorkshopProject } from '../features/workshop/model/projectStore';
import { useWorkshopFlow } from '../features/workshop/model/useWorkshopFlow';
import { generatePatternFromImage } from '../lib/pattern/generator';

const routeToTab: Partial<Record<string, NavItemId>> = {
  '/': 'discovery',
  '/workshop': 'workshop',
  '/workshop/create': 'workshop',
  '/workshop/result': 'workshop',
  '/workshop/settings': 'workshop',
  '/workshop/preview': 'workshop',
  '/workshop/editor': 'workshop',
  '/workshop/focus': 'workshop',
  '/workshop/download-settings': 'workshop',
  '/collection': 'collection',
};

const hiddenBottomNavPaths = new Set(['/crop', '/workshop/settings', '/workshop/editor', '/workshop/focus']);

function normalizePath(pathname: string) {
  if (pathname.startsWith('/workshop/create/')) return '/workshop/create';
  if (pathname.startsWith('/workshop/result/')) return '/workshop/result';
  return pathname;
}

function createProjectId() {
  return String(Date.now());
}

function WorkshopRoute({ mode }: { mode: 'create' | 'result' }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { state, actions, isHydrating } = useWorkshopFlow(projectId ?? null);

  const handleGeneratePattern = async () => {
    if (!state.uploadedImage || !projectId) return;

    actions.setGenerating(true);
    try {
      const result = await generatePatternFromImage({
        imageUrl: state.uploadedImage.dataUrl,
        config: state.config,
      });
      actions.setPatternResult(result);
      await saveWorkshopProject(projectId, {
        uploadedImage: state.uploadedImage,
        cropTransform: state.cropTransform,
        config: state.config,
        patternResult: result,
        viewMode: 'pattern',
      });
      navigate(`/workshop/result/${projectId}`);
    } finally {
      actions.setGenerating(false);
    }
  };

  const handleUploadSelected = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const nextProjectId = projectId ?? createProjectId();
    await saveWorkshopProject(nextProjectId, {
      uploadedImage: {
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
      },
      cropTransform: defaultCropTransform,
      config: defaultWorkshopConfig,
      patternResult: null,
      viewMode: 'image',
    });

    navigate(`/workshop/create/${nextProjectId}`);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          await handleUploadSelected(file);
        }}
      />
      {isHydrating ? (
        <main className="workshop-page">
          <section className="workshop-canvas card-surface" aria-label="加载中">
            <div className="workshop-canvas__frame" style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}>
              <div className="workshop-panel__hint">正在恢复项目数据...</div>
            </div>
          </section>
        </main>
      ) : (
        <WorkshopPage
          flowState={state}
          projectId={projectId ?? null}
          mode={mode}
          onConfigChange={actions.setConfig}
          onCropTransformChange={actions.setCropTransform}
          onGeneratePattern={handleGeneratePattern}
          onSwitchViewMode={actions.setViewMode}
          onBackToOriginal={() => navigate(`/workshop/create/${projectId ?? createProjectId()}`)}
          onRegenerate={handleGeneratePattern}
          onRemoveBackground={() => {}}
          onUploadImage={() => fileInputRef.current?.click()}
        />
      )}
    </>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const normalizedPath = useMemo(() => normalizePath(location.pathname), [location.pathname]);
  const activeTab: NavItemId = routeToTab[normalizedPath] ?? 'discovery';
  const showDownloadSettings = location.pathname === '/workshop/download-settings';
  const showBottomNav = !hiddenBottomNavPaths.has(location.pathname);

  const createProjectAndNavigate = (uploadedImage: {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
  }) => {
    const projectId = createProjectId();

    try {
      saveWorkshopProject(projectId, {
        uploadedImage,
        cropTransform: defaultCropTransform,
        config: defaultWorkshopConfig,
        patternResult: null,
        viewMode: 'image',
      });
    } catch (error) {
      console.warn('project storage write failed, fallback to session state', error);
    }

    navigate(`/workshop/create/${projectId}`);
  };

  return (
    <div className="app-shell">
      <div className="layered-shell" aria-label="页面容器">
        <Routes>
          <Route
            path="/"
            element={
              <DiscoveryPage
                onUploadImage={(image) => createProjectAndNavigate(image)}
                onOpenWorkshop={() => navigate('/workshop')}
              />
            }
          />
          <Route path="/crop" element={<CropPage onNext={() => navigate('/workshop/settings')} />} />
          <Route path="/workshop" element={<WorkshopRoute mode="create" />} />
          <Route path="/workshop/create/:projectId" element={<WorkshopRoute mode="create" />} />
          <Route path="/workshop/result/:projectId" element={<WorkshopRoute mode="result" />} />
          <Route
            path="/workshop/settings"
            element={<WorkshopSettingsPage onGeneratePreview={() => navigate('/workshop/preview')} />}
          />
          <Route
            path="/workshop/preview"
            element={
              <WorkshopPreviewPage
                onOpenDownloadSettings={() => navigate('/workshop/download-settings')}
                onOpenEditor={() => navigate('/workshop/editor')}
                onOpenFocusMode={() => navigate('/workshop/focus')}
              />
            }
          />
          <Route
            path="/workshop/download-settings"
            element={
              <WorkshopPreviewPage
                onOpenDownloadSettings={() => navigate('/workshop/download-settings')}
                onOpenEditor={() => navigate('/workshop/editor')}
                onOpenFocusMode={() => navigate('/workshop/focus')}
              />
            }
          />
          <Route path="/workshop/editor" element={<WorkshopEditorPage />} />
          <Route path="/workshop/focus" element={<FocusModePage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {showBottomNav ? (
        <BottomNav items={navItems} activeTab={activeTab} onChange={(tab) => navigate(tab === 'discovery' ? '/' : `/${tab}`)} />
      ) : null}
      {showDownloadSettings ? <DownloadSettingsModal onClose={() => navigate('/workshop/preview')} /> : null}
    </div>
  );
}
