/* main.js браузера*/
'use strict';

/* ================= Database Controller (IndexedDB) ================= */
class DatabaseController {
  constructor(name='BrowserDB', version=1) {
    this.name = name;
    this.version = version;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      
      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  async get(key, defaultValue=null) {
    await this.initPromise;
    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);
        
        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.value : defaultValue);
        };
        
        request.onerror = () => resolve(defaultValue);
      } catch (e) {
        resolve(defaultValue);
      }
    });
  }

  async set(key, value) {
    await this.initPromise;
    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ key, value });
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }
}

const db = new DatabaseController();

/* ================= Утилиты ================= */
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc=encodeURIComponent;
const uid=()=>Math.random().toString(36).slice(2,10);
const trunc=(s,n=26)=>s.length>n?s.slice(0,n-1)+'…':s;
const E=window.electronAPI||null;


/* ================= Иконки ================= */
const I={
  back:'<svg class="ic" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  fwd:'<svg class="ic" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  reload:'<svg class="ic" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>',
  search:'<svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.2-4.2"/></svg>',
  searchin:'<svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5l-4.2-4.2M11 8.2v5.6M8.2 11h5.6"/></svg>',
  clock:'<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  close:'<svg class="ic" viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  plus:'<svg class="ic" viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></svg>',
  lock:'<svg class="ic" viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  globe:'<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5Z"/></svg>',
  grid:'<svg class="ic" viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="5.6" height="5.6" rx="1.4"/><rect x="13.9" y="4.5" width="5.6" height="5.6" rx="1.4"/><rect x="4.5" y="13.9" width="5.6" height="5.6" rx="1.4"/><rect x="13.9" y="13.9" width="5.6" height="5.6" rx="1.4"/></svg>',
  tab:'<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="7" width="13" height="12" rx="2"/><path d="M8 7V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1"/></svg>',
  window:'<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16"/></svg>',
  incog:'<svg class="ic" viewBox="0 0 24 24"><circle cx="7.5" cy="14.5" r="3.2"/><circle cx="16.5" cy="14.5" r="3.2"/><path d="M10.7 14c.9-.8 1.7-.8 2.6 0M3.5 9.5 5 5h14l1.5 4.5"/></svg>',
  split:'<svg class="ic" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/></svg>',
  link:'<svg class="ic" viewBox="0 0 24 24"><path d="M9.5 14.5 14.5 9.5M8 11l-2.4 2.4a3.5 3.5 0 0 0 5 5L13 16M16 13l2.4-2.4a3.5 3.5 0 0 0-5-5L11 8"/></svg>',
  dl:'<svg class="ic" viewBox="0 0 24 24"><path d="M12 4v11m0 0 4.2-4.2M12 15l-4.2-4.2M5 19.5h14"/></svg>',
  folder:'<svg class="ic" viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4.2l2 2.3h6.8a2 2 0 0 1 2 2v8.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/></svg>',
  bookmark:'<svg class="ic" viewBox="0 0 24 24"><path d="M6.5 4.5h11V20l-5.5-3.6L6.5 20Z"/></svg>',
  copy:'<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5.5 14.5A1.5 1.5 0 0 1 4 13V5.5A1.5 1.5 0 0 1 5.5 4H13a1.5 1.5 0 0 1 1.5 1.5"/></svg>',
  print:'<svg class="ic" viewBox="0 0 24 24"><path d="M7 8V4.5h10V8"/><rect x="4.5" y="8" width="15" height="8" rx="1.5"/><rect x="7" y="13.5" width="10" height="6" rx="1"/></svg>',
  code:'<svg class="ic" viewBox="0 0 24 24"><path d="M9 7.5 4.5 12 9 16.5M15 7.5 19.5 12 15 16.5"/></svg>',
  pin:'<svg class="ic" viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 2v2H7v-2l3-2Z"/><path d="M12 14v6"/></svg>'
};

/* ================= Данные ================= */
const ENGINES={
  google:{name:'Google',color:'#4285f4',search:q=>'https://www.google.com/search?igu=1&q='+enc(q),match:/google\./},
  yandex:{name:'Яндекс',color:'#fc3f1d',search:q=>'https://yandex.ru/search/?text='+enc(q),match:/yandex\./},
  duck:{name:'DuckDuckGo',color:'#de5833',search:q=>'https://duckduckgo.com/?q='+enc(q),match:/duckduckgo\./}
};
const KNOWN={
  'wikipedia.org':{l:'W',c:'#606a76'},'youtube.com':{l:'▶',c:'#e02f2f'},'github.com':{l:'G',c:'#24292f'},
  'habr.com':{l:'H',c:'#4a90d9'},'kinopoisk.ru':{l:'К',c:'#ff6600'},'telegram.org':{l:'T',c:'#2aabee'},
  'google.com':{l:'G',c:'#4285f4'},'yandex.ru':{l:'Я',c:'#fc3f1d'},'duckduckgo.com':{l:'D',c:'#de5833'},
  'mail.ru':{l:'@',c:'#005ff9'},'gosuslugi.ru':{l:'Г',c:'#0d4cd3'}
};
const NEWS=[
  {cat:'Технологии',img:'https://image.qwenlm.ai/public_source/4426591b-ca7d-4a93-9fef-1afc103b0577/19ce8ca0a-d3aa-4bc8-9fbd-47f26f41614e.png',t:'Нейрочипы нового поколения обещают ускорить обучение ИИ вдвое',src:'Код Дня',time:'2 ч назад',q:'нейрочипы нового поколения'},
  {cat:'Наука',img:'https://image.qwenlm.ai/public_source/4426591b-ca7d-4a93-9fef-1afc103b0577/19053e52c-da0b-4470-99fd-ee2e680d2c08.png',t:'Телескопы зафиксировали редкую вспышку в ядре галактики M87',src:'Вестник науки',time:'4 ч назад',q:'вспышка в ядре галактики M87'},
  {cat:'Экономика',img:'https://image.qwenlm.ai/public_source/4426591b-ca7d-4a93-9fef-1afc103b0577/1307a88d1-f82d-4c8b-aea4-2d41e048eef4.png',t:'Рынки отреагировали ростом на снижение ключевой ставки',src:'Финансы сегодня',time:'5 ч назад',q:'снижение ключевой ставки рынки'},
  {cat:'Культура',img:'https://image.qwenlm.ai/public_source/4426591b-ca7d-4a93-9fef-1afc103b0577/16676e42e-ad62-471e-92d5-1f8899b929d0.png',t:'Киноархив завершил оцифровку двухсот редких плёнок',src:'КиноОбзор',time:'7 ч назад',q:'оцифровка редких киноплёнок'},
  {cat:'Спорт',img:'https://image.qwenlm.ai/public_source/4426591b-ca7d-4a93-9fef-1afc103b0577/16c8c73f8-1000-4268-8799-9083dfd47327.png',t:'Лига объявила расписание решающих матчей сезона',src:'СпортЭкспресс',time:'9 ч назад',q:'расписание решающих матчей сезона'}
];
const CORPUS=[['погода в москве',10],['погода',7],['курс доллара',9],['курс евро',4],['перевод с английского на русский',9],['карты',8],['новости',8],['youtube',9],['калькулятор',7],['рецепт пиццы',6],['рецепт борща',5],['как научиться программировать',6],['javascript учебник',5],['python курсы',5],['фильмы 2025',6],['сериалы смотреть',5],['гороскоп на сегодня',4],['спорт новости',5],['футбол',6],['шахматы онлайн',4],['нейросети',6],['chat gpt',7],['искусственный интеллект новости',5],['квантовые компьютеры',3],['космос новости',4],['инвестиции',5],['криптовалюта биткоин',5],['акции',4],['инфляция',3],['вакансии',6],['удалённая работа',4],['авиабилеты',5],['ржд билеты',4],['доставка еды',6],['маркетплейсы',5],['скидки',4],['смартфоны новинки',5],['ноутбуки',4],['наушники',3],['музыка новинки',4],['подкасты',3],['книги',4],['аудиокниги',3],['тренировки дома',4],['медитация',3],['психология',4],['путешествия',5],['сочи отели',3],['туры в турцию',4],['виза',3],['игры',6],['киберспорт',4],['как пройти собеседование',4]];
const FOLDERS={downloads:{name:'Загрузки',path:'C:\\Users\\User\\Downloads'},documents:{name:'Документы',path:'C:\\Users\\User\\Documents'},desktop:{name:'Рабочий стол',path:'C:\\Users\\User\\Desktop'},custom:{name:'Другая папка',path:''}};
const TESTFILES=[['отчёт_2025.pdf',8.4e6],['фото_отпуск.zip',4.6e7],['презентация.pptx',1.2e7],['трек_2025.mp3',7.3e6],['датасет.csv',2.2e7]];

