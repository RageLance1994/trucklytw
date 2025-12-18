export class Counter {
  constructor(target, series) {
    this.target = typeof target != "string" ? target : document.querySelector(target);
    this.series = series;
    this.label = null;
    this._init();
  }

  _init() {
    this._cleanup();
    this.container = document.createElement('div');
    this.container.classList.value = "progressbar"
    this.target.appendChild(this.container);
    this.series = this.series.map((s, i) => {
      const seriesOl = document.createElement('div');
      seriesOl.classList.value = "bar";
      const value = s.value ?? 0;
      seriesOl.style.left = `${s.startpoint ?? 0}%`;
      seriesOl.style.width = `${value}%`;
      seriesOl.style.zIndex = 99- 4*i; 
      if (i == 0) {
        seriesOl.style.borderTopLeftRadius = "4px"
        seriesOl.style.borderBottomLeftRadius = "4px"
      }
      if (i == this.series.length - 1) {
        seriesOl.style.borderTopRightRadius = "4px"
        seriesOl.style.borderBottomRightRadius = "4px"
      }


      seriesOl.style.backgroundColor = s.color;

      this.container.appendChild(seriesOl);


      return ({ ...s, element: seriesOl, value })
    })
    this.label = document.createElement('div');
    this.label.classList.value = "perc";
    this.label.textContent = "";
    this.container.appendChild(this.label);

    this._render();
  }
  _setSeries(idx, newValue) {
    const target = typeof idx === 'number' ? this.series[idx] : this.series.find(s => s.name === idx);
    if (!target) return;
    target.value = Math.max(0, Math.min(newValue ?? 0, 100));
    this._render();
  }

  _render() {
    let offset = 0;
    this.series.forEach((s) => {
      const width = s.value ?? 0;
      const start = s.constant ? (s.startpoint ?? offset) : offset;
      s.element.style.left = `${start}%`;
      s.element.style.width = `${width}%`;
      if (!s.constant) {
        offset += width;
      }
    });
  }

  setSeries(idx, newValue) {
    this._setSeries(idx, newValue);
  }

  setLabel(text = '') {
    this.setText(text);
  }

  setText(text = '', options = {}) {
    if (!this.label || !this.container) return;
    const { minWidth = 72 } = options;
    const display = text || '';
    const primary = this.series?.[0]?.element;
    const width = primary?.offsetWidth ?? this.container.offsetWidth ?? 0;
    const isNarrow = width < minWidth;

    if (isNarrow) {
      this.label.textContent = '';
      if (display) {
        this.container.setAttribute('title', display);
      } else {
        this.container.removeAttribute('title');
      }
    } else {
      this.label.textContent = display;
      this.container.removeAttribute('title');
    }
  }

  _cleanup() {
    if (!this.target) return;
    this.target.querySelectorAll('.progressbar').forEach(el => el.remove());
  }
}
