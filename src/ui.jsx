import React, { useEffect, useId, useRef, useState } from 'react';
import { Archive, BookMarked, Bookmark, Calculator, Check, ChevronDown, ChevronRight, CookingPot, ExternalLink, FlaskConical, Gem, Globe2, Hammer, HardDrive, Home, ListTree, Minus, Plus, Search, Shield, Swords, X } from 'lucide-react';
import { integer, MAX_CRAFTS, MAX_STOCK } from '../shared/planner.js';
import { fold } from './data.js';
import { locales, regionName } from './i18n.js';

export const professions = ['blacksmithing', 'armorsmithing', 'handicrafting', 'alchemy', 'cooking'];
export const professionIcons = { blacksmithing: Swords, armorsmithing: Shield, handicrafting: Gem, alchemy: FlaskConical, cooking: CookingPot };
export const pages = { calculator: Calculator, lines: ListTree, inventory: Archive, saved: Bookmark };

export function Coin({ large = false }) {
  return <span aria-hidden="true" className={'kinah-coin' + (large ? ' large' : '')}><i /></span>;
}

export function ItemIcon({ item, large = false }) {
  const [broken, setBroken] = useState('');
  return <span className={'item-icon grade-' + (item?.grade || 'common') + (large ? ' large' : '')}>
    {item?.icon && broken !== item.icon
      ? <img src={item.icon} onError={() => setBroken(item.icon)} alt="" loading={large ? 'eager' : 'lazy'} />
      : <Gem size={large ? 29 : 17} aria-hidden="true" />}
  </span>;
}

export function NumberField({ value, onChange, label, maximum = MAX_STOCK, minimum = 0, disabled = false, className = '' }) {
  const [draft, setDraft] = useState(null);
  return <input className={'number-field ' + className} type="number" inputMode="numeric" pattern="[0-9]*"
    step="1" min={minimum} max={maximum} value={draft ?? value} aria-label={label} disabled={disabled}
    onFocus={event => { setDraft(String(value)); event.target.select(); }}
    onKeyDown={event => {
      if (['-', '+', 'e', 'E', '.', ','].includes(event.key)) event.preventDefault();
      if (event.key === 'Enter') event.currentTarget.blur();
    }}
    onChange={event => {
      const raw = event.target.value;
      const next = integer(raw, maximum, minimum);
      setDraft(raw === '' ? '' : String(next));
      if (next !== value) onChange(next);
    }}
    onBlur={() => setDraft(null)} />;
}

export function Stepper({ count, setCount, t }) {
  return <div className="stepper">
    <button type="button" aria-label={t('less')} disabled={count <= 1} onClick={() => setCount(integer(count - 1, MAX_CRAFTS, 1))}><Minus size={15}/></button>
    <NumberField value={count} minimum={1} maximum={MAX_CRAFTS} onChange={setCount} label={t('crafts')}/>
    <button type="button" aria-label={t('more')} disabled={count >= MAX_CRAFTS} onClick={() => setCount(count + 1)}><Plus size={15}/></button>
  </div>;
}

export function Modal({ title, onClose, children, t, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const before = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = before;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={'modal ' + className} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); closeRef.current(); }}
    onClick={event => { if (event.target === ref.current) { const b = ref.current.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) onClose(); } }}>
    <div className="modal-head"><h2 id={titleId}>{title}</h2><button autoFocus className="icon-button" aria-label={t('close')} onClick={onClose}><X size={19}/></button></div>
    {children}
  </dialog>;
}

export function SearchField({ value, setValue, label, t }) {
  return <div className="search-field">
    <Search size={17} aria-hidden="true" />
    <input type="search" value={value} placeholder={label} aria-label={label} onChange={event => setValue(event.target.value)}/>
    {value && <button className="search-clear" type="button" aria-label={t('clear')} onClick={() => setValue('')}><X size={15}/></button>}
  </div>;
}

function Brand() {
  return <span className="brand"><img src="/forge-mark.svg" alt="" width="42" height="42"/><span>Atreia <em>Forge</em></span></span>;
}

export function Navigation({ page, go, t, numSaved, onDevice, questUrl }) {
  const links = compact => Object.entries(pages).map(([key, Icon]) =>
    <button key={key} className={'nav-link' + (page === key ? ' active' : '')} aria-label={t(key)} title={t(key)} aria-current={page === key ? 'page' : undefined} onClick={() => go(key)}>
      <Icon size={20} strokeWidth={1.65}/><span>{t(key === 'lines' && compact ? 'linesShort' : key)}</span>
      {key === 'saved' && numSaved > 0 && <span className="nav-count">{numSaved}</span>}
    </button>);
  return <>
    <aside className="sidebar">
      <button className="brand-link" aria-label="Atreia Forge" onClick={() => go('calculator')}><Brand/></button>
      <div className="side-group"><div className="section-label">{t('workshop')}</div><nav aria-label={t('navigation')}>{links(false)}</nav></div>
      <div className="side-bottom">
        <div className="resources">
          <div className="section-label">{t('market')}</div>
          <a href={questUrl} target="_blank" rel="noreferrer"><BookMarked size={16}/> Questlog <ExternalLink size={13}/></a>
          <a href="https://aion2.exchange/" target="_blank" rel="noreferrer"><Globe2 size={16}/> Aion2 Exchange <ExternalLink size={13}/></a>
        </div>
        <button className="profile-link" onClick={onDevice} aria-label={t('deviceData')} title={t('deviceData')}><span className="avatar"><HardDrive size={21}/></span>
          <span><strong>{t('deviceData')}</strong></span>
          <ChevronRight size={15} className="profile-chevron"/>
        </button>
      </div>
    </aside>
    <nav className="mobile-nav" aria-label={t('navigation')}>{links(true)}</nav>
  </>;
}