/* ================= Состояние ================= */
let settings={engine:'google',folder:'downloads',customPath:'',ask:false};
let pins=null;
let visits=null;
let historyQ=null;
let bookmarks=[];
let downloads=[];
let tabs=[],activeId=null,ctxState=null,codeCopyData='',dropIndex=-1;

async function loadState() {
  settings = Object.assign({engine:'google',folder:'downloads',customPath:'',ask:false}, await db.get('settings', {}));
  
  pins = await db.get('pins', null);
  if (!pins) {
    pins = [
      {name:'Википедия',url:'https://ru.wikipedia.org'},
      {name:'YouTube',url:'https://www.youtube.com'},
      {name:'GitHub',url:'https://github.com'},
      {name:'Хабр',url:'https://habr.com'},
      {name:'Кинопоиск',url:'https://www.kinopoisk.ru'},
      {name:'Telegram',url:'https://web.telegram.org'}
    ];
    await db.set('pins', pins);
  }
  
  visits = await db.get('visits', []);
  historyQ = await db.get('searchHistory', []);
  
  bookmarks = await db.get('bookmarks', []);
  downloads = (await db.get('downloads', [])).map(d => Object.assign({}, d, {state:'done'}));
  
  const savedTabs = await db.get('tabs', []);
  if (savedTabs.length > 0) {
    tabs = savedTabs.map(t => ({...t, frame: null}));
    activeId = await db.get('activeId', tabs[0]?.id || null);
  }
}

/* ================= DOM ================= */
const tabsEl=$('#tabs'),stripLeft=$('#stripLeft'),stripRight=$('#stripRight'),tabstrip=$('#tabstrip');
const backBtn=$('#backBtn'),fwdBtn=$('#fwdBtn'),reloadBtn=$('#reloadBtn');
const addrbox=$('#addrbox'),addr=$('#addr'),addrIcon=$('#addrIcon');
const dlBtn=$('#dlBtn'),dlRing=$('#dlRing'),ringProg=$('#ringProg'),dlPanel=$('#dlPanel'),dlList=$('#dlList'),dlEmpty=$('#dlEmpty'),dlFoot=$('#dlFoot'),dlSettingsBox=$('#dlSettingsBox'),dlFolderSel=$('#dlFolderSel'),dlFolderCustom=$('#dlFolderCustom'),dlAsk=$('#dlAsk');
const contentEl=$('#content'),homeView=$('#homeView'),engineRow=$('#engineRow'),searchShell=$('#searchShell'),searchInput=$('#searchInput'),searchClear=$('#searchClear'),drop=$('#searchDrop'),pinsGrid=$('#pinsGrid'),recentGrid=$('#recentGrid'),newsGrid=$('#newsGrid');
const splitPane=$('#splitPane'),splitFrame=$('#splitFrame'),splitUrlEl=$('#splitUrl');
const ctxMenu=$('#ctxMenu'),ctxSub=$('#ctxSub'),translateSub=$('#translateSub');
const translateLangSearch=$('#translateLangSearch'),translateLangList=$('#translateLangList');
const translatePanel=$('#translatePanel'),tpHeader=$('#tpHeader'),tpOriginal=$('#tpOriginal'),tpResult=$('#tpResult');
const drawer=$('#codeDrawer'),codePath=$('#codePath'),codePre=$('#codePre');
const modal=$('#modal'),addForm=$('#addForm'),siteUrl=$('#siteUrl'),siteName=$('#siteName');
const toastEl=$('#toast');

let currentTranslateText = '';
let isDraggingPanel = false, dragOffsetX = 0, dragOffsetY = 0;

/* ================= Хелперы ================= */
function hostOf(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return String(u)}}
function shortenUrl(u){if(!u||u.startsWith('browser://'))return '';try{const x=new URL(u);let s=x.hostname.replace(/^www\./,'')+x.pathname.replace(/\/$/,'');if(x.search)s+=x.search.length>24?x.search.slice(0,24)+'…':x.search;return s.length>42?s.slice(0,41)+'…':s}catch(e){return u}}
function known(host){for(const k in KNOWN){if(host===k||host.endsWith('.'+k))return KNOWN[k]}const pal=['#e5484d','#f76b15','#e2a336','#46a758','#0e9384','#0b7fea','#3e63dd','#8e4ec6','#d6409f'];let h=0;for(const ch of host)h=(h*31+ch.charCodeAt(0))>>>0;return{l:(host[0]||'?').toUpperCase(),c:pal[h%pal.length]}}
function favHtml(url){if(!url||url.startsWith('browser://'))return '<span class="fav" style="background:#8a929c">'+I.grid+'</span>';const k=known(hostOf(url));return '<span class="fav" style="background:'+k.c+'">'+esc(k.l)+'</span>'}
function normalizeUrl(v){v=(v||'').trim();if(!v||/\s/.test(v))return null;if(/^https?:\/\//i.test(v))return v;if(/^[a-z0-9а-я-]+(\.[a-z0-9а-я-]+)+(:\d+)?(\/\S*)?$/i.test(v))return 'https://'+v;return null}
function fmtBytes(n){if(n<1024)return n+' Б';if(n<1048576)return Math.round(n/1024)+' КБ';if(n<1073741824)return (n/1048576).toFixed(1)+' МБ';return (n/1073741824).toFixed(1)+' ГБ'}
let toastTm=null;function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(toastTm);toastTm=setTimeout(()=>toastEl.classList.remove('show'),2400)}
function copyText(t,msg){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(()=>toast(msg||'Скопировано')).catch(()=>fbCopy(t,msg))}else fbCopy(t,msg)}
function fbCopy(t,msg){const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast(msg||'Скопировано')}catch(e){}ta.remove()}

