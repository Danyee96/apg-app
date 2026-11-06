/* Presentation-only localisation: API keys, money, stored data and form values stay unchanged. */
(() => {
  'use strict';
  const catalog = window.APG_TRANSLATIONS;
  const supported = new Set(['en', 'ur', 'roman']);
  let language = 'en';
  try { const saved = localStorage.getItem('apg.language'); if (supported.has(saved)) language = saved; } catch {}
  const textSources = new WeakMap(), attributeSources = new WeakMap(), dataValues = new Set();
  const dataKeys = new Set(['name','full_name','username','customer','party_to','party_from','receiver','driver','detail','description','remarks','memo','address','urdu_address','urdu_name','station','truck','email','mobile','phone','goods_type','goods_custom','goods_category_name','goods_subcategory_name','submitted_name','recorded_by','job_title','about']);
  function remember(value, key = '') {
    if (Array.isArray(value)) { value.forEach(item => remember(item, key)); return; }
    if (value && typeof value === 'object') { Object.entries(value).forEach(([k,v]) => remember(v,k)); return; }
    if (typeof value === 'string' && dataKeys.has(key) && value.trim()) dataValues.add(value.trim());
  }
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const terms = Object.keys(catalog).sort((a,b) => b.length-a.length);
  // Match complete UI phrases, never pieces of words (e.g. "Bag" in a customer's name).
  const phrasePattern = new RegExp('(?<![\\p{L}\\p{N}_])(?:'+terms.map(escapeRegex).join('|')+')(?![\\p{L}\\p{N}_])','gu');
  function fieldLabel(value) {
    const field=value.replace(/[._]+$/,'').replaceAll('_',' ').trim();
    const aliases={dated:'Date',bilty:'Bilty number',qty:'Quantity',name:'Name',receiver:'Receiver',bilty_received:'Bilty cash received',service_received:'Loading / Suzuki received'};
    return t(aliases[value] || field.charAt(0).toUpperCase()+field.slice(1));
  }
  function dynamic(value,index) {
    const patterns = [
      [/^(\d+) bilt(?:y|ies) selected · Record the handover details\.$/, n => [`${n} بلٹیاں منتخب · حوالگی کی تفصیلات درج کریں۔`, `${n} biltyan muntakhib · hawalgi ki tafseelat darj karein.`]],
      [/^(\d+) (places & tasks|matches|tabs|controls|permissions|found)$/, (n,kind) => {
        const labels = {'places & tasks':['مینو اور کام','menu aur kaam'],matches:['نتائج','nataij'],tabs:['مینو','menu'],controls:['اختیارات','ikhtiyarat'],permissions:['اختیارات','ikhtiyarat'],found:['نتائج','nataij']};
        return [`${n} ${labels[kind][0]}`,`${n} ${labels[kind][1]}`];
      }],
      [/^(.+?) saved\.$/, ref => [`${ref} محفوظ ہو گیا۔`,`${ref} mehfooz ho gaya.`]],
      [/^(.+?) created\.$/, ref => [`${ref} بن گیا۔`,`${ref} ban gaya.`]],
      [/^(.+?) submitted for approval\.$/, ref => [`${ref} منظوری کے لیے بھیج دیا گیا۔`,`${ref} manzoori ke liye bhej diya gaya.`]],
      [/^Discard PENDING-(\d+)\? It will be removed from Pending incoming goods\.$/, id => [`کیا PENDING-${id} مسترد کر دیں؟ یہ منظوری کی فہرست سے ہٹ جائے گا۔`,`Kya PENDING-${id} mustarad kar dein? Yeh manzoori ki fehrist se hat jaye ga.`]],
      [/^No (automatic|manual) backups yet\.$/, kind => [ `ابھی کوئی ${kind==='automatic'?'خودکار':'دستی'} بیک اپ نہیں۔`, `Abhi koi ${kind==='automatic'?'khudkar':'dasti'} backup nahin.`]],
      [/^Enter a valid non-negative amount for (.+)$/, field => [`${fieldLabel(field)} کے لیے صفر یا اس سے زیادہ درست رقم درج کریں۔`,`${fieldLabel(field)} ke liye sifar ya is se zyada durust raqam darj karein.`]],
      [/^(.+) is required\.$/, field => [`${fieldLabel(field)} درج کریں۔`,`${fieldLabel(field)} darj karein.`]],
      [/^(.+) is too long\.$/, field => [`${fieldLabel(field)} کی حد سے زیادہ تفصیل درج ہے۔`,`${fieldLabel(field)} ki hadd se zyada tafseel darj hai.`]],
      [/^Invalid (.+)$/, field => [`${fieldLabel(field)} درست نہیں۔`,`${fieldLabel(field)} durust nahin.`]],
    ];
    for (const [pattern,render] of patterns) {const match=value.match(pattern);if(match)return render(...match.slice(1))[index];}
    return null;
  }
  function t(source, protectData = false) {
    if (language === 'en' || !source) return source;
    const raw = String(source), value = raw.trim(), index = language === 'ur' ? 0 : 1;
    if (protectData && dataValues.has(value)) return source;
    if (catalog[value]) return raw.replace(value,catalog[value][index]);
    const composed = dynamic(value,index);
    if (composed) return raw.replace(value,composed);
    // Field units and required markers are deliberately kept separate from the label.
    const unit = value.match(/^(.*?)\s*(\(Rs\)|\*)$/);
    if (unit && catalog[unit[1]]) return raw.replace(value, catalog[unit[1]][index]+' '+(unit[2] === '(Rs)' && language === 'ur' ? '(روپے)' : unit[2]));
    return raw.replace(phrasePattern, term => {
      if (protectData && dataValues.has(term)) return term;
      return catalog[term][index];
    });
  }
  function picker() {
    return `<label class="language-control" data-no-translate><span lang="en">Language / زبان</span><select aria-label="Language / زبان" id="app-language"><option value="en" lang="en">English</option><option value="ur" lang="ur">اردو</option><option value="roman" lang="ur-Latn">Roman Urdu</option></select></label>`;
  }
  function sourceText(root, exclude = '') {
    if (!root) return '';
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const previous=textSources.get(node);
        return previous && node.data===previous.output ? previous.source : node.data;
      }
      if (node.nodeType!==Node.ELEMENT_NODE || (exclude && node.matches(exclude))) return '';
      return (exclude && node.matches('small') ? ' · ' : '') + [...node.childNodes].map(visit).join('');
    }
    return visit(root);
  }
  let observer;
  function localise(root = document.body) {
    if (!root) return;
    observer?.disconnect();
    try {
      const walker = document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,{
        acceptNode(node) {
          const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
          if (!parent || parent.closest('script,style,textarea,datalist,[data-no-translate]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.data.trim()) continue;
          const previous = textSources.get(node);
          const source = previous && node.data === previous.output ? previous.source : node.data;
          // User-edited text and source archives are never rewritten.
          const output = node.parentElement.closest('[contenteditable],.user-identity b,.avatar') ? source : t(source,true);
          if (node.data !== output) node.data = output;
          textSources.set(node,{source,output});
        } else {
          let attributes = attributeSources.get(node);
          if (!attributes) { attributes = {}; attributeSources.set(node,attributes); }
          for (const name of ['placeholder','title','aria-label']) {
            if (!node.hasAttribute(name)) continue;
            const current = node.getAttribute(name), previous = attributes[name];
            const source = previous && current === previous.output ? previous.source : current;
            const output = t(source);
            if (current !== output) node.setAttribute(name, output);
            attributes[name] = {source,output};
          }
          if (node.matches('input:not([type="hidden"]),textarea')) {
            const forceLTR = /^(number|date|time|datetime-local|email|url|tel|password)$/.test(node.type) || /bilty|cnic|mobile|phone|username|confirmation/.test(node.name);
            node.dir = forceLTR ? 'ltr' : 'auto';
          }
        }
      }
      document.querySelectorAll('#app-language').forEach(select => {select.value=language;});
      document.title = language === 'ur' ? 'APG — مال اور حسابات' : language === 'roman' ? 'APG — Maal aur hisaab' : 'APG — Goods & accounts';
    } finally { observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']}); }
  }
  function setLanguage(value) {
    if (!supported.has(value)) return;
    language = value;
    try { localStorage.setItem('apg.language',value); } catch {}
    document.documentElement.lang = value === 'roman' ? 'ur-Latn' : value;
    document.documentElement.dir = value === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.dataset.language = value;
    document.querySelectorAll('[data-language-validation]').forEach(input=>{input.setCustomValidity('');delete input.dataset.languageValidation;});
    localise();
    window.dispatchEvent(new CustomEvent('apg-language-change',{detail:value}));
  }
  observer = new MutationObserver(() => localise());
  window.APG = {t,remember,picker,localise,setLanguage,sourceText,get language(){return language;}};
  document.addEventListener('change', event => {if (event.target.id === 'app-language') setLanguage(event.target.value);});
  document.addEventListener('change',event=>{const input=event.target;if(dataKeys.has(input.name))remember({[input.name]:input.value});});
  document.addEventListener('invalid',event=>{
    const input=event.target;
    if(language==='en'||!input.validity)return;
    const validity=input.validity;
    const message=validity.valueMissing?'Please fill in this field.':validity.typeMismatch?'Please enter a valid value.':validity.rangeUnderflow?'The value is below the allowed minimum.':validity.rangeOverflow?'The value is above the allowed maximum.':validity.stepMismatch||validity.badInput?'Please enter a valid number.':validity.patternMismatch?'Please use the required format.':validity.tooShort?'Please enter a longer value.':'Please check this value.';
    input.setCustomValidity(t(message));input.dataset.languageValidation='true';
  },true);
  document.addEventListener('input',event=>{if(event.target.dataset.languageValidation){event.target.setCustomValidity('');delete event.target.dataset.languageValidation;}});
  setLanguage(language);
})();