export function Topbar({ page, t, server, locale, onServer, onLanguage, onDevice, onHome }) {
  const region = regionName(server.region, locale.code);
  return <header className="topbar">
    <div className="crumb"><Home size={16}/><ChevronRight size={13}/><span>{t('workshop')}</span><ChevronRight size={13}/><b>{t(page)}</b></div>
    <button className="mobile-brand" aria-label="Atreia Forge" onClick={onHome}><Brand/></button>
    <div className="top-actions">
      <button className="top-pill" onClick={onServer} aria-label={[t('server'), server.name, region].join(' · ')}><span className="server-glyph"><Globe2 size={15}/></span><span className="server-location"><span>{server.name}</span><span className="server-region">{region}</span></span><ChevronDown size={14}/></button>
      <button className="language-button" onClick={onLanguage} aria-label={t('language') + ' · ' + locale.label}><Globe2 size={16}/><span>{locale.short}</span><ChevronDown size={14}/></button>
      <button onClick={onDevice} className="mobile-account icon-button" aria-label={t('deviceData')}><HardDrive size={20}/></button>
    </div>
  </header>;
}

export function Hero({ page, t }) {
  const heading = page === 'calculator' ? 'planner' : page;
  const desc = { calculator: 'description', inventory: 'inventoryDesc', saved: 'savedDesc', lines: 'linesDesc' }[page];
  return <section className={'hero' + (page !== 'calculator' ? ' compact' : '')}>
    <div className="hero-inner"><div className="game-tag"><span className="title-diamond"/>AION 2</div>
      <h1>{t(heading)}</h1><p>{t(desc)}</p>
    </div>
  </section>;
}

export function Professions({ selected, counts, onSelect, t, format }) {
  const heading = useId();
  return <section className="professions" aria-labelledby={heading}>
    <h2 className="small-heading" id={heading}>{t('professions')}</h2>
    <div className="profession-strip" role="group" aria-labelledby={heading}>
      {professions.map(key => {
        const Icon = professionIcons[key] || Hammer;
        return <button className={'profession ' + key + (selected === key ? ' chosen' : '')} aria-pressed={selected === key} key={key} onClick={() => onSelect(key)}>
          <span className="profession-icon"><Icon size={23} strokeWidth={1.65}/></span>
          <span><strong>{t(key)}</strong><small>{format(counts[key] || 0)} {t('recipes').toLocaleLowerCase()}</small></span>
        </button>;
      })}
    </div>
  </section>;
}

export function FactionSelect({ server, value, onChange, t }) {
  return <label className="form-label">{t('faction')}<span className="form-select"><select value={value} onChange={e => onChange(e.target.value)}>
    <option value="server">{server.name} · {t(server.faction.toLowerCase())}</option><option value="all">{t('bothFactions')}</option><option value="elyos">{t('elyos')}</option><option value="asmodian">{t('asmodian')}</option>
  </select><ChevronDown size={15}/></span></label>;
}

export function SelectionDialog({ kind, onClose, t, server, servers, language, onServer, onLanguage }) {
  const [query, setQuery] = useState('');
  const isServer = kind === 'server';
  const title = t(isServer ? 'selectServer' : 'language');
  const words = fold(query).split(/\s+/);
  const regionCodes = new Set(servers.map(s => s.region.toLowerCase()));
  const choices = isServer ? servers.filter(s => {
    const searchable = fold([s.name, '#' + s.id, regionName(s.region, language), s.region, t(s.faction.toLowerCase()), s.faction].join(' '));
    return words.every(word => regionCodes.has(word) ? s.region.toLowerCase() === word : searchable.includes(word));
  }) : locales;
  return <Modal title={title} onClose={onClose} t={t}>
      {isServer && <SearchField value={query} setValue={setQuery} label={t('searchServer')} t={t}/>}
      <div className="choice-list">{choices.map(choice => {
        const id = isServer ? choice.id : choice.code;
        const selected = id === (isServer ? server.id : language);
        return <button className={'choice-row' + (selected ? ' chosen' : '')} key={id} aria-pressed={selected}
          onClick={() => { if (isServer) onServer(id); else onLanguage(id); onClose(); }}>
          <span>{isServer ? choice.name : choice.label}{isServer && <small>{regionName(choice.region, language)} · {t(choice.faction.toLowerCase())} · #{choice.id}</small>}</span>
          {selected && <Check size={17}/>}
        </button>;
      })}{!choices.length && <p className="empty-text">{t('noResults')}</p>}</div>
  </Modal>;
}