/* ================= Вкладки ================= */
const active=()=>tabs.find(t=>t.id===activeId);
function makeTab(url,title){
  const u=url||'browser://home';
  const isHome = u==='browser://home';
  return {
    id:uid(),
    url:u,
    view:isHome?'home':'web',
    title:title||(isHome?'Новая вкладка':hostOf(u)),
    stack:[{url:u,title:title||null}],
    idx:isHome?-1:0,
    frame:null,
    splitUrl:null
  };
}
function addTab(url,opts){opts=opts||{};const t=makeTab(url,opts.title);tabs.splice(opts.index==null?tabs.length:opts.index,0,t);if(t.view==='web'){ensureFrame(t);t.frame.src=t.url;recordVisit(t.url,t.title)}activate(t.id);return t}
function addTabAfter(url,title){addTab(url,{index:tabs.findIndex(t=>t.id===activeId)+1,title})}
function ensureFrame(tab){
  if(tab.frame) return tab.frame;
  // ИСПРАВЛЕНИЕ: Используем <webview> вместо <iframe>. 
  // Webview игнорирует X-Frame-Options и CSP frame-ancestors (сайты вроде OpenRouter теперь открываются).
  // Также webview пробрасывает контекстное меню (ПКМ) независимо от Same-Origin Policy.
  const f = document.createElement('webview');
  f.className = 'page-frame';
  f.setAttribute('src', tab.url);
  f.setAttribute('allowpopups', '');
  // persist:browser сохраняет cookies, localStorage и сессию между перезапусками приложения
  f.setAttribute('partition', 'persist:browser');
  f.setAttribute('nodeintegration', 'false');
  f.setAttribute('contextIsolation', 'true');
  
  f.addEventListener('did-finish-load', () => {
    try {
      const title = f.getTitle();
      if (title) {
        tab.title = title;
        if (tab.id === activeId) renderTabs();
      }
    } catch (e) {}
  });
  
  f.addEventListener('page-title-updated', (e) => {
    tab.title = e.title;
    if (tab.id === activeId) renderTabs();
  });
  
  f.addEventListener('did-navigate', () => {
    try {
      tab.url = f.getURL();
      if (tab.id === activeId) {
        updateAddr();
        updateNav();
      }
    } catch (e) {}
  });
  
  f.addEventListener('did-navigate-in-page', () => {
    try {
      tab.url = f.getURL();
      if (tab.id === activeId) {
        updateAddr();
        updateNav();
      }
    } catch (e) {}
  });

  f.addEventListener('did-fail-load', (e) => {
    // -3 = ABORTED (нормально при прерывании загрузки пользователем или редиректе)
    if (e.errorCode !== -3 && e.errorCode !== 0) {
      console.warn('[webview] Load failed:', e.errorDescription, 'Code:', e.errorCode);
    }
  });

  f.addEventListener('context-menu', (e) => {
    e.preventDefault();
    const p = e.params || {};
    const sel = p.selectionText || '';
    const href = p.linkURL || null;

    // Если нет выделенного текста или ссылки, закрываем меню
    if (!sel && !href) {
      closeCtx();
      return;
    }

    const r = f.getBoundingClientRect();
    let cx = (typeof p.x === 'number' && !isNaN(p.x)) ? p.x : (r.width / 2);
    let cy = (typeof p.y === 'number' && !isNaN(p.y)) ? p.y : (r.height / 2);
    openCtx({
      x: cx + r.left,
      y: cy + r.top,
      sel: sel,
      href: href,
      el: null,
      linkEl: href ? f : null,
      cardEl: null
    });
  });

  f.addEventListener('before-input-event', (e) => {
    if (e.type !== 'keyDown') return;
    const k = (e.key || '').toLowerCase();
    const ctrl = e.ctrl || e.meta;
    const alt = e.alt;

    // F5 НЕ перехватываем — webview обрабатывает F5 нативно через собственную reload-логику.
    // Это устраняет race condition с document keydown listener (раньше было два reload).
    
    if (ctrl && k === 'r') {
      e.preventDefault();
      try { 
        if (f.stop) f.stop(); // Останавливаем текущую загрузку
        if (f.reload) f.reload(); 
      } catch (_) {}
      return;
    }
    if (ctrl && k === 't') {
      e.preventDefault();
      addTab();
      return;
    }
    if (ctrl && k === 'w') {
      e.preventDefault();
      closeTab(activeId);
      return;
    }
    if (ctrl && k === 'l') {
      e.preventDefault();
      addr.focus();
      return;
    }
    if (alt && e.key === 'ArrowLeft') {
      e.preventDefault();
      try { if (f.canGoBack && f.canGoBack()) f.goBack(); } catch (_) {}
      setTimeout(updateNav, 120);
      return;
    }
    if (alt && e.key === 'ArrowRight') {
      e.preventDefault();
      try { if (f.canGoForward && f.canGoForward()) f.goForward(); } catch (_) {}
      setTimeout(updateNav, 120);
      return;
    }
    if (e.key === 'Escape') {
      closeCtx();
      closeDrawer();
      closeModal();
    }
  });

  contentEl.insertBefore(f, splitPane);
  tab.frame = f;
  return f;
}
function activate(id){
  if(!tabs.length) return;
  activeId=id;
  saveTabs();
  showActive();
  renderTabs();
  updateNav();
  updateAddr();
}
function showActive(){const t=active();if(!t)return;tabs.forEach(x=>{if(x.frame)x.frame.classList.toggle('active',x.id===t.id&&x.view==='web')});homeView.classList.toggle('active',t.view==='home');if(t.view==='home')renderHome();applySplit();const el=tabsEl.querySelector('.tab.active');if(el)el.scrollIntoView({block:'nearest',inline:'nearest'})}
function closeTab(id){
  const i=tabs.findIndex(t=>t.id===id);
  if(i<0) return;
  const t=tabs[i];
  if(t.frame) t.frame.remove();
  tabs.splice(i,1);
  if(!tabs.length){
    addTab();
    return;
  }
  if(activeId===id) {
    activate(tabs[Math.min(i,tabs.length-1)].id);
  } else {
    saveTabs();
    renderTabs();
  }
}
function navigate(tab,url,opts){
  opts=opts||{};
  tab.url=url;
  tab.view=url==='browser://home'?'home':'web';
  
  if(opts.push!==false){
    tab.stack=tab.stack.slice(0,tab.idx+1);
    tab.stack.push({url,title:opts.title||null});
    tab.idx=tab.stack.length-1;
  } else {
    if(tab.idx >= 0) {
      tab.stack[tab.idx]={url,title:opts.title||tab.stack[tab.idx].title};
    }
  }
  
  if(tab.view==='web'){
    tab.title=opts.title||hostOf(url);
    ensureFrame(tab);
    if(tab.frame.getAttribute('src')!==url) {
      tab.frame.setAttribute('src', url);
      updateFavicon(tab);
    }
    recordVisit(url,tab.title);
  } else {
    tab.title='Новая вкладка';
  }
  
  saveTabs();
  if(tab.id===activeId)showActive();
  renderTabs();
  updateNav();
  updateAddr();
}
function go(d){
  const t = active();
  if (!t || !t.frame || t.view === 'home') return;
  try {
    // Webview использует собственные методы навигации по истории
    if (d < 0 && t.frame.canGoBack()) {
      t.frame.goBack();
    } else if (d > 0 && t.frame.canGoForward()) {
      t.frame.goForward();
    }
    // Небольшая задержка, чтобы webview успел обновить внутреннюю историю перед перерисовкой UI
    setTimeout(updateNav, 100);
  } catch (e) {
    console.warn('Navigation error:', e);
  }
}
function reload(){
  const t = active();
  if (!t) return;
  if (t.view === 'home') {
    renderHome();
    return;
  }
  
  if (!t.frame) return;
  
  // Для webview не делаем reload через document listener — webview обрабатывает F5 нативно.
  // Проверяем через isTrusted-like флаг: если вызов пришёл от F5 и активен webview, пропускаем.
  // Но т.к. мы уже убрали F5 перехват в webview.before-input-event, здесь просто делаем reload
  // ТОЛЬКО если он был вызван вручную (Ctrl+R, кнопка reload), а не клавишей F5.
  // Глобальный флаг _f5Handled устанавливается в document keydown для F5.
  if (reload._skipIfWebview && t.view === 'web') {
    reload._skipIfWebview = false;
    return;
  }
  
  try {
    // Надёжный reload: stop + reload (чтобы не было race с текущей загрузкой)
    if (t.frame.stop) t.frame.stop();
    if (t.frame.reload) t.frame.reload();
    else {
      // Fallback: перезагрузка через сброс src (для iframe в Capacitor WebView)
      const currentSrc = t.frame.getAttribute('src') || t.frame.src;
      t.frame.setAttribute('src', 'about:blank');
      setTimeout(() => { t.frame.setAttribute('src', currentSrc); }, 30);
    }
  } catch(e) {
    console.warn('Reload failed:', e);
  }
}
function updateFavicon(tab) {
  if (!tab.url || tab.url.startsWith('browser://')) return;
  const host = hostOf(tab.url);
  // Принудительное использование https:// предотвращает ошибки Mixed Content и 404 для сайтов, перенаправляющих http на https
  const secureHost = host.startsWith('http') ? host : `https://${host}`;
  const faviconUrl = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(secureHost)}&size=64`;
  tab.favicon = faviconUrl;
}

function getFaviconHtml(tab) {
  if (tab.favicon) {
    // Используем onerror для корректного fallback без засорения консоли ошибками 404
    const fallback = favHtml(tab.url).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<span class="fav"><img src="${esc(tab.favicon)}" onerror="this.style.display='none';this.parentElement.innerHTML='${fallback}'" loading="lazy"></span>`;
  }
  return favHtml(tab.url);
}

function renderTabs(){
  tabsEl.innerHTML=tabs.map(t=>'<div class="tab'+(t.id===activeId?' active':'')+'" data-id="'+t.id+'" title="'+esc(t.title)+'">'+getFaviconHtml(t)+'<span class="t-title">'+esc(t.title)+'</span><button class="t-close" data-close="'+t.id+'" title="Закрыть (Ctrl+W)">'+I.close+'</button></div>').join('');
  updateArrows();
}
function updateArrows(){const over=tabsEl.scrollWidth>tabsEl.clientWidth+2;stripLeft.style.visibility=over?'visible':'hidden';stripRight.style.visibility=over?'visible':'hidden';stripLeft.disabled=tabsEl.scrollLeft<=0;stripRight.disabled=tabsEl.scrollLeft+tabsEl.clientWidth>=tabsEl.scrollWidth-1}
function updateNav(){
  const t = active();
  if (!t) return;
  if (t.view === 'home' || !t.frame) {
    backBtn.disabled = true;
    fwdBtn.disabled = true;
    return;
  }
  try {
    backBtn.disabled = !t.frame.canGoBack();
    fwdBtn.disabled = !t.frame.canGoForward();
  } catch(e) {
    backBtn.disabled = true;
    fwdBtn.disabled = true;
  }
}
function openExternal(url){
  if(E && E.openExternal){
    E.openExternal(url);
    toast('Открыто во внешнем браузере');
  } else {
    const w = window.open(url, '_blank');
    if(w) toast('Открыто в новой вкладке браузера');
    else addTabAfter(url);
  }
}

