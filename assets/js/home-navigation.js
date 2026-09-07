(() => {
  const config = document.currentScript.dataset;
  const pages = [
    {url: new URL(config.archiveUrl, location.href), label: '文章'},
    {url: new URL(config.profileUrl, location.href), label: '全部文章'},
    {url: new URL(config.projectsUrl, location.href), label: '项目'}
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
  let firstFrame, secondFrame, idleCallback, idleTimeout;
  let homeReady = document.readyState === 'complete';
  const supportsRules = HTMLScriptElement.supports?.('speculationrules');
  const supportsPrefetch = document.createElement('link').relList.supports?.('prefetch');
  const status = document.createElement('span');
  status.className = 'navigation-status';
  status.setAttribute('role', 'status');
  document.body.append(status);

  function canPrepare() {
    const connection = navigator.connection;
    return document.visibilityState === 'visible' && navigator.onLine &&
      !connection?.saveData && !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType);
  }

  function cancelScheduled() {
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
    if ('cancelIdleCallback' in window) cancelIdleCallback(idleCallback);
    clearTimeout(idleTimeout);
  }

  function discard() {
    cancelScheduled();
    pages.forEach(page => {
      page.hint?.remove();
      page.hint = undefined;
      clearTimeout(page.expiry);
    });
  }

  function prepare(page) {
    if (!homeReady || page.hint || !page.links.length || !canPrepare()) return;
    if (supportsRules) {
      page.hint = document.createElement('script');
      page.hint.type = 'speculationrules';
      page.hint.textContent = JSON.stringify({prefetch: [{
        urls: [page.url.href], eagerness: 'immediate'
      }]});
    } else if (supportsPrefetch) {
      // Other supporting browsers can warm their ordinary HTTP cache.
      page.hint = document.createElement('link');
      page.hint.rel = 'prefetch';
      page.hint.href = page.url.href;
      page.hint.as = 'document';
      page.hint.fetchPriority = 'low';
    } else return;
    document.head.append(page.hint);
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
      clearTimeout(pendingTimeout);
      pendingTimeout = setTimeout(clearPending, 10000);
      // Native links retain history, accessibility and modified-click behavior.
    });
  }));

  function prepareAfterHome() {
    cancelScheduled();
    if (!homeReady || !canPrepare()) return;
    // Finish the home load, allow a paint, then use an idle turn. Only these
    // three HTML documents are fetched; their images and scripts are not run.
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const run = () => pages.forEach(prepare);
        if ('requestIdleCallback' in window) idleCallback = requestIdleCallback(run, {timeout: 1500});
        else idleTimeout = setTimeout(run, 0);
      });
    });
  }

  function resume() {
    discard();
    prepareAfterHome();
  }
  window.addEventListener('load', () => {
    homeReady = true;
    prepareAfterHome();
  }, {once: true});
  window.addEventListener('pageshow', event => {
    clearPending();
    if (event.persisted) resume();
  });
  window.addEventListener('pagehide', discard);
  window.addEventListener('offline', discard);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  navigator.connection?.addEventListener('change', resume);
  prepareAfterHome();
})();
