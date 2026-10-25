import {v2Changes} from '../../shared/changelog';
import {useI18n} from '../lib/i18n';

export default function ChangelogView(){
  const {t, lang} = useI18n();
  const locale = lang === 'en' ? 'en-US' : 'pl-PL';
  const format=(value:string,dayOnly=false)=>new Intl.DateTimeFormat(locale,{day:'numeric',month:dayOnly?undefined:'long',year:dayOnly?undefined:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
  return <article className="content-view changelog-view" aria-labelledby="changelog-title">
    <div className="changelog-content">
      <header className="changelog-heading"><h2 id="changelog-title">{t.changelogTitle}</h2><p>{t.changelogSubtitle}</p><div className="changelog-meta"><strong>v{v2Changes.version}</strong><span><time dateTime={v2Changes.from}>{format(v2Changes.from,true)}</time>–<time dateTime={v2Changes.to}>{format(v2Changes.to)}</time></span></div></header>
      <nav className="changelog-index" aria-label={t.changelogNav}>{v2Changes.sections.map(section=><a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav>
      <div className="changelog-sections">{v2Changes.sections.map(section=><section id={section.id} key={section.id} aria-labelledby={`change-${section.id}`}><h3 id={`change-${section.id}`}>{section.title}</h3><ul>{section.items.map(item=><li key={item}>{item}</li>)}</ul></section>)}</div>
      <footer className="changelog-footer">{t.changelogFooter}</footer>
    </div>
  </article>;
}