function updateAddr(){
  const t=active();
  if(!t)return;
  if(document.activeElement!==addr) addr.value=t.view==='home'?'':shortenUrl(t.url);
  
  if(t.view==='home'){
    addrIcon.innerHTML=I.search;
    addrIcon.style.cursor='default';
    addrIcon.title='';
    addrIcon.onclick=null;
  } else {
    addrIcon.innerHTML=/^https:/.test(t.url)?I.lock:I.globe;
    addrIcon.style.cursor='pointer';
    addrIcon.title='Открыть во внешнем браузере (обход CSP)';
    addrIcon.onclick=(e)=>{
      e.stopPropagation();
      if(t.url && t.url.startsWith('http')) openExternal(t.url);
    };
  }
}

tabsEl.addEventListener('click',e=>{const c=e.target.closest('[data-close]');if(c){closeTab(c.dataset.close);return}const tb=e.target.closest('.tab');if(tb)activate(tb.dataset.id)});
tabsEl.addEventListener('auxclick',e=>{if(e.button===1){const tb=e.target.closest('.tab');if(tb){e.preventDefault();closeTab(tb.dataset.id)}}});
tabsEl.addEventListener('wheel',e=>{if(e.deltaY){tabsEl.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
tabsEl.addEventListener('scroll',updateArrows);
window.addEventListener('resize',updateArrows);
stripLeft.addEventListener('click',()=>tabsEl.scrollBy({left:-280,behavior:'smooth'}));
stripRight.addEventListener('click',()=>tabsEl.scrollBy({left:280,behavior:'smooth'}));
tabstrip.addEventListener('dblclick',e=>{if(!e.target.closest('.tab')&&!e.target.closest('button'))addTab()});
$('#newTab').addEventListener('click',()=>addTab());
backBtn.addEventListener('click',()=>go(-1));
fwdBtn.addEventListener('click',()=>go(1));
reloadBtn.addEventListener('click',reload);

/* ================= Адресная строка ================= */
addr.addEventListener('focus',()=>{const t=active();addrbox.classList.add('focused');if(t&&t.view==='web')addr.value=t.url;requestAnimationFrame(()=>addr.select())});
addr.addEventListener('blur',()=>{addrbox.classList.remove('focused');updateAddr()});
addr.addEventListener('keydown',e=>{
  if(e.key==='Enter'){const v=addr.value.trim();if(!v)return;const u=normalizeUrl(v);if(u)navigate(active(),u,{title:hostOf(u)});else doSearch(v);addr.blur()}
  if(e.key==='Escape')addr.blur();
});

async function saveTabs() {
  const tabsToSave = tabs.map(t => ({
    id: t.id,
    url: t.url,
    view: t.view,
    title: t.title,
    stack: t.stack,
    idx: t.idx,
    splitUrl: t.splitUrl,
    favicon: t.favicon
  }));
  await db.set('tabs', tabsToSave);
  await db.set('activeId', activeId);
}

/* ================= История посещений ================= */
function recordVisit(url,title){
  if(url.startsWith('browser://')) return;
  const host=hostOf(url);
  visits=visits.filter(v=>v.host!==host);
  visits.unshift({host,url,title:title||host,ts:Date.now()});
  visits=visits.slice(0,30);
  db.set('visits',visits);
}

function addSearchHistory(q){
  historyQ=historyQ.filter(h=>h.q!==q);
  historyQ.unshift({q,ts:Date.now()});
  historyQ=historyQ.slice(0,30);
  db.set('searchHistory',historyQ);
}

/* ================= Поиск ================= */
function engineForTab(t){if(!t)return null;for(const k in ENGINES){if(ENGINES[k].match.test(t.url||''))return k}return null}
function doSearch(q,engine,opts){opts=opts||{};q=(q||'').trim();if(!q)return;const e=ENGINES[engine]||ENGINES[settings.engine]||ENGINES.google;addSearchHistory(q);const url=e.search(q),title=q+' — '+e.name;if(opts.newTab)addTabAfter(url,title);else navigate(active(),url,{title})}
function suggest(q){const res=[],seen=new Set();const qq=q.toLowerCase();
  const push=(t,w)=>{const s=t.toLowerCase();if(seen.has(s))return;let sc=0;
    if(!qq)sc=10;else if(s===qq)sc=130;else if(s.startsWith(qq))sc=95;else if((' '+s).includes(' '+qq))sc=70;else if(s.includes(qq))sc=38;else return;
    seen.add(s);res.push({t,sc:sc*(0.55+Math.log2(w+1))})};
  CORPUS.forEach(c=>push(c[0],c[1]));historyQ.forEach(h=>push(h.q,7));
  res.sort((a,b)=>b.sc-a.sc);return res.slice(0,8)}
function hl(text,q){if(!q)return esc(text);const i=text.toLowerCase().indexOf(q.toLowerCase());if(i<0)return esc(text);return esc(text.slice(0,i))+'<b>'+esc(text.slice(i,i+q.length))+'</b>'+esc(text.slice(i+q.length))}
function histItems(list,q){return list.map(h=>'<div class="sug" data-q="'+esc(h.q)+'"><span class="sug-ico">'+I.clock+'</span><span class="sug-txt">'+hl(h.q,q)+'</span><button class="sug-del" data-del="'+esc(h.q)+'" title="Удалить из истории">'+I.close+'</button></div>').join('')}
function renderDrop(){const q=searchInput.value.trim();let html='';
  if(q){const sugs=suggest(q);
    if(sugs.length)html+=sugs.map(s=>'<div class="sug" data-q="'+esc(s.t)+'"><span class="sug-ico">'+I.search+'</span><span class="sug-txt">'+hl(s.t,q)+'</span></div>').join('');
    const hist=historyQ.filter(h=>h.q.toLowerCase().includes(q.toLowerCase())).slice(0,4);
    if(hist.length)html+='<div class="drop-lbl">История</div>'+histItems(hist,q);
    if(!html)html='<div class="sug" data-q="'+esc(q)+'"><span class="sug-ico">'+I.search+'</span><span class="sug-txt">'+esc(q)+'</span></div>';
  }else{
    if(historyQ.length)html+='<div class="drop-lbl">Недавние запросы</div>'+histItems(historyQ.slice(0,6),'');
    html+='<div class="drop-lbl">Часто ищут</div>'+CORPUS.slice().sort((a,b)=>b[1]-a[1]).slice(0,5).map(c=>'<div class="sug" data-q="'+esc(c[0])+'"><span class="sug-ico">'+I.search+'</span><span class="sug-txt">'+esc(c[0])+'</span></div>').join('');
  }
  drop.innerHTML=html;dropIndex=-1}
function moveDropSel(d){const list=$$('.sug',drop);if(!list.length)return;let i=list.findIndex(x=>x.classList.contains('sel'));if(i>=0)list[i].classList.remove('sel');i=d>0?(i+1)%list.length:(i-1+list.length)%list.length;list[i].classList.add('sel');list[i].scrollIntoView({block:'nearest'})}
searchShell.addEventListener('focusin',()=>{searchShell.classList.add('expanded');renderDrop();drop.hidden=false});
searchShell.addEventListener('focusout',e=>{if(!searchShell.contains(e.relatedTarget)){searchShell.classList.remove('expanded');drop.hidden=true}});
searchInput.addEventListener('input',()=>{searchClear.hidden=!searchInput.value;renderDrop();drop.hidden=false});
searchInput.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){e.preventDefault();moveDropSel(1)}
  else if(e.key==='ArrowUp'){e.preventDefault();moveDropSel(-1)}
  else if(e.key==='Enter'){const s=$('.sug.sel',drop);doSearch(s?s.dataset.q:searchInput.value);searchInput.blur()}
  else if(e.key==='Escape')searchInput.blur();
});
searchClear.addEventListener('click',()=>{searchInput.value='';searchClear.hidden=true;renderDrop();searchInput.focus()});
drop.addEventListener('pointerdown',e=>e.preventDefault());
drop.addEventListener('click',e=>{const del=e.target.closest('[data-del]');if(del){historyQ=historyQ.filter(h=>h.q!==del.dataset.del);db.set('searchHistory',historyQ);renderDrop();return}const s=e.target.closest('.sug');if(s){doSearch(s.dataset.q);searchInput.blur()}});

