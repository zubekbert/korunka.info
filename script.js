(() => {
  'use strict';

  const photoLinks = [...document.querySelectorAll('[data-photo]')];
  const photos = photoLinks.map(link => ({ src: link.getAttribute('href'), alt: link.querySelector('img').alt }));
  const dialog = document.querySelector('#lightbox');
  const image = document.querySelector('#lightbox-img');
  const stage = document.querySelector('#lightbox-stage');
  const loading = document.querySelector('#lightbox-loading');
  const error = document.querySelector('#lightbox-error');
  const counter = document.querySelector('#lightbox-count');
  const closeButton = document.querySelector('#lightbox-close');
  const thumbnails = [...document.querySelectorAll('.lightbox-thumb')];
  let currentIndex = 0;
  let requestId = 0;
  let opener = null;
  let scrollPosition = 0;
  let previousBodyTop = '';
  let previousBodyPadding = '';
  let loadingTimer;
  let touchStart = null;

  // Bez podpory dialogu vedou fotografie dál přímo na původní soubory.
  if (dialog && typeof dialog.showModal === 'function') {
    function showPhoto(index) {
      currentIndex = (index + photos.length) % photos.length;
      const photo = photos[currentIndex];
      const thisRequest = ++requestId;
      clearTimeout(loadingTimer);
      image.hidden = true;
      image.classList.remove('is-ready');
      image.alt = photo.alt;
      error.hidden = true;
      loading.hidden = true;
      stage.setAttribute('aria-busy', 'true');
      counter.textContent = `${currentIndex + 1} / ${photos.length}`;
      counter.setAttribute('aria-label', `Fotografie ${currentIndex + 1} z ${photos.length}`);
      thumbnails.forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === currentIndex)));

      // Rychle načtená fotka nebliká načítacím indikátorem.
      loadingTimer = setTimeout(() => {
        if (thisRequest === requestId && dialog.open) loading.hidden = false;
      }, 160);

      const pendingImage = new Image();
      pendingImage.decoding = 'async';
      pendingImage.onload = async () => {
        try { await pendingImage.decode(); } catch { /* onload již potvrdil dostupnost obrázku. */ }
        if (thisRequest !== requestId || !dialog.open) return;
        clearTimeout(loadingTimer);
        image.src = photo.src;
        image.hidden = false;
        image.classList.add('is-ready');
        loading.hidden = true;
        stage.setAttribute('aria-busy', 'false');
        // Do mezipaměti připravíme jen bezprostředně sousední fotografie.
        [-1, 1].forEach(offset => {
          const next = new Image();
          next.src = photos[(currentIndex + offset + photos.length) % photos.length].src;
        });
      };
      pendingImage.onerror = () => {
        if (thisRequest !== requestId || !dialog.open) return;
        clearTimeout(loadingTimer);
        loading.hidden = true;
        error.hidden = false;
        stage.setAttribute('aria-busy', 'false');
      };
      pendingImage.src = photo.src;
    }

    function openLightbox(index, source) {
      opener = source;
      scrollPosition = window.scrollY;
      previousBodyTop = document.body.style.top;
      previousBodyPadding = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
      }
      document.body.style.top = `-${scrollPosition}px`;
      document.body.classList.add('lightbox-open');
      dialog.showModal();
      closeButton.focus({ preventScroll: true });
      showPhoto(index);
    }

    function closeLightbox() {
      if (!dialog.open) return;
      dialog.close();
    }

    photoLinks.forEach((link, index) => {
      link.setAttribute('aria-haspopup', 'dialog');
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openLightbox(index, link);
      });
    });
    closeButton.addEventListener('click', closeLightbox);
    document.querySelector('#lightbox-prev').addEventListener('click', () => showPhoto(currentIndex - 1));
    document.querySelector('#lightbox-next').addEventListener('click', () => showPhoto(currentIndex + 1));
    document.querySelector('#lightbox-retry').addEventListener('click', () => {
      // Tlačítko se při načítání skryje, proto přesuneme fokus na trvalý prvek.
      closeButton.focus({ preventScroll: true });
      showPhoto(currentIndex);
    });
    thumbnails.forEach(thumb => thumb.addEventListener('click', () => showPhoto(Number(thumb.dataset.index))));

    dialog.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const destinations = { ArrowLeft: currentIndex - 1, ArrowRight: currentIndex + 1, Home: 0, End: photos.length - 1 };
      if (Object.hasOwn(destinations, event.key)) {
        event.preventDefault();
        showPhoto(destinations[event.key]);
      }
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button')].filter(button => !button.disabled && button.getClientRects().length);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeLightbox();
    });
    dialog.addEventListener('close', () => {
      requestId += 1;
      clearTimeout(loadingTimer);
      touchStart = null;
      document.body.classList.remove('lightbox-open');
      document.body.style.top = previousBodyTop;
      document.body.style.paddingRight = previousBodyPadding;
      const priorScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, scrollPosition);
      document.documentElement.style.scrollBehavior = priorScrollBehavior;
      opener?.focus({ preventScroll: true });
      image.hidden = true;
      image.removeAttribute('src');
      loading.hidden = true;
      error.hidden = true;
      stage.setAttribute('aria-busy', 'false');
    });

    // Fotka a ovládání mají ochranný okraj; zavírací tlačítko jej nepotřebuje.
    let backgroundPointer = null;
    const protectedElements = [image, ...dialog.querySelectorAll('button:not(#lightbox-close)'), counter,
      document.querySelector('#lightbox-help'), loading, error];
    const compactGallery = window.matchMedia('(max-width: 767px), (pointer: coarse)');
    function isCloseArea(x, y) {
      if ((window.visualViewport?.scale ?? 1) > 1) return false;
      // Na mobilu ochráníme celý spodní pás, včetně okrajů a prostoru pod náhledy.
      if (compactGallery.matches && thumbnails[0]?.getClientRects().length) {
        const firstThumb = thumbnails[0].getBoundingClientRect();
        const bounds = dialog.getBoundingClientRect();
        if (y >= firstThumb.top - 16 && y <= bounds.bottom
            && x >= bounds.left && x <= bounds.right) return false;
      }
      return !protectedElements.some(element => {
        if (!element.getClientRects().length) return false;
        const rect = element.getBoundingClientRect();
        const margin = element === image ? 20 : element.tagName === 'BUTTON' ? 16 : 8;
        return x >= rect.left - margin && x <= rect.right + margin
          && y >= rect.top - margin && y <= rect.bottom + margin;
      });
    }
    dialog.addEventListener('pointerdown', event => {
      backgroundPointer = event.isPrimary !== false && event.button === 0 && isCloseArea(event.clientX, event.clientY)
        ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
    });
    dialog.addEventListener('pointermove', event => {
      if (backgroundPointer && event.pointerId === backgroundPointer.id
          && Math.hypot(event.clientX - backgroundPointer.x, event.clientY - backgroundPointer.y) >= 8) {
        backgroundPointer = null;
      }
    }, { passive: true });
    dialog.addEventListener('pointercancel', () => {
      backgroundPointer = null;
    });
    dialog.addEventListener('click', event => {
      const shouldClose = backgroundPointer
        && Math.hypot(event.clientX - backgroundPointer.x, event.clientY - backgroundPointer.y) < 8
        && isCloseArea(event.clientX, event.clientY);
      backgroundPointer = null;
      if (shouldClose) closeLightbox();
    });

    stage.addEventListener('touchstart', event => {
      if (event.touches.length !== 1 || event.target.closest('button') || (window.visualViewport?.scale ?? 1) > 1) {
        touchStart = null;
        return;
      }
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }, { passive: true });
    stage.addEventListener('touchend', event => {
      if (!touchStart || event.touches.length || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.4) showPhoto(currentIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
    stage.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  }

  photoLinks.forEach(link => {
    const thumbnail = link.querySelector('img');
    const fallback = link.querySelector('.gallery-error');
    const update = () => {
      link.classList.remove('is-loading');
      const failed = thumbnail.naturalWidth === 0;
      link.classList.toggle('has-error', failed);
      fallback.hidden = !failed;
    };
    thumbnail.addEventListener('load', update);
    thumbnail.addEventListener('error', update);
    if (thumbnail.complete) update();
    else link.classList.add('is-loading');
  });

  // Aktivní položka navigace odpovídá právě viditelné sekci.
  const navLinks = [...document.querySelectorAll('.site-header nav a')];
  const sections = navLinks.map(link => document.querySelector(link.getAttribute('href')));
  let scheduled = false;
  function updateNavigation() {
    scheduled = false;
    if (dialog?.open) return;
    const threshold = document.querySelector('.site-header').getBoundingClientRect().height + 60;
    let active = -1;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= threshold) active = index;
    });
    navLinks.forEach((link, index) => {
      if (index === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function scheduleNavigation() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateNavigation);
  }
  window.addEventListener('scroll', scheduleNavigation, { passive: true });
  window.addEventListener('resize', scheduleNavigation, { passive: true });
  window.addEventListener('load', scheduleNavigation);
  updateNavigation();
})();
