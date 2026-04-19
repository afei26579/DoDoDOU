const parameterTags = [
  { id: 'size', icon: '◫', label: '尺寸' },
  { id: 'brand', icon: '◉', label: '品牌' },
  { id: 'style', icon: '✦', label: '风格' },
  { id: 'palette', icon: '◌', label: '容色' },
] as const;

export type ParameterTagId = (typeof parameterTags)[number]['id'];

type WorkshopParameterTabsProps = {
  activeTag: ParameterTagId;
  onChange: (tag: ParameterTagId) => void;
};

export function WorkshopParameterTabs({ activeTag, onChange }: WorkshopParameterTabsProps) {
  return (
    <div className="workshop-tags" role="tablist" aria-label="参数标签">
      {parameterTags.map((tag) => (
        <button key={tag.id} className={`workshop-tag ${activeTag === tag.id ? 'is-active' : ''}`} type="button" onClick={() => onChange(tag.id)}>
          <span className="workshop-tag__icon" aria-hidden="true">{tag.icon}</span>
          <span className="workshop-tag__label">{tag.label}</span>
        </button>
      ))}
    </div>
  );
}
