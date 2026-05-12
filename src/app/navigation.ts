export type NavItemId = 'discovery' | 'workshop' | 'collection';

export type NavItem = {
  id: NavItemId;
  label: string;
  active: boolean;
  iconSrc?: string;
  activeIconSrc?: string;
};

export const navItems: NavItem[] = [
  { id: 'discovery', label: '发现', active: true, iconSrc: '/assets/icons/home.png', activeIconSrc: '/assets/icons/home.png' },
  { id: 'workshop', label: '工坊', active: false },
  { id: 'collection', label: '画册', active: false },
];
