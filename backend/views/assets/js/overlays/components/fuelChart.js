export class FuelChart {
  constructor(chart) {
    this.chart = chart;
    this.extraSeries = [];
  }

  clearExtraSeries() {
    this.extraSeries = [];
  }

  setExtraSeries(seriesList = []) {
    this.extraSeries = Array.isArray(seriesList) ? [...seriesList] : [];
  }

  addSeries(series) {
    if (!series) return;
    if (!Array.isArray(this.extraSeries)) this.extraSeries = [];
    this.extraSeries.push(series);
  }

  toNumber(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  toTimestamp(value) {
    if (value instanceof Date) return value.getTime();
    const num = Number(value);
    if (Number.isFinite(num)) return num < 1e12 ? num * 1000 : num;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  smoothSeries(series, windowSize = 5) {
    if (!Array.isArray(series) || series.length <= 2) return series;
    const w = Math.max(1, Math.floor(windowSize));
    const half = Math.floor(w / 2);
    return series.map((point, idx) => {
      const start = Math.max(0, idx - half);
      const end = Math.min(series.length - 1, idx + half);
      let sum = 0;
      let count = 0;
      for (let i = start; i <= end; i++) {
        const v = series[i][1];
        if (Number.isFinite(v)) {
          sum += v;
          count++;
        }
      }
      const avg = count ? sum / count : point[1];
      return [point[0], avg];
    });
  }

  normalizeEvents(events = []) {
    if (!Array.isArray(events)) return [];
    return events
      .map((evt, idx) => {
        const start = this.toTimestamp(evt?.startMs ?? evt?.start ?? evt?.startTs);
        let end = this.toTimestamp(evt?.endMs ?? evt?.end ?? evt?.endTs ?? start);
        if (!Number.isFinite(start)) return null;
        const durationMs = this.toNumber(evt?.durationMs);
        if (Number.isFinite(durationMs) && durationMs > 0) {
          const durationEnd = start + durationMs;
          if (!Number.isFinite(end) || end <= start) end = durationEnd;
          else if (durationEnd > end) end = durationEnd;
        }
        const normalizedType = (evt?.normalizedType || evt?.type || '').toLowerCase();
        const isRefuel = normalizedType === 'refuel' || normalizedType === 'rifornimento';
        const isWithdrawal = normalizedType === 'withdrawal' || normalizedType === 'fuel-theft' || normalizedType === 'theft';
        return {
          ...evt,
          eventId: evt?.eventId || evt?._id || `evt-${idx}`,
          start,
          end: Number.isFinite(end) ? end : start,
          type: normalizedType,
          isRefuel,
          isWithdrawal
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
  }

  extractSamples(history) {
    const source = Array.isArray(history?.raw)
      ? history.raw
      : Array.isArray(history?.data)
        ? history.data
        : Array.isArray(history)
          ? history
          : [];

    const samples = source
      .map((entry) => {
        const io = entry?.io || entry;
        const gps = entry?.gps || {};
        const ts = this.toTimestamp(entry?.timestamp ?? entry?.ts ?? io?.timestamp ?? io?.ts);
        if (!Number.isFinite(ts)) return null;

        const litersCandidates = [
          io.current_fuel,
          io.currentFuel,
          io.fuel_total,
          io.fuel,
          io.tank,
          io.tankLiters,
          io.value,
          io.liters
        ];
        let liters = null;
        for (const cand of litersCandidates) {
          const n = this.toNumber(cand);
          if (Number.isFinite(n)) {
            liters = n;
            break;
          }
        }

        const tank1 = this.toNumber(io.tank1 ?? io.tank_1 ?? io.tankPrimary ?? io.primaryTankCapacity);
        const tank2 = this.toNumber(io.tank2 ?? io.tank_2 ?? io.tankSecondary ?? io.secondaryTankCapacity);

        if (!Number.isFinite(liters) && !Number.isFinite(tank1) && !Number.isFinite(tank2)) return null;

        return {
          ts,
          liters,
          tank1,
          tank2
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts);

    return samples;
  }

  buildSeries(samples) {
    const fuel = samples
      .map((s) => [s.ts, this.toNumber(s.liters)])
      .filter(([, v]) => Number.isFinite(v));
    const tank1 = samples
      .map((s) => [s.ts, this.toNumber(s.tank1)])
      .filter(([, v]) => Number.isFinite(v));
    const tank2 = samples
      .map((s) => [s.ts, this.toNumber(s.tank2)])
      .filter(([, v]) => Number.isFinite(v));
    const capacity = samples
      .map((s) => {
        const t1 = this.toNumber(s.tank1) || 0;
        const t2 = this.toNumber(s.tank2) || 0;
        const total = t1 + t2;
        return Number.isFinite(total) && total > 0 ? total : null;
      })
      .filter((v) => Number.isFinite(v));

    const smoothedFuel = this.smoothSeries(fuel, Math.max(3, Math.round(fuel.length / 200)));
    return { fuel: smoothedFuel, tank1, tank2, capacity };
  }

  buildAnnotations(events = []) {
    const spans = this.normalizeEvents(events)
      .filter((evt) => (evt.isRefuel || evt.isWithdrawal) && Number.isFinite(evt.start))
      .map((evt) => {
        const start = evt.start;
        const end = Number.isFinite(evt.end) ? evt.end : start;
        const negative = evt.isWithdrawal;
        return {
          x: start,
          x2: end,
          fillColor: negative ? 'rgba(242,54,69,0.25)' : 'rgba(8,153,129,0.25)',
          borderColor: 'transparent',
          opacity: 0.25,
          label: {
            text: negative ? 'Prelievo' : 'Rifornimento',
            style: {
              color: '#fff',
              background: negative ? 'rgba(242,54,69,0.9)' : 'rgba(8,153,129,0.9)',
              fontSize: '14px',
              fontWeight: 800,
              padding: [6, 8]
            }
          }
        };
      });
    return spans.length ? { xaxis: spans } : undefined;
  }

  update(history, providedEvents = []) {
    const samples = this.extractSamples(history);
    if (!samples.length) {
      this.chart.line({
        legend: false,
        showGrid: true,
        series: [{ name: 'Livello carburante', type: 'line', data: [] }]
      });
      return;
    }

    const { fuel, tank1, tank2, capacity } = this.buildSeries(samples);
    const series = [];
    const fuelAxisIndex = 0;
    const fuelValues = fuel.map(([, v]) => v).filter((v) => Number.isFinite(v));
    let fuelMin = null;
    let fuelMax = null;
    if (fuelValues.length) {
      const positiveFuel = fuelValues.filter((v) => v > 0);
      const minSource = positiveFuel.length ? positiveFuel : fuelValues;
      fuelMin = Math.min(...minSource);
      fuelMax = Math.max(...fuelValues);
    }
    const capacityMax = capacity.length ? Math.max(...capacity) : null;
    const axisMax = Number.isFinite(capacityMax) ? capacityMax : fuelMax;
    if (Number.isFinite(fuelMin) && Number.isFinite(axisMax) && fuelMin >= axisMax) {
      fuelMin = axisMax - 1;
    }

    series.push({
      name: 'Livello carburante',
      visible: true,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color: '#ffb87a' },
      itemStyle: { color: '#ffb87a' },
      data: fuel,
      yAxisIndex: fuelAxisIndex
    });

    if (tank1.length) {
      series.push({
        name: 'Serbatoio 1',
        visible: true,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.2, color: '#8bd17c', opacity: 0.8 },
        itemStyle: { color: '#8bd17c' },
        data: tank1,
        yAxisIndex: fuelAxisIndex
      });
    }

    if (tank2.length) {
      series.push({
        name: 'Serbatoio 2',
        visible: true,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.2, color: '#d184ff', opacity: 0.8 },
        itemStyle: { color: '#d184ff' },
        data: tank2,
        yAxisIndex: fuelAxisIndex
      });
    }

    if (Array.isArray(this.extraSeries) && this.extraSeries.length) {
      this.extraSeries.forEach((s) => {
        if (!s?.name || !Array.isArray(s?.data)) return;
        series.push({
          name: s.name,
          visible: s.visible !== false,
          type: s.type || 'line',
          smooth: s.smooth !== false,
          showSymbol: s.showSymbol || false,
          lineStyle: s.lineStyle || { width: 1.2, color: s.color || '#ccc' },
          itemStyle: { color: (s.itemStyle?.color) || s.color || '#ccc' },
          data: s.data,
          yAxisIndex: Number.isFinite(s.yAxisIndex) ? s.yAxisIndex : fuelAxisIndex
        });
      });
    }

    const annotations = this.buildAnnotations(
      Array.isArray(providedEvents) && providedEvents.length
        ? providedEvents
        : Array.isArray(history?.fuelEvents)
          ? history.fuelEvents
          : Array.isArray(history?.refuelEvents)
            ? history.refuelEvents
            : Array.isArray(history?.events)
              ? history.events
              : []
    );

    const formatValue = (val) => {
      if (!Number.isFinite(val)) return '--';
      if (Math.abs(val) >= 100) return val.toFixed(0);
      return val.toFixed(1);
    };

    this.chart.line({
      legend: false,
      showGrid: true,
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, height: 16, bottom: 0 }
      ],
      yAxis: [
        {
          type: 'value',
          name: 'Carburante (L)',
          position: 'left',
          scale: true,
          min: Number.isFinite(fuelMin) ? fuelMin : undefined,
          max: Number.isFinite(axisMax) ? axisMax : undefined,
          axisLine: { lineStyle: { color: '#ffb87a' } },
          axisLabel: { color: '#ffb87a' }
        }
      ],
      series,
      tooltip: {
        confine: true,
        formatter: (params) => {
          if (!Array.isArray(params) || !params.length) return '';
          const ts = params[0]?.value?.[0];
          const date = ts ? new Date(ts).toLocaleString('it-IT') : '';
          const lines = params
            .filter((p) => p && p.seriesName)
            .map((p) => {
              const val = Array.isArray(p.value) ? p.value[1] : p.value;
              return `${p.marker} ${p.seriesName}:  ${formatValue(val)} L`;
            });
          return [date, ...lines].join('<br/>');
        }
      },
      annotations
    });
  }
}
