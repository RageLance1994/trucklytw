var MAX_ZOOM = 15
var CLUSTER_MIN_ZOOM = 12
var CLUSTER_BASE_KM = 0.4
const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (value = "") => value.replace(REGEX_ESCAPE, "\\$&");

export class TrucklyMap {
  constructor({ target, theme = "dark", center = [12.4964, 41.9028], zoom = 6, markers = [] }) {
    this.targetDom = document.querySelector('#' + target);
    this.target = target;
    this.theme = this._resolveTheme(theme);
    this.markers = new Map(); // imei → marker
    this._clusterUpdateScheduled = false;
    this.hoverMarker = this.hoverMarker.bind(this);
    this.unHoverMarker = this.unHoverMarker.bind(this);
    this.hoveringMarker = false;
    this.styles = {
      dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
    };

    this.map = new window.maplibregl.Map({
      container: this.target,
      style: this.styles[this.theme],
      center,
      zoom,
      attributionControl: false
    });

    // aggiungi marker iniziali solo quando la mappa è pronta
    this.map.on("load", () => {
      markers.forEach(m => this.addOrUpdateMarker(m));
    });

      this.map.on('zoom', (ev) => {
        const zoom = this.map.getZoom()
        if (!this.hoveringMarker) {
          var markers = document.querySelectorAll('.custom-marker')
          markers.forEach((m) => {
            m.dataset.collapsed = zoom < MAX_ZOOM;
          })
        }

        this.updateClusters();
      })

    this._handleThemeChange = () => {
      const desired = this._resolveTheme();
      if (desired !== this.theme) {
        this.switchTheme(desired);
      }
    };
    document.addEventListener('themechange', this._handleThemeChange);
  }

  switchTheme(theme) {
    this.theme = theme || (this.theme === "dark" ? "light" : "dark");
    try {
      this.map.setStyle(this.styles[this.theme], { diff: true });
    } catch (err) {
      console.warn('[TrucklyMap] unable to set style', err);
    }
  }

  _resolveTheme(preferred = null) {
    if (preferred) return preferred;
    const isLight = document?.body?.classList?.contains('theme-light');
    return isLight ? 'light' : 'dark';
  }



