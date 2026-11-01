import { useState } from 'react';
import { releases } from '../../shared/changelog';
import { useI18n } from '../lib/i18n';

export default function ChangelogView() {
  const { t, lang } = useI18n();
  const [selectedVer, setSelectedVer] = useState<string>(releases[0].version);
  const activeRelease = releases.find((r) => r.version === selectedVer) || releases[0];
  const isPl = lang === 'pl';
  const locale = lang === 'en' ? 'en-US' : 'pl-PL';

  const format = (value: string, dayOnly = false) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: dayOnly ? undefined : 'long',
      year: dayOnly ? undefined : 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));

  return (
    <article className="content-view changelog-view" aria-labelledby="changelog-title">
      <div className="changelog-content">
        <div className="changelog-top-bar">
          <div className="changelog-version-switcher" role="tablist" aria-label={isPl ? 'Wybór wersji' : 'Version selector'}>
            {releases.map((rel) => (
              <button
                key={rel.version}
                type="button"
                role="tab"
                aria-selected={rel.version === activeRelease.version}
                className={`changelog-version-btn ${rel.version === activeRelease.version ? 'active' : ''}`}
                onClick={() => setSelectedVer(rel.version)}
              >
                <span className="changelog-ver-tag">v{rel.version}</span>
                {rel.isLatest && <span className="changelog-latest-badge">{isPl ? 'Najnowsza' : 'Latest'}</span>}
              </button>
            ))}
          </div>
        </div>

        <header className="changelog-heading">
          <h2 id="changelog-title">{activeRelease.title}</h2>
          <p>{activeRelease.summary}</p>
          <div className="changelog-meta">
            <strong>v{activeRelease.version}</strong>
            <span>
              <time dateTime={activeRelease.from}>{format(activeRelease.from, true)}</time>
              {' – '}
              <time dateTime={activeRelease.to}>{format(activeRelease.to)}</time>
            </span>
            {activeRelease.isLatest && (
              <span className="changelog-status-pill">
                {isPl ? 'Aktualna wersja produkcyjna' : 'Current production version'}
              </span>
            )}
          </div>
        </header>

        <nav className="changelog-index" aria-label={t.changelogNav}>
          {activeRelease.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>

        <div className="changelog-sections">
          {activeRelease.sections.map((section) => (
            <section id={section.id} key={section.id} aria-labelledby={`change-${section.id}`}>
              <h3 id={`change-${section.id}`}>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="changelog-footer">{t.changelogFooter}</footer>
      </div>
    </article>
  );
}
