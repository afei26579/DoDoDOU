type PlaceholderPageProps = {
  title: string;
  subtitle: string;
};

export function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <section className="placeholder-card" aria-label={title}>
      <p className="eyebrow">分层模块架构</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <div className="placeholder-card__grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
