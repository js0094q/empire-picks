// modal.js
const Modal = {
  overlay: null,
  content: null,
  closeBtn: null,

  // ============================================================
// modal.js — Minimal for Layout 2
// ============================================================

window.Modal = {
  alert(msg) {
    alert(msg);
  }
};

  init() {
    // Create Modal HTML dynamically if it doesn't exist
    if (!document.querySelector('.modal-overlay')) {
      const div = document.createElement('div');
      div.className = 'modal-overlay';
      div.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="modal-title" style="margin:0">Game Details</h3>
            <button class="close-modal">&times;</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
        </div>
      `;
      document.body.appendChild(div);
    }

    this.overlay = document.querySelector('.modal-overlay');
    this.body = document.getElementById('modal-body');
    this.title = document.getElementById('modal-title');
    this.closeBtn = document.querySelector('.close-modal');

    // Event Listeners
    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  open(titleHtml, bodyHtml) {
    if (!this.overlay) this.init();
    this.title.innerHTML = titleHtml;
    this.body.innerHTML = bodyHtml;
    this.overlay.classList.add('open');
  },

  // Helper to inject a DOM element directly instead of HTML string
  openElement(titleText, domElement) {
    if (!this.overlay) this.init();
    this.title.textContent = titleText;
    this.body.innerHTML = '';
    this.body.appendChild(domElement);
    this.overlay.classList.add('open');
  },

  close() {
    if (this.overlay) this.overlay.classList.remove('open');
  }
};

window.Modal = Modal;// Beta modal placeholder
