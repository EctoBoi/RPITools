// ==UserScript==
// @name         RPITools
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Copy slot and toggle layout views
// @match        https://retailproductinformation.prodretailapps.basspro.net/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

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
            button.style.cursor = 'pointer';
            button.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const slot = this.querySelector("span").innerHTML;
                navigator.clipboard.writeText(slot).then(() => {
                    const originalBg = this.style.backgroundColor;
                    this.style.backgroundColor = '#90EE90';
                    setTimeout(() => { this.style.backgroundColor = originalBg; }, 200);
                });
            });
        });
    }

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

    const observer = new MutationObserver((mutations) => {
        // Run the toggle button injector
        addLayoutToggleButton();

        const productInfoCard = document.querySelector('.productInfoCard');
        if(productInfoCard) productInfoCard.style.height = 'auto';

        const buttons = document.querySelectorAll('.primarySlotButton, .nonPrimarySlotButton');
        if (buttons.length > 0) attachSlotCopyHandlers(buttons);

        const skuCard = document.querySelector('mat-card-title.mat-card-title');
        if(skuCard) attachSKUCopyHandler(skuCard);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