/* ================= Главный экран ================= */
function renderEngineRow(){engineRow.innerHTML=Object.keys(ENGINES).map(k=>'<button class="engine-pill'+(settings.engine===k?' active':'')+'" data-engine="'+k+'">'+esc(ENGINES[k].name)+'</button>').join('')}
function renderPins(){
  pinsGrid.innerHTML = pins.map(p => {
    const h = hostOf(p.url);
    const fb = (p.name[0] || '?').toUpperCase();
    const k = known(h);
    const secureHost = h.startsWith('http') ? h : `https://${h}`;
    return '<a class="site-card" href="' + esc(p.url) + '" data-open="cur" data-pinned="1" data-title="' + esc(p.name) + '">' +
      '<span class="site-ico" style="background:' + k.c + '">' +
      '<img src="https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=' + enc(secureHost) + '&size=64" alt="" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'grid\')">' +
      '<span class="site-fallback" style="display:none">' + esc(fb) + '</span>' +
      '</span>' +
      '<span class="site-name">' + esc(p.name) + '</span>' +
      '</a>';
  }).join('') + '<button class="site-card glass" id="addSiteCard" type="button"><span class="site-ico">' + I.plus + '</span><span class="site-name">Добавить сайт</span></button>';
}
function renderRecent(){
  const list = visits.slice(0, 8);
  recentGrid.innerHTML = list.length ? list.map(v => {
    const fb = (v.title[0] || v.host[0] || '?').toUpperCase();
    const k = known(v.host);
    const secureHost = v.host.startsWith('http') ? v.host : `https://${v.host}`;
    return '<a class="site-card" href="' + esc(v.url) + '" data-open="cur" data-recent="1" data-title="' + esc(v.title) + '">' +
      '<span class="site-ico" style="background:' + k.c + '">' +
      '<img src="https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=' + enc(secureHost) + '&size=64" alt="" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'grid\')">' +
      '<span class="site-fallback" style="display:none">' + esc(fb) + '</span>' +
      '</span>' +
      '<span class="site-name">' + esc(v.title) + '</span>' +
      '</a>';
  }).join('') : '<div class="empty-note">Вы ещё никуда не заходили — недавние сайты появятся здесь.</div>';
}
function renderHome(){renderEngineRow();renderPins();renderRecent()}
function buildNews(){newsGrid.innerHTML=NEWS.map(n=>'<article class="news-card" href="#" data-open="new" data-q="'+esc(n.q)+'" data-title="'+esc(n.t)+'"><div class="news-img"><img src="'+n.img+'" alt="" loading="lazy" onerror="this.style.display=\'none\'"></div><div class="news-body"><div class="news-meta"><span class="chip">'+esc(n.cat)+'</span><span>'+esc(n.time)+'</span></div><h3>'+esc(n.t)+'</h3><div class="news-src">'+esc(n.src)+'</div></div></article>').join('')}
engineRow.addEventListener('click',e=>{
  const b=e.target.closest('[data-engine]');
  if(!b) return;
  settings.engine=b.dataset.engine;
  db.set('settings',settings);
  renderEngineRow();
});
homeView.addEventListener('click',e=>{
  if(e.target.closest('#addSiteCard')){openModal();return}
  const card=e.target.closest('[data-open]');if(!card)return;e.preventDefault();
  if(card.dataset.open==='new')doSearch(card.dataset.q,settings.engine,{newTab:true});
  else navigate(active(),card.getAttribute('href'),{title:card.dataset.title||null});
});

/* ================= Загрузки ================= */
function folderPath(){if(settings.folder==='custom')return settings.customPath||'C:\\Downloads';return FOLDERS[settings.folder].path}
function extOf(n){const m=(n.split('.').pop()||'').toLowerCase();const map={pdf:['PDF','#e5484d'],zip:['ZIP','#f76b15'],rar:['ZIP','#f76b15'],png:['IMG','#46a758'],jpg:['IMG','#46a758'],jpeg:['IMG','#46a758'],gif:['IMG','#46a758'],mp3:['MP3','#8e4ec6'],wav:['MP3','#8e4ec6'],mp4:['VID','#d6409f'],mkv:['VID','#d6409f'],doc:['DOC','#0b7fea'],docx:['DOC','#0b7fea'],xls:['XLS','#46a758'],xlsx:['XLS','#46a758'],ppt:['PPT','#f76b15'],exe:['EXE','#66707b'],html:['HTM','#0e9384'],csv:['CSV','#0e9384']};const v=map[m]||[(m.slice(0,3).toUpperCase()||'FILE'),'#66707b'];return{t:v[0],c:v[1]}}
function startDownload(name,size,src){
  const d={id:uid(),name:String(name),size:Math.max(1,Math.round(size)),received:0,state:'dl',path:folderPath()+'\\'+name,src:src||'',ts:Date.now()};
  downloads.unshift(d);
  renderDl();
  openDlPanel();
  const tm=setInterval(()=>{
    d.received=Math.min(d.size,d.received+d.size*(0.025+Math.random()*0.055));
    if(d.received>=d.size){
      d.state='done';
      clearInterval(tm);
      toast('Файл загружен: '+d.name);
      db.set('downloads',downloads.filter(x=>x.state==='done'));
    }
    renderDl();
    updateRing();
  },170);
  updateRing();
}

function updateRing(){const act=downloads.filter(d=>d.state==='dl');if(!act.length){dlRing.classList.remove('on');dlBtn.classList.remove('busy');return}
  const tot=act.reduce((s,d)=>s+d.size,0),rec=act.reduce((s,d)=>s+d.received,0),p=Math.min(1,rec/tot);
  ringProg.style.strokeDashoffset=(125.66*(1-p)).toFixed(2);dlRing.classList.add('on');dlBtn.classList.add('busy')}
function renderDl(){if(!downloads.length){dlList.innerHTML='';dlEmpty.hidden=false;dlFoot.hidden=true;return}
  dlEmpty.hidden=true;
  dlList.innerHTML=downloads.map(d=>{const ex=extOf(d.name),done=d.state==='done',p=done?100:Math.round(d.received/d.size*100);
    return '<div class="dl-item"><span class="dl-ico" style="background:'+ex.c+'">'+ex.t+'</span><div class="dl-info"><div class="dl-name">'+esc(d.name)+'</div><div class="dl-bar"><i style="width:'+p+'%"></i></div><div class="dl-sub">'+(done?'Готово · '+fmtBytes(d.size):fmtBytes(d.received)+' из '+fmtBytes(d.size)+' · '+p+'%')+'</div></div><button class="dl-folder" data-folder="'+d.id+'" title="Показать в папке">'+I.folder+'</button></div>'}).join('');
  dlFoot.hidden=!downloads.some(d=>d.state==='done')}
function openDlPanel(){dlPanel.hidden=false}
function closeDlPanel(){dlPanel.hidden=true}
dlBtn.addEventListener('click',e=>{e.stopPropagation();dlPanel.hidden?openDlPanel():closeDlPanel()});
$('#dlClose').addEventListener('click',closeDlPanel);
$('#dlSettings').addEventListener('click',()=>{dlSettingsBox.hidden=!dlSettingsBox.hidden});
dlList.addEventListener('click',e=>{
  const b=e.target.closest('[data-folder]');
  if(!b) return;
  const d=downloads.find(x=>x.id===b.dataset.folder);
  if(!d) return;
  if(E&&E.showInFolder) E.showInFolder(d.path);
  else toast('Открываю папку: '+d.path);
});

$('#dlClear').addEventListener('click',()=>{
  downloads=downloads.filter(d=>d.state!=='done');
  db.set('downloads',downloads);
  renderDl();
  updateRing();
});

$('#dlTest').addEventListener('click',()=>{
  const f=TESTFILES[Math.floor(Math.random()*TESTFILES.length)];
  startDownload(f[0],f[1]*(0.7+Math.random()*0.6));
});

dlFolderSel.value=settings.folder;
dlFolderCustom.hidden=settings.folder!=='custom';
dlFolderCustom.value=settings.customPath;
dlAsk.checked=!!settings.ask;

dlFolderSel.addEventListener('change',()=>{
  settings.folder=dlFolderSel.value;
  dlFolderCustom.hidden=settings.folder!=='custom';
  db.set('settings',settings);
  toast('Папка загрузок: '+(FOLDERS[settings.folder]?FOLDERS[settings.folder].name:'другая'));
});

