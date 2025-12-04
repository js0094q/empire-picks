(function () {
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('nav-menu');
  const availabilityList = document.getElementById('availability-list');
  const bookingForm = document.getElementById('booking-form');
  const bookingSuccess = document.getElementById('booking-success');
  const year = document.getElementById('year');

  // Enforce HTTPS for production environments
  if (location.protocol === 'http:' && location.hostname !== 'localhost') {
    location.href = location.href.replace('http:', 'https:');
  }

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('open');
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  document.querySelectorAll('[data-scroll]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.scroll);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  const availability = [
    { day: 'Monday', slots: ['10:00 AM', '2:00 PM'] },
    { day: 'Wednesday', slots: ['8:30 AM', '12:30 PM', '4:30 PM'] },
    { day: 'Thursday', slots: ['9:00 AM', '1:30 PM'] },
    { day: 'Friday', slots: ['9:00 AM (telehealth)', '12:30 PM'] },
  ];

  if (availabilityList) {
    availabilityList.innerHTML = availability
      .map(
        (slot) => `
          <li>
            <span>${slot.day}</span>
            <span class="muted">${slot.slots.join(' · ')}</span>
          </li>
        `
      )
      .join('');
  }

  const validators = {
    name: (value) => value.trim().length > 2,
    email: (value) => /.+@.+\..+/.test(value),
    phone: (value) => value.replace(/\D/g, '').length >= 10,
    service: (value) => Boolean(value),
    date: (value) => Boolean(value),
    time: (value) => Boolean(value),
    format: (value) => Boolean(value),
    consent: (checked) => checked === true,
  };

  const showError = (field, message) => {
    const errorEl = bookingForm?.querySelector(`[data-error="${field}"]`);
    if (errorEl) errorEl.textContent = message;
  };

  const clearErrors = () => {
    bookingForm?.querySelectorAll('.error').forEach((el) => (el.textContent = ''));
    bookingSuccess.textContent = '';
  };

  const persistRequest = (payload) => {
    const existing = JSON.parse(localStorage.getItem('bookingRequests') || '[]');
    existing.push({ ...payload, savedAt: new Date().toISOString() });
    localStorage.setItem('bookingRequests', JSON.stringify(existing));
  };

  bookingForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();

    const data = new FormData(bookingForm);
    const payload = {
      name: data.get('name'),
      email: data.get('email'),
      phone: data.get('phone'),
      service: data.get('service'),
      date: data.get('date'),
      time: data.get('time'),
      format: data.get('format'),
      notes: data.get('notes'),
      consent: bookingForm.querySelector('#consent')?.checked || false,
    };

    let valid = true;

    Object.entries(validators).forEach(([field, validate]) => {
      const value = field === 'consent' ? payload.consent : payload[field];
      if (!validate(value)) {
        valid = false;
        showError(field, 'This field is required to book a session.');
      }
    });

    if (!valid) return;

    bookingForm.setAttribute('aria-busy', 'true');

    setTimeout(() => {
      persistRequest(payload);
      bookingSuccess.textContent = 'Request received! Lauren will confirm your time within one business day.';
      bookingForm.reset();
      bookingForm.removeAttribute('aria-busy');
    }, 350);
  });
})();
