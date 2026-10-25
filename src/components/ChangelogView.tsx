import {v2Changes} from '../../shared/changelog';

export default function ChangelogView(){
  const format=(value:string,dayOnly=false)=>new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:dayOnly?undefined:'long',year:dayOnly?undefined:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
  return <article className="content-view changelog-view" aria-labelledby="changelog-title">
    <div className="changelog-content">
      <header className="changelog-heading"><h2 id="changelog-title">Co zmieniło się w v2</h2><p>Nowy interfejs, baza stacji BTMap i rzeczywiste dane SI2PEM. Wszystkie dotychczasowe zmiany w jednym miejscu.</p><div className="changelog-meta"><strong>v{v2Changes.version}</strong><span><time dateTime={v2Changes.from}>{format(v2Changes.from,true)}</time>–<time dateTime={v2Changes.to}>{format(v2Changes.to)}</time></span></div></header>
      <nav className="changelog-index" aria-label="Tematy zmian">{v2Changes.sections.map(section=><a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
      <div className="changelog-sections">{v2Changes.sections.map(section=><section id={section.id} key={section.id} aria-labelledby={`change-${section.id}`}><h3 id={`change-${section.id}`}>{section.title}</h3><ul>{section.items.map(item=><li key={item}>{item}</li>)}</ul></section>)}</div>
      <footer className="changelog-footer">Historia zmian BTMap v2. Kolejne aktualizacje pojawią się w tym miejscu.</footer>
    </div>
  </article>;
}