dlFolderCustom.addEventListener('input',()=>{
  settings.customPath=dlFolderCustom.value;
  db.set('settings',settings);
});

dlAsk.addEventListener('change',()=>{
  settings.ask=dlAsk.checked;
  db.set('settings',settings);
});
function saveLink(href){let name='';try{const u=new URL(href,location.href);name=(u.pathname.split('/').filter(Boolean).pop()||'').split('?')[0]}catch(e){}
  if(!name||name.indexOf('.')<0)name=(name||'page')+'.html';
  if(settings.ask){openDlPanel();dlSettingsBox.hidden=false;toast('Выберите папку для сохранения')}
  startDownload(name,3e5+Math.random()*2.2e7,href)}

/* ================= Разделённый экран ================= */
function openSplit(url){const t=active();if(!t)return;t.splitUrl=url;applySplit()}
function closeSplit(){const t=active();if(!t)return;t.splitUrl=null;applySplit()}
function applySplit(){
  const t=active();
  if(t&&t.splitUrl){
    splitPane.classList.add('open');
    contentEl.classList.add('splitting');
    if(splitFrame.getAttribute('src')!==t.splitUrl) splitFrame.setAttribute('src', t.splitUrl);
    splitUrlEl.textContent=shortenUrl(t.splitUrl);
  } else {
    splitPane.classList.remove('open');
    contentEl.classList.remove('splitting');
  }
}
$('#splitClose').addEventListener('click',closeSplit);

/* ================= Контекстные меню ================= */
function mi(icon,label,action,extra){return Object.assign({icon:icon,label:label,action:action},extra||{})}
document.addEventListener('contextmenu',e=>{
  if(e.target.closest('#ctxMenu,#ctxSub,#translateSub,#modal')){e.preventDefault();return}
  if(e.target.closest('#dlPanel')){e.preventDefault();return}
  
  // Для webview: блокируем native context menu, дальше обрабатывает сам webview через 'context-menu' event
  if(e.target.closest('webview.page-frame')){
    e.preventDefault();
    return;
  }
  
  e.preventDefault();
  const sel=String(window.getSelection()||'').trim();
  const cardEl=e.target.closest('.site-card[data-pinned],.site-card[data-recent]');
  const linkEl=e.target.closest('a[href],[data-href]');
  let href=null;
  if(linkEl){
    href=linkEl.dataset.href||linkEl.getAttribute('href');
    if(href==='#'||!href) href=null;
  }

  // Если нет выделенного текста, ссылки или карточки, закрываем меню и не открываем заново
  if(!sel && !href && !cardEl){
    closeCtx();
    return;
  }

  // Определяем оптимальные координаты для появления меню (компактно, без лишних отступов вниз)
  let x = e.clientX + 8;
  let y = e.clientY + 8;
  
  if (sel) {
    const range = window.getSelection().getRangeAt(0);
    const rects = range.getClientRects();
    if (rects.length > 0) {
      const rect = rects[rects.length - 1];
      x = rect.right + 6;
      y = rect.bottom + 2; // Минимальный отступ, чтобы не было "слишком низко"
    }
  } else if (linkEl || cardEl) {
    const rect = (linkEl || cardEl).getBoundingClientRect();
    x = rect.right + 6;
    y = rect.top + 6;
  }

  // Гарантируем, что меню не вылезет за пределы экрана
  const menuW = 260, menuH = 200;
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 12;
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 12;
  if (x < 8) x = 8;
  if (y < 8) y = 8;

  openCtx({x, y, sel, href, el: e.target, linkEl, cardEl});
});
function attachFrameCtx(f){
  // Устаревшая функция для iframe. Контекстное меню теперь перехватывается 
  // через нативное событие 'context-menu' тега <webview> в ensureFrame().
  // Оставлена как заглушка для предотвращения ошибок при вызове из старых мест.
  return;
}
function buildCtxItems(o){
  const items=[];
  if(o.cardEl&&!o.sel){
    const url=o.cardEl.getAttribute('href'),title=o.cardEl.dataset.title||hostOf(url);
    if(o.cardEl.dataset.pinned){
      items.push(
        mi(I.tab,'Открыть в новой вкладке',()=>addTabAfter(url,title)),
        mi(I.window,'Открыть в новом окне',()=>openWindow(url,false)),
        {sep:true},
        mi(I.close,'Открепить',()=>{
          pins=pins.filter(p=>p.url!==url);
          db.set('pins',pins);
          renderPins();
          toast('Сайт откреплён');
        })
      );
    } else {
      items.push(
        mi(I.tab,'Открыть в новой вкладке',()=>addTabAfter(url,title)),
        mi(I.pin,'Закрепить на главном экране',()=>{
          if(pins.some(p=>p.url===url)){
            toast('Уже закреплено');
          } else {
            pins.push({name:title,url:url});
            db.set('pins',pins);
            renderPins();
            toast('Сайт закреплён');
          }
        })
      );
    }
    return items;
  }
  
  if(o.href){
    items.push(
      mi(I.tab,'Открыть в новой вкладке',()=>addTabAfter(o.href,hostOf(o.href))),
      mi(I.window,'Открыть в новом окне',()=>openWindow(o.href,false)),
      mi(I.incog,'Открыть в приватном окне',()=>openWindow(o.href,true)),
      mi(I.split,'Открыть, разделив экран',()=>openSplit(o.href)),
      {sep:true},
      mi(I.link,'Копировать адрес ссылки',()=>copyText(o.href,'Адрес ссылки скопирован')),
      mi(I.dl,'Сохранить ссылку как…',()=>saveLink(o.href)),
      mi(I.bookmark,'Добавить ссылку в закладки',()=>{
        bookmarks.push({url:o.href,ts:Date.now()});
        db.set('bookmarks',bookmarks);
        toast('Ссылка добавлена в закладки');
      }),
      mi(I.code,'Просмотреть код элемента',()=>showCode(o.linkEl||o.el))
    );
  }
  
  if(o.href&&o.sel) items.push({sep:true});
  
  if(o.sel){
    items.push(
      mi(I.search,'Поиск «'+trunc(o.sel,22)+'»',()=>ctxSearch(o.sel)),
      mi(I.searchin,'Искать в…',null,{arrow:'searchIn'}),
      mi(I.globe,'Перевести на…',null,{arrow:'translate'}),
      {sep:true},
      mi(I.copy,'Копировать',()=>copyText(o.sel,'Скопировано')),
      mi(I.link,'Копировать ссылку на выделение',()=>copyFragment(o.sel)),
      {sep:true},
      mi(I.print,'Печать…',()=>window.print()),
      mi(I.code,'Просмотреть код элемента',()=>showCode(o.el))
    );
  }
  
  if(!items.length){
    items.push(
      mi(I.reload,'Обновить страницу',reload),
      {sep:true},
      mi(I.plus,'Новая вкладка',()=>addTab()),
      {sep:true},
      mi(I.code,'Просмотр кода страницы',()=>showCode(o.el||document.body))
    );
  }
  
  return items;
}

function closeSub() {
  ctxSub.hidden = true;
  translateSub.hidden = true;
}

function openCtx(o) {
  closeCtx();
  ctxState = o;
  const items = buildCtxItems(o);
  if (!items.length) return;
  
  ctxMenu.innerHTML = items.map((it, i) => 
    it.sep ? '<div class="sep"></div>' : 
    `<button type="button" class="mi" data-i="${i}">
      <span class="ic">${it.icon || ''}</span>
      <span class="lbl">${esc(it.label)}</span>
      ${it.arrow ? '<span class="arrow">▸</span>' : ''}
    </button>`
  ).join('');
  
  ctxMenu._items = items;
  ctxMenu.hidden = false;
  closeSub();
  
  ctxMenu.style.left = Math.max(8, Math.min(o.x, innerWidth - (ctxMenu.offsetWidth || 260) - 8)) + 'px';
  ctxMenu.style.top = Math.max(8, Math.min(o.y, innerHeight - (ctxMenu.offsetHeight || 200) - 8)) + 'px';
}
ctxMenu.addEventListener('pointerdown',e=>{e.stopPropagation()});
ctxMenu.addEventListener('click', e => {
  const b = e.target.closest('.mi');
  if (!b) return;
  const it = ctxMenu._items[+b.dataset.i];
  if (!it) return;
  
  if (it.arrow === 'searchIn') {
    openSearchIn((ctxState && ctxState.sel) || '', b);
    return;
  }
  if (it.arrow === 'translate') {
    openTranslateSub((ctxState && ctxState.sel) || '', b);
    return;
  }
  
  closeCtx();
  if (it.action) it.action();
});
function closeCtx(){ctxMenu.hidden=true;closeSub()}
function ctxSearch(sel){const eng=engineForTab(active())||settings.engine;doSearch(sel,eng,{newTab:true})}
function copyFragment(sel){const t=active();if(t&&t.view==='web')copyText(t.url+'#:~:text='+enc(sel.slice(0,120)),'Ссылка на выделение скопирована');else copyText(sel,'Скопировано')}
function openWindow(url,priv){if(E&&E.newWindow){E.newWindow(url,!!priv);toast(priv?'Открыто в приватном окне':'Открыто в новом окне');return}
  const w=window.open(url,'_blank','width=1100,height=760');
  if(w)toast(priv?'Открыто в приватном окне':'Открыто в новом окне');
  else{addTabAfter(url);toast('Всплывающие окна заблокированы — открыто во вкладке')}}
