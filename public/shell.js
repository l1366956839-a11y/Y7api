(() => {
  const logoSrc = '/__y7st__/logo.jpg';
  const isWelcome = document.body.classList.contains('y7st-welcome');
  const isTopDocument = window.top === window.self;

  function replaceProjectLogo() {
    if (!isTopDocument || isWelcome) return;
    document.documentElement.classList.add('y7st-project-host');
    const toggle = document.getElementById('sidebarLogoToggle');
    if (!toggle) return;
    toggle.querySelectorAll(':scope > *').forEach((child) => { child.style.display = 'none'; });
    if (toggle.querySelector('.y7api-project-logo')) return;
    const logo = document.createElement('img');
    logo.className = 'y7api-project-logo';
    logo.src = logoSrc;
    logo.alt = 'Y7api';
    toggle.append(logo);
  }

  function setupSidebarAutoToggle() {
    if (!isTopDocument || isWelcome) return;
    const sidebar = document.getElementById('studioSidebar');
    const toggle = document.getElementById('sidebarLogoToggle');
    if (!sidebar || !toggle) return;
    if (typeof window.toggleSidebarPinned !== 'function') return;
    if (sidebar.dataset.y7stAutoToggle) return;
    sidebar.dataset.y7stAutoToggle = '1';

    let hoverTimer = null;
    let leaveTimer = null;

    sidebar.addEventListener('mouseenter', () => {
      clearTimeout(leaveTimer);
      hoverTimer = setTimeout(() => {
        if (!sidebar.classList.contains('is-pinned')) window.toggleSidebarPinned({ preventDefault() {}, stopPropagation() {} });
      }, 200);
    });

    sidebar.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      leaveTimer = setTimeout(() => {
        if (sidebar.classList.contains('is-pinned')) window.toggleSidebarPinned({ preventDefault() {}, stopPropagation() {} });
      }, 400);
    });

    let userPinned = false;
    toggle.addEventListener('click', () => {
      userPinned = sidebar.classList.contains('is-pinned');
      if (userPinned) localStorage.setItem('y7st_user_pinned', '1');
      else localStorage.removeItem('y7st_user_pinned');
    });

    if (localStorage.getItem('y7st_user_pinned') === '1') {
      if (!sidebar.classList.contains('is-pinned')) window.toggleSidebarPinned({ preventDefault() {}, stopPropagation() {} });
    }
  }

  function rebrandSidebarBottom() {
    if (!isTopDocument || isWelcome) return;
    const sidebar = document.getElementById('studioSidebar');
    if (!sidebar || sidebar.dataset.y7stRebranded) return;
    sidebar.dataset.y7stRebranded = '1';

    const homeBtn = sidebar.querySelector('#github-entry-btn');
    if (homeBtn) homeBtn.style.display = 'none';

    const updateBtn = sidebar.querySelector('#update-now-btn');
    if (updateBtn) updateBtn.style.display = 'none';

    const versionBadge = sidebar.querySelector('#project-version-badge');
    if (versionBadge) versionBadge.style.display = 'none';

    const authorName = sidebar.querySelector('.author-name-lite');
    if (authorName) authorName.textContent = 'Y7api';

    const authorBox = sidebar.querySelector('.author-box');
    if (authorBox) {
      const dLetter = authorBox.querySelector('.letter-d');
      const xLetter = authorBox.querySelector('.letter-x');
      if (dLetter) dLetter.style.display = 'none';
      if (xLetter) xLetter.style.display = 'none';

      const socialRow = authorBox.querySelector('.social-row-lite');
      if (socialRow) socialRow.style.display = 'none';
    }
  }

  function init() {
    replaceProjectLogo();
    setupSidebarAutoToggle();
    rebrandSidebarBottom();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();