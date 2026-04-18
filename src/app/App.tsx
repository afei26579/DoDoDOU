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
import { WorkshopPage } from '../pages/workshop/WorkshopPage';
import { WorkshopPreviewPage } from '../pages/workshop/WorkshopPreviewPage';
import { WorkshopSettingsPage } from '../pages/workshop/WorkshopSettingsPage';
import { useWorkshopFlow } from '../features/workshop/model/useWorkshopFlow';
import { generatePatternFromImage } from '../lib/pattern/generator';

const routeToTab: Partial<Record<string, NavItemId>> = {
  '/': 'discovery',
  '/workshop': 'workshop',
  '/workshop/create': 'workshop',
  '/workshop/settings': 'workshop',
  '/workshop/preview': 'workshop',
  '/workshop/editor': 'workshop',
  '/workshop/focus': 'workshop',
  '/workshop/download-settings': 'workshop',
  '/collection': 'collection',
};

const hiddenBottomNavPaths = new Set([
  '/crop',
  '/workshop/settings',
  '/workshop/editor',
  '/workshop/focus',
]);

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, actions } = useWorkshopFlow();

  const normalizedPath = useMemo(() => {
    if (location.pathname.startsWith('/workshop/create/')) {
      return '/workshop/create';
    }

    return location.pathname;
  }, [location.pathname]);

  const activeTab: NavItemId = routeToTab[normalizedPath] ?? 'discovery';
  const showDownloadSettings = location.pathname === '/workshop/download-settings';
  const showBottomNav = !hiddenBottomNavPaths.has(location.pathname);

  const handleOpenWorkshopCreate = () => {
    navigate(`/workshop/create/${Date.now()}`);
  };

  const handleGeneratePattern = async () => {
    if (!state.uploadedImage) return;

    actions.setGenerating(true);
    try {
      const result = await generatePatternFromImage({
        imageUrl: state.uploadedImage.dataUrl,
        config: state.config,
      });
      actions.setPatternResult(result);
    } finally {
      actions.setGenerating(false);
    }
  };

  const handleTabChange = (tab: NavItemId) => {
    navigate(tab === 'discovery' ? '/' : `/${tab}`);
  };

  return (
    <div className="app-shell">
      <div className="layered-shell" aria-label="页面容器">
        <Routes>
          <Route
            path="/"
            element={
              <DiscoveryPage
                onUploadImage={(image) => {
                  actions.setUploadedImage(image);
                  handleOpenWorkshopCreate();
                }}
                onOpenWorkshop={() => navigate('/workshop')}
              />
            }
          />
          <Route path="/crop" element={<CropPage onNext={() => navigate('/workshop/settings')} />} />
          <Route
            path="/workshop"
            element={
              <WorkshopPage
                flowState={state}
                onConfigChange={actions.setConfig}
                onCropTransformChange={actions.setCropTransform}
                onGeneratePattern={handleGeneratePattern}
                onSwitchViewMode={actions.setViewMode}
              />
            }
          />
          <Route
            path="/workshop/create/:projectId"
            element={
              <WorkshopPage
                flowState={state}
                onConfigChange={actions.setConfig}
                onCropTransformChange={actions.setCropTransform}
                onGeneratePattern={handleGeneratePattern}
                onSwitchViewMode={actions.setViewMode}
              />
            }
          />
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

      {showBottomNav ? <BottomNav items={navItems} activeTab={activeTab} onChange={handleTabChange} /> : null}

      {showDownloadSettings ? <DownloadSettingsModal onClose={() => navigate('/workshop/preview')} /> : null}
    </div>
  );
}
