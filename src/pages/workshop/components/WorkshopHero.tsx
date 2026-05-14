type WorkshopHeroProps = {
  projectId: string | null;
};

export function WorkshopHero({ projectId }: WorkshopHeroProps) {
  return (
    <section className="page-hero" aria-label="工坊引导">
      <h2>灵感在这里碰撞成画</h2>
    </section>
  );
}
