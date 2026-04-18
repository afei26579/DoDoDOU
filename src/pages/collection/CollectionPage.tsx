const collectionFilters = ['全部', '最新', '最热', '我的'] as const;

const collectionCards = [
  { title: '森林小屋', status: '已完成', tone: 'green', desc: '24×24 · 8 色' },
  { title: '草莓兔兔', status: '草稿', tone: 'rose', desc: '18×18 · 6 色' },
  { title: '猫咪下午茶', status: '进行中', tone: 'mauve', desc: '32×32 · 10 色' },
  { title: '海边日落', status: '已完成', tone: 'amber', desc: '28×28 · 9 色' },
  { title: '春日花束', status: '草稿', tone: 'mint', desc: '20×20 · 7 色' },
  { title: '星光兔子', status: '进行中', tone: 'mauve', desc: '32×32 · 10 色' },
] as const;

export function CollectionPage() {
  return (
    <main className="collection-page">
      <section className="collection-hero" aria-label="画册问候">
        <h2>记录每一份创作的温暖</h2>
        <div className="collection-hero__avatar" aria-hidden="true">
          <span>☁</span>
        </div>
      </section>

      <section className="collection-filters" aria-label="作品筛选">
        {collectionFilters.map((filter, index) => (
          <button
            key={filter}
            className={`filter-chip ${index === 0 ? 'is-active' : ''}`}
          >
            {filter}
          </button>
        ))}
      </section>

      <section className="collection-masonry" aria-label="作品列表">
        <div className="collection-masonry__column">
          {collectionCards.filter((_, index) => index % 2 === 0).map((card) => (
            <article key={card.title} className={`collection-card collection-card--${card.tone}`}>
              <div className="collection-card__media collection-card__media--tall" aria-hidden="true">
                <span className="collection-card__status">{card.status}</span>
                <div className="collection-card__art">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="collection-card__body">
                <strong>{card.title}</strong>
                <p>{card.desc}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="collection-masonry__column">
          {collectionCards.filter((_, index) => index % 2 === 1).map((card, index) => (
            <article key={card.title} className={`collection-card collection-card--${card.tone}`}>
              <div className={`collection-card__media ${index === 0 ? 'collection-card__media--short' : 'collection-card__media--tall'}`} aria-hidden="true">
                <span className="collection-card__status">{card.status}</span>
                <div className="collection-card__art">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="collection-card__body">
                <strong>{card.title}</strong>
                <p>{card.desc}</p>
              </div>
              {index === 0 ? <span className="collection-card__badge">草稿中</span> : null}
            </article>
          ))}
        </div>
      </section>

      <button className="collection-fab" aria-label="新建作品">
        ＋
      </button>
    </main>
  );
}
