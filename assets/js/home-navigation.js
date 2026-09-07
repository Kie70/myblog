(() => {
  const config = document.currentScript.dataset;
  const pages = [
    {url: new URL(config.archiveUrl, location.href), label: '文章'},
    {url: new URL(config.profileUrl, location.href), label: '全部文章'}
  ].filter(page => page.url.origin === location.origin);
  pages.forEach(page => {
    page.links = [...document.querySelectorAll('a[href]')].filter(link =>
      link.href === page.url.href && !link.hasAttribute('download') &&
      (!link.target || link.target === '_self')
    );
  });
  const links = pages.flatMap(page => page.links);
  if (!links.length) return;

  let pendingTimeout;
  const status = document.createElement('span');
  status.className = 'navigation-status';
  status.setAttribute('role', 'status');
  document.body.append(status);

  function discard() {
    pages.forEach(page => {
      page.hint?.remove();
      page.hint = undefined;
      clearTimeout(page.expiry);
      clearTimeout(page.idleTimer);
    });
  }

  function prepare(page) {
    const connection = navigator.connection;
    if (page.hint || !page.links.length || document.visibilityState !== 'visible' || !navigator.onLine ||
        connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType)) return;

    // Older document-prefetch hints can refetch HTML when cache headers require
    // revalidation. Unsupported browsers keep the ordinary link and feedback.
    if (!HTMLScriptElement.supports?.('speculationrules')) return;
    page.hint = document.createElement('script');
    page.hint.type = 'speculationrules';
    page.hint.textContent = JSON.stringify({prefetch: [{urls: [page.url.href]}]});
    document.head.append(page.hint);
    // Keep the preparation short-lived, instead of maintaining a custom page cache.
    page.expiry = setTimeout(() => {
      page.hint?.remove();
      page.hint = undefined;
    }, 60000);
  }

  function clearPending() {
    links.forEach(link => {
      link.removeAttribute('data-navigation-pending');
      link.removeAttribute('aria-busy');
    });
    status.textContent = '';
    clearTimeout(pendingTimeout);
  }

  pages.forEach(page => page.links.forEach(link => {
    link.addEventListener('pointerenter', () => prepare(page), {passive: true});
    link.addEventListener('focus', () => prepare(page));
    link.addEventListener('pointerdown', () => prepare(page), {passive: true});
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
          event.ctrlKey || event.shiftKey || event.altKey) return;
      link.setAttribute('data-navigation-pending', '');
      link.setAttribute('aria-busy', 'true');
      status.textContent = `正在打开${page.label}…`;
      pendingTimeout = setTimeout(clearPending, 10000);
      // Leave navigation, history, and scroll restoration to the browser.
    });
  }));

  navigator.connection?.addEventListener('change', discard);
  function prepareWhenIdle() {
    // Stagger the two small documents; explicit intent bypasses these timers.
    // Prefetch does not render the pages or request their hidden modal images.
    pages.forEach((page, index) => {
      page.idleTimer = setTimeout(() => {
        if ('requestIdleCallback' in window) requestIdleCallback(() => prepare(page), {timeout: 1500});
        else prepare(page);
      }, 1200 * (index + 1));
    });
  }
  window.addEventListener('pageshow', event => {
    clearPending();
    if (event.persisted) {
      discard();
      prepareWhenIdle();
    }
  });
  prepareWhenIdle();
})();
