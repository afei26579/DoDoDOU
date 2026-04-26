import { useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { navItems, type NavItemId } from './navigation';
import { BottomNav } from './components/BottomNav';
import { CollectionPage } from '../pages/collection/CollectionPage';
import { DiscoveryPage } from '../pages/discovery/DiscoveryPage';
import { FocusModePage } from '../pages/workshop/FocusModePage';
import { WorkshopEditorPage } from '../pages/workshop/WorkshopEditorPage';
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
  '/workshop/editor/:projectId': 'workshop',
  '/workshop/focus': 'workshop',
  '/workshop/focus/:projectId': 'workshop',
  '/collection': 'collection',
};

const hiddenBottomNavPaths = new Set(['/crop', '/workshop/settings', '/workshop/editor', '/workshop/editor/:projectId', '/workshop/focus', '/workshop/focus/:projectId']);

function normalizePath(pathname: string) {
  if (pathname.startsWith('/workshop/create/')) return '/workshop/create';
  if (pathname.startsWith('/workshop/result/')) return '/workshop/result';
  if (pathname.startsWith('/workshop/editor/')) return '/workshop/editor';
  if (pathname.startsWith('/workshop/focus/')) return '/workshop/focus';
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
  const shouldHideBottomNav =
    hiddenBottomNavPaths.has(normalizedPath) ||
    location.pathname.startsWith('/workshop/editor/') ||
    location.pathname.startsWith('/workshop/focus/');
  const showBottomNav = !shouldHideBottomNav;
  const isFullScreenRoute = normalizedPath.startsWith('/workshop/focus') || normalizedPath.startsWith('/workshop/editor');

  const handleUploadToWorkshop = async (image: { name: string; type: string; size: number; dataUrl: string }) => {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const previewImage = new Image();
      previewImage.onload = () => resolve({ width: previewImage.naturalWidth || previewImage.width, height: previewImage.naturalHeight || previewImage.height });
      previewImage.onerror = () => reject(new Error('图片加载失败'));
      previewImage.src = image.dataUrl;
    });

    const projectId = createProjectId();
    await saveWorkshopProject(projectId, {
      uploadedImage: {
        ...image,
        ...dimensions,
      },
      cropTransform: defaultCropTransform,
      config: defaultWorkshopConfig,
      patternResult: null,
      viewMode: 'image',
    });
    navigate(`/workshop/create/${projectId}`);
  };

  return (
    <div className={isFullScreenRoute ? 'app-shell app-shell--fullscreen' : 'app-shell'}>
      <div className={isFullScreenRoute ? 'layered-shell layered-shell--fullscreen' : 'layered-shell'} aria-label="页面容器">
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
          {/* <Route path="/crop" element={<CropPage onNext={() => navigate('/workshop/settings')} />} /> */}
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
          {/* <Route path="/workshop/settings" element={<WorkshopSettingsPage onGeneratePreview={() => navigate('/workshop/preview')} />} /> */}
          {/* <Route
            path="/workshop/preview"
            element={
              <WorkshopPreviewPage
                onOpenEditor={() => navigate('/workshop/editor')}
                onOpenFocusMode={() => navigate('/workshop/focus')}
                brand="MARD"
                patternResult={null}
              />
            }
          /> */}

          <Route path="/workshop/editor/:projectId" element={<WorkshopEditorPage />} />
          <Route path="/workshop/focus/:projectId" element={<FocusModePage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {showBottomNav ? (
        <BottomNav items={navItems} activeTab={activeTab} onChange={(tab) => navigate(tab === 'discovery' ? '/' : `/${tab}`)} />
      ) : null}
    </div>
  );
}
