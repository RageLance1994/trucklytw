export class OdometerChart {
    constructor(chart) {
        this.chart = chart;
    }
    smooth(data, windowSize) {
        const res = [];
        const w = windowSize;
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - Math.floor(w / 2));
            const end = Math.min(data.length - 1, i + Math.floor(w / 2));
            let sum = 0, count = 0;
            for (let j = start; j <= end; j++) {
                sum += data[j][1];
                count++;
            }
            res.push([data[i][0], sum / count]);
        }
        return res;
    }
    update(history) {
        const raw = Array.isArray(history?.raw) ? [...history.raw] : [];
        const ordered = raw
            .map((entry) => {
                const ts = new Date(entry?.timestamp);
                return { ...entry, _ts: Number.isFinite(ts.getTime()) ? ts : null };
            })
            .filter((entry) => entry._ts !== null)
            .sort((a, b) => a._ts - b._ts);

        const dayBuckets = new Map();

        ordered.forEach((entry) => {
            const ts = entry._ts;
            const io = entry?.io || {};
            const candidates = [
                io.totalOdometer,
                io.odometer,
                io.tripOdometer,
                entry?.gps?.Odometer,
                entry?.gps?.odometer
            ];
            let odometer = null;
            for (const value of candidates) {
                const num = Number(value);
                if (Number.isFinite(num)) {
                    odometer = num;
                    break;
                }
            }
            if (odometer === null) return;

            const dayKey = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime();
            if (!dayBuckets.has(dayKey)) {
                dayBuckets.set(dayKey, { min: odometer, max: odometer });
            } else {
                const bucket = dayBuckets.get(dayKey);
                if (odometer < bucket.min) bucket.min = odometer;
                if (odometer > bucket.max) bucket.max = odometer;
            }
        });

        const dayEntries = [...dayBuckets.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([dayMs, bucket]) => {
                const delta = Number(bucket.max) - Number(bucket.min);
                const km = delta > 0 ? delta / 1000 : 0;
                const label = new Date(dayMs).toISOString().slice(0, 10);
                return { label, value: Number.isFinite(km) ? Number(km.toFixed(1)) : 0 };
            });

        const categories = dayEntries.map((item) => item.label);
        const values = dayEntries.map((item) => item.value);

        const renderBar = typeof this.chart.bars === 'function'
            ? this.chart.bars.bind(this.chart)
            : this.chart.bar.bind(this.chart);

        renderBar({
            legend: ['Km percorsi'],
            showGrid: true,
            xAxis: {
                type: 'category',
                data: categories,
                axisLabel: { rotate: categories.length > 7 ? 45 : 0 }
            },
            yAxis: {
                name: 'km',
                axisLabel: { color: '#aaa' }
            },
            series: [{
                name: 'Km percorsi',
                data: values
            }]
        });
    }

}
