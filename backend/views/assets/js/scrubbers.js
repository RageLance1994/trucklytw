export class Scrubber {
  constructor(target) {
    this.target = typeof target == "string" ? document.querySelector(target) : target;
    this.value = 0;
    this.events = [];
    this._handleResize = this._handleResize.bind(this);
    this.openEvent = this.openEvent.bind(this);
    this.closeEvent = this.closeEvent.bind(this);
    this.init();

  }

  init() {
    var content = `            <div class="scrubber">                                                  
                                  <div class="dot"></div>
                                </div>`

    this.target.innerHTML = content;
    this.dot = this.target.querySelector('.dot');;
    this.scrubber = this.target.querySelector('.scrubber');
    this.bufferbar = this.target.querySelector('.bufferbar');
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this._handleResize());
      this._resizeObserver.observe(this.scrubber);
    } else {
      window.addEventListener('resize', this._handleResize);
    }
    this.setValue(this.value || 0, false);
    this.enableDragging();
  }

  _handleResize() {
    if (!this.dot || !this.scrubber) return;
    this.setValue(this.value || 0, false);
  }

  openEvent(ev) {
    ev.currentTarget.classList.remove('closed');    
    ev.currentTarget.removeEventListener('mouseover', this.openEvent);
    ev.currentTarget.addEventListener('mouseleave', this.closeEvent);
  }

  closeEvent(ev) {
    const tgt = ev.currentTarget;
    tgt.classList.add('closed');
    tgt.removeEventListener('mouseleave', this.closeEvent);
    tgt.addEventListener('mouseover', this.openEvent);
  }


  setValue(v, emit = true) {
    const val = Math.max(0, Math.min(1, Number(v) || 0));
    this.value = val;

    const barRect = this.scrubber.getBoundingClientRect();
    const dotRect = this.dot.getBoundingClientRect();
    const usable = Math.max(0, barRect.width - dotRect.width);
    const px = Math.round(val * usable);

    // posiziona il dot
    this.dot.style.left = px + "px";

    if (emit) {
      this.dispatchChange(px, val);
    }
  }

  enableDragging() {
    let dragging = false;

    const posToValue = (clientX) => {
      const barRect = this.scrubber.getBoundingClientRect();
      const dotRect = this.dot.getBoundingClientRect();
      const usable = Math.max(0, barRect.width - dotRect.width);
      const rawPx = clientX - barRect.left - dotRect.width / 2; // centra il puntatore
      const px = Math.max(0, Math.min(usable, rawPx));
      const percent = usable ? (px / usable) : 0;
      return { px, percent };
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const { px, percent } = posToValue(e.clientX);
      // aggiorna senza ridondanze sull'evento (lo emettiamo qui direttamente)
      this.dot.style.left = px + "px";
      this.value = percent;
      this.dispatchChange(px, percent);
      e.preventDefault();
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      this.dot.releasePointerCapture?.(lastPointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp, true);
    };

    let lastPointerId = null;

    const startDrag = (e) => {
      lastPointerId = e.pointerId;
      dragging = true;
      this.dot.setPointerCapture?.(lastPointerId);
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp, true);
      // aggiorna subito alla posizione iniziale
      const { px, percent } = posToValue(e.clientX);
      this.dot.style.left = px + "px";
      this.value = percent;
      this.dispatchChange(px, percent);
      e.preventDefault();
    };

    // Drag dal dot
    this.dot.addEventListener("pointerdown", startDrag);

    // Click (o pointerdown) sulla barra per saltare a un punto e iniziare drag
    this.scrubber.addEventListener("pointerdown", (e) => {
      if (e.target === this.dot) return; // già gestito
      startDrag(e);
    });
  }

  dispatchChange(px, percent) {
    this.target.dispatchEvent(new CustomEvent("scrubber:change", {
      detail: { px, percent }
    }));
  }

  setEvents(events = []) {
    this.events = Array.isArray(events)
      ? events.filter(evt => Number.isFinite(Number(evt?.pct)))
      : [];
    this._renderEvents();
  }

  clearEvents() {
    if (!this.scrubber) return;
    this.scrubber.querySelectorAll('.sb-event').forEach(el => el.remove());
  }

  _renderEvents() {
    if (!this.scrubber) return;
    this.clearEvents();
    this.events.forEach((evt, idx) => {
      const pct = Math.max(0, Math.min(1, Number(evt.pct) || 0));
      const el = document.createElement('div');
      el.className = `sb-event ${evt.className || ''}`.trim() || 'sb-event';
      el.classList.add('closed');
      el.style.left = `${pct * 100}%`;
      el.dataset.eventIdx = idx;

      const icon = evt.icon || {};
      const iconHtml = icon.type === 'img'
        ? `<img src="${icon.value}" alt="${evt.label || ''}">`
        : `<i class="${icon.value || 'fa fa-info-circle'}"></i>`;

      el.innerHTML = `
      <div class="wrapper-h cg-382 j-center a-center">
        ${iconHtml}
        <p>${evt.label || ''}</p>
      </div>`;

      el.addEventListener('mouseover', this.openEvent);
      this.scrubber.appendChild(el);
    });
  }
}
