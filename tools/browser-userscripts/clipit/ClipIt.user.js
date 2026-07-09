// ==UserScript==
// @name         ClipIt
// @namespace    Yung-Megafone
// @version      1.5
// @description  Copies the title and URL of a ticket for easy dissemination
// @author       ym <https://t.me/yung_megafone>
// @include      http*://t.corp.amazon.com/*
// @run-at       document-end
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/yung-megafone/ClipIt/refs/heads/main/scripts/ClipIt.user.js
// @downloadURL  https://raw.githubusercontent.com/yung-megafone/ClipIt/refs/heads/main/scripts/ClipIt.user.js
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'copy_ticket_details_btn';

    injectClipItCSS();

    setInterval(function () {
        if (document.getElementById(BUTTON_ID)) return;

        const interactiveButtons = document.getElementsByClassName('flex-item-right');

        if (interactiveButtons.length > 0) {
            console.log('[ClipIt] Adding copy button');

            const button = document.createElement('button');
            button.id = BUTTON_ID;
            button.className = 'clipit-fancy-btn';
            button.type = 'button';
            button.innerHTML = `
                <span class="clipit-icon">⧉</span>
                <span>Copy Ticket Info</span>
            `;

            button.addEventListener('click', copyTicketDetailsToClipboard, false);

            const div = document.createElement('div');
            div.className = 'edit-issue clipit-wrapper';
            div.appendChild(button);

            interactiveButtons[0].insertBefore(div, interactiveButtons[0].firstChild);
        }
    }, 3000);

    function copyTicketDetailsToClipboard() {
        const titleEl = document.getElementsByClassName('title-container')[0]?.children[0];

        if (!titleEl) {
            showToast('Could not find ticket title', true);
            return;
        }

        const text = `${titleEl.innerText} {${document.URL}}`;

        GM_setClipboard(text, 'text');

        const button = document.getElementById(BUTTON_ID);
        if (button) {
            button.classList.add('clipit-copied');
            button.innerHTML = `
                <span class="clipit-icon">✓</span>
                <span>Copied</span>
            `;

            setTimeout(() => {
                button.classList.remove('clipit-copied');
                button.innerHTML = `
                    <span class="clipit-icon">⧉</span>
                    <span>Copy Ticket Info</span>
                `;
            }, 1400);
        }

        showToast('Ticket info copied');
    }

    function showToast(message, isError = false) {
        const oldToast = document.getElementById('clipit-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'clipit-toast';
        toast.className = isError ? 'clipit-toast clipit-toast-error' : 'clipit-toast';
        toast.innerText = message;

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('clipit-toast-show');
        });

        setTimeout(() => {
            toast.classList.remove('clipit-toast-show');
            setTimeout(() => toast.remove(), 350);
        }, 2000);
    }

    function injectClipItCSS() {
        if (document.getElementById('clipit-style')) return;

        const style = document.createElement('style');
        style.id = 'clipit-style';

        style.textContent = `
            .clipit-wrapper {
                display: inline-flex;
                align-items: center;
                margin-right: 1rem;
            }

            #${BUTTON_ID}.clipit-fancy-btn {
                appearance: none;
                border: 1px solid rgba(120, 160, 255, 0.45);
                border-radius: 999px;
                padding: 7px 15px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.01em;
                line-height: 1;
                cursor: pointer;
                color: #f8fbff;
                background:
                    radial-gradient(circle at 20% 10%, rgba(255,255,255,0.24), transparent 30%),
                    linear-gradient(135deg, #3b82f6 0%, #7c3aed 52%, #0f172a 100%);
                box-shadow:
                    0 8px 20px rgba(15, 23, 42, 0.26),
                    inset 0 1px 0 rgba(255,255,255,0.28);
                display: inline-flex;
                align-items: center;
                gap: 7px;
                min-height: 32px;
                white-space: nowrap;
                transition:
                    transform 140ms ease,
                    box-shadow 140ms ease,
                    filter 140ms ease,
                    border-color 140ms ease;
            }

            #${BUTTON_ID}.clipit-fancy-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.08) saturate(1.1);
                border-color: rgba(180, 205, 255, 0.8);
                box-shadow:
                    0 10px 26px rgba(59, 130, 246, 0.34),
                    0 4px 12px rgba(124, 58, 237, 0.24),
                    inset 0 1px 0 rgba(255,255,255,0.34);
            }

            #${BUTTON_ID}.clipit-fancy-btn:active {
                transform: translateY(0) scale(0.98);
                filter: brightness(0.96);
            }

            #${BUTTON_ID}.clipit-fancy-btn:focus-visible {
                outline: 3px solid rgba(96, 165, 250, 0.45);
                outline-offset: 2px;
            }

            #${BUTTON_ID}.clipit-copied {
                background:
                    radial-gradient(circle at 20% 10%, rgba(255,255,255,0.24), transparent 30%),
                    linear-gradient(135deg, #10b981 0%, #059669 55%, #064e3b 100%) !important;
                border-color: rgba(167, 243, 208, 0.75) !important;
            }

            .clipit-icon {
                font-size: 14px;
                line-height: 1;
                opacity: 0.95;
            }

            .clipit-toast {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 100000;
                padding: 11px 16px;
                border-radius: 12px;
                color: #f8fafc;
                font-family: Tahoma, Verdana, sans-serif;
                font-size: 14px;
                font-weight: 700;
                background:
                    linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.96));
                border: 1px solid rgba(148, 163, 184, 0.35);
                box-shadow:
                    0 14px 36px rgba(0,0,0,0.32),
                    inset 0 1px 0 rgba(255,255,255,0.08);
                opacity: 0;
                transform: translateY(8px) scale(0.98);
                transition:
                    opacity 220ms ease,
                    transform 220ms ease;
                pointer-events: none;
            }

            .clipit-toast-show {
                opacity: 1;
                transform: translateY(0) scale(1);
            }

            .clipit-toast-error {
                background:
                    linear-gradient(135deg, rgba(127,29,29,0.96), rgba(69,10,10,0.96));
                border-color: rgba(252, 165, 165, 0.45);
            }
        `;

        document.head.appendChild(style);
    }
})();
