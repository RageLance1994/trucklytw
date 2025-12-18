const DEFAULT_PALETTE = () => [
  getComputedStyle(document.documentElement).getPropertyValue('--main').trim() || '#ff5000',
  '#f23645',
  '#f58f12',
  '#089981',
  '#5b8def',
  '#b76df0'
];

const loadECharts = () => {
  if (window.echarts) return Promise.resolve(window.echarts);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-echarts]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.echarts));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
    script.async = true;
    script.defer = true;
    script.dataset.echarts = 'true';
    script.onload = () => resolve(window.echarts);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export class ChartWrapper {
  constructor(target, palette) {
    this.el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.el) throw new Error('Target element not found');
    this.palette = typeof palette === 'function' ? palette() : (palette || DEFAULT_PALETTE());
    this.gridColor = getComputedStyle(document.documentElement).getPropertyValue('--nav-hover').trim() || '#2E2E2E';
    this.chart = null;
    this._pending = [];
    this._echartsReady = !!window.echarts;
    this._echartsPromise = null;
    this._resizeScheduled = false;
    this._boundHandleResize = this._handleResize.bind(this);

    if (getComputedStyle(this.el).position === 'static') {
      this.el.style.position = 'relative';
    }

    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(this._boundHandleResize);
      this._resizeObserver.observe(this.el);
    } else {
      window.addEventListener('resize', this._boundHandleResize);
    }

    this._ensureECharts();
  }

  _ensureECharts() {
    if (this._echartsReady && window.echarts) return Promise.resolve(window.echarts);
    if (this._echartsPromise) return this._echartsPromise;
    this._echartsPromise = loadECharts()
      .then((ec) => {
        this._echartsReady = !!ec;
        const queued = [...this._pending];
        this._pending.length = 0;
        queued.forEach((cb) => cb?.());
        return ec;
      })
      .catch((err) => {
        console.error('[ChartWrapper] failed to load ECharts', err);
        return null;
      });
    return this._echartsPromise;
  }

  _destroyChart() {
    try { this.chart?.dispose?.(); } catch { }
    this.chart = null;
  }

  _baseOption(legend) {
    const legendIsObj = legend && typeof legend === 'object' && !Array.isArray(legend);
    const legendData = legendIsObj ? (legend.data || []) : (Array.isArray(legend) ? legend : undefined);
    return {
      color: this.palette,
      backgroundColor: 'transparent',
      animation: true,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        confine: true,
        borderWidth: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        textStyle: { color: '#fff' }
      },
      legend: legend ? {
        data: legendData,
        type: 'scroll',
        bottom: 0,
        textStyle: { color: '#ddd' },
        itemWidth: 18,
        itemHeight: 10,
        padding: [4, 12],
        pageIconColor: '#fff',
        pageTextStyle: { color: '#aaa' },
        ...(legendIsObj ? legend : {})
      } : undefined,
      grid: {
        left: 50,
        right: 50,
        top: 24,
        bottom: legend ? 70 : 30,
        containLabel: true
      },
      dataZoom: [],
      axisPointer: { link: [{ xAxisIndex: 'all' }] }
    };
  }

  _buildAxis(cfg = {}, position = 'left') {
    const base = {
      type: 'value',
      position,
      axisLine: { lineStyle: { color: '#888' } },
      axisLabel: { color: '#aaa' },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: this.gridColor, opacity: 0.6 } }
    };
    const merged = { ...base, ...cfg };
    if (cfg.show === false) merged.show = false;
    return merged;
  }

  _parseAnnotations(annotations) {
    const spans = Array.isArray(annotations?.xaxis) ? annotations.xaxis : [];
    return spans
      .map((ann) => {
        const start = Number(ann?.x ?? ann?.from);
        const end = Number(ann?.x2 ?? ann?.to ?? ann?.end ?? start);
        if (!Number.isFinite(start)) return null;
        return {
          start,
          end: Number.isFinite(end) ? end : start,
          color: ann?.fillColor || 'rgba(8,153,129,0.25)',
          opacity: Number.isFinite(ann?.opacity) ? ann.opacity : 0.25,
          label: typeof ann?.label === 'object' ? ann.label?.text : null
        };
      })
      .filter(Boolean);
  }

  _renderLine(echarts, { series = [], legend, showGrid = true, annotations, yAxis, yAxes, dataZoom, tooltip, ...rest } = {}) {
    this._destroyChart();
    if (!echarts) return null;
    const elRect = this.el.getBoundingClientRect();
    const width = Math.max(320, Math.floor(elRect.width || this.el.clientWidth || 320));
    const height = Math.max(240, Math.floor(elRect.height || this.el.clientHeight || 240));
    this.chart = echarts.init(this.el, null, { renderer: 'canvas', useDirtyRect: true, width, height, locale: 'it' });

    const spans = this._parseAnnotations(annotations);
    const axisConfig = Array.isArray(yAxis || yAxes) ? (yAxis || yAxes) : [yAxis || {}];
    const yAxesBuilt = axisConfig.map((cfg, idx) => this._buildAxis(cfg, cfg?.position === 'right' ? 'right' : 'left'));

    const buildSeries = series.map((s, idx) => {
      const markArea = spans.length && idx === 0
        ? {
          itemStyle: { color: spans[0]?.color || 'rgba(8,153,129,0.25)', opacity: spans[0]?.opacity ?? 0.25 },
          data: spans.map((span) => [{ xAxis: span.start }, { xAxis: span.end }])
        }
        : undefined;
      const visible = s?.visible !== false;
      return {
        name: s?.name || `Series ${idx + 1}`,
        type: 'line',
        smooth: s?.smooth ?? true,
        showSymbol: s?.showSymbol ?? false,
        connectNulls: true,
        lineStyle: { width: s?.lineStyle?.width ?? 2, color: s?.lineStyle?.color },
        itemStyle: { color: s?.itemStyle?.color },
        areaStyle: s?.areaStyle,
        data: Array.isArray(s?.data) ? s.data : [],
        yAxisIndex: Number.isFinite(s?.yAxisIndex) ? s.yAxisIndex : 0,
        show: visible,
        markArea: markArea && spans.length ? markArea : undefined
      };
    });

    const option = {
      ...this._baseOption(legend),
      ...rest,
      grid: {
        ...(this._baseOption(legend).grid),
        ...(rest?.grid || {})
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#666' } },
        axisLabel: { color: '#aaa' },
        axisTick: { show: false },
        splitLine: showGrid ? { show: true, lineStyle: { color: this.gridColor, opacity: 0.5 } } : { show: false }
      },
      yAxis: yAxesBuilt,
      dataZoom: Array.isArray(dataZoom) ? dataZoom : (dataZoom ? [dataZoom] : []),
      series: buildSeries,
      tooltip: tooltip || this._baseOption(legend).tooltip
    };

    this.chart.setOption(option, true);
    return this.chart;
  }

  line(options = {}) {
    const exec = () => {
      if (window.echarts) {
        this._renderLine(window.echarts, options);
      }
    };
    if (this._echartsReady && window.echarts) {
      exec();
      return this.chart;
    }
    this._pending.push(exec);
    this._ensureECharts();
    return this.chart;
  }

  _handleResize() {
    if (this._resizeScheduled) return;
    this._resizeScheduled = true;
    requestAnimationFrame(() => {
      this._resizeScheduled = false;
      if (!this.chart || !this.el?.isConnected) return;
      const rect = this.el.getBoundingClientRect();
      this.chart.resize({
        width: Math.floor(rect.width || this.el.clientWidth || 320),
        height: Math.floor(rect.height || this.el.clientHeight || 240)
      });
    });
  }

  resize() {
    this._handleResize();
  }
}
