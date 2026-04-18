import type { NavItem, NavItemId } from '../navigation';

type BottomNavProps = {
  items: NavItem[];
  activeTab: NavItemId;
  onChange: (tab: NavItemId) => void;
};

export function BottomNav({ items, activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="底部导航栏">
      {items.map((item) => {
        const isActive = item.id === activeTab;

        return (
          <button
            key={item.id}
            className={`nav-item ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className={`nav-item__dot ${isActive ? 'is-active' : ''}`} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
