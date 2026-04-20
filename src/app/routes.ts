export type AppRoute =
  | 'discovery'
  | 'crop'
  | 'workshop-settings'
  | 'workshop-preview'
  | 'workshop-editor'
  | 'focus-mode'
  | 'download-settings'
  | 'workshop'
  | 'workshop-create'
  | 'workshop-result'
  | 'collection';

export const routePathMap: Record<AppRoute, string> = {
  discovery: '/',
  crop: '/crop',
  'workshop-settings': '/workshop/settings',
  'workshop-preview': '/workshop/preview',
  'workshop-editor': '/workshop/editor',
  'focus-mode': '/workshop/focus',
  'download-settings': '/workshop/download-settings',
  workshop: '/workshop',
  'workshop-create': '/workshop/create/:projectId',
  'workshop-result': '/workshop/result/:projectId',
  collection: '/collection',
};
