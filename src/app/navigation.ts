export type NavItemId = 'discovery' | 'workshop' | 'collection';

export type NavItem = {
  id: NavItemId;
  label: string;
  active: boolean;
};

export const navItems: NavItem[] = [
  { id: 'discovery', label: '发现', active: true },
  { id: 'workshop', label: '工坊', active: false },
  { id: 'collection', label: '画册', active: false },
];