  addOrUpdateMarker({ id, lng, lat, tooltip, vehicle, device, status, html, hasPopup, classlist }) {
    try {
      const numericLng = Number(lng);
      const numericLat = Number(lat);
      if (!Number.isFinite(numericLng) || !Number.isFinite(numericLat)) return null;

      const angle = Number(device?.data?.gps?.Angle ?? device?.gps?.Angle ?? 0);
      const collapsedValue = this.map.getZoom() < MAX_ZOOM ? "true" : "false";
      const useArrow = true;
      const defaultTemplate = this._getDefaultMarkerTemplate({ useArrow });
      const templateToUse = html ?? defaultTemplate;
      const useCustomTemplate = Boolean(html);

      let marker = this.markers.get(id);

      if (!marker) {
        const element = document.createElement("div");
        this._syncMarkerClasses(element, { status, classlist, initial: true });
        element.dataset.collapsed = collapsedValue;
        element.innerHTML = templateToUse;

        marker = new window.maplibregl.Marker({ element })
          .setLngLat([numericLng, numericLat]);

        if (!useCustomTemplate) {
          this._updateDefaultMarkerContent(element, { vehicle, angle });
        }

        marker._usesDefaultTemplate = !useCustomTemplate;

        if (hasPopup) {
          const popup = new window.maplibregl.Popup({ offset: 12 });
          if (tooltip instanceof HTMLElement) {
            popup.setDOMContent(tooltip);
            popup.__contentNode = tooltip;
            popup.__contentHTML = null;
          } else {
            popup.setHTML(tooltip || `<b>Marker ${id}</b>`);
            popup.__contentHTML = tooltip || `<b>Marker ${id}</b>`;
            popup.__contentNode = null;
          }
          try {
            popup.on('open', () => {
              this.focusMarker(marker, { openPopup: false });
            });
          } catch {}
          marker.setPopup(popup);
        }

        marker.addTo(this.map);
        this.markers.set(id, marker);
        marker._customClassList = classlist === undefined ? null : classlist;

        const markerNode = marker.getElement ? marker.getElement() : marker._element;
        if (markerNode?.classList?.contains("custom-marker")) {
          markerNode.addEventListener("click", (ev) => {
            console.log(ev);
            window.dispatchEvent(new CustomEvent("vchange", { detail: { vehicle: marker.vehicle } }));
          });
        }
        markerNode?.addEventListener("mouseover", this.hoverMarker);
      } else {
        marker.setLngLat([numericLng, numericLat]);
        const element = marker.getElement ? marker.getElement() : marker._element;
        if (element) {
          if (classlist !== undefined) {
            marker._customClassList = classlist;
          }
          const hasCustomClassList = marker._customClassList !== null;
          const shouldSkipClassSync = hasCustomClassList && classlist === undefined;
          if (!shouldSkipClassSync) {
            this._syncMarkerClasses(element, { status, classlist });
          }
          element.dataset.collapsed = collapsedValue;

          if (useCustomTemplate) {
            element.innerHTML = html;
            marker._usesDefaultTemplate = false;
          } else {
            if (!marker._usesDefaultTemplate) {
              element.innerHTML = defaultTemplate;
            }
            this._updateDefaultMarkerContent(element, { vehicle, angle });
            marker._usesDefaultTemplate = true;
          }
        }

        if (tooltip && hasPopup) {
          const popup = marker.getPopup();
          if (popup) {
            if (tooltip instanceof HTMLElement) {
              // Avoid replacing identical DOM nodes to preserve scroll position/state.
              if (popup.__contentNode !== tooltip) {
                popup.setDOMContent(tooltip);
                popup.__contentNode = tooltip;
                popup.__contentHTML = null;
              }
            } else {
              const nextHtml = tooltip || `<b>Marker ${id}</b>`;
              if (popup.__contentHTML !== nextHtml) {
                popup.setHTML(nextHtml);
                popup.__contentHTML = nextHtml;
                popup.__contentNode = null;
              }
            }
            try {
              popup.off && popup.off('open'); // ensure we don't duplicate
              popup.on && popup.on('open', () => {
                this.focusMarker(marker, { openPopup: false });
              });
            } catch {}
          }
        }
      }

        marker.vehicle = vehicle;
        marker.device = device;
        marker.status = status;

      marker._lat = numericLat;
      marker._lng = numericLng;

      const latestElement = marker.getElement ? marker.getElement() : marker._element;
      if (latestElement) {
        if (marker._baseHTML === undefined) {
          marker._baseHTML = latestElement.innerHTML;
        }
        marker._defaultHTML = latestElement.innerHTML;
      }

      this._scheduleUpdateClusters();

      return marker;
    }
    catch (e) {
      console.log(e, `\nError while parsing device -> `, device)
    }
  }

  _syncMarkerClasses(element, { status, classlist, initial = false } = {}) {
    if (!element) return;
    if (typeof classlist === "string") {
      element.className = classlist;
      return;
    }
    const stateClasses = ["success", "danger", "warning"];
    stateClasses.forEach(cls => element.classList.remove(cls));
    if (initial) {
      element.className = "custom-marker";
    } else if (!element.classList.contains("custom-marker")) {
      element.classList.add("custom-marker");
    }
    if (status) {
      element.classList.add(status);
    }
  }

  _getDefaultMarkerTemplate({ useArrow = true } = {}) {
    const directionIcon = this._getMarkerHeadingIconMarkup(useArrow !== false);
    return `
      <div class="wrapper-h rectangle j-center a-center relative">                                        
        <a class="compass">
          <i class="fa fa-truck flipped-x"></i>
        </a>
        <p data-role="marker-plate"></p>
        <a class="compass">
          ${directionIcon}
        </a>
      </div>
      <div class="wrapper-h nopadding circle j-center a-center relative">
        <a class="compass" style="padding-bottom:2px;">
          ${directionIcon}
        </a>
      </div>
    `;
  }

