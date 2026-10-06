(function () {
  'use strict';

  var C = window.BANYA_CONFIG || {};
  var phone = String(C.phone || '').replace(/[^\d+]/g, '');
  var waNumber = String(C.whatsapp || phone).replace(/\D/g, '');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  // В собранном файле каждое фото лежит один раз, повторы берут его отсюда
  $$('img[data-same]').forEach(function (img) {
    var source = document.querySelector('img[data-key="' + img.getAttribute('data-same') + '"]');
    if (source) img.src = source.getAttribute('src');
  });

  function waUrl(text) {
    var url = 'https://wa.me/' + waNumber;
    return text ? url + '?text=' + encodeURIComponent(text) : url;
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms || 150);
    };
  }

  /* ---------- Яндекс Метрика ---------- */
  var metrikaId = Number(C.metrikaId) || 0;

  if (metrikaId) {
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = 1;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(metrikaId, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }

  function goal(name, params) {
    if (metrikaId && typeof window.ym === 'function') {
      window.ym(metrikaId, 'reachGoal', name, params || {});
    }
  }

  /* ---------- Контакты из настроек ---------- */
  $$('[data-wa]').forEach(function (link) {
    link.href = waUrl(link.getAttribute('data-wa') || C.waDefaultText || '');
    link.target = '_blank';
    link.rel = 'noopener';
    link.addEventListener('click', function () {
      goal('whatsapp', { place: link.getAttribute('data-place') || '' });
    });
  });

  $$('[data-tel]').forEach(function (link) {
    if (phone) link.href = 'tel:' + phone;
    link.addEventListener('click', function () {
      goal('call', { place: link.getAttribute('data-place') || '' });
    });
  });

  if (C.phoneDisplay) {
    $$('[data-phone-text]').forEach(function (el) { el.textContent = C.phoneDisplay; });
  }

  if (C.telegram) {
    $$('[data-tg]').forEach(function (link) {
      link.href = C.telegram;
      link.target = '_blank';
      link.rel = 'noopener';
      link.hidden = false;
      link.addEventListener('click', function () {
        goal('telegram', { place: link.getAttribute('data-place') || '' });
      });
    });
  }

  /* ---------- Уведомление ---------- */
  var toastEl = document.querySelector('[data-toast]');
  var toastTimer;

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3400);
  }

  /* ---------- Плавающие кнопки ----------
     Появляются, когда кнопки первого экрана ушли вверх. Прячутся, пока
     на экране запись или контакты — там свои кнопки. */
  var dock = document.querySelector('[data-dock]');
  var heroCta = document.querySelector('[data-hero-cta]');

  if (dock && heroCta && 'IntersectionObserver' in window) {
    var heroPassed = false;
    var covered = {};

    var updateDock = function () {
      var isCovered = Object.keys(covered).some(function (id) { return covered[id]; });
      dock.classList.toggle('is-visible', heroPassed && !isCovered);
    };

    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        heroPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      });
      updateDock();
    }).observe(heroCta);

    var coverObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { covered[entry.target.id] = entry.isIntersecting; });
      updateDock();
    }, { rootMargin: '0px 0px -30% 0px' });
    $$('#book, #contacts').forEach(function (el) { coverObserver.observe(el); });
  }

  /* ---------- Запотевшее стекло ----------
     Поверх каждой створки — холст: размытая копия фото, белёсая дымка
     и капли конденсата. Курсор или палец стирают дымку, по протёртому
     иногда стекает капля. Через несколько секунд без касаний стекло
     «отпотевает» само, чтобы фото было видно и тем, кто не трогал. */
  initGlass();

  function initGlass() {
    var glass = document.querySelector('[data-glass]');
    if (!glass) return;
    var canvasTest = document.createElement('canvas');
    if (reducedMotion || !canvasTest.getContext) {
      glass.classList.add('is-off');
      return;
    }

    var frame = glass.querySelector('.glass__frame');
    var hint = glass.querySelector('[data-glass-hint]');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var brush = canHover ? 24 : 30;
    var drops = [];
    var stroke = null;
    var rafId = 0;
    var cleared = false;
    var touched = false;
    var idleTimer = 0;
    var pointer = null;
    var lastWidth = 0;

    var panes = $$('.glass__pane', glass).map(function (el) {
      var canvas = document.createElement('canvas');
      canvas.className = 'glass__fog';
      canvas.setAttribute('aria-hidden', 'true');
      el.appendChild(canvas);
      return { el: el, img: el.querySelector('img'), canvas: canvas, ctx: canvas.getContext('2d'), w: 0, h: 0 };
    });

    function loaded(img) { return img.complete && img.naturalWidth > 0; }

    function bead(ctx, x, y, r) {
      var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      g.addColorStop(0.55, 'rgba(206, 218, 211, 0.3)');
      g.addColorStop(1, 'rgba(84, 104, 94, 0.32)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function paint(p) {
      var rect = p.el.getBoundingClientRect();
      p.w = Math.max(2, Math.round(rect.width * dpr));
      p.h = Math.max(2, Math.round(rect.height * dpr));
      p.canvas.width = p.w;
      p.canvas.height = p.h;
      var ctx = p.ctx;
      var img = p.img;

      // размытая копия фото: уменьшаем в 14 раз и растягиваем обратно
      if (loaded(img)) {
        var k = 0.07;
        var small = document.createElement('canvas');
        small.width = Math.max(2, Math.round(p.w * k));
        small.height = Math.max(2, Math.round(p.h * k));
        var scale = Math.max(p.w / img.naturalWidth, p.h / img.naturalHeight);
        var dw = img.naturalWidth * scale;
        var dh = img.naturalHeight * scale;
        small.getContext('2d').drawImage(img, ((p.w - dw) / 2) * k, ((p.h - dh) / 2) * k, dw * k, dh * k);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, p.w, p.h);
      } else {
        ctx.fillStyle = '#c9d3cc';
        ctx.fillRect(0, 0, p.w, p.h);
      }

      // белёсая дымка, к низу чуть плотнее
      var haze = ctx.createLinearGradient(0, 0, 0, p.h);
      haze.addColorStop(0, 'rgba(238, 242, 239, 0.7)');
      haze.addColorStop(1, 'rgba(218, 226, 221, 0.78)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, p.w, p.h);

      // мелкий конденсат: светлые и тёмные точки, каждые одним путём
      var fine = Math.round((p.w * p.h) / (240 * dpr * dpr));
      ['rgba(255, 255, 255, 0.42)', 'rgba(118, 136, 128, 0.15)'].forEach(function (color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (var i = 0; i < fine; i++) {
          var x = Math.random() * p.w;
          var y = Math.random() * p.h;
          var r = (Math.random() * 1.2 + 0.35) * dpr;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      });

      // крупные капли
      var big = Math.round((p.w * p.h) / (5600 * dpr * dpr));
      for (var j = 0; j < big; j++) {
        bead(ctx, Math.random() * p.w, Math.random() * p.h, (Math.random() * 2.2 + 1.1) * dpr);
      }
    }

    function paintAll() {
      lastWidth = frame.clientWidth;
      panes.forEach(paint);
    }

    // мягкая кисть рисуется один раз, дальше только штампуется
    var brushPx = Math.round(brush * dpr);
    var brushSprite = document.createElement('canvas');
    brushSprite.width = brushSprite.height = brushPx * 2;
    (function () {
      var bctx = brushSprite.getContext('2d');
      var g = bctx.createRadialGradient(brushPx, brushPx, brushPx * 0.3, brushPx, brushPx, brushPx);
      g.addColorStop(0, 'rgba(0, 0, 0, 1)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, brushPx * 2, brushPx * 2);
    })();

    function stamp(p, x, y) {
      var ctx = p.ctx;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(brushSprite, x - brushPx, y - brushPx);
      ctx.globalCompositeOperation = 'source-over';
    }

    function addDrop(p, x, y) {
      if (drops.length > 40 || y > p.h) return;
      drops.push({ p: p, x: x, y: y, r: (1.3 + Math.random() * 1.5) * dpr, v: 0, life: 40 + Math.random() * 170 });
    }

    // отрезок в координатах экрана: штампуем по всем створкам, которые он задевает
    function wipe(from, to) {
      var steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (brush * 0.3)));
      panes.forEach(function (p) {
        var rect = p.el.getBoundingClientRect();
        for (var i = 0; i <= steps; i++) {
          var t = i / steps;
          var x = from.x + (to.x - from.x) * t - rect.left;
          var y = from.y + (to.y - from.y) * t - rect.top;
          if (x < -brush || y < -brush || x > rect.width + brush || y > rect.height + brush) continue;
          stamp(p, x * dpr, y * dpr);
          if (Math.random() < 0.022) addDrop(p, x * dpr, (y + brush * 0.7) * dpr);
        }
      });
      run();
    }

    function stepDrops() {
      for (var i = drops.length - 1; i >= 0; i--) {
        var d = drops[i];
        d.v = Math.min(d.v + 0.05 * dpr, 2.4 * dpr);
        d.y += Math.random() < 0.22 ? d.v * 0.1 : d.v; // капля то замирает, то срывается
        d.x += (Math.random() - 0.5) * 0.5 * dpr;
        var ctx = d.p.ctx;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        d.life -= 1;
        if (d.life <= 0 || d.y > d.p.h + d.r) drops.splice(i, 1);
      }
    }

    // при загрузке по стеклу «проводят ладонью» — так видно, что его можно протереть
    function stepStroke(now) {
      var t = Math.min(1, (now - stroke.start) / stroke.duration);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var r = frame.getBoundingClientRect();
      var pt = {
        x: r.left + r.width * (0.05 + 0.9 * e),
        y: r.top + r.height * (0.56 + 0.05 * Math.sin(e * Math.PI * 2.2))
      };
      wipe(stroke.last || pt, pt);
      stroke.last = pt;
      if (t >= 1) stroke = null;
    }

    function loop(now) {
      rafId = 0;
      if (stroke) stepStroke(now);
      stepDrops();
      if (stroke || drops.length) run();
    }

    function run() {
      if (!rafId && !cleared) rafId = requestAnimationFrame(loop);
    }

    function clearGlass() {
      if (cleared) return;
      cleared = true;
      clearTimeout(idleTimer);
      glass.classList.add('is-ready', 'is-clear');
      if (hint) hint.classList.add('is-done');
      setTimeout(function () {
        panes.forEach(function (p) { p.canvas.remove(); });
      }, 2800);
    }

    function touch() {
      if (!touched) {
        touched = true;
        if (hint) hint.classList.add('is-done');
        goal('glass_wipe');
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(clearGlass, 6500);
    }

    frame.addEventListener('pointerdown', function (e) {
      if (cleared) return;
      pointer = { x: e.clientX, y: e.clientY };
      wipe(pointer, pointer);
      touch();
    });

    frame.addEventListener('pointermove', function (e) {
      if (cleared) return;
      // мышь стирает просто наведением, палец — пока касается стекла
      if (e.pointerType !== 'mouse' && !pointer) return;
      var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (!events.length) events = [e];
      events.forEach(function (ev) {
        var pt = { x: ev.clientX, y: ev.clientY };
        wipe(pointer || pt, pt);
        pointer = pt;
      });
      touch();
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      frame.addEventListener(type, function () { pointer = null; });
    });

    window.addEventListener('resize', debounce(function () {
      if (!cleared && frame.clientWidth !== lastWidth) paintAll();
    }, 200));

    // ушли с первого экрана — стекло больше не держим запотевшим
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting && touched) clearGlass();
      }).observe(glass);
    }

    var waits = panes.map(function (p) {
      if (loaded(p.img)) return Promise.resolve();
      return new Promise(function (resolve) {
        p.img.addEventListener('load', resolve, { once: true });
        p.img.addEventListener('error', resolve, { once: true });
      });
    });

    Promise.all(waits).then(function () {
      if (cleared) return;
      paintAll();
      glass.classList.add('is-ready');
      if (hint) {
        hint.textContent = canHover
          ? 'Стекло запотело. Протрите его курсором'
          : 'Стекло запотело. Протрите его пальцем';
        hint.classList.add('is-shown');
      }
      setTimeout(function () {
        if (cleared) return;
        stroke = { start: performance.now(), duration: 1500, last: null };
        run();
      }, 650);
      idleTimer = setTimeout(clearGlass, 9000);
    });
  }

  /* ---------- Запись: сообщение собирается из отметок ---------- */
  initComposer();

  function initComposer() {
    var form = document.querySelector('[data-composer]');
    var message = document.querySelector('[data-message]');
    var send = document.querySelector('[data-send]');
    if (!form || !message || !send) return;

    var resetBtn = document.querySelector('[data-reset]');
    var tgCopy = document.querySelector('[data-tg-copy]');
    var dateField = form.querySelector('[data-date-field]');
    var dateInput = form.elements.date;
    var nameInput = form.elements.name;
    var edited = false;
    var started = false;

    var dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
    var weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' });

    var GUESTS = {
      '1–2': 'Нас будет 1–2 человека.',
      '3–4': 'Нас будет 3–4 человека.',
      '5–6': 'Нас будет 5–6 человек.',
      '7+': 'Нас будет 7 человек или больше.'
    };
    var PROGRAM = {
      aroma: 'Интересует аромапарение с травами.',
      master: 'Хотим парение с мастером.',
      ritual: 'Интересует обрядное парение.',
      advice: 'Посоветуйте, какое парение выбрать.'
    };
    var OCCASION = {
      birthday: 'Повод — день рождения.',
      couple: 'Хотим провести вечер вдвоём.',
      gift: 'Хочу подарить посещение близкому человеку.',
      friends: 'Собираемся с друзьями.'
    };

    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    dateInput.min = isoDate(new Date());

    function checked(name) {
      var input = form.querySelector('input[name="' + name + '"]:checked');
      return input ? input.value : '';
    }

    function whenLine() {
      var when = checked('when');
      var day = new Date();
      if (when === 'today') return 'Хотим приехать сегодня, ' + dayMonth.format(day) + '.';
      if (when === 'tomorrow') {
        day.setDate(day.getDate() + 1);
        return 'Хотим приехать завтра, ' + dayMonth.format(day) + '.';
      }
      if (when === 'weekend') return 'Хотим приехать на ближайших выходных.';
      if (when === 'date' && dateInput.value) {
        var p = dateInput.value.split('-');
        var picked = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        return 'Хотим приехать ' + dayMonth.format(picked) + ' (' + weekday.format(picked) + ').';
      }
      return '';
    }

    function compose() {
      var name = nameInput.value.trim();
      var lines = [name
        ? 'Здравствуйте! Меня зовут ' + name + '. Хочу забронировать баню.'
        : 'Здравствуйте! Хочу забронировать баню.'];
      [GUESTS[checked('guests')], whenLine(), PROGRAM[checked('program')], OCCASION[checked('occasion')]]
        .forEach(function (line) { if (line) lines.push(line); });
      lines.push('Подскажите, пожалуйста, свободное время и стоимость.');
      return lines.join('\n');
    }

    function fit() {
      message.style.height = 'auto';
      message.style.height = message.scrollHeight + 2 + 'px';
    }

    function update(animate) {
      if (!edited) {
        var text = compose();
        if (text !== message.value) {
          message.value = text;
          if (animate && !reducedMotion) {
            message.classList.remove('is-updated');
            void message.offsetWidth;
            message.classList.add('is-updated');
          }
        }
      }
      send.href = waUrl(message.value.trim());
      fit();
    }

    form.addEventListener('change', function (e) {
      if (e.target.name === 'when') {
        dateField.hidden = e.target.value !== 'date';
        if (e.target.value === 'date') dateInput.focus();
      }
      if (!started) {
        started = true;
        goal('book_start');
      }
      update(true);
    });

    form.addEventListener('input', function (e) {
      if (e.target === nameInput || e.target === dateInput) update(false);
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); });

    message.addEventListener('input', function () {
      edited = true;
      resetBtn.hidden = false;
      send.href = waUrl(message.value.trim());
      fit();
    });

    resetBtn.addEventListener('click', function () {
      edited = false;
      resetBtn.hidden = true;
      update(true);
    });

    send.addEventListener('click', function () {
      send.href = waUrl(message.value.trim());
      goal('whatsapp', { place: 'book' });
      goal('book_send');
    });

    if (tgCopy && C.telegram) {
      tgCopy.hidden = false;
      tgCopy.addEventListener('click', function () {
        var text = message.value.trim();
        goal('telegram', { place: 'book' });
        var done = function () { toast('Текст скопирован. Вставьте его в чат Telegram'); };
        var fail = function () { toast('Скопируйте текст сообщения и вставьте его в чат Telegram'); };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(done, fail);
        } else {
          try {
            message.select();
            if (document.execCommand('copy')) done(); else fail();
          } catch (err) {
            fail();
          }
        }
        window.open(C.telegram, '_blank', 'noopener');
      });
    }

    window.addEventListener('resize', debounce(fit, 150));
    update(false);
  }

  /* ---------- Лента фото ---------- */
  var suppressPhotoClick = false;
  initStrip();

  function initStrip() {
    var strip = document.querySelector('[data-strip]');
    if (!strip) return;
    var prev = document.querySelector('[data-strip-prev]');
    var next = document.querySelector('[data-strip-next]');

    function updateNav() {
      if (!prev || !next) return;
      prev.disabled = strip.scrollLeft < 4;
      next.disabled = strip.scrollLeft + strip.clientWidth > strip.scrollWidth - 4;
    }

    function page(direction) {
      strip.scrollBy({ left: direction * strip.clientWidth * 0.8, behavior: reducedMotion ? 'auto' : 'smooth' });
    }

    if (prev) prev.addEventListener('click', function () { page(-1); });
    if (next) next.addEventListener('click', function () { page(1); });
    strip.addEventListener('scroll', debounce(updateNav, 60), { passive: true });
    window.addEventListener('resize', debounce(updateNav, 150));
    updateNav();

    // мышью ленту можно тащить, как на телефоне
    var drag = null;
    strip.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: strip.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        strip.classList.add('is-dragging');
      }
      if (drag.moved) {
        e.preventDefault();
        strip.scrollLeft = drag.left - dx;
      }
    });
    window.addEventListener('pointerup', function () {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      if (!moved) return;
      suppressPhotoClick = true;
      setTimeout(function () { suppressPhotoClick = false; }, 0);
      requestAnimationFrame(function () { strip.classList.remove('is-dragging'); });
    });
  }

  /* ---------- Просмотр фото ---------- */
  initLightbox();

  function initLightbox() {
    var box = document.querySelector('[data-lightbox]');
    var sources = $$('.album__item img');
    if (!box || !sources.length || typeof box.showModal !== 'function') return;

    var img = box.querySelector('img');
    var caption = box.querySelector('figcaption');
    var counter = box.querySelector('[data-lb-count]');
    var index = 0;
    var opener = null;
    var touchX = null;

    img.addEventListener('load', function () {
      // вписываем в экран, маленькие фото увеличиваем не больше чем вдвое
      var scale = Math.min(
        2,
        (document.documentElement.clientWidth - 28) / img.naturalWidth,
        (window.innerHeight * 0.72) / img.naturalHeight
      );
      img.style.width = Math.round(img.naturalWidth * scale) + 'px';
    });

    function show(i) {
      index = (i + sources.length) % sources.length;
      var src = sources[index];
      var full = src.closest('[data-full]');
      img.src = full ? full.getAttribute('data-full') : src.getAttribute('src');
      img.alt = src.alt;
      caption.textContent = src.alt;
      counter.textContent = (index + 1) + ' из ' + sources.length;
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.ph[data-photo]') : null;
      if (!btn || suppressPhotoClick) return;
      opener = btn;
      show(Number(btn.getAttribute('data-photo')) || 0);
      if (!box.open) box.showModal();
      goal('photo_open');
    });

    box.querySelector('[data-lb-prev]').addEventListener('click', function () { show(index - 1); });
    box.querySelector('[data-lb-next]').addEventListener('click', function () { show(index + 1); });
    box.querySelector('[data-lb-close]').addEventListener('click', function () { box.close(); });

    box.addEventListener('click', function (e) {
      if (e.target === box) box.close();
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
    box.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(dx < 0 ? index + 1 : index - 1);
      touchX = null;
    });
    box.addEventListener('close', function () {
      if (opener) opener.focus();
    });
  }
})();
