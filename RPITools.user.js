// ==UserScript==
// @name         TESTRPITools
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Copy slot and toggle layout views
// @match        https://retailproductinformation.prodretailapps.basspro.net/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const PRIORITY_EXACT_SLOTS = ["CAMP0000", "FISH0000", "HUNT0000"]; // Priority 1 (Full matches)
    const PRIORITY_PREFIXES = ["CM", "FS", "HU", "MN", "FX"]; // Priority 2 & 3 (Starts with)

    function generateSolution() {
        const skuTitle = document.querySelector('mat-card-title.mat-card-title');
        if (!skuTitle) return;
        const skuMatch = skuTitle.textContent.match(/\d+$/);
        const sku = skuMatch ? skuMatch[0] : "UNKNOWN_SKU";

        const container = document.querySelector('.mat-dialog-container') || document;
        const buttons = container.querySelectorAll('.primarySlotButton, .nonPrimarySlotButton');

        let negatives = [];
        let poolExact = []; // Tier 1: Exact matches (CAMP0000, etc)
        let poolNonPrimary = []; // Tier 2: Prefixes (CM...) + Non-Primary
        let poolPrimary = []; // Tier 3: Prefixes (CM...) + Primary

        buttons.forEach(btn => {
            const spans = btn.querySelectorAll('span');
            if (spans.length < 2) return;

            const slotName = spans[0].innerText.trim();
            const qtyText = spans[1].innerText.trim();
            const qty = parseInt(qtyText.replace(/[^\d-]/g, ''));

            if (qty < 0) {
                negatives.push({ slot: slotName, qty: Math.abs(qty) });
            } else if (qty > 0) {
                // Tier 1: Check Exact Matches
                if (PRIORITY_EXACT_SLOTS.includes(slotName)) {
                    poolExact.push({ slot: slotName, qty: qty });
                }
                // Tiers 2 & 3: Check Prefixes
                else if (PRIORITY_PREFIXES.some(pre => slotName.startsWith(pre))) {
                    if (btn.classList.contains('nonPrimarySlotButton')) {
                        poolNonPrimary.push({ slot: slotName, qty: qty });
                    } else {
                        poolPrimary.push({ slot: slotName, qty: qty });
                    }
                }
            }
        });

        const sourcePools = [poolExact, poolNonPrimary, poolPrimary];
        let moves = [];

        negatives.forEach(neg => {
            for (let pool of sourcePools) {
                for (let pos of pool) {
                    if (neg.qty <= 0) break;
                    if (pos.qty <= 0) continue;

                    let amountToMove = Math.min(neg.qty, pos.qty);
                    moves.push(`${sku},${pos.slot},${neg.slot},${amountToMove}`);

                    neg.qty -= amountToMove;
                    pos.qty -= amountToMove;
                }
                if (neg.qty <= 0) break;
            }
        });

        if (moves.length > 0) {
            const output = moves.join('\n');
            navigator.clipboard.writeText(output).then(() => {
                alert("Solution copied to clipboard:\n" + output);
            });
        } else {
            alert("No fixable negative slots found matching current criteria.");
        }
    }

    function addFixButton(dialog) {
        if (dialog.querySelector('.fix-inv-btn')) return;

        const btn = document.createElement('button');
        btn.innerHTML = 'Fix Inv';
        btn.className = 'fix-inv-btn';
        Object.assign(btn.style, {
            position: 'absolute',
            top: '21px',
            right: '70px',
            zIndex: '9999',
            padding: '8px 12px',
            cursor: 'pointer',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: '#4CAF50',
            color: 'white',
            fontWeight: 'bold',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            generateSolution();
        });

        dialog.style.position = 'relative';
        dialog.appendChild(btn);
    }

    // --- Core Script Logic ---

    function attachSKUCopyHandler(matCardTitle) {
        if (!matCardTitle || matCardTitle.dataset.copyHandlerAdded) return;
        matCardTitle.dataset.copyHandlerAdded = 'true';
        matCardTitle.style.cursor = 'pointer';
        matCardTitle.addEventListener('click', function(e) {
            const fullText = this.textContent || this.innerText;
            const skuMatch = fullText.match(/\d+$/);
            const sku = skuMatch ? skuMatch[0] : null;
            if (sku) {
                navigator.clipboard.writeText(sku).then(() => {
                    const originalBg = this.style.backgroundColor;
                    this.style.backgroundColor = '#90EE90';
                    setTimeout(() => { this.style.backgroundColor = originalBg; }, 200);
                });
            }
        });
    }

    function addLayoutToggleButton() {
        // Target the end of the first div of the first form inside .mat-card-content
        const targetContainer = document.querySelector('.mat-card-content form div');

        if (!targetContainer || targetContainer.dataset.toggleBtnAdded) return;
        targetContainer.dataset.toggleBtnAdded = 'true';

        const btn = document.createElement('button');
        btn.innerHTML = '↔';
        btn.type = 'button';
        btn.className = 'layout-toggle-btn';

        // Apply your specific attributes
        Object.assign(btn.style, {
            margin: '10px',
            padding: '3px 8px 6px 8px',
            cursor: 'pointer',
            borderRadius: '10px',
            borderStyle: 'hidden',
            fontSize: '22px',
            backgroundColor: '#b5e5fb',
            outline: 'none',
            transition: 'filter 0.2s'
        });

        btn.addEventListener('click', () => {
            // 1. Toggle flex-direction on .displayFlex
            document.querySelectorAll('.displayFlex').forEach(el => {
                const isColumn = el.style.flexDirection === 'column';
                el.style.flexDirection = isColumn ? 'row' : 'column';
            });

            // 2. Toggle width on .tileClass and .alternativeTile
            const tileSelectors = '.tileClass, .alternativeTile';
            document.querySelectorAll(tileSelectors).forEach(el => {
                const isFullWidth = el.style.width === '100%';
                el.style.width = isFullWidth ? '50%' : '100%';
            });
        });

        targetContainer.appendChild(btn);
    }

    function attachSlotCopyHandlers(buttons) {
        buttons.forEach(button => {
            if (button.dataset.copyHandlerAdded) return;
            button.dataset.copyHandlerAdded = 'true';
            button.addEventListener('click', function(e) {
                const slot = this.querySelector("span").innerText;
                navigator.clipboard.writeText(slot).then(() => {
                    const originalBg = this.style.backgroundColor;
                    this.style.backgroundColor = '#90EE90';
                    setTimeout(() => { this.style.backgroundColor = originalBg; }, 200);
                });
            });
        });
    }

    // --- Observer Loop ---
    const observer = new MutationObserver(() => {
        addLayoutToggleButton();

        const productInfoCard = document.querySelector('.productInfoCard');
        if(productInfoCard) productInfoCard.style.height = 'auto';

        const buttons = document.querySelectorAll('.primarySlotButton, .nonPrimarySlotButton');
        if (buttons.length > 0) attachSlotCopyHandlers(buttons);

        const skuCard = document.querySelector('mat-card-title.mat-card-title');
        if(skuCard) attachSKUCopyHandler(skuCard);

        const dialog = document.querySelector('.mat-dialog-container');
        if (dialog) addFixButton(dialog);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
