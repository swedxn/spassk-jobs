import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import brandMark from '../assets/brand-mark.webp';
import { normalizeSalaryText, salaryNumber } from './salary.mjs';
import { isNoExperienceVacancy, isNoHigherEducationVacancy, vacancyFacts } from './qualification.mjs';
import { cleanFarpostDescription } from './farpost-clean.mjs';
import { jobDateValue, publicationInfo } from './date.mjs';
import { sanitizeTracker, TRACKER_STATUSES } from './tracker.mjs';
import { sourceLinkLabel } from './source-link.mjs';
import {
  ArrowDown,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  GraduationCap,
  Heart,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sun,
  Upload,
  X,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const BASE = import.meta.env.BASE_URL;
const PAGE_SIZE = 24;
const STORE_KEY = 'spassk-jobs-tracker-v1';
const THEME_KEY = 'spassk-jobs-theme-v1';
const ease = [0.22, 1, 0.36, 1];

const hasSalary = (job) => salaryNumber(job.salary) > 0;
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
};

function friendlyWarnings(warnings = []) {
  const text = warnings.join(' · ');
  if (!text) return [];
  if (/временно недоступ|последн(?:ий|его) успешн|прямая карточка/iu.test(text)) {
    return ['Источник временно недоступен. Проверьте актуальность вакансии.'];
  }
  if (/агрегирован|проверьте источник|проверьте работодателя/iu.test(text)) {
    return ['Проверьте условия и работодателя на сайте источника.'];
  }
  return [...new Set(warnings)].slice(0, 2);
}

function readTracker() {
  try {
    return sanitizeTracker(JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
  } catch {
    return {};
  }
}

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* use the system preference */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function formatUpdate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'время уточняется';
  const day = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Vladivostok',
  }).format(date);
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Vladivostok',
  }).format(date);
  return `${day}, ${time}`;
}

function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function BlurIn({ children, delay = 0, className = '', as = 'div' }) {
  const Component = motion[as] || motion.div;
  const reduced = useReducedMotion();
  return (
    <Component
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24, filter: 'blur(14px)' }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ duration: 0.85, delay, ease }}
    >
      {children}
    </Component>
  );
}

function CountUp({ value }) {
  const [shown, setShown] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return undefined;
    }
    let frame;
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 1200);
      const eased = 1 - Math.pow(1 - progress, 4);
      setShown(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return shown.toLocaleString('ru-RU');
}

