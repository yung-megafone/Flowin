/*
 * IBCL V2 modular development file: desktop-layout.js
 * Extracted from the standalone release build.
 */

/*
========================================================================
IBCL DESKTOP CARD LAYOUT
------------------------------------------------------------------------
Turns the hardcoded dashboard into a movable/resizable workspace.
- Drag cards by their top bar.
- Resize cards from any edge or corner handle.
- Layout saves locally per browser.
- Reset Layout returns to a sane default.
========================================================================
*/
(function () {
    const LAYOUT_KEY = 'ibcl_desktop_card_layout_v2_beefy';
    const DEFAULT_LAYOUT = {
        inputs:  { left: 0,    top: 0,   width: 620, height: 390, title: 'Inputs' },
        metrics: { left: 640,  top: 0,   width: 500, height: 430, title: 'Live Numbers' },
        areas:   { left: 0,    top: 410, width: 620, height: 500, title: 'Affected Areas' },
        graph:   { left: 640,  top: 450, width: 500, height: 360, title: 'Graph / Projection' },
        log:     { left: 1120, top: 0,   width: 760, height: 810, title: 'Event Log' }
    };
    const PRESET_LAYOUTS = {
        pg: DEFAULT_LAYOUT,
        bigNumbers: {
            metrics: { left: 0, top: 0, width: 720, height: 520 },
            graph: { left: 740, top: 0, width: 760, height: 520 },
            inputs: { left: 0, top: 540, width: 520, height: 360 },
            areas: { left: 540, top: 540, width: 520, height: 360 },
            log: { left: 980, top: 540, width: 760, height: 360 }
        },
        logHeavy: {
            inputs: { left: 0, top: 0, width: 560, height: 380 },
            metrics: { left: 580, top: 0, width: 520, height: 380 },
            graph: { left: 1120, top: 0, width: 560, height: 380 },
            areas: { left: 0, top: 400, width: 560, height: 420 },
            log: { left: 580, top: 400, width: 1100, height: 420 }
        },
        minimal: {
            metrics: { left: 0, top: 0, width: 520, height: 430 },
            graph: { left: 540, top: 0, width: 560, height: 430 },
            log: { left: 1040, top: 0, width: 760, height: 430 },
            inputs: { left: 0, top: 455, width: 520, height: 320 },
            areas: { left: 540, top: 455, width: 560, height: 320 }
        }
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function snap(value) {
        return Math.round(value / 16) * 16;
    }

    function readSavedLayout() {
        try {
            return Object.assign({}, DEFAULT_LAYOUT, JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'));
        } catch (e) {
            return Object.assign({}, DEFAULT_LAYOUT);
        }
    }

    function bringCardForward(card) {
        if (!card || !card.classList || !card.classList.contains('ibcl-card')) return;
        const currentMax = Math.max(100, ...Array.from(document.querySelectorAll('.ibcl-card')).map(c => parseInt(c.style.zIndex || '100', 10) || 100));
        card.style.zIndex = String(currentMax + 1);
    }


    function getPopoutCardId() {
        try { return new URLSearchParams(window.location.search).get('popout'); }
        catch (_) { return null; }
    }

    function isPopoutMode() {
        return Boolean(getPopoutCardId());
    }

    function openCardPopout(cardId) {
        const url = new URL(window.location.href);
        url.searchParams.set('popout', cardId);
        const features = 'popup=yes,width=1100,height=760,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes';
        window.open(url.toString(), `ibcl_popout_${cardId}`, features);
    }

    function applyPopoutMode(workspace) {
        const cardId = getPopoutCardId();
        if (!cardId || !workspace) return;
        document.body.classList.add('ibcl-popout-mode');
        document.title = `IBCL - ${cardId} popout`;
        workspace.querySelectorAll('.ibcl-card').forEach(card => {
            const match = card.dataset.cardId === cardId;
            card.style.display = match ? 'block' : 'none';
            if (!match) return;
            card.classList.remove('is-minimized');
            card.style.left = '0px';
            card.style.top = '0px';
            card.style.width = '100%';
            card.style.height = '100%';
            card.style.zIndex = '9999';
            card.querySelectorAll('.ibcl-resize-handle').forEach(h => h.style.display = 'none');
            const tools = card.querySelector('.ibcl-card-tools');
            if (tools) tools.innerHTML = '<i class="fas fa-up-right-from-square"></i><span>pop-out view</span>';
        });
        const menu = document.getElementById('settingsMenuWrap');
        if (menu) menu.style.display = 'none';
        const badge = document.getElementById('ibclPersonalBadge');
        if (badge) badge.style.display = 'none';
        workspace.style.height = '100vh';
        workspace.style.minHeight = '100vh';
        workspace.style.border = '0';
        workspace.style.borderRadius = '0';
    }

    function saveCardLayout(card) {
        if (!card || !card.dataset.cardId) return;
        const layout = readSavedLayout();
        layout[card.dataset.cardId] = Object.assign({}, layout[card.dataset.cardId], {
            left: Math.round(parseFloat(card.style.left) || 0),
            top: Math.round(parseFloat(card.style.top) || 0),
            width: Math.round(card.offsetWidth),
            height: Math.round(card.dataset.restoreHeight || card.offsetHeight),
            minimized: card.classList.contains('is-minimized')
        });
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    }

    function applyCardLayout(card, layout) {
        const cfg = layout[card.dataset.cardId] || DEFAULT_LAYOUT[card.dataset.cardId];
        if (!cfg) return;
        card.style.left = `${cfg.left}px`;
        card.style.top = `${cfg.top}px`;
        card.style.width = `${cfg.width}px`;
        card.dataset.restoreHeight = String(cfg.height || card.offsetHeight || 300);
        card.style.height = `${cfg.minimized ? 34 : cfg.height}px`;
        card.classList.toggle('is-minimized', Boolean(cfg.minimized));
        const minBtn = card.querySelector('.ibcl-card-minimize');
        if (minBtn) minBtn.title = cfg.minimized ? 'Restore card' : 'Minimize card';
    }

    function makeCard(id, title, contentNode) {
        if (!contentNode) return null;
        const card = document.createElement('section');
        card.className = 'ibcl-card';
        card.dataset.cardId = id;
        card.innerHTML = `
            <div class="ibcl-card-header">
                <span><i class="fas fa-grip-lines mr-1"></i>${title}</span>
                <span class="ibcl-card-tools"><i class="fas fa-up-down-left-right"></i><span>snap 16px</span><button class="ibcl-card-popout" type="button" title="Pop this card out to another window" onclick="popoutIBCLCard(this)"><i class="fas fa-up-right-from-square"></i></button><button class="ibcl-card-minimize" type="button" title="Minimize card" onclick="toggleIBCLCardMinimize(this)"><i class="fas fa-minus"></i></button></span>
            </div>
            <div class="ibcl-card-body"></div>
            <div class="ibcl-resize-handle ibcl-resize-n" data-resize-dir="n" aria-hidden="true"></div>
            <div class="ibcl-resize-handle ibcl-resize-s" data-resize-dir="s" aria-hidden="true"></div>
            <div class="ibcl-resize-handle ibcl-resize-e" data-resize-dir="e" aria-hidden="true"></div>
            <div class="ibcl-resize-handle ibcl-resize-w" data-resize-dir="w" aria-hidden="true"></div>
            <div class="ibcl-resize-handle ibcl-resize-ne" data-resize-dir="ne" aria-hidden="true"></div>
            <div class="ibcl-resize-handle ibcl-resize-nw" data-resize-dir="nw" aria-hidden="true"></div>
            <div class="ibcl-resize-handle ibcl-resize-se" data-resize-dir="se" aria-hidden="true"></div>
            <div class="ibcl-resize-handle ibcl-resize-sw" data-resize-dir="sw" aria-hidden="true"></div>
        `;
        card.querySelector('.ibcl-card-body').appendChild(contentNode);
        return card;
    }

    function makeDraggable(card, workspace) {
        const header = card.querySelector('.ibcl-card-header');
        if (!header) return;
        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        header.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            if (window.matchMedia('(max-width: 900px)').matches) return;
            dragging = true;
            card.classList.add('is-dragging');
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseFloat(card.style.left) || 0;
            startTop = parseFloat(card.style.top) || 0;
            card.style.zIndex = String(Date.now()).slice(-6);
            header.setPointerCapture(e.pointerId);
        });

        header.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const maxLeft = Math.max(0, workspace.clientWidth - card.offsetWidth);
            const maxTop = Math.max(0, workspace.clientHeight - card.offsetHeight);
            card.style.left = `${snap(clamp(startLeft + e.clientX - startX, 0, maxLeft))}px`;
            card.style.top = `${snap(clamp(startTop + e.clientY - startY, 0, maxTop))}px`;
        });

        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            card.classList.remove('is-dragging');
            try { header.releasePointerCapture(e.pointerId); } catch (_) {}
            saveCardLayout(card);
        }
        header.addEventListener('pointerup', endDrag);
        header.addEventListener('pointercancel', endDrag);
    }

    function makeResizable(card, workspace) {
        const handles = card.querySelectorAll('.ibcl-resize-handle');
        if (!handles.length) return;
        const minW = parseFloat(getComputedStyle(card).minWidth) || 320;
        const minH = parseFloat(getComputedStyle(card).minHeight) || 170;

        handles.forEach(handle => {
            handle.addEventListener('pointerdown', (e) => {
                if (window.matchMedia('(max-width: 900px)').matches) return;
                e.preventDefault();
                e.stopPropagation();

                const dir = handle.dataset.resizeDir || '';
                const startX = e.clientX;
                const startY = e.clientY;
                const startLeft = parseFloat(card.style.left) || 0;
                const startTop = parseFloat(card.style.top) || 0;
                const startWidth = card.offsetWidth;
                const startHeight = card.offsetHeight;
                card.classList.add('is-resizing');
                card.style.zIndex = String(Date.now()).slice(-6);
                handle.setPointerCapture(e.pointerId);

                function onMove(moveEvent) {
                    let dx = moveEvent.clientX - startX;
                    let dy = moveEvent.clientY - startY;
                    let left = startLeft;
                    let top = startTop;
                    let width = startWidth;
                    let height = startHeight;

                    if (dir.includes('e')) {
                        width = startWidth + dx;
                    }
                    if (dir.includes('s')) {
                        height = startHeight + dy;
                    }
                    if (dir.includes('w')) {
                        width = startWidth - dx;
                        left = startLeft + dx;
                    }
                    if (dir.includes('n')) {
                        height = startHeight - dy;
                        top = startTop + dy;
                    }

                    if (width < minW) {
                        if (dir.includes('w')) left -= (minW - width);
                        width = minW;
                    }
                    if (height < minH) {
                        if (dir.includes('n')) top -= (minH - height);
                        height = minH;
                    }

                    const maxRight = workspace.clientWidth;
                    if (left < 0) {
                        if (dir.includes('w')) width += left;
                        left = 0;
                    }
                    if (left + width > maxRight) {
                        if (dir.includes('e')) width = maxRight - left;
                        else left = Math.max(0, maxRight - width);
                    }
                    if (top < 0) {
                        if (dir.includes('n')) height += top;
                        top = 0;
                    }

                    card.style.left = `${snap(left)}px`;
                    card.style.top = `${snap(top)}px`;
                    card.style.width = `${snap(clamp(width, minW, Math.max(minW, workspace.clientWidth - left)))}px`;
                    card.style.height = `${snap(Math.max(minH, height))}px`;
                    fitWorkspaceToCards(workspace);
                }

                function onEnd(endEvent) {
                    card.classList.remove('is-resizing');
                    try { handle.releasePointerCapture(endEvent.pointerId); } catch (_) {}
                    handle.removeEventListener('pointermove', onMove);
                    handle.removeEventListener('pointerup', onEnd);
                    handle.removeEventListener('pointercancel', onEnd);
                    saveCardLayout(card);
                    fitWorkspaceToCards(workspace);
                }

                handle.addEventListener('pointermove', onMove);
                handle.addEventListener('pointerup', onEnd);
                handle.addEventListener('pointercancel', onEnd);
            });
        });
    }

    function fitWorkspaceToCards(workspace) {
        if (isPopoutMode()) return;
        if (window.matchMedia('(max-width: 900px)').matches) return;
        let bottom = 0;
        workspace.querySelectorAll('.ibcl-card:not(.is-hidden-by-gate)').forEach(card => {
            bottom = Math.max(bottom, (parseFloat(card.style.top) || 0) + card.offsetHeight + 32);
        });
        workspace.style.minHeight = `${Math.max(window.innerHeight * 0.80, bottom)}px`;
    }

    function addResetButtons() {
        const panel = document.getElementById('settingsMenuPanel');
        if (!panel || document.getElementById('layoutMenuCard')) return;

        const layoutCard = document.createElement('div');
        layoutCard.id = 'layoutMenuCard';
        layoutCard.className = 'ibcl-menu-card';
        layoutCard.innerHTML = `
            <div class="ibcl-menu-title"><i class="fas fa-table-cells-large mr-1"></i><span data-i18n="layout_title">Layout</span></div>
            <div class="grid grid-cols-2 gap-2">
                <button class="ibcl-preset-btn" onclick="applyIBCLPreset('pg')" data-i18n="layout_pg">PG</button>
                <button class="ibcl-preset-btn" onclick="applyIBCLPreset('bigNumbers')" data-i18n="layout_big_numbers">Big Numbers</button>
                <button class="ibcl-preset-btn" onclick="applyIBCLPreset('logHeavy')" data-i18n="layout_log_heavy">Log Heavy</button>
                <button class="ibcl-preset-btn" onclick="applyIBCLPreset('minimal')" data-i18n="layout_minimal">Minimal</button>
            </div>
            <button id="layoutResetBtn" class="ibcl-layout-reset-btn mt-2 w-full" onclick="resetIBCLDesktopLayout()"><i class="fas fa-rotate-left mr-1"></i><span data-i18n="reset_layout_btn">Reset Layout</span></button>
        `;

        const personalCard = document.createElement('div');
        personalCard.id = 'personalMenuCard';
        personalCard.className = 'ibcl-menu-card';
        personalCard.innerHTML = `
            <div class="ibcl-menu-title"><i class="fas fa-signature mr-1"></i><span data-i18n="personalization_title">Personalization</span></div>
            <label class="block text-[11px] text-slate-400 font-bold mb-1" data-i18n="name_station_label">Name / station label</label>
            <input id="personalNameInput" class="ibcl-menu-input mb-2" maxlength="32" data-i18n-placeholder="personal_name_placeholder" placeholder="e.g. Flow Desk, PID Deck, Noul" oninput="savePersonalizationFromMenu()">
            <label class="block text-[11px] text-slate-400 font-bold mb-1" data-i18n="top_message_label">Top-right message</label>
            <input id="personalMessageInput" class="ibcl-menu-input" maxlength="96" data-i18n-placeholder="personal_message_placeholder" placeholder="e.g. No guesswork. No mercy." oninput="savePersonalizationFromMenu()">
            <div class="flex gap-2 mt-2">
                <button class="ibcl-preset-btn flex-1" onclick="setPersonalizationExample()"><i class="fas fa-wand-magic-sparkles mr-1"></i><span data-i18n="example_btn">Example</span></button>
                <button class="ibcl-preset-btn flex-1" onclick="clearPersonalization()"><i class="fas fa-eraser mr-1"></i><span data-i18n="clear_personal_btn">Clear</span></button>
            </div>
        `;

        const hintsCard = document.createElement('div');
        hintsCard.id = 'hintsMenuCard';
        hintsCard.className = 'ibcl-menu-card';
        hintsCard.innerHTML = `
            <div class="ibcl-menu-title"><i class="fas fa-circle-question mr-1"></i><span data-i18n="hints_title">Hints</span></div>
            <label class="ibcl-hint-toggle-row cursor-pointer">
                <span data-i18n="hints_label">Display Hints</span>
                <input id="hintsToggle" type="checkbox" onchange="setHintsVisible(this.checked)">
            </label>
            <div class="text-[11px] text-slate-400 mt-2" data-i18n="hints_clean_note">Off keeps the dashboard clean; hover the small ? markers for quick reminders.</div>
        `;

        panel.insertBefore(personalCard, panel.firstChild);
        panel.insertBefore(layoutCard, personalCard);
        panel.insertBefore(hintsCard, personalCard);
        loadPersonalizationIntoMenu();
        applyTranslations();
        applyHintsPreference();
    }

    const PERSONALIZATION_KEY = 'ibcl_personalization_v2';

    function readPersonalization() {
        try { return JSON.parse(localStorage.getItem(PERSONALIZATION_KEY) || '{}') || {}; }
        catch (_) { return {}; }
    }

    function applyPersonalization(data = readPersonalization()) {
        const badge = document.getElementById('ibclPersonalBadge');
        const nameEl = document.getElementById('ibclPersonalName');
        const msgEl = document.getElementById('ibclPersonalMessage');
        if (!badge || !nameEl || !msgEl) return;
        const name = (data.name || '').trim();
        const message = (data.message || '').trim();
        nameEl.textContent = name;
        msgEl.textContent = message;
        badge.classList.toggle('is-visible', Boolean(name || message));
    }

    window.savePersonalizationFromMenu = function () {
        const name = document.getElementById('personalNameInput')?.value || '';
        const message = document.getElementById('personalMessageInput')?.value || '';
        const data = { name: name.trim(), message: message.trim() };
        localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(data));
        applyPersonalization(data);
    };

    function loadPersonalizationIntoMenu() {
        const data = readPersonalization();
        const nameInput = document.getElementById('personalNameInput');
        const msgInput = document.getElementById('personalMessageInput');
        if (nameInput) nameInput.value = data.name || '';
        if (msgInput) msgInput.value = data.message || '';
        applyPersonalization(data);
    }

    window.setPersonalizationExample = function () {
        const nameInput = document.getElementById('personalNameInput');
        const msgInput = document.getElementById('personalMessageInput');
        if (nameInput) nameInput.value = 'PID Deck';
        if (msgInput) msgInput.value = 'No guesswork. No mercy.';
        window.savePersonalizationFromMenu();
    };

    window.clearPersonalization = function () {
        const nameInput = document.getElementById('personalNameInput');
        const msgInput = document.getElementById('personalMessageInput');
        if (nameInput) nameInput.value = '';
        if (msgInput) msgInput.value = '';
        window.savePersonalizationFromMenu();
    };

    function syncLocationCardVisibility() {
        const gate = document.getElementById('affectedAreaGate');
        const card = document.querySelector('.ibcl-card[data-card-id="areas"]');
        const hint = document.getElementById('locationGateHint');
        if (!gate || !card) return;
        const hidden = gate.classList.contains('hidden');
        card.classList.toggle('is-hidden-by-gate', hidden);
        if (hint) hint.classList.toggle('hidden', !hidden);
        const workspace = document.getElementById('ibclDesktopWorkspace');
        if (workspace) fitWorkspaceToCards(workspace);
    }


    const HINTS_KEY = 'ibcl_show_hints_v2';

    function applyHintsPreference() {
        const showHints = localStorage.getItem(HINTS_KEY) === '1';
        document.body.classList.toggle('ibcl-hints-hidden', !showHints);
        const toggle = document.getElementById('hintsToggle');
        if (toggle) toggle.checked = showHints;
        document.querySelectorAll('[data-i18n$="_hint"], [data-i18n="calc_subtitle"], [data-i18n="metric_waiting"], #liveModeHint').forEach(el => {
            const txt = (el.textContent || '').trim();
            if (txt) el.setAttribute('title', txt);
        });
    }

    window.setHintsVisible = function (visible) {
        localStorage.setItem(HINTS_KEY, visible ? '1' : '0');
        applyHintsPreference();
    };

    window.popoutIBCLCard = function (button) {
        const card = button?.closest('.ibcl-card');
        if (!card || !card.dataset.cardId) return;
        openCardPopout(card.dataset.cardId);
    };

    window.toggleIBCLCardMinimize = function (button) {
        const card = button?.closest('.ibcl-card');
        if (!card) return;
        const minimized = !card.classList.contains('is-minimized');
        if (minimized) {
            card.dataset.restoreHeight = String(Math.max(170, card.offsetHeight));
            card.classList.add('is-minimized');
            button.title = 'Restore card';
        } else {
            card.classList.remove('is-minimized');
            card.style.height = `${parseFloat(card.dataset.restoreHeight) || 320}px`;
            button.title = 'Minimize card';
        }
        saveCardLayout(card);
        const workspace = document.getElementById('ibclDesktopWorkspace');
        if (workspace) fitWorkspaceToCards(workspace);
    };

    window.applyIBCLPreset = function (name) {
        const preset = PRESET_LAYOUTS[name] || DEFAULT_LAYOUT;
        const merged = Object.assign({}, DEFAULT_LAYOUT, preset);
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(merged));
        document.querySelectorAll('.ibcl-card').forEach(card => applyCardLayout(card, merged));
        const workspace = document.getElementById('ibclDesktopWorkspace');
        if (workspace) fitWorkspaceToCards(workspace);
        if (typeof showToast === 'function') showToast(getLang().layout_preset_applied_toast || 'Layout preset applied.');
    };

    window.resetIBCLDesktopLayout = function () {
        localStorage.removeItem(LAYOUT_KEY);
        const layout = readSavedLayout();
        document.querySelectorAll('.ibcl-card').forEach(card => applyCardLayout(card, layout));
        const workspace = document.getElementById('ibclDesktopWorkspace');
        if (workspace) fitWorkspaceToCards(workspace);
        if (typeof showToast === 'function') showToast(getLang().layout_reset_toast || 'Layout reset.');
    };

    function buildDesktopLayout() {
        if (document.getElementById('ibclDesktopWorkspace')) return;

        const root = document.querySelector('.max-w-\\[1400px\\]');
        const oldGrid = root ? root.querySelector(':scope > .grid') : null;
        if (!root || !oldGrid) return;

        const inputs = document.querySelector('.border-t-4.border-blue-600');
        const areas = document.getElementById('affectedAreaGate');
        const metrics = document.getElementById('metricBasis')?.closest('.rounded-2xl');
        const graph = document.querySelector('.graph-placeholder-grid');
        const log = document.getElementById('eventLogBody')?.closest('.w-full.max-w-\\[1400px\\]');

        const toolbar = document.createElement('div');
        toolbar.className = 'ibcl-desktop-toolbar';
        toolbar.innerHTML = `
            <div>
                <div class="text-sm font-black text-slate-800"><i class="fas fa-table-cells-large mr-2 text-blue-500"></i>Custom IBCL workspace</div>
                <div class="text-xs text-slate-500">Drag headers, resize any edge/corner, snap to grid, and save your cockpit locally.</div>
            </div>
            <div class="text-[11px] uppercase tracking-wide text-slate-500 font-black">
                <i class="fas fa-bars mr-1"></i> Layout presets in menu
            </div>
        `;

        const workspace = document.createElement('div');
        workspace.id = 'ibclDesktopWorkspace';
        workspace.className = 'ibcl-desktop';

        const cards = [
            makeCard('inputs', 'Inputs', inputs),
            makeCard('metrics', 'Live Numbers', metrics),
            makeCard('areas', 'Affected Areas', areas),
            makeCard('graph', 'Graph / Projection', graph),
            makeCard('log', 'Event Log', log)
        ].filter(Boolean);

        const layout = readSavedLayout();
        cards.forEach(card => {
            workspace.appendChild(card);
            card.addEventListener('pointerdown', () => bringCardForward(card), { capture: true });
            applyCardLayout(card, layout);
            makeDraggable(card, workspace);
            makeResizable(card, workspace);
            if ('ResizeObserver' in window) {
                new ResizeObserver(() => {
                    saveCardLayout(card);
                    fitWorkspaceToCards(workspace);
                }).observe(card);
            }
        });

        /* toolbar intentionally not inserted; settings live in the menu */
        root.insertBefore(workspace, oldGrid);
        oldGrid.remove();
        fitWorkspaceToCards(workspace);
        addResetButtons();
        applyHintsPreference();
        syncLocationCardVisibility();
        applyPopoutMode(workspace);

        const originalGate = window.handleDetailsGate;
        if (typeof originalGate === 'function') {
            window.handleDetailsGate = function () {
                const result = originalGate.apply(this, arguments);
                syncLocationCardVisibility();
                return result;
            };
        }
        const ticket = document.getElementById('ticketInput');
        if (ticket) ticket.addEventListener('input', () => setTimeout(syncLocationCardVisibility, 0));
        window.addEventListener('resize', () => fitWorkspaceToCards(workspace));
    }

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { buildDesktopLayout(); applyHintsPreference(); if (typeof updateThroughputAndProjection === 'function') updateThroughputAndProjection(); }, 0);
    });
})();
