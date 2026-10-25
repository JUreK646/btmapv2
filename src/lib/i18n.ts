export type Lang = 'pl' | 'en';

export const i18n = {
  pl: {
    // Navigation & Views
    map: 'Mapa',
    mapViewTitle: 'Mapa stacji bazowych',
    database: 'Baza stacji',
    databaseViewTitle: 'Baza stacji BTMap',
    stats: 'Statystyki',
    statsViewTitle: 'Statystyki i analityka',
    changelog: 'Changelog',
    guides: 'O bazie stacji',
    admin: 'Panel moderacji',
    breadcrumbParent: 'Stacje bazowe',

    // Connection & status
    connecting: 'Łączenie…',
    noConnection: 'Brak połączenia',
    btmapStationsCount: (n: string) => `${n} stacji w bazie BTMap`,
    locationsTotal: (n: string) => `${n} lokalizacji (BTMap + UKE)`,

    // Language switcher & sidebar
    language: 'Język',
    switchLanguage: 'Przełącz język interfejsu (PL / ENG)',
    account: 'Twoje konto',
    signIn: 'Zaloguj się',
    accountDesc: 'Konto i zgłoszenia',

    // Header actions
    themeDark: 'Włącz ciemny motyw',
    themeLight: 'Włącz jasny motyw',
    expandNav: 'Rozwiń nawigację',
    collapseNav: 'Zwiń nawigację',
    openNav: 'Otwórz nawigację',
    closeNav: 'Zamknij nawigację',

    // Map controls & topbar
    addStation: 'Dodaj stację',
    filters: 'Filtry',
    audit: 'Audyt',
    stationsInArea: 'Stacje w obszarze',
    legend: 'Operatorzy',
    close: 'Zamknij',
    adminRequired: 'Panel wymaga konta administratora',
    backToMap: 'Wróć do mapy',
    skipLink: 'Przejdź do treści',
  },
  en: {
    // Navigation & Views
    map: 'Map',
    mapViewTitle: 'Base Station Map',
    database: 'Station Database',
    databaseViewTitle: 'BTMap Station Database',
    stats: 'Statistics',
    statsViewTitle: 'Statistics & Analytics',
    changelog: 'Changelog',
    guides: 'About Database',
    admin: 'Moderation Panel',
    breadcrumbParent: 'Base Stations',

    // Connection & status
    connecting: 'Connecting…',
    noConnection: 'No connection',
    btmapStationsCount: (n: string) => `${n} stations in BTMap database`,
    locationsTotal: (n: string) => `${n} locations (BTMap + UKE)`,

    // Language switcher & sidebar
    language: 'Language',
    switchLanguage: 'Switch interface language (PL / ENG)',
    account: 'Your account',
    signIn: 'Sign in',
    accountDesc: 'Account & submissions',

    // Header actions
    themeDark: 'Switch to dark theme',
    themeLight: 'Switch to light theme',
    expandNav: 'Expand navigation',
    collapseNav: 'Collapse navigation',
    openNav: 'Open navigation',
    closeNav: 'Close navigation',

    // Map controls & topbar
    addStation: 'Add station',
    filters: 'Filters',
    audit: 'Audit',
    stationsInArea: 'Stations in area',
    legend: 'Operators',
    close: 'Close',
    adminRequired: 'Panel requires administrator privileges',
    backToMap: 'Back to map',
    skipLink: 'Skip to content',
  },
} as const;