function openSearchIn(q, anchor) {
  const opts = [
    { n: 'Википедия', url: 'https://ru.wikipedia.org', action: (q) => `https://ru.wikipedia.org/w/index.php?search=${enc(q)}`, favicon: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://wikipedia.org&size=32' },
    { n: 'Google', url: 'https://google.com', action: (q) => ENGINES.google.search(q), favicon: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=32' },
    { n: 'Яндекс', url: 'https://yandex.ru', action: (q) => ENGINES.yandex.search(q), favicon: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://yandex.ru&size=32' },
    { n: 'DuckDuckGo', url: 'https://duckduckgo.com', action: (q) => ENGINES.duck.search(q), favicon: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://duckduckgo.com&size=32' }
  ];
  
  ctxSub.innerHTML = opts.map((o2, i) => 
    `<button type="button" class="ctx-sub-item" data-i="${i}">
      <img src="${o2.favicon}" alt="" onerror="this.style.display='none'">
      <span class="lbl">${esc(o2.n)}</span>
    </button>`
  ).join('');
  ctxSub._opts = opts;
  ctxSub.hidden = false;
  
  const mr = ctxMenu.getBoundingClientRect();
  const w = ctxSub.offsetWidth, h = ctxSub.offsetHeight;
  let left = mr.right + 8;
  if (left + w > innerWidth - 8) left = Math.max(8, mr.left - w - 8);
  ctxSub.style.left = left + 'px';
  ctxSub.style.top = Math.max(8, Math.min(mr.top, innerHeight - h - 8)) + 'px';
}

ctxSub.addEventListener('click', e => {
  const b = e.target.closest('.ctx-sub-item');
  if (!b) return;
  const o2 = ctxSub._opts[+b.dataset.i];
  const q = (ctxState && ctxState.sel) || '';
  closeCtx();
  
  const url = o2.action(q);
  if (E && E.openExternal) {
    E.openExternal(url);
  } else {
    addTabAfter(url, q + ' — ' + o2.n);
  }
  toast('Открываю «' + trunc(q, 18) + '» в ' + o2.n + '…');
});
function closeCtxIfOutside(e) {
  // Если клик был ВНУТРИ любого меню — не закрываем
  if (e.target.closest('#ctxMenu, #ctxSub, #translateSub')) return;
  
  // Игнорируем клики на самом webview (там своё контекстное меню)
  if (e.target.closest('webview.page-frame')) return;
  
  if (!ctxMenu.hidden) {
    // Используем rAF для гарантии, что сначала обработается клик на кнопке меню
    requestAnimationFrame(() => {
      // Повторная проверка — вдруг меню уже закрылось из-за клика на кнопку
      if (!ctxMenu.hidden && !document.querySelector('#ctxMenu:hover, #ctxSub:hover, #translateSub:hover')) {
        closeCtx();
      }
    });
  }
}

// ВАЖНО: используем bubbling phase (без true), а не capture.
// В capture phase event срабатывает раньше, чем на кнопках внутри меню, 
// что приводило к закрытию меню ДО выполнения click-обработчика на кнопке.
document.addEventListener('pointerdown', closeCtxIfOutside);
document.addEventListener('mousedown', closeCtxIfOutside);
window.addEventListener('scroll',()=>{closeCtx()},{passive:true});
window.addEventListener('blur',closeCtx);
window.addEventListener('resize',closeCtx);
document.addEventListener('pointerdown',e=>{if(!dlPanel.hidden&&!e.target.closest('#dlPanel,#dlWrap'))closeDlPanel()},true);

/* ================= Перевод текста ================= */
const LANGUAGES = [
  { code: 'EN', name: 'Английский' },
  { code: 'RU', name: 'Русский' },
  { code: 'DE', name: 'Немецкий' },
  { code: 'FR', name: 'Французский' },
  { code: 'ES', name: 'Испанский' },
  { code: 'IT', name: 'Итальянский' },
  { code: 'PT', name: 'Португальский' },
  { code: 'PL', name: 'Польский' },
  { code: 'NL', name: 'Нидерландский' },
  { code: 'TR', name: 'Турецкий' },
  { code: 'UK', name: 'Украинский' },
  { code: 'BE', name: 'Белорусский' },
  { code: 'CS', name: 'Чешский' },
  { code: 'SK', name: 'Словацкий' },
  { code: 'BG', name: 'Болгарский' },
  { code: 'RO', name: 'Румынский' },
  { code: 'HU', name: 'Венгерский' },
  { code: 'FI', name: 'Финский' },
  { code: 'SV', name: 'Шведский' },
  { code: 'NO', name: 'Норвежский' },
  { code: 'DA', name: 'Датский' },
  { code: 'EL', name: 'Греческий' },
  { code: 'HE', name: 'Иврит' },
  { code: 'AR', name: 'Арабский' },
  { code: 'FA', name: 'Персидский' },
  { code: 'HI', name: 'Хинди' },
  { code: 'ZH', name: 'Китайский' },
  { code: 'JA', name: 'Японский' },
  { code: 'KO', name: 'Корейский' },
  { code: 'ID', name: 'Индонезийский' },
  { code: 'VI', name: 'Вьетнамский' },
  { code: 'TH', name: 'Тайский' }
];

function openTranslateSub(q, anchor) {
  currentTranslateText = q;
  renderTranslateList('');
  translateSub.hidden = false;
  
  const mr = ctxMenu.getBoundingClientRect();
  const w = translateSub.offsetWidth, h = translateSub.offsetHeight;
  let left = mr.right + 8;
  if (left + w > innerWidth - 8) left = Math.max(8, mr.left - w - 8);
  translateSub.style.left = left + 'px';
  translateSub.style.top = Math.max(8, Math.min(mr.top, innerHeight - h - 8)) + 'px';
  
  setTimeout(() => translateLangSearch.focus(), 50);
}

function renderTranslateList(filter) {
  const f = filter.toLowerCase();
  const filtered = LANGUAGES.filter(l => l.name.toLowerCase().includes(f) || l.code.toLowerCase().includes(f));
  
  translateLangList.innerHTML = filtered.map(l => 
    `<button type="button" class="ctx-sub-item" data-lang="${l.code}">
      <span class="lbl">${esc(l.name)} <span style="color:var(--mut);font-size:11px">(${l.code})</span></span>
    </button>`
  ).join('');
}

translateLangSearch.addEventListener('input', (e) => {
  renderTranslateList(e.target.value);
});

translateLangList.addEventListener('click', (e) => {
  const btn = e.target.closest('.ctx-sub-item');
  if (!btn) return;
  const langCode = btn.dataset.lang;
  closeCtx();
  performTranslation(currentTranslateText, langCode);
});

async function performTranslation(text, targetLang) {
  translatePanel.hidden = false;
  tpOriginal.textContent = text;
  tpResult.innerHTML = '<div class="tp-loading">Переводим...</div>';
  
  // Позиционируем панель по центру экрана при первом открытии
  if (!translatePanel.style.left) {
    translatePanel.style.left = (window.innerWidth / 2 - 160) + 'px';
    translatePanel.style.top = (window.innerHeight / 2 - 100) + 'px';
  }

  try {
    // MyMemory Translation API — бесплатный, без ключей, работает во всех средах
    // (Web, Electron, Capacitor WebView). Автоопределение языка источника.
    // Официальная документация: https://mymemory.translated.net/doc/spec.php
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${targetLang}`;
    
    // Таймаут 10 секунд через AbortController — защита от зависаний
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.responseData || !data.responseData.translatedText) {
      throw new Error('Некорректный ответ API');
    }
    
    // HTTP 429 или не-200 status в ответе API — сигнал о превышении квоты
    const isQuotaExceeded = data.responseStatus === 429 ||
                           (data.responseStatus && data.responseStatus !== 200);
    
    let translated = data.responseData.translatedText;
    const detectedLang = data.responseData.detectedLanguage || null;
    
    // Нормализация регистра: API иногда возвращает текст в ВЕРХНЕМ регистре для коротких фраз
    if (translated === translated.toUpperCase() && text !== text.toUpperCase()) {
      translated = translated.charAt(0).toUpperCase() + translated.slice(1).toLowerCase();
    }
    
    // Находим полное имя языка по коду для красивого вывода
    const langInfo = LANGUAGES.find(l => l.code === targetLang);
    const langDisplayName = langInfo ? langInfo.name : targetLang;
    
    // Блок с информацией о переводчике
    const metaRow = `
      <div class="tp-meta">
        <span class="tp-meta-item">
          <svg class="ic" viewBox="0 0 24 24" style="width:13px;height:13px">
            <path d="M20 12a8 8 0 1 0-16 0 8 8 0 0 0 16 0z"/>
            <path d="M4 12h16"/>
            <path d="M12 4c2.5 2.5 3.5 5 3.5 8s-1 5.5-3.5 8c-2.5-2.5-3.5-5-3.5-8s1-5.5 3.5-8z"/>
          </svg>
          ${esc(langDisplayName)}
        </span>
        ${detectedLang ? `<span class="tp-meta-item">
          <svg class="ic" viewBox="0 0 24 24" style="width:13px;height:13px">
            <circle cx="11" cy="11" r="7"/>
            <path d="M20.5 20.5l-4.2-4.2"/>
          </svg>
          Авто-детект: ${esc(detectedLang.toUpperCase())}
        </span>` : ''}
      </div>`;
    
    const warningBadge = isQuotaExceeded
      ? `<div class="tp-warning">
          <svg class="ic" viewBox="0 0 24 24" style="width:13px;height:13px">
            <path d="M12 8v4M12 16h.01"/>
            <path d="M10.3 3.9l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z"/>
          </svg>
          Бесплатный лимит — перевод через публичный движок
        </div>`
      : '';
    
    tpResult.innerHTML = `
      <div class="tp-result-text">${esc(translated)}</div>
      ${metaRow}
      ${warningBadge}`;
      
  } catch (error) {
    console.warn('Translation failed:', error);
    
    const reason = error.name === 'AbortError'
      ? 'Превышено время ожидания'
      : error.message.includes('Failed to fetch')
        ? 'Нет соединения с интернетом'
        : 'Сервис перевода недоступен';
    
    tpResult.innerHTML = `
      <div class="tp-error">
        <div class="tp-error-head">
          <svg class="ic" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <span>${esc(reason)}</span>
        </div>
        <div class="tp-error-hint">Попробуйте ещё раз через несколько секунд или выберите другой язык перевода.</div>
        <div class="tp-error-fallback">
          <span class="tp-error-lbl">Исходный текст:</span>
          <em>${esc(text)}</em>
        </div>
      </div>`;
  }
}

// Перетаскивание панели перевода (с безопасной проверкой существования элементов)
const tpHeaderEl = $('#tpHeader');
const tpExpandEl = $('#tpExpand');
const tpCloseEl = $('#tpClose');

if (tpHeaderEl && translatePanel) {
  tpHeaderEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hbtn')) return;
    isDraggingPanel = true;
    dragOffsetX = e.clientX - translatePanel.offsetLeft;
    dragOffsetY = e.clientY - translatePanel.offsetTop;
    tpHeaderEl.style.cursor = 'grabbing';
  });
}

window.addEventListener('mousemove', (e) => {
  if (!isDraggingPanel || !translatePanel) return;
  e.preventDefault();
  let newX = e.clientX - dragOffsetX;
  let newY = e.clientY - dragOffsetY;
  
  newX = Math.max(0, Math.min(newX, window.innerWidth - translatePanel.offsetWidth));
  newY = Math.max(0, Math.min(newY, window.innerHeight - translatePanel.offsetHeight));
  
  translatePanel.style.left = newX + 'px';
  translatePanel.style.top = newY + 'px';
});

window.addEventListener('mouseup', () => {
  if (isDraggingPanel && tpHeaderEl) {
    isDraggingPanel = false;
    tpHeaderEl.style.cursor = 'grab';
  }
});

if (tpExpandEl) {
  tpExpandEl.addEventListener('click', () => {
    translatePanel.classList.toggle('expanded');
  });
}

if (tpCloseEl) {
  tpCloseEl.addEventListener('click', () => {
    translatePanel.hidden = true;
    translatePanel.classList.remove('expanded');
  });
}
/* ================= Просмотр кода ================= */
function selPath(el){const parts=[];let n=el;while(n&&n.nodeType===1&&parts.length<5){let s=n.tagName.toLowerCase();if(n.id)s+='#'+n.id;else if(typeof n.className==='string'&&n.className.trim())s+='.'+n.className.trim().split(/\s+/).slice(0,2).join('.');parts.unshift(s);n=n.parentElement}return parts.join(' › ')}
function highlight(s){return s.replace(/(&lt;\/?)([a-zA-Z0-9-]+)/g,'$1<span class="tg">$2</span>').replace(/([a-zA-Z-]+)=(&quot;.*?&quot;)/g,'<span class="at">$1</span>=<span class="st">$2</span>')}
function showCode(el){if(!el||el.nodeType!==1)el=document.body;codePath.textContent=selPath(el);codeCopyData=(el.outerHTML||'').slice(0,6000);codePre.innerHTML=highlight(esc(codeCopyData));drawer.hidden=false;requestAnimationFrame(()=>drawer.classList.add('open'))}
function closeDrawer(){drawer.classList.remove('open');setTimeout(()=>{drawer.hidden=true},240)}
$('#codeClose').addEventListener('click',closeDrawer);
$('#codeCopy').addEventListener('click',()=>copyText(codeCopyData,'Код скопирован'));

/* ================= Модалка ================= */
function openModal(){modal.hidden=false;siteUrl.value='';siteName.value='';setTimeout(()=>siteUrl.focus(),0)}
function closeModal(){modal.hidden=true}
$('#modalCancel').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
addForm.addEventListener('submit',e=>{
  e.preventDefault();
  const u=normalizeUrl(siteUrl.value);
  if(!u){
    toast('Введите корректный адрес сайта');
    return;
  }
  const name=siteName.value.trim()||hostOf(u);
  pins.push({name:name,url:u});
  db.set('pins',pins);
  renderPins();
  closeModal();
  toast('Сайт «'+name+'» добавлен');
});

/* ================= Горячие клавиши ================= */
document.addEventListener('keydown',e=>{
  const t = active();
  const isWebviewActive = t && t.view === 'web' && t.frame;
  
  if (e.key === 'F5') {
    e.preventDefault();
    if (isWebviewActive) {
      // Для webview: помечаем, что reload вызван через F5.
      // Webview сам обработает F5 через нативный reload (before-input-event не перехватывает F5).
      // Ничего не делаем здесь, чтобы избежать двойного reload.
      // Но если webview по какой-то причине не среагировал (например, Capacitor iframe) — 
      // вызываем reload с флагом skip для совместимости.
      reload._skipIfWebview = false;
      // Принудительно reload через webview API для надёжности (без дублирования)
      try {
        if (t.frame.stop) t.frame.stop();
        if (t.frame.reload) t.frame.reload();
      } catch(_) {
        reload();
      }
    } else {
      reload();
    }
    return;
  }
  
  if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); addTab(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(activeId); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); addr.focus(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); reload(); return; }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
  if (e.key === 'Escape') { closeCtx(); closeDrawer(); closeModal(); }
});

/* ================= Старт ================= */
(async function init() {
  await loadState();
  buildNews();
  renderHome();
  
  if (tabs.length === 0) {
    addTab();
  } else {
    tabs.forEach(t => {
      if (t.view === 'web') {
        ensureFrame(t);
        if (t.frame) {
          t.frame.setAttribute('src', t.url);
          updateFavicon(t);
        }
      }
    });
    showActive();
    renderTabs();
  }
  
  updateArrows();
})();
