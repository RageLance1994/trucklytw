export class ChartWrapper {
  constructor(target, palette) {
    this.el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.el) throw new Error('Target element not found');
    this.palette = palette || [
      getComputedStyle(document.documentElement).getPropertyValue('--main').trim() || '#ff5000',
      '#f23645', '#f58f12', '#089981'
    ];
    this.gridColor = getComputedStyle(document.documentElement).getPropertyValue('--nav-hover').trim() || '#2E2E2E';
    this._resizeScheduled = false;
    this._boundHandleResize = this._handleResize.bind(this);
    this._init();
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(this._boundHandleResize);
      this._resizeObserver.observe(this.el);
    } else {
      window.addEventListener('resize', this._boundHandleResize);
    }
  }

  _init() {
    if (this.chart && !this.chart.isDisposed) echarts.dispose(this.chart);
    this.chart = echarts.init(this.el, null, { backgroundColor: 'transparent' });
  }

  _split(show) { return show ? { show: true, lineStyle: { color: this.gridColor, width: 1, opacity: .8 } } : { show: false }; }
  _base(legend) {
    return {
      color: this.palette, animation: true,
      tooltip: { appendToBody: true, backgroundColor: 'rgba(0,0,0,0.7)', textStyle: { color: '#fff' } },
      legend: legend ? { data: legend, top: 0, textStyle: { color: '#fff' } } : undefined,
      grid: { left: 40, right: 12, top: 18, bottom: 22, containLabel: true },
      brush: {}, dataZoom: [], toolbox: {}
    };
  }

  line({ series = [], xAxis = {}, yAxis = {}, legend, showGrid = true, tooltip, ...rest } = {}) {
    this._init(); // pulizia garantita

    const buildAxis = (axis, factory) => {
      const normalise = (cfg = {}) => {
        const base = factory();
        const merged = { ...base, ...cfg };
        if (!('splitLine' in cfg)) {
          merged.splitLine = base.splitLine;
        }
        return merged;
      };

      return Array.isArray(axis) ? axis.map(normalise) : normalise(axis);
    };

    const opt = {
      ...this._base(legend),
      ...rest,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        ...(tooltip || {}),
      },
      xAxis: buildAxis(xAxis, () => ({
        type: 'time',
        axisLine: { lineStyle: { color: '#666' } },
        axisLabel: { color: '#aaa' },
        axisTick: { show: false },
        splitLine: this._split(showGrid),
      })),
      yAxis: buildAxis(yAxis, () => ({
        type: 'value',
        axisLine: { lineStyle: { color: '#666' } },
        axisLabel: { color: '#aaa' },
        axisTick: { show: false },
        splitLine: this._split(showGrid),
      })),
      series: series.map((s = {}) => {
        const {
          name,
          data = [],
          type,
          smooth,
          showSymbol,
          lineStyle: customLineStyle,
          areaStyle,
          markArea,
          markLine,
          markPoint,
          emphasis,
          itemStyle,
          tooltip: seriesTooltip,
          yAxisIndex,
          stack,
          step,
          symbol,
          symbolSize,
          connectNulls,
          z,
          zlevel,
          encode,
          ...extra
        } = s;

        const seriesOpt = {
          name,
          type: type || 'line',
          data,
          smooth: smooth ?? true,
          showSymbol: showSymbol ?? false,
          connectNulls: connectNulls ?? true,
          lineStyle: { width: 2, ...(customLineStyle || {}) },
          ...extra,
        };

        if (typeof yAxisIndex === 'number') seriesOpt.yAxisIndex = yAxisIndex;
        if (stack !== undefined) seriesOpt.stack = stack;
        if (step !== undefined) seriesOpt.step = step;
        if (symbol !== undefined) seriesOpt.symbol = symbol;
        if (symbolSize !== undefined) seriesOpt.symbolSize = symbolSize;
        if (typeof z === 'number') seriesOpt.z = z;
        if (typeof zlevel === 'number') seriesOpt.zlevel = zlevel;
        if (encode) seriesOpt.encode = encode;
        if (areaStyle) seriesOpt.areaStyle = areaStyle;
        if (itemStyle) seriesOpt.itemStyle = itemStyle;
        if (markArea) seriesOpt.markArea = markArea;
        if (markLine) seriesOpt.markLine = markLine;
        if (markPoint) seriesOpt.markPoint = markPoint;
        if (emphasis) seriesOpt.emphasis = emphasis;
        if (seriesTooltip) seriesOpt.tooltip = seriesTooltip;

        return seriesOpt;
      }),
    };


    opt.animationDuration = 1500;          // durata animazione in ms
    opt.animationEasing = 'cubicOut';     // easing morbido
    opt.animationThreshold = 50000;       // mantieni animazione fino a 50k punti
    opt.progressive = 2000;               // render parziale per fluidità
    opt.progressiveThreshold = 5000;      // inizia progressive dopo 5k punti


    this.chart.setOption(opt, true);
  }

  bar({ series = [], xAxis = {}, yAxis = {}, legend, showGrid = true }) {
    this._init();
    const isCat = (xAxis.type || 'category') === 'category';
    const cats = xAxis.data || (isCat && series[0]?.data?.map(d => Array.isArray(d) ? d[0] : d.x)) || undefined;
    const opt = {
      ...this._base(legend),
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: xAxis.type || (cats ? 'category' : 'time'), data: cats, axisLine: { lineStyle: { color: '#666' } }, axisLabel: { color: '#aaa' }, axisTick: { show: false }, splitLine: this._split(showGrid), ...xAxis },
      yAxis: { type: 'value', axisLine: { lineStyle: { color: '#666' } }, axisLabel: { color: '#aaa' }, axisTick: { show: false }, splitLine: this._split(showGrid), ...yAxis },
      series: series.map(s => ({ name: s.name, type: 'bar', barMaxWidth: 18, data: s.data }))
    };
    this.chart.setOption(opt, true);
  }

  scatter({ series = [], xAxis = {}, yAxis = {}, legend, showGrid = true }) {
    this._init();
    const opt = {
      ...this._base(legend),
      tooltip: { trigger: 'item', formatter: p => `${p.seriesName}<br>x: ${p.value[0]}<br>y: ${p.value[1]}` },
      xAxis: { type: xAxis.type || 'value', axisLine: { lineStyle: { color: '#666' } }, axisLabel: { color: '#aaa' }, axisTick: { show: false }, splitLine: this._split(showGrid), ...xAxis },
      yAxis: { type: yAxis.type || 'value', axisLine: { lineStyle: { color: '#666' } }, axisLabel: { color: '#aaa' }, axisTick: { show: false }, splitLine: this._split(showGrid), ...yAxis },
      series: series.map(s => ({ name: s.name, type: 'scatter', symbolSize: s.symbolSize || (v => (v[2] || 4)), data: s.data }))
    };
    this.chart.setOption(opt, true);
  }

  radar({ indicators = [], series = [], legend, radius = '70%' }) {
    this._init();
    const opt = {
      ...this._base(legend),
      tooltip: { trigger: 'item' },
      radar: { radius, indicator: indicators },
      series: series.map(s => ({ name: s.name, type: 'radar', areaStyle: s.areaStyle || {}, data: [{ value: s.data, name: s.name }] }))
    };
    this.chart.setOption(opt, true);
  }

  _handleResize() {
    if (this._resizeScheduled) return;
    this._resizeScheduled = true;
    requestAnimationFrame(() => {
      this._resizeScheduled = false;
      this.resize();
    });
  }

  resize() { this.chart.resize(); }
}

