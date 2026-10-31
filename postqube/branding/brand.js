/* Postqube presentation overlay; no API calls, credentials, or user-content rewrites. */
(() => {
  'use strict';
  const name = 'Postqube';
  let instagramReady = false;
  const mark = '<rect width="64" height="64" rx="17" fill="#7c3aed"/><path d="m32 13 16 9v18l-16 9-16-9V22Z" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/><path d="m16 22 16 9 16-9M32 31v18m10-8 10 10" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';
  const wordmark = '<g transform="translate(0 2) scale(.6875)">' + mark + '</g><text x="55" y="33" fill="currentColor" font-family="Inter,Arial,sans-serif" font-size="29" font-weight="700" letter-spacing="-1">Postqube</text>';
  const knownText = /^(?:Postiz|Welcome to Postiz|Welcome back to Postiz|Sign in to Postiz|Sign up to Postiz|Postiz AI|Postiz Copilot)$/i;
  // Upstream requires an organization name. A blank optional company gets a
  // neutral workspace name through the normal form, with no auth/API override.
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!location.pathname.startsWith('/auth') || !(form instanceof HTMLFormElement)) return;
    const company = form.querySelector('input[name="company"]');
    if (!company || company.value.trim()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(company, 'Personal workspace');
    company.dispatchEvent(new Event('input', {bubbles:true}));
    company.dispatchEvent(new Event('change', {bubbles:true}));
    requestAnimationFrame(() => form.requestSubmit());
  }, true);
  function instagramNotice() {
    if (document.querySelector('.postqube-instagram-notice')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'postqube-instagram-notice';
    dialog.innerHTML = '<h2>Instagram está em configuração</h2><p>O Instagram ficará disponível depois de o administrador concluir a ativação. Por agora, já podes ligar a tua conta X.</p><button type="button">Entendido</button>';
    document.body.append(dialog);
    dialog.querySelector('button').addEventListener('click', () => { dialog.close(); dialog.remove(); });
    dialog.addEventListener('cancel', () => dialog.remove(), {once:true});
    dialog.showModal();
  }
  document.addEventListener('click', event => {
    if (!instagramReady && event.target instanceof Element && event.target.closest('[data-postqube-instagram="pending"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); instagramNotice();
    }
  }, true);
  function decorate() {
    for (const close of document.querySelectorAll('.mantine-Modal-close')) {
      const panel = close.parentElement;
      if (panel?.classList.contains('bg-newBgColorInner')) {
        panel.dataset.postqubeOnboarding = 'true';
        const content = Array.from(panel.children).find(e => e.tagName === 'DIV');
        if (content) {
          content.dataset.postqubeOnboardingContent = 'true';
          const steps = content.firstElementChild?.firstElementChild;
          if (steps) steps.dataset.postqubeSteps = 'true';
        }
      }
    }
    if (!document.querySelector('.postqube-source')) {
      const footer = document.createElement('footer');
      footer.className = 'postqube-source';
      footer.setAttribute('aria-label', 'Postqube source and license');
      footer.innerHTML = '<a href="https://github.com/drdrey7/postqube/tree/postqube-0.3.0-beta.1" target="_blank" rel="noopener noreferrer">Código-fonte</a><span> · </span><a href="https://github.com/drdrey7/postqube/blob/postqube-0.3.0-beta.1/LICENSE" target="_blank" rel="noopener noreferrer">AGPL</a><span> · </span><a href="https://drdrey7.github.io/postqube/" target="_blank" rel="noopener noreferrer">Ajuda</a>';
      document.body.append(footer);
    }
    if (/postiz/i.test(document.title)) document.title = document.title.replace(/postiz/gi, name);
    for (const svg of document.querySelectorAll('svg:not([data-postqube-brand])')) {
      const paths = Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d') || '');
      const icon = paths.some(d => d.startsWith('M12.8816 11.4648'));
      const text = paths.some(d => d.startsWith('M41.7953 5.76801'));
      if (!icon && !text) continue;
      svg.setAttribute('data-postqube-brand', text ? 'wordmark' : 'mark');
      svg.setAttribute('viewBox', text ? '0 0 234 48' : '0 0 64 64');
      svg.setAttribute('aria-label', name);
      svg.setAttribute('role', 'img');
      svg.innerHTML = text ? wordmark : mark;
    }
    for (const img of document.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      const filename = src.split('?')[0].split('/').pop();
      if (['logo.svg', 'postiz.svg'].includes(filename) && !img.dataset.postqubeBrand) {
        img.src = '/postqube/mark.svg'; img.alt = name; img.dataset.postqubeBrand = 'mark';
      } else if (['logo-text.svg', 'postiz-text.svg'].includes(filename) && !img.dataset.postqubeBrand) {
        img.src = '/postqube/wordmark.svg'; img.alt = name; img.dataset.postqubeBrand = 'wordmark';
      }
    }
    if (!instagramReady) {
      for (const card of document.querySelectorAll('button,[role="button"],[class*="cursor-pointer"]')) {
        if (card.dataset.postqubeInstagram || !/^Instagram\s*\(?Standalone\)?$/i.test(card.textContent.trim())) continue;
        card.dataset.postqubeInstagram = 'pending';
        card.setAttribute('aria-label', 'Instagram — configuração pendente');
        const label = document.createElement('small'); label.className = 'postqube-pending';
        label.textContent = 'Configuração pendente'; card.append(label);
      }
    }
    const auth = location.pathname.startsWith('/auth');
    if (auth) {
      const company = document.querySelector('input[name="company"]');
      if (company && !company.dataset.postqubeOptional) {
        company.dataset.postqubeOptional = 'true';
        company.placeholder = 'Company (optional)';
        company.setAttribute('aria-label', 'Company (optional)');
        company.removeAttribute('required');
        const field = company.parentElement?.parentElement;
        const label = field?.querySelector('label') || field?.firstElementChild;
        if (label && /^Company$/i.test(label.textContent.trim())) label.textContent = 'Company (optional)';
      }
    }
    if (auth && !document.querySelector('[data-postqube-hero]')) {
      let hero = Array.from(document.querySelectorAll('div,span')).find(e => e.textContent.includes('Entrepreneurs use') && !Array.from(e.children).some(c => c.textContent.includes('Entrepreneurs use')));
      if (hero) {
        while (hero.parentElement && !['BODY','HTML','FORM'].includes(hero.parentElement.tagName) && !hero.parentElement.querySelector('input,form,button[type="submit"]')) hero = hero.parentElement;
        if (!hero.querySelector('input,form') && hero !== document.body) {
          hero.dataset.postqubeHero = 'true';
          const content = document.createElement('section'); content.className = 'postqube-hero';
          content.innerHTML = '<div class="postqube-hero-kicker">POSTQUBE · EARLY ACCESS</div><h2>Your content.<br><em>Your next move.</em></h2><p>A focused workspace to plan, schedule and publish your next post.</p><div class="postqube-hero-flow"><span>Ideas</span><b>→</b><span>Drafts</span><b>→</b><span>Published</span></div><div class="postqube-hero-channels"><span><b>𝕏</b> Ready to connect</span><span><b>◎</b> Instagram · coming soon</span></div><small>Your own account. Your own workspace.</small>';
          hero.replaceChildren(content);
        }
      }
    }
    const regions = auth ? [document.body] : Array.from(document.querySelectorAll('nav,aside,header'));
    for (const root of regions) {
      if (!root) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const edits = [];
      while (walker.nextNode()) {
        const n = walker.currentNode, p = n.parentElement;
        if (!p || p.closest('script,style,textarea,input,[contenteditable],pre,code,.postqube-credit')) continue;
        if (knownText.test(n.nodeValue.trim())) edits.push(n);
      }
      for (const n of edits) n.nodeValue = n.nodeValue.replace(/postiz/gi, name);
    }
    if (auth && !document.querySelector('.postqube-credit')) {
      const form = document.querySelector('form');
      if (form) {
        const credit = document.createElement('small'); credit.className = 'postqube-credit';
        credit.append(document.createTextNode('Postqube · '));
        const a = document.createElement('a'); a.href = 'https://github.com/gitroomhq/postiz-app';
        a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Powered by Postiz';
        credit.append(a); const submit = form.querySelector('button[type="submit"]'); if (submit) { submit.parentElement.classList.add('postqube-submit'); submit.insertAdjacentElement('afterend', credit); } else form.append(credit);
      }
    }
  }
  function start() {
    fetch('/postqube/config.json', {cache:'no-store'}).then(r => r.json()).then(c => {
      instagramReady = c.instagramReady === true;
      if (instagramReady) document.querySelectorAll('[data-postqube-instagram]').forEach(card => {
        card.removeAttribute('data-postqube-instagram'); card.querySelector('.postqube-pending')?.remove();
      });
    }).catch(() => {});
    const icon = document.createElement('link'); icon.rel = 'icon'; icon.type = 'image/svg+xml';
    icon.href = '/postqube/mark.svg?v=1'; document.head.append(icon);
    const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = '/postqube/manifest.webmanifest'; document.head.append(manifest);
    const apple = document.createElement('link'); apple.rel = 'apple-touch-icon'; apple.href = '/postqube/icon-192.png'; document.head.append(apple);
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; decorate(); });
    });
    observer.observe(document.documentElement, {childList:true,subtree:true});
    decorate();
  }
  // Wait for hydration before modifying application chrome.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, {once:true});
})();
