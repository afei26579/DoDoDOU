import { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { navItems, type NavItemId } from './navigation';
import { BottomNav } from './components/BottomNav';
import { AccountPage } from '../pages/account/AccountPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { CollectionDetailPage } from '../pages/collection/CollectionDetailPage';
import { CollectionPage } from '../pages/collection/CollectionPage';
import { BeadInventoryPage } from '../pages/beads/BeadInventoryPage';
import { DiscoveryPage } from '../pages/discovery/DiscoveryPage';
import { FocusModePage } from '../pages/workshop/focus/FocusModePage';
import { WorkshopEditorPage } from '../pages/workshop/WorkshopEditorPage';
import { WorkshopHomePage } from '../pages/workshop/WorkshopHomePage';
import { WorkshopShell } from '../pages/workshop/WorkshopShell';
import { defaultCropTransform, defaultWorkshopConfig, defaultWorkshopFlowState } from '../features/workshop/model/defaults';
import { saveWorkshopProject } from '../features/workshop/model/projectStore';
import type { WorkshopFlowState } from '../features/workshop/model/types';

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
  '/workshop/inventory': 'workshop',
  '/collection': 'collection',
  '/collection/detail': 'collection',
};

const hiddenBottomNavPaths = new Set(['/login', '/crop', '/workshop/settings', '/workshop/editor', '/workshop/editor/:projectId', '/workshop/focus', '/workshop/focus/:projectId', '/collection/detail']);

function normalizePath(pathname: string) {
  if (pathname.startsWith('/workshop/create/')) return '/workshop/create';
  if (pathname.startsWith('/workshop/result/')) return '/workshop/result';
  if (pathname.startsWith('/workshop/editor/')) return '/workshop/editor';
  if (pathname.startsWith('/workshop/focus/')) return '/workshop/focus';
  if (pathname.startsWith('/collection/')) return '/collection/detail';
  return pathname;
}

function createProjectId() {
  return String(Date.now());
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [workshopHomeState, setWorkshopHomeState] = useState<WorkshopFlowState>({
    ...defaultWorkshopFlowState,
    config: defaultWorkshopConfig,
  });

  const normalizedPath = useMemo(() => normalizePath(location.pathname), [location.pathname]);
  const activeTab: NavItemId = routeToTab[normalizedPath] ?? 'discovery';
  const shouldHideBottomNav =
    hiddenBottomNavPaths.has(normalizedPath) ||
    location.pathname.startsWith('/workshop/editor/') ||
    location.pathname.startsWith('/workshop/focus/');
  const showBottomNav = !shouldHideBottomNav;
  const isFullScreenRoute =
    normalizedPath === '/login' ||
    normalizedPath.startsWith('/workshop/focus') ||
    normalizedPath.startsWith('/workshop/editor') ||
    normalizedPath === '/collection/detail';

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
      beadingState: 'idle',
      sourceType: 'upload',
      sourceItemId: null,
    });
    navigate(`/workshop/create/${projectId}`);
  };

  return (
    <div className={isFullScreenRoute ? 'app-shell app-shell--fullscreen' : 'app-shell'}>
      <div className={isFullScreenRoute ? 'layered-shell layered-shell--fullscreen' : 'layered-shell'} aria-label="页面容器">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route
            path="/"
            element={
              <DiscoveryPage
                onUploadImage={handleUploadToWorkshop}
                onOpenWorkshop={() => navigate('/workshop')}
                onCreateCanvas={() => navigate(`/workshop/editor/${createProjectId()}`)}
              />
            }
          />
          {/* <Route path="/crop" element={<CropPage onNext={() => navigate('/workshop/settings')} />} /> */}
          <Route
            path="/workshop"
            element={
              <WorkshopHomePage
                flowState={workshopHomeState}
                projectId={null}
                isHydrating={false}
                onUploadImage={() => navigate('/workshop')}
                onConfigChange={(patch) => {
                  setWorkshopHomeState((current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      ...patch,
                    },
                  }));
                }}
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
          <Route path="/workshop/inventory" element={<BeadInventoryPage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/collection/:itemId" element={<CollectionDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {showBottomNav ? (
        <BottomNav items={navItems} activeTab={activeTab} onChange={(tab) => navigate(tab === 'discovery' ? '/' : `/${tab}`)} />
      ) : null}
    </div>
  );
}
