(function () {
  'use strict';

  var C = window.BANYA_CONFIG || {};
  var phone = String(C.phone || '').replace(/[^\d+]/g, '');
  var waNumber = String(C.whatsapp || phone).replace(/\D/g, '');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function waUrl(text) {
    var url = 'https://wa.me/' + waNumber;
    return text ? url + '?text=' + encodeURIComponent(text) : url;
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

  /* ---------- Контакты из config.js ---------- */
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
    $$('[data-tg-copy]').forEach(function (btn) { btn.hidden = false; });
  }

  /* ---------- Уведомление ---------- */
  var toastEl = document.querySelector('[data-toast]');
  var toastTimer;

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3200);
  }

  function copyText(text, fallbackField) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        fallbackField.focus();
        fallbackField.select();
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  /* ---------- Нижняя панель на телефоне ----------
     Появляется, когда кнопки первого экрана ушли вверх, и прячется,
     пока на экране квиз или финальный блок со своими кнопками. */
  var dock = document.querySelector('[data-dock]');
  var heroCta = document.querySelector('[data-hero-cta]');

  if (dock && heroCta && 'IntersectionObserver' in window) {
    var heroPassed = false;
    var covered = {};
    var coverTargets = $$('#book, #contacts');

    var updateDock = function () {
      var isCovered = Object.keys(covered).some(function (key) { return covered[key]; });
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
    }, { rootMargin: '0px 0px -35% 0px' });
    coverTargets.forEach(function (el) { coverObserver.observe(el); });
  }

  /* ---------- Квиз ---------- */
  var quiz = document.getElementById('quiz');
  if (quiz) initQuiz(quiz);

  function initQuiz(form) {
    var steps = $$('[data-step]', form);
    var total = steps.length - 1; // последний шаг — готовое сообщение
    var current = 0;
    var started = false;
    var messageEdited = false;
    var pointerOption = null;
    var pointerTime = 0;

    var count = form.querySelector('[data-quiz-count]');
    var bar = form.querySelector('[data-quiz-bar]');
    var nextBtn = form.querySelector('[data-next]');
    var backBtn = form.querySelector('[data-back]');
    var restartBtn = form.querySelector('[data-restart]');
    var sendLink = form.querySelector('[data-quiz-send]');
    var tgCopy = form.querySelector('[data-tg-copy]');
    var dateField = form.querySelector('[data-date-field]');
    var dateInput = form.elements.date;
    var nameInput = form.elements.name;
    var message = form.elements.message;

    var dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    dateInput.min = isoDate(new Date());

    function checked(name) {
      var input = form.querySelector('input[name="' + name + '"]:checked');
      return input ? input.value : '';
    }

    function stepValid(i) {
      var choice = steps[i].querySelector('input[type="radio"]:checked');
      if (!choice) return false;
      if (choice.name === 'when' && choice.value === 'date') return Boolean(dateInput.value);
      return true;
    }

    function whenText() {
      var when = checked('when');
      var day = new Date();
      if (when === 'today') return 'сегодня, ' + dayFormat.format(day);
      if (when === 'tomorrow') {
        day.setDate(day.getDate() + 1);
        return 'завтра, ' + dayFormat.format(day);
      }
      if (when === 'weekend') return 'на ближайших выходных';
      if (when === 'date' && dateInput.value) {
        var parts = dateInput.value.split('-');
        return dayFormat.format(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      }
      if (when === 'unknown') return 'дату пока не выбрали';
      return '';
    }

    function compose() {
      var name = nameInput.value.trim();
      var lines = [name ? 'Здравствуйте! Меня зовут ' + name + ', хочу забронировать баню.' : 'Здравствуйте! Хочу забронировать баню.'];
      var guests = checked('guests');
      var program = checked('program');
      var occasion = checked('occasion');
      var when = whenText();
      if (guests) lines.push('Гостей: ' + guests);
      if (program) lines.push('Парение: ' + program);
      if (occasion) lines.push('Повод: ' + occasion);
      if (when) lines.push('Когда: ' + when);
      lines.push('Подскажите, пожалуйста, свободное время и стоимость.');
      return lines.join('\n');
    }

    function updateSend() {
      sendLink.href = waUrl(message.value.trim());
    }

    // поле сообщения растёт под текст, чтобы его не приходилось прокручивать
    function fitMessage() {
      message.style.height = 'auto';
      message.style.height = message.scrollHeight + 4 + 'px';
    }

    function show(i, moveFocus) {
      current = i;
      var isFinal = i === total;
      steps.forEach(function (step, idx) { step.hidden = idx !== i; });

      count.textContent = isFinal ? 'Готово' : 'Вопрос ' + (i + 1) + ' из ' + total;
      bar.style.setProperty('--p', ((isFinal ? total : i + 1) / total) * 100 + '%');

      backBtn.hidden = i === 0 || isFinal;
      restartBtn.hidden = !isFinal;
      nextBtn.hidden = isFinal;
      nextBtn.disabled = !stepValid(i);

      if (isFinal) {
        if (!messageEdited) message.value = compose();
        updateSend();
        fitMessage();
        goal('quiz_ready');
      } else if (i > 0) {
        goal('quiz_step_' + (i + 1));
      }

      if (moveFocus) {
        var heading = steps[i].querySelector('legend, h3');
        if (heading) heading.focus({ preventScroll: true });
        if (form.getBoundingClientRect().top < 0) {
          form.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        }
      }
    }

    // Тап по варианту сразу ведёт к следующему вопросу. Выбор стрелками
    // с клавиатуры так не делает — там переход по кнопке «Дальше».
    form.addEventListener('pointerdown', function (event) {
      pointerOption = event.target.closest ? event.target.closest('.option') : null;
      pointerTime = Date.now();
    }, true);

    form.addEventListener('change', function (event) {
      var target = event.target;
      if (target.type === 'radio') {
        if (!started) {
          started = true;
          goal('quiz_start');
        }
        if (target.name === 'when') {
          dateField.hidden = target.value !== 'date';
          if (target.value === 'date') dateInput.focus();
        }
      }
      if (target === dateInput || target.type === 'radio') {
        nextBtn.disabled = !stepValid(current);
      }
    });

    form.addEventListener('click', function (event) {
      var target = event.target;
      if (target.type !== 'radio') return;
      var tapped = pointerOption && pointerOption.contains(target) && Date.now() - pointerTime < 1000;
      pointerOption = null;
      if (!tapped) return;
      if (target.name === 'when' && target.value === 'date') return;
      var from = current;
      setTimeout(function () {
        if (current === from && stepValid(from)) show(from + 1, true);
      }, 240);
    });

    dateInput.addEventListener('input', function () { nextBtn.disabled = !stepValid(current); });

    nextBtn.addEventListener('click', function () {
      if (stepValid(current)) show(current + 1, true);
    });

    backBtn.addEventListener('click', function () {
      if (current > 0) show(current - 1, true);
    });

    restartBtn.addEventListener('click', function () {
      form.reset();
      messageEdited = false;
      dateField.hidden = true;
      show(0, true);
    });

    nameInput.addEventListener('input', function () {
      if (!messageEdited) message.value = compose();
      updateSend();
      fitMessage();
    });

    message.addEventListener('input', function () {
      messageEdited = true;
      updateSend();
      fitMessage();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (current < total) {
        if (stepValid(current)) show(current + 1, true);
      } else {
        sendLink.click();
      }
    });

    sendLink.addEventListener('click', function () {
      updateSend();
      goal('quiz_send');
      goal('whatsapp', { place: 'quiz' });
    });

    if (tgCopy && C.telegram) {
      tgCopy.addEventListener('click', function () {
        var text = message.value.trim();
        goal('telegram', { place: 'quiz' });
        copyText(text, message).then(function () {
          toast('Текст скопирован — вставьте его в чат Telegram');
        }, function () {
          toast('Скопируйте текст сообщения и вставьте его в чат Telegram');
        });
        window.open(C.telegram, '_blank', 'noopener');
      });
    }

    show(0, false);
  }

  /* ---------- Просмотр фото ---------- */
  var lightbox = document.querySelector('[data-lightbox]');
  var thumbs = $$('[data-gallery] button');

  if (lightbox && thumbs.length && typeof lightbox.showModal === 'function') {
    var lbImg = lightbox.querySelector('img');
    var lbCaption = lightbox.querySelector('figcaption');
    var index = 0;
    var touchX = null;

    lbImg.addEventListener('load', function () {
      // вписываем фото в экран, но маленькие не растягиваем больше чем вдвое
      var scale = Math.min(
        2,
        (document.documentElement.clientWidth - 24) / lbImg.naturalWidth,
        (window.innerHeight * 0.76) / lbImg.naturalHeight
      );
      lbImg.style.width = Math.round(lbImg.naturalWidth * scale) + 'px';
    });

    var openAt = function (i) {
      index = (i + thumbs.length) % thumbs.length;
      var img = thumbs[index].querySelector('img');
      lbImg.src = thumbs[index].getAttribute('data-full') || img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCaption.textContent = img.alt;
      if (!lightbox.open) lightbox.showModal();
    };

    thumbs.forEach(function (thumb, i) {
      thumb.setAttribute('aria-label', 'Открыть фото: ' + thumb.querySelector('img').alt);
      thumb.addEventListener('click', function () { openAt(i); });
    });

    lightbox.querySelector('[data-lb-prev]').addEventListener('click', function () { openAt(index - 1); });
    lightbox.querySelector('[data-lb-next]').addEventListener('click', function () { openAt(index + 1); });
    lightbox.querySelector('[data-lb-close]').addEventListener('click', function () { lightbox.close(); });

    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') openAt(index - 1);
      if (event.key === 'ArrowRight') openAt(index + 1);
    });
    lightbox.addEventListener('touchstart', function (event) {
      touchX = event.touches[0].clientX;
    }, { passive: true });
    lightbox.addEventListener('touchend', function (event) {
      if (touchX === null) return;
      var dx = event.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) openAt(dx < 0 ? index + 1 : index - 1);
      touchX = null;
    });
    lightbox.addEventListener('close', function () { thumbs[index].focus(); });
  }

  /* ---------- Длинные отзывы ---------- */
  var reviews = $$('.review');

  function measureReviews() {
    reviews.forEach(function (review) {
      if (review.classList.contains('is-open')) return;
      var text = review.querySelector('.review__text');
      var more = review.querySelector('.review__more');
      if (text && more) more.hidden = text.scrollHeight - text.clientHeight < 4;
    });
  }

  reviews.forEach(function (review) {
    var more = review.querySelector('.review__more');
    if (!more) return;
    more.addEventListener('click', function () {
      var open = review.classList.toggle('is-open');
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Свернуть' : 'Читать полностью';
    });
  });

  measureReviews();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureReviews);
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measureReviews, 150);
  });
})();
