export type AppRoute =
  | 'login'
  | 'account'
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
  | 'bead-inventory'
  | 'collection';

export const routePathMap: Record<AppRoute, string> = {
  login: '/login',
  account: '/account',
  discovery: '/discovery',
  crop: '/crop',
  'workshop-settings': '/workshop/settings',
  'workshop-preview': '/workshop/preview',
  'workshop-editor': '/workshop/editor',
  'focus-mode': '/workshop/focus',
  'download-settings': '/workshop/download-settings',
  workshop: '/workshop',
  'workshop-create': '/workshop/create/:projectId',
  'workshop-result': '/workshop/result/:projectId',
  'bead-inventory': '/workshop/inventory',
  collection: '/collection',
};
