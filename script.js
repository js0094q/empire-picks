// script.js
// Handles booking form interactions for Lauren Hart Trauma Recovery

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('booking-form');
  const status = document.getElementById('form-status');
  const chipGroup = document.querySelectorAll('.chip');
  const daysInput = document.getElementById('days');

  // Toggle active state for preferred day chips
  chipGroup.forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      const selected = Array.from(chipGroup)
        .filter(btn => btn.classList.contains('active'))
        .map(btn => btn.dataset.value);
      daysInput.value = selected.join(', ');
    });
  });

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const values = Object.fromEntries(formData.entries());

      if (!values.days) {
        status.textContent = 'Select at least one preferred day to continue.';
        status.className = 'form-status error';
        return;
      }

      // Simulate a secure submission
      status.textContent = 'Submitting securely...';
      status.className = 'form-status';

      setTimeout(() => {
        status.textContent = 'Thank you. Your request was received and encrypted. Expect a confirmation within one business day.';
        status.className = 'form-status success';
        form.reset();
        chipGroup.forEach(btn => btn.classList.remove('active'));
        daysInput.value = '';
      }, 600);
    });
  }
});
