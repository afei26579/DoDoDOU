import { useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { navItems, type NavItemId } from './navigation';
import { BottomNav } from './components/BottomNav';
import { CollectionPage } from '../pages/collection/CollectionPage';
import { CropPage } from '../pages/crop/CropPage';
import { DiscoveryPage } from '../pages/discovery/DiscoveryPage';
import { DownloadSettingsModal } from '../pages/workshop/DownloadSettingsModal';
import { FocusModePage } from '../pages/workshop/FocusModePage';
import { WorkshopEditorPage } from '../pages/workshop/WorkshopEditorPage';
import { WorkshopPreviewPage } from '../pages/workshop/WorkshopPreviewPage';
import { WorkshopSettingsPage } from '../pages/workshop/WorkshopSettingsPage';
import { WorkshopHomePage } from '../pages/workshop/WorkshopHomePage';
import { WorkshopShell } from '../pages/workshop/WorkshopShell';
import { defaultCropTransform, defaultWorkshopConfig } from '../features/workshop/model/defaults';
import { saveWorkshopProject } from '../features/workshop/model/projectStore';

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

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const normalizedPath = useMemo(() => normalizePath(location.pathname), [location.pathname]);
  const activeTab: NavItemId = routeToTab[normalizedPath] ?? 'discovery';
  const showDownloadSettings = location.pathname === '/workshop/download-settings';
  const showBottomNav = !hiddenBottomNavPaths.has(location.pathname);

  const handleUploadToWorkshop = async (image: { name: string; type: string; size: number; dataUrl: string }) => {
    const projectId = createProjectId();
    await saveWorkshopProject(projectId, {
      uploadedImage: image,
      cropTransform: defaultCropTransform,
      config: defaultWorkshopConfig,
      patternResult: null,
      viewMode: 'image',
    });
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
                onUploadImage={handleUploadToWorkshop}
                onOpenWorkshop={() => navigate('/workshop')}
              />
            }
          />
          <Route path="/crop" element={<CropPage onNext={() => navigate('/workshop/settings')} />} />
          <Route
            path="/workshop"
            element={
              <WorkshopHomePage
                flowState={{
                  uploadedImage: null,
                  cropTransform: { scale: 1, x: 0, y: 0 },
                  config: { canvasSize: 100, brand: 'MARD', style: '动漫', colorMergeThreshold: 30 },
                  patternResult: null,
                  viewMode: 'image',
                  isGenerating: false,
                }}
                projectId={null}
                isHydrating={false}
                onUploadImage={() => navigate('/workshop')}
                onConfigChange={() => {}}
                onCropTransformChange={() => {}}
                onGeneratePattern={() => {}}
                onSwitchViewMode={() => {}}
              />
            }
          />
          <Route path="/workshop/create/:projectId" element={<WorkshopShell mode="create" />} />
          <Route path="/workshop/result/:projectId" element={<WorkshopShell mode="result" />} />
          <Route path="/workshop/settings" element={<WorkshopSettingsPage onGeneratePreview={() => navigate('/workshop/preview')} />} />
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