  _getMarkerHeadingIconMarkup(useArrow = true) {
    if (useArrow) {
      return `<i class="fa fa-arrow-up" data-role="marker-arrow"></i>`;
    }
    return `<img data-role="marker-arrow" style="max-width:15px;" src="/assets/images/icons/pointer_white.svg">`;
  }

  _updateDefaultMarkerContent(element, { vehicle, angle } = {}) {
    if (!element) return;
    const plateNode = element.querySelector('[data-role="marker-plate"]');
    if (plateNode) {
      plateNode.textContent = this._getVehiclePlateLabel(vehicle);
    }
    const rotation = Number(angle) || 0;
    element.querySelectorAll('[data-role="marker-arrow"]').forEach((node) => {
      node.style.transform = `rotate(${rotation}deg)`;
    });
  }

  _getVehiclePlateLabel(vehicle) {
    if (!vehicle) return "-";
    return vehicle?.plate?.v ?? vehicle?.plate ?? vehicle?.nickname ?? vehicle?.name ?? "-";
  }

  _getVehicleDisplayLabel(vehicle) {
    if (!vehicle) return "-";
    const nickname = vehicle?.nickname ?? vehicle?.name;
    const plate = vehicle?.plate?.v ?? vehicle?.plate;
    if (nickname && plate) return `${nickname} - ${plate}`;
    return nickname || plate || "-";
  }

  _isMarkerHidden(element) {
    if (!element) return false;
    return element.dataset.eventHidden === 'true' || element.dataset.rewindHidden === 'true';
  }

  hoverMarker(ev) {

    if (ev.currentTarget.dataset.collapsed == "false") return;


    ev.currentTarget.removeEventListener('mouseenter', this.hoverMarker)
    ev.currentTarget.addEventListener('mouseleave', this.unHoverMarker);
    ev.currentTarget.dataset.collapsed = "false";
    this.hoveringMarker = true;

  }

  unHoverMarker(ev) {
    ev.currentTarget.dataset.collapsed = "true";
    ev.currentTarget.removeEventListener('mouseleave', this.unHoverMarker)
    ev.currentTarget.addEventListener('mouseenter', this.hoverMarker);
    this.hoveringMarker = false;
  }

  removeMarker(id) {
    const marker = this.markers.get(id);
    if (marker) {
      marker.remove();
      this.markers.delete(id);
      this._scheduleUpdateClusters();
    }
  }

  clearMarkers() {
    // remove every marker instance from the map and reset the collection
    this.markers.forEach(marker => marker.remove());
    this.markers.clear();
    this.hoveringMarker = false;
  }

