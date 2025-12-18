export class Table {
    constructor(target, features = [], options = {}) {
        this.target = typeof target === 'string' ? document.querySelector(target) : target;
        if (!this.target) {
            throw new Error(`[Table] => Unable to resolve target "${target}".`);
        }
        if (!this.target.classList.contains('smart-table')) {
            console.warn(`[Table-${this.target.id || 'unnamed'}] => Can't find class smart-table. Proceeding regardless.`);
        }

        this.options = Object.assign({
            actionsColumn: true,
            actionsHeaderName: 'Azioni',
            actionsKey: '__actions',
            defaultActionRenderer: null
        }, options);

        const baseFeatures = Array.isArray(features) ? [...features] : [];
        if (this.options.actionsColumn) {
            baseFeatures.push({
                name: this.options.actionsHeaderName,
                key: this.options.actionsKey,
                editable: false
            });
        }

        this.features = baseFeatures.map((feature, index) => {
            const name = feature?.name ?? `Colonna ${index + 1}`;
            const key = feature?.key ?? name.toLowerCase().trim()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/gi, '');
            const editable = Boolean(feature?.editable);
            const render = typeof feature?.render === 'function'
                ? feature.render
                : (feature?.key === this.options.actionsKey && typeof this.options.defaultActionRenderer === 'function'
                    ? this.options.defaultActionRenderer
                    : null);
            const formatter = typeof feature?.formatter === 'function' ? feature.formatter : null;
            return { ...feature, name, key, editable, render, formatter };
        });

        this.rows = new Map();
        this.header = { cells: [], element: null };
        this.body = { element: null };

        this.init();
    }

    init() {
        this.header.element = document.createElement('div');
        this.header.element.classList.value = 'wrapper-h nopadding h-min-content table-header';
        this.target.appendChild(this.header.element);

        this.header.cells = this.features.map((feature) => {
            const cell = document.createElement('a');
            cell.style.fontSize = '1em';
            cell.classList.value = 'wrapper-h j-start a-center nopadding relative st-cell';
            cell.style.columnGap = '12px';
            cell.dataset.sortKey = feature.key;
            cell.dataset.sortable = feature?.sortable === false ? 'false' : 'true';
            if (feature.sortType) {
                cell.dataset.sortType = feature.sortType;
            }
            cell.dataset.sortDirection = 'none';
            cell.setAttribute('role', 'button');
            cell.setAttribute('aria-sort', 'none');
            cell.tabIndex = 0;
            const ariaLabel = feature?.name ? `Ordina per ${feature.name}` : 'Ordina';
            cell.setAttribute('aria-label', ariaLabel);
            cell.innerHTML = `
                <div class="overlay">
                    <div class="wrapper-h j-start a-center" style="column-gap:16px">
                        <p>${feature.name}</p>
                        <i class="fa fa-sort"></i>
                    </div>
                </div>`;
            this.header.element.appendChild(cell);
            return cell;
        });

        this.body.element = document.createElement('div');
        this.body.element.classList.value = 'wrapper-v nopadding table-body';
        this.target.appendChild(this.body.element);
    }

    generateRowId() {
        return `row-${Math.random().toString(16).slice(2)}-${Date.now()}`;
    }

    clearRows() {
        if (this.body.element) {
            this.body.element.innerHTML = '';
        }
        this.rows.clear();
    }

    setRows(rows = []) {
        this.clearRows();
        rows.forEach((row) => {
            const rowId = row?.id ?? this.generateRowId();
            this.addRow(row, rowId);
        });
    }

    addRow(rowData = {}, rowId = this.generateRowId()) {
        if (!this.body.element) return null;

        const rowElement = document.createElement('div');
        rowElement.classList.value = 'wrapper-h j-start a-center nopadding table-row';
        rowElement.dataset.rowId = rowId;

        this.features.forEach((feature) => {
            const cell = document.createElement('div');
            cell.classList.value = 'wrapper-h j-start a-center nopadding st-cell';
            cell.dataset.key = feature.key;

            const value = rowData[feature.key];

            if (feature.editable) {
                cell.contentEditable = 'true';
                cell.dataset.editable = 'true';
                cell.tabIndex = 0;
                cell.setAttribute('role', 'textbox');
                cell.setAttribute('aria-label', feature.name);
                cell.spellcheck = false;
            }

            if (typeof feature.render === 'function') {
                const rendered = feature.render({ rowId, data: rowData, value });
                if (rendered instanceof HTMLElement) {
                    cell.appendChild(rendered);
                } else if (rendered !== undefined && rendered !== null) {
                    cell.innerHTML = `${rendered}`;
                } else {
                    cell.textContent = '';
                }
            } else if (feature.key === this.options.actionsKey && this.options.actionsColumn) {
                const actionContent = value ?? (typeof this.options.defaultActionRenderer === 'function'
                    ? this.options.defaultActionRenderer({ rowId, data: rowData })
                    : null);
                if (actionContent instanceof HTMLElement) {
                    cell.appendChild(actionContent);
                } else if (typeof actionContent === 'string') {
                    cell.innerHTML = actionContent;
                } else {
                    cell.textContent = '';
                }
            } else if (value instanceof HTMLElement) {
                cell.appendChild(value);
            } else if (value !== undefined && value !== null) {
                const text = feature.formatter ? feature.formatter(value, rowData, rowId) : value;
                cell.textContent = `${text}`;
            } else {
                cell.textContent = '';
            }

            rowElement.appendChild(cell);
        });

        this.body.element.appendChild(rowElement);
        this.rows.set(rowId, { element: rowElement, data: { ...rowData, id: rowId } });
        return rowElement;
    }

    updateCell(rowId, key, value) {
        const row = this.rows.get(rowId);
        if (!row) return;

        const cell = row.element.querySelector(`.st-cell[data-key="${key}"]`);
        if (!cell) return;

        if (value instanceof HTMLElement) {
            cell.innerHTML = '';
            cell.appendChild(value);
        } else if (value !== undefined && value !== null) {
            cell.textContent = `${value}`;
        } else {
            cell.textContent = '';
        }

        row.data[key] = value;
    }

    getRowData(rowId) {
        const row = this.rows.get(rowId);
        return row ? { ...row.data } : null;
    }
}