function App() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [tracker, setTracker] = useState(readTracker);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ noExperience: false, noHigher: false, favorite: false });
  const [sort, setSort] = useState('fresh');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const searchRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let live = true;
    fetch(`${BASE}data/vacancies.json?ts=${Date.now()}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => live && setPayload(data))
      .catch(() => live && setError('Не удалось загрузить базу. Обновите страницу через минуту.'));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(tracker)); } catch { /* tracker stays usable in memory */ }
  }, [tracker]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#f5f5f7');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* preference remains active for this visit */ }
  }, [theme]);

  const toggleTheme = () => {
    const update = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
    if (!reduced && document.startViewTransition) document.startViewTransition(update);
    else update();
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        document.querySelector('#vacancies')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      }
      if (event.key === 'Escape') setSelected(null);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, [reduced]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', Boolean(selected));
    return () => document.body.classList.remove('modal-open');
  }, [selected]);

  useLayoutEffect(() => {
    if (!payload || reduced) return undefined;
    const context = gsap.context(() => {
      gsap.to('.hero-orb--one', {
        yPercent: 28,
        xPercent: 10,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.2 },
      });
    });
    return () => context.revert();
  }, [payload, reduced]);

  const jobs = payload?.vacancies || [];
  const remoteJobs = payload?.remote || [];
  const meta = payload?.meta || {};
  const stats = meta.stats || {};

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    const result = jobs.filter((job) => {
      const haystack = `${job.name} ${job.employer} ${job.description} ${job.address} ${job.source}`.toLocaleLowerCase('ru-RU');
      return (!needle || haystack.includes(needle))
        && (!filters.noExperience || isNoExperienceVacancy(job))
        && (!filters.noHigher || isNoHigherEducationVacancy(job))
        && (!filters.favorite || tracker[job.id]?.favorite);
    });
    return result.sort((a, b) => {
      if (sort === 'fresh') return jobDateValue(b) - jobDateValue(a);
      if (sort === 'salary') return salaryNumber(b.salary) - salaryNumber(a.salary);
      return jobDateValue(b) - jobDateValue(a);
    });
  }, [jobs, query, filters, sort, tracker]);

  useEffect(() => setVisible(PAGE_SIZE), [query, filters, sort]);

  const patchTracker = (id, patch) => setTracker((current) => ({
    ...current,
    [id]: { ...current[id], ...patch },
  }));

  const toggleFilter = (name) => setFilters((current) => ({ ...current, [name]: !current[name] }));
  const resetFilters = () => {
    setQuery('');
    setFilters({ noExperience: false, noHigher: false, favorite: false });
    setSort('fresh');
  };
  const hasActiveFilters = query || Object.values(filters).some(Boolean);

  if (error) return <ErrorState message={error} />;
  if (!payload) return <LoadingState />;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#vacancies">Перейти к вакансиям</a>
      <Header scrolled={scrolled} theme={theme} onTheme={toggleTheme} onSearch={() => {
        document.querySelector('#vacancies')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
        setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 450);
      }} />

      <main>
        <Hero meta={meta} stats={stats} onStart={() => document.querySelector('#vacancies')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })} />
        <section className="catalog" id="vacancies">
          <div className="section-wrap">
            <BlurIn className="section-heading catalog-heading">
              <div>
                <span className="eyebrow">Все вакансии</span>
                <h2>Найдите свою.</h2>
              </div>
              <p><strong>{filtered.length}</strong> из {jobs.length} вакансий</p>
            </BlurIn>

            <div className={`search-console ${scrolled ? 'is-ready' : ''}`}>
              <label className="search-field" htmlFor="job-search">
                <Search aria-hidden="true" />
                <input
                  id="job-search"
                  ref={searchRef}
                  type="search"
                  aria-label="Поиск вакансий"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Должность, компания или навык"
                  autoComplete="off"
                />
                <kbd>⌘K</kbd>
              </label>
              <button className={`filter-toggle ${filtersOpen ? 'active' : ''}`} type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}>
                <SlidersHorizontal aria-hidden="true" />
                Фильтры
              </button>
              <label className="sort-field">
                <span className="sr-only">Сортировка</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="fresh">Сначала свежие</option>
                  <option value="salary">Выше зарплата</option>
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
            </div>

            <AnimatePresence initial={false}>
              {filtersOpen && (
                <motion.div
                  className="filter-panel"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.4, ease }}
                >
                  <FilterButton active={filters.noExperience} onClick={() => toggleFilter('noExperience')}>Без опыта</FilterButton>
                  <FilterButton active={filters.noHigher} onClick={() => toggleFilter('noHigher')}>Без высшего образования</FilterButton>
                  <FilterButton active={filters.favorite} onClick={() => toggleFilter('favorite')} icon={<Heart />}>Избранное</FilterButton>
                  {hasActiveFilters && <button className="clear-button" type="button" onClick={resetFilters}>Сбросить</button>}
                </motion.div>
              )}
            </AnimatePresence>

            {filtered.length ? (
              <motion.div className="job-list" layout>
                <AnimatePresence mode="popLayout">
                  {filtered.slice(0, visible).map((job, index) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      index={index}
                      showNoHigher={filters.noHigher}
                      favorite={Boolean(tracker[job.id]?.favorite)}
                      onFavorite={() => patchTracker(job.id, { favorite: !tracker[job.id]?.favorite })}
                      onOpen={() => setSelected(job)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="empty-state">
                <Search aria-hidden="true" />
                <h3>Ничего не нашлось.</h3>
                <p>Попробуйте другой запрос или сбросьте фильтры.</p>
                <button className="primary-button" type="button" onClick={resetFilters}>Показать все вакансии</button>
              </div>
            )}

            {visible < filtered.length && (
              <button className="load-more" type="button" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
                Показать ещё {Math.min(PAGE_SIZE, filtered.length - visible)}
                <ArrowDown aria-hidden="true" />
              </button>
            )}
          </div>
        </section>

        {remoteJobs.length > 0 && (
          <RemoteSection
            jobs={remoteJobs}
            tracker={tracker}
            onFavorite={(job) => patchTracker(job.id,{favorite:!tracker[job.id]?.favorite})}
            onOpen={setSelected}
          />
        )}

        <TrustSection meta={meta} stats={stats} tracker={tracker} setTracker={setTracker} />
      </main>

      <Footer />
      <MobileDock onSearch={() => {
        document.querySelector('#vacancies')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
        setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 350);
      }} onFilters={() => {
        setFiltersOpen(true);
        document.querySelector('#vacancies')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      }} onFavorites={() => {
        setFilters((current) => ({ ...current, favorite: true }));
        setFiltersOpen(true);
        document.querySelector('#vacancies')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      }} />

      <AnimatePresence>
        {selected && (
          <JobModal
            job={selected}
            state={tracker[selected.id] || {}}
            onPatch={(patch) => patchTracker(selected.id, patch)}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RemoteSection({jobs,tracker,onFavorite,onOpen}) {
  return (
    <section className="remote-catalog" id="remote-vacancies">
      <div className="section-wrap">
        <BlurIn className="section-heading">
          <div><span className="eyebrow">Отдельно от города</span><h2>Полностью удалённая работа.</h2></div>
          <p><strong>{jobs.length}</strong> проверенных удалённых вакансий</p>
        </BlurIn>
        <div className="remote-notice"><CircleAlert aria-hidden="true" /><span>Эти вакансии не входят в основной городской список. Перед откликом проверьте работодателя и условия.</span></div>
        <div className="job-list">
          {jobs.map((job,index)=><JobRow key={job.id} job={job} index={index} favorite={Boolean(tracker[job.id]?.favorite)} onFavorite={()=>onFavorite(job)} onOpen={()=>onOpen(job)} />)}
        </div>
      </div>
    </section>
  );
}

function Header({ scrolled, theme, onTheme, onSearch }) {
  return (
    <header className={`site-header ${scrolled ? 'site-header--scrolled' : ''}`}>
      <nav className="nav-wrap" aria-label="Главная навигация">
        <a className="brand" href="#top" aria-label="Работа в Спасске-Дальнем — на главную">
          <img className="brand-mark" src={brandMark} alt="" />
          <span>Работа в Спасске</span>
        </a>
        <div className="nav-links">
          <a href="#vacancies">Вакансии</a>
          <a href="#data">О данных</a>
        </div>
        <div className="nav-actions">
          <button className="theme-toggle" type="button" onClick={onTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme} initial={{ opacity: 0, rotate: -35, scale: 0.7 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 35, scale: 0.7 }} transition={{ duration: 0.22 }}>
                {theme === 'dark' ? <Sun /> : <Moon />}
              </motion.span>
            </AnimatePresence>
          </button>
          <button className="nav-action" type="button" onClick={onSearch}>Найти работу</button>
        </div>
      </nav>
    </header>
  );
}

function Hero({ meta, stats, onStart }) {
  const reduced = useReducedMotion();
  const onMove = (event) => {
    if (reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--pointer-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    event.currentTarget.style.setProperty('--pointer-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };

  return (
    <section className="hero" id="top" onPointerMove={onMove}>
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-orb hero-orb--one" aria-hidden="true" />
      <div className="hero-orb hero-orb--two" aria-hidden="true" />
      <div className="hero-content">
        <motion.div className="live-pill" initial={reduced ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <span className="live-orbit" aria-hidden="true"><i /></span>
          Свежие вакансии каждые 3 часа
        </motion.div>
        <motion.h1 initial={reduced ? false : { opacity: 0, y: 40, filter: 'blur(18px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 1.1, ease }}>
          Работа в<br /><span>Спасске-Дальнем.</span>
        </motion.h1>
        <motion.div className="hero-actions" initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.36, ease }}>
          <button className="primary-button" type="button" onClick={onStart}>Смотреть вакансии</button>
        </motion.div>

        <motion.div className="hero-product" initial={reduced ? false : { opacity: 0, y: 70, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.25, delay: 0.25, ease }}>
          <div className="summary-main">
            <span>Сейчас доступно</span>
            <strong><CountUp value={stats.active || 0} /></strong>
            <p>вакансий в Спасске-Дальнем</p>
          </div>
          <div className="summary-facts">
            <div><strong><CountUp value={stats.noExperience || 0} /></strong><span>без опыта</span></div>
            <div><strong><CountUp value={stats.noHigherEducation || 0} /></strong><span>без высшего</span></div>
            <div className="summary-update"><RefreshCw /><span>Обновлено<br /><strong>{formatUpdate(meta.generatedAt)}</strong></span></div>
          </div>
        </motion.div>
      </div>
      <a className="scroll-cue" href="#vacancies" aria-label="Прокрутить к вакансиям"><span /><ArrowDown /></a>
    </section>
  );
}

function FilterButton({ active, onClick, children, icon }) {
  return (
    <button className={`filter-chip ${active ? 'active' : ''}`} type="button" aria-pressed={active} onClick={onClick}>
      {icon}
      {active && <Check aria-hidden="true" />}
      {children}
    </button>
  );
}

function JobRow({ job, index, favorite, onFavorite, onOpen, showNoHigher = false }) {
  const reduced = useReducedMotion();
  const publication = publicationInfo(job);
  return (
    <motion.article
      className="job-row"
      layout
      initial={reduced ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.45, delay: Math.min(index, 7) * 0.035, ease }}
    >
      <button className="job-row__main" type="button" onClick={onOpen}>
        <div className="job-row__title">
          {(isNoExperienceVacancy(job) || (showNoHigher && isNoHigherEducationVacancy(job)) || job.isNew) && (
            <div className="job-badges">
              {isNoExperienceVacancy(job) && <span className="badge">Без опыта</span>}
              {showNoHigher && isNoHigherEducationVacancy(job) && <span className="badge">Без высшего</span>}
              {job.isNew && <span className="badge badge--new">Новая</span>}
            </div>
          )}
          <h3>{job.name}</h3>
          <p>{job.employer}</p>
          <span className="job-date"><CalendarDays /> {publication.short}</span>
        </div>
        <div className="job-row__meta">
          <strong>{normalizeSalaryText(job.salary)}</strong>
          <span><MapPin /> {job.address || job.city}</span>
        </div>
      </button>
      <button className={`favorite-button ${favorite ? 'active' : ''}`} type="button" onClick={onFavorite} aria-label={favorite ? 'Убрать из избранного' : 'Добавить в избранное'}>
        <Heart />
      </button>
    </motion.article>
  );
}

function JobModal({ job, state, onPatch, onClose }) {
  const reduced = useReducedMotion();
  const publication = publicationInfo(job);
  const facts = vacancyFacts(job);
  const warnings = friendlyWarnings(job.warnings);
  const dialogRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    const closeButton = dialogRef.current?.querySelector('[data-modal-close]');
    closeButton?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  const keepFocusInside = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll('a[href], button:not([disabled]), select, textarea, input')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <button className="modal-backdrop" type="button" onClick={onClose} aria-label="Закрыть карточку" />
      <motion.section
        ref={dialogRef}
        className="job-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-modal-title"
        onKeyDown={keepFocusInside}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 42, scale: 0.94, filter: 'blur(12px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.97, filter: 'blur(8px)' }}
        transition={{ duration: 0.52, ease }}
      >
        <button className="modal-close" data-modal-close type="button" onClick={onClose} aria-label="Закрыть"><X /></button>
        <div className="modal-body">
          <div className="modal-hero">
            <h2 id="job-modal-title">{job.name}</h2>
            <p className="modal-employer">{job.employer}</p>
            <div className="modal-salary">{normalizeSalaryText(job.salary)}</div>
          </div>

          <div className="detail-grid">
            <Detail icon={<MapPin />} label="Место" value={job.address || job.city} />
            <Detail icon={<BriefcaseBusiness />} label="Опыт" value={job.experience} />
            <Detail icon={<GraduationCap />} label="Образование" value={job.education} />
            <Detail icon={<Clock3 />} label="График" value={job.schedule} />
            <Detail icon={<CalendarDays />} label={publication.label} value={publication.full} wide />
          </div>

          <div className="modal-section">
            <h3>О вакансии</h3>
            <p className="description">{job.source === 'FarPost' ? cleanFarpostDescription(job.description, job.name) : job.description}</p>
          </div>

          {facts.length > 0 && (
            <div className="modal-section">
              <h3>Коротко об условиях</h3>
              <ul className="reason-list">{facts.map((fact) => <li key={fact}><Check /> {fact}</li>)}</ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="warning-box"><CircleAlert /> <span>{warnings.join(' ')}</span></div>
          )}

          <div className="modal-section tracker-section">
            <div className="tracker-title">
              <h3>Мой отклик</h3>
              <button className={`modal-favorite ${state.favorite ? 'active' : ''}`} type="button" onClick={() => onPatch({ favorite: !state.favorite })}>
                <Heart /> {state.favorite ? 'В избранном' : 'В избранное'}
              </button>
            </div>
            <label>
              <span>Статус</span>
              <select value={state.status || TRACKER_STATUSES[0]} onChange={(event) => onPatch({ status: event.target.value })}>
                {TRACKER_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label>
              <span>Заметка</span>
              <textarea value={state.note || ''} onChange={(event) => onPatch({ note: event.target.value })} placeholder="Например: позвонить после 15:00" rows="4" />
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <div className="modal-source"><span>Источник</span><strong title={job.source}>{job.source}</strong></div>
          <a className="primary-button" href={safeUrl(job.url)} target="_blank" rel="noreferrer">{sourceLinkLabel(job)} <ArrowUpRight /></a>
        </div>
      </motion.section>
    </motion.div>
  );
}

function Detail({ icon, label, value, wide = false }) {
  return <div className={`detail-item ${wide ? 'detail-item--wide' : ''}`}>{icon}<div><span>{label}</span><strong>{value || 'Не указано'}</strong></div></div>;
}

function TrustSection({ meta, stats, tracker, setTracker }) {
  const inputRef = useRef(null);
  const sourceRuns = meta.sourceRuns || [];
  const importTracker = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setTracker(sanitizeTracker(parsed.tracker || parsed));
    } catch {
      window.alert('Не удалось прочитать JSON трекера');
    }
    event.target.value = '';
  };

  return (
    <section className="trust" id="data">
      <div className="section-wrap">
        <BlurIn className="section-heading">
          <div>
            <span className="eyebrow">Прозрачность</span>
            <h2>Ничего не спрятано.</h2>
          </div>
          <p>Данные, ограничения источников и ваши личные статусы остаются под контролем.</p>
        </BlurIn>

        <div className="trust-grid">
          <BlurIn className="trust-card trust-card--wide" delay={0.05}>
            <div className="trust-icon"><Database /></div>
            <span>Состояние базы</span>
            <strong>{stats.active || 0} активных вакансий</strong>
            <p>{meta.updateStatus}</p>
            <div className="source-chips">
              {sourceRuns.map((source) => (
                <span key={source.name} className={source.status === 'ok' ? 'ok' : 'blocked'}>
                  <i /> {source.name}
                </span>
              ))}
            </div>
          </BlurIn>

          <BlurIn className="trust-card" delay={0.1}>
            <div className="trust-icon"><BadgeCheck /></div>
            <span>Фильтрация</span>
            <strong>{(meta.rejected?.otherCity || 0) + (meta.rejected?.imprecise || 0)} скрыто</strong>
            <p>Другие города и объявления без точного места не попадают в основной список.</p>
          </BlurIn>

          <BlurIn className="trust-card" delay={0.15}>
            <div className="trust-icon"><RefreshCw /></div>
            <span>Обновление</span>
            <strong>Каждые 3 часа</strong>
            <p>GitHub Actions бесплатно обновляет данные и заново публикует сайт.</p>
          </BlurIn>

          <BlurIn className="trust-card trust-card--downloads" delay={0.2}>
            <div className="trust-icon"><Download /></div>
            <span>Экспорт данных</span>
            <strong>Заберите всё.</strong>
            <div className="download-links">
              <a href={`${BASE}data/vacancies.json`} download><FileJson /> JSON</a>
              <a href={`${BASE}data/vacancies.csv`} download><FileSpreadsheet /> CSV</a>
            </div>
          </BlurIn>

          <BlurIn className="trust-card trust-card--tracker" delay={0.25}>
            <div className="trust-icon"><Heart /></div>
            <span>Личный трекер</span>
            <strong>Только в браузере.</strong>
            <p>Избранное, статусы и заметки никуда не отправляются.</p>
            <div className="tracker-actions">
              <button type="button" onClick={() => downloadJson({ exportedAt: new Date().toISOString(), tracker }, 'spassk-jobs-tracker.json')}><Download /> Экспорт</button>
              <button type="button" onClick={() => inputRef.current?.click()}><Upload /> Импорт</button>
              <input ref={inputRef} type="file" accept="application/json" onChange={importTracker} hidden />
            </div>
          </BlurIn>
        </div>
      </div>
    </section>
  );
}

function MobileDock({ onSearch, onFilters, onFavorites }) {
  return (
    <nav className="mobile-dock" aria-label="Быстрые действия">
      <button type="button" onClick={onSearch}><Search /><span>Поиск</span></button>
      <button type="button" onClick={onFilters}><SlidersHorizontal /><span>Фильтры</span></button>
      <button type="button" onClick={onFavorites}><Heart /><span>Избранное</span></button>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="section-wrap footer-inner">
        <div><img className="brand-mark" src={brandMark} alt="" /><strong>Работа в Спасске</strong></div>
        <p>Бесплатный некоммерческий агрегатор вакансий Спасска-Дальнего.</p>
        <a href="#top">Наверх <ArrowUpRight /></a>
      </div>
    </footer>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <div className="loading-mark"><img src={brandMark} alt="Работа в Спасске" /></div>
      <div className="loading-line"><span /></div>
      <p>Обновляем вакансии</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="error-state">
      <CircleAlert />
      <h1>Данные временно недоступны.</h1>
      <p>{message}</p>
      <button className="primary-button" type="button" onClick={() => location.reload()}>Повторить</button>
    </div>
  );
}

export default App;
