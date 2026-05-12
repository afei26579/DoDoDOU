export type NavItemId = 'discovery' | 'workshop' | 'collection';

export type NavItem = {
  id: NavItemId;
  label: string;
  active: boolean;
  iconSrc?: string;
  activeIconSrc?: string;
};

export const navItems: NavItem[] = [
  { id: 'discovery', label: '发现', active: true, iconSrc: '/assets/icons/home.svg', activeIconSrc: '/assets/icons/home_active.svg' },
  { id: 'workshop', label: '工坊', active: false, iconSrc: '/assets/icons/workshop_inactive.svg', activeIconSrc: '/assets/icons/workshop_active.svg' },
  { id: 'collection', label: '画册', active: false, iconSrc: '/assets/icons/album_inactive.svg', activeIconSrc: '/assets/icons/album_active.svg' },
];
