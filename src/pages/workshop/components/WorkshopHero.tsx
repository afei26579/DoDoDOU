type WorkshopHeroProps = {
  projectId: string | null;
};

export function WorkshopHero({ projectId }: WorkshopHeroProps) {
  return (
    <section className="workshop-hero" aria-label="工坊引导">
      <div>
        <h2>灵感在这里碰撞成画</h2>
        
      </div>
      <div className="workshop-hero__avatar" aria-hidden="true">
        <span>☁</span>
      </div>
    </section>
  );
}