  resetClusterState({ animate = true } = {}) {
    const zoom = this.map?.getZoom?.();
    this.markers.forEach(marker => {
      const el = marker?._element;
      if (!el) return;
      const clusterMeta = marker._clusterMeta;
      const restoreHTML = marker._baseHTML !== undefined ? marker._baseHTML : marker._defaultHTML;
      if (restoreHTML !== undefined) el.innerHTML = restoreHTML;
      if (this._isMarkerHidden(el)) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }
      el.classList.remove('clustered-marker');
      el.classList.remove('custom-marker--split');
      el.style.removeProperty('--split-delay');
      el.style.removeProperty('animationDelay');
      if (Number.isFinite(zoom) && el.classList.contains('custom-marker')) {
        el.dataset.collapsed = zoom < MAX_ZOOM ? "true" : "false";
      }

      if (clusterMeta && animate) {
        const delayMs = Math.max(0, clusterMeta.index || 0) * 40;
        if (delayMs > 0) el.style.setProperty('--split-delay', `${delayMs}ms`);
        const handleAnimationEnd = () => {
          el.classList.remove('custom-marker--split');
          el.style.removeProperty('--split-delay');
          el.style.removeProperty('animationDelay');
          el.removeEventListener('animationend', handleAnimationEnd);
        };
        el.addEventListener('animationend', handleAnimationEnd, { once: true });
        el.classList.add('custom-marker--split');
      }

      this._unbindClusterLeader(marker);
      delete marker._clusterMeta;
      delete marker._clusterMembers;
    });
  }

  _scheduleUpdateClusters() {
    if (this._clusterUpdateScheduled) return;
    this._clusterUpdateScheduled = true;
    requestAnimationFrame(() => {
      this._clusterUpdateScheduled = false;
      this.updateClusters();
    });
  }

  updateClusters() {
    if (!this.map || typeof this.map.getZoom !== 'function') return;
    if (this.markers.size <= 1) {
      this.resetClusterState({ animate: true });
      return;
    }

    const zoom = this.map.getZoom();
    if (!Number.isFinite(zoom)) return;
    if (zoom >= CLUSTER_MIN_ZOOM) {
      this.resetClusterState({ animate: true });
      return;
    }

    this.resetClusterState({ animate: false });

    const radiusKm = CLUSTER_BASE_KM * Math.pow(2, CLUSTER_MIN_ZOOM - zoom);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) return;

    this._clusters = [];
    const clusters = [];
    this.markers.forEach(marker => {
      const el = marker?._element;
      if (!el) return;
      const currentDisplay = window.getComputedStyle(el).display;
      if (currentDisplay === "none" || this._isMarkerHidden(el)) return;

      const lat = marker._lat;
      const lng = marker._lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      let bucket = null;
      for (let i = 0; i < clusters.length; i++) {
        if (this.distanceKm(clusters[i].center, [lat, lng]) <= radiusKm) {
          bucket = clusters[i];
          break;
        }
      }

      if (!bucket) {
        bucket = { center: [lat, lng], members: [] };
        clusters.push(bucket);
      } else {
        const len = bucket.members.length + 1;
        bucket.center[0] += (lat - bucket.center[0]) / len;
        bucket.center[1] += (lng - bucket.center[1]) / len;
      }

      bucket.members.push(marker);
    });

    clusters.forEach(cluster => {
      if (cluster.members.length <= 1) return;
      const [leader, ...rest] = cluster.members;
      if (!leader._element) return;

      cluster.members.forEach((marker, index) => {
        marker._clusterMeta = { index, count: cluster.members.length };
      });

      leader._clusterMembers = cluster.members;
      leader._element.innerHTML = this.getClusterHTML(cluster.members.length);
      leader._element.dataset.collapsed = "false";
      leader._element.classList.add('clustered-marker');
      this._bindClusterLeader(leader);
      this._clusters.push(cluster);
      rest.forEach(m => {
        if (!m._element) return;
        m._element.style.display = 'none';
        m._element.dataset.collapsed = "true";
      });
    });
  }

  distanceKm([lat1, lon1], [lat2, lon2]) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return Infinity;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  getClusterHTML(count) {
    return `<div class="cluster-marker">${count}</div>`;
  }

  _unbindClusterLeader(marker) {
    if (!marker) return;
    const el = marker._element;
    if (el && marker._clusterHandlers) {
      marker._clusterHandlers.forEach(({ type, handler }) => el.removeEventListener(type, handler));
    }
    if (marker._clusterPopup) {
      try { marker._clusterPopup.remove(); } catch { }
    }
    marker._clusterHandlers = null;
    marker._clusterPopup = null;
    marker._isClusterLeader = false;
  }

  _bindClusterLeader(marker) {
    if (!marker?._element || !Array.isArray(marker._clusterMembers) || marker._clusterMembers.length < 2) return;
    this._unbindClusterLeader(marker);
    const el = marker._element;
    marker._isClusterLeader = true;
    marker._clusterHandlers = [];
    const openCluster = (ev) => {
      ev?.stopPropagation?.();
      ev?.preventDefault?.();
      if (window.__rewindActiveImei) return;
      this._showClusterPopup(marker);
    };
    ['click', 'mouseenter'].forEach((type) => {
      el.addEventListener(type, openCluster);
      marker._clusterHandlers.push({ type, handler: openCluster });
    });
  }

  _buildClusterPopupContent(members = [], onClose) {
    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper-v j-start a-start nopadding smooth fit-content cluster-explained shadowed-dark';
    members.forEach((member) => {
      const vehicle = member?.vehicle;
      const plateLabel = this._getVehicleDisplayLabel(vehicle);
      const row = document.createElement('div');
      row.className = 'cluster-plate wrapper-h rectangle cg-1618';
      row.innerHTML = `<i class="fa-solid fa-truck" style="margin-right:8px;"></i><span>${plateLabel}</span>`;
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        this.focusMarker(member, { openPopup: true });
        const popup = typeof member.getPopup === 'function' ? member.getPopup() : null;
        if (popup) {
          try { popup.addTo(this.map); } catch { }
        }
        onClose?.();
      });
      wrapper.appendChild(row);
    });
    if (onClose) {
      wrapper.addEventListener('mouseleave', () => onClose(), { passive: true });
    }
    return wrapper;
  }

  _showClusterPopup(marker) {
    if (!marker || !marker._clusterMembers || marker._clusterMembers.length < 2) return;
    if (!marker._clusterPopup) {
      marker._clusterPopup = new window.maplibregl.Popup({ offset: 12, closeButton: false });
    }
    const closeActivePopup = () => {
      if (this._activeClusterPopup) {
        try { this._activeClusterPopup.remove(); } catch { }
      }
    };
    const content = this._buildClusterPopupContent(marker._clusterMembers, closeActivePopup);
    marker._clusterPopup.setDOMContent(content);
    marker._clusterPopup.setLngLat(marker.getLngLat());
    marker._clusterPopup.addTo(this.map);
    this._activeClusterPopup = marker._clusterPopup;
  }

  fitToMarkers() {
    if (this.markers.size === 0) return;
    const bounds = new window.maplibregl.LngLatBounds();
    this.markers.forEach(m => bounds.extend(m.getLngLat()));
    this.map.fitBounds(bounds, { padding: 50, maxZoom: 15 }); // limite massimo
    gl.LngLatBounds();
    this.markers.forEach(m => bounds.extend(m.getLngLat()));
    this.map.fitBounds(bounds, { padding: 50, maxZoom: 15 }); // limite massimo
  }

  findMarkers(query) {
    if (!query) return [];
    const regex = query instanceof RegExp ? query : new RegExp(String(query), "i");
    const results = [];
    const testField = (value) => {
      regex.lastIndex = 0;
      return regex.test(String(value));
    };
    this.markers.forEach((marker, id) => {
      const vehicle = marker.vehicle || {};
      const device = marker.device || {};
      const fields = [
        vehicle.nickname,
        vehicle.name,
        vehicle.plate?.v,
        vehicle.plate,
        device?.data?.io?.driver1Id,
        device?.data?.io?.driver2Id,
        device?.driverName,
      ].filter(Boolean);
      if (fields.some(testField)) {
        results.push({ id, marker, vehicle, device });
      }
    });
    return results;
  }

  focusMarker(marker, { openPopup = true, offset = null } = {}) {
    if (!marker || typeof marker.getLngLat !== "function") return false;
    const lngLat = marker.getLngLat();
    if (!lngLat) return false;
    

    console.log(lngLat);

    if (typeof this.resetClusterState === "function") {
      this.resetClusterState({ animate: true });
    }
    const currentZoom = this.map?.getZoom?.();
    this.map.flyTo({
      center: offset ? {lng:lngLat.lng, lat: lngLat.lat - 0.0185} : lngLat,
      zoom: Math.max(Number.isFinite(currentZoom) ? currentZoom : 12, 12.5),
      speed: 1.2,
      curve: 1.4,
      
    });

    if (openPopup && typeof marker.getPopup === "function") {
      const popup = marker.getPopup();
      if (popup) {
        if (typeof popup.isOpen === "function" && popup.isOpen()) {
          popup.setLngLat(lngLat);
        } else if (typeof marker.togglePopup === "function") {
          marker.togglePopup();
        } else {
          popup.setLngLat(lngLat).addTo(this.map);
        }
      }
    }
    return true;
  }

  searchVehicles(queryInfo = {}) {
    const raw = typeof queryInfo === "string"
      ? queryInfo
      : (queryInfo?.raw ?? "");
    const trimmed = (raw || "").trim();

    if (!trimmed) {
      this.resetClusterState({ animate: true });
      return { matches: [], focused: false, query: "" };
    }

    const allowRegex = Boolean(queryInfo?.allowRegex);
    const flags = typeof queryInfo?.flags === "string" ? queryInfo.flags : "i";
    let regex = queryInfo instanceof RegExp ? queryInfo : null;

    if (!regex && allowRegex) {
      try {
        regex = new RegExp(trimmed, flags);
      } catch (err) {
        console.warn("Invalid regex pattern:", trimmed, err);
      }
    }

    if (!regex) {
      const escaped = escapeRegex(trimmed);
      try {
        regex = new RegExp(escaped, flags);
      } catch (err) {
        console.warn("Unable to build fallback regex for:", trimmed, err);
        return { matches: [], focused: false, query: trimmed, invalid: true };
      }
    }

    const matches = this.findMarkers(regex);
    const firstMatch = matches[0]?.marker;
    const focused = firstMatch ? this.focusMarker(firstMatch) : false;

    return {
      matches: matches.map(m => ({
        id: m.id,
        vehicle: {
          nickname: m.vehicle?.nickname || null,
          plate: m.vehicle?.plate?.v || m.vehicle?.plate || null,
        },
        device: {
          driver1Id: m.device?.data?.io?.driver1Id || null,
          driver2Id: m.device?.data?.io?.driver2Id || null,
        }
      })),
      focused: Boolean(focused),
      query: regex.source,
      flags,
    };
  }

  static enableTableSorting(tableOrSelector, options = {}) {
    const table = typeof tableOrSelector === 'string'
      ? document.querySelector(tableOrSelector)
      : tableOrSelector;

    if (!table) return null;

    const config = Object.assign({
      headerSelector: '.table-header .st-cell',
      bodySelector: '.table-body',
      rowSelector: '.table-row',
      cellSelector: '.st-cell',
      eventName: 'table:sorted',
    }, options);

    const headers = Array.from(table.querySelectorAll(config.headerSelector))
      .filter((cell) => cell.dataset.sortable !== 'false');

    if (!headers.length) return table;

    const previousBinding = TrucklyMap._tableSortBindings.get(table);
    if (previousBinding) {
      previousBinding.headers.forEach(({ cell, handleClick, handleKeydown }) => {
        cell.removeEventListener('click', handleClick);
        cell.removeEventListener('keydown', handleKeydown);
      });
    }

    const bindings = headers.map((cell, index) => {
      const handleClick = (event) => {
        event.preventDefault();
        const currentState = TrucklyMap._tableSortState.get(table) || { columnIndex: -1, direction: 'none' };
        const nextDirection = currentState.columnIndex === index && currentState.direction === 'asc'
          ? 'desc'
          : 'asc';
        TrucklyMap._applyTableSort(table, index, nextDirection, config);
      };

      const handleKeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick(event);
        }
      };

      cell.addEventListener('click', handleClick);
      cell.addEventListener('keydown', handleKeydown);
      cell.dataset.sortDirection = cell.dataset.sortDirection || 'none';
      cell.setAttribute('aria-sort', cell.dataset.sortDirection === 'asc'
        ? 'ascending'
        : cell.dataset.sortDirection === 'desc'
          ? 'descending'
          : 'none');

      return { cell, handleClick, handleKeydown };
    });

    TrucklyMap._tableSortBindings.set(table, { headers: bindings, config });
    if (!TrucklyMap._tableSortState.has(table)) {
      TrucklyMap._tableSortState.set(table, { columnIndex: -1, direction: 'none', key: null });
    }

    return table;
  }

  static _applyTableSort(table, columnIndex, direction, config) {
    const body = table.querySelector(config.bodySelector);
    if (!body) return;

    const rows = Array.from(body.querySelectorAll(config.rowSelector));
    if (!rows.length) return;

    const headerCells = Array.from(table.querySelectorAll(config.headerSelector));
    const activeHeader = headerCells[columnIndex];
    if (!activeHeader) return;

    const sortType = (activeHeader.dataset.sortType || 'auto').toLowerCase();
    const sortKey = activeHeader.dataset.sortKey || null;

    const sortedRows = rows.slice().sort((rowA, rowB) => {
      const valueA = TrucklyMap._extractCellSortValue(rowA, columnIndex, config.cellSelector);
      const valueB = TrucklyMap._extractCellSortValue(rowB, columnIndex, config.cellSelector);
      return TrucklyMap._compareForSort(valueA, valueB, sortType);
    });

    if (direction === 'desc') {
      sortedRows.reverse();
    }

    sortedRows.forEach(row => body.appendChild(row));

    TrucklyMap._tableSortState.set(table, { columnIndex, direction, key: sortKey, sortType });
    TrucklyMap._updateSortIndicators(headerCells, columnIndex, direction);

    if (config.eventName) {
      const sortEvent = new CustomEvent(config.eventName, {
        bubbles: true,
        detail: {
          table,
          columnIndex,
          direction,
          key: sortKey,
          sortType,
        }
      });
      table.dispatchEvent(sortEvent);
    }
  }

  static _extractCellSortValue(row, columnIndex, cellSelector) {
    const cells = row.querySelectorAll(cellSelector);
    const cell = cells[columnIndex];
    if (!cell) return '';
    if (cell.dataset.sortValue !== undefined) {
      return cell.dataset.sortValue;
    }
    if (cell.dataset.value !== undefined) {
      return cell.dataset.value;
    }
    return (cell.textContent || '').trim();
  }

  static _compareForSort(aValue, bValue, sortType) {
    const a = TrucklyMap._normalizeForSort(aValue, sortType);
    const b = TrucklyMap._normalizeForSort(bValue, sortType);

    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }

    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  }

  static _normalizeForSort(rawValue, sortType) {
    const value = rawValue == null ? '' : String(rawValue).trim();
    if (!value) return { rank: 3, value: '' };

    const normalizedType = (sortType || '').toLowerCase();

    const parseNumber = (input) => {
      if (typeof input !== 'string') return Number(input);
      const cleaned = input.replace(/\s+/g, '').replace(',', '.');
      return Number(cleaned);
    };

    const asNumber = parseNumber(value);
    const asDate = Date.parse(value);

    if (normalizedType === 'number') {
      if (Number.isFinite(asNumber)) return { rank: 0, value: asNumber };
      return { rank: 2, value: value.toLowerCase() };
    }

    if (normalizedType === 'date') {
      if (Number.isFinite(asDate)) return { rank: 1, value: asDate };
      return { rank: 2, value: value.toLowerCase() };
    }

    if (normalizedType === 'string') {
      return { rank: 2, value: value.toLowerCase() };
    }

    if (Number.isFinite(asNumber)) {
      return { rank: 0, value: asNumber };
    }

    if (Number.isFinite(asDate)) {
      return { rank: 1, value: asDate };
    }

    return { rank: 2, value: value.toLowerCase() };
  }

  static _updateSortIndicators(headerCells, activeIndex, direction) {
    headerCells.forEach((cell, index) => {
      const isActive = index === activeIndex;
      const sortDirection = isActive ? direction : 'none';
      cell.dataset.sortDirection = sortDirection;
      cell.setAttribute('aria-sort', sortDirection === 'asc'
        ? 'ascending'
        : sortDirection === 'desc'
          ? 'descending'
          : 'none');

      const icon = cell.querySelector('i.fa');
      if (icon) {
        icon.classList.remove('fa-sort', 'fa-sort-asc', 'fa-sort-desc');
        if (sortDirection === 'asc') {
          icon.classList.add('fa-sort-asc');
        } else if (sortDirection === 'desc') {
          icon.classList.add('fa-sort-desc');
        } else {
          icon.classList.add('fa-sort');
        }
      }
    });
  }
}

TrucklyMap._tableSortBindings = new WeakMap();
TrucklyMap._tableSortState = new WeakMap();
