// ==UserScript==
// @name         RPITools
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Copy Buttons, layout views, Slot solutions
// @match        https://retailproductinformation.prodretailapps.basspro.net/*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
    "use strict";

    // Inject Toast CSS
    GM_addStyle(`
        #toastContainer {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            pointer-events: none;
        }
        .toast {
            background: #333;
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            pointer-events: auto;
            font-family: sans-serif;
        }
        .toast.show {
            opacity: 1;
            transform: translateX(0);
        }
        .toast.success { background: #28a745; }
        .toast.error { background: #dc3545; }
        .toast.warning { background: #ffc107; color: #212529; }
    `);


    const PRIORITY_EXACT_SLOTS = ["CAMP0000", "FISH0000", "HUNT0000", "FOOT0000", "HFRESADJ"]; // Priority 1 (Full matches)
    const PRIORITY_PREFIXES = ["CM", "PF", "GF", "MA", "FS", "HU", "HC", "MN", "WM", "FX"]; // Priority 2 & 3
    const PRIORITY_BACKROOM_PREFIXES = ["B1"]; // Priority 4

    function fixNegatives() {
        const skuTitle = document.querySelector("mat-card-title.mat-card-title");
        if (!skuTitle) return;
        const skuMatch = skuTitle.textContent.match(/\d+$/);
        const sku = skuMatch ? skuMatch[0] : "UNKNOWN_SKU";

        const container = document.querySelector(".mat-dialog-container") || document;
        const buttons = container.querySelectorAll(".primarySlotButton, .nonPrimarySlotButton");

        let negatives = [];
        let poolExact = []; // Tier 1: Exact matches
        let poolNonPrimary = []; // Tier 2: Standard Prefixes + Non-Primary
        let poolPrimary = []; // Tier 3: Standard Prefixes + Primary
        let poolBackroom = []; // Tier 4: Backroom Prefixes

        buttons.forEach((btn) => {
            const spans = btn.querySelectorAll("span");
            if (spans.length < 2) return;

            const slotName = spans[0].innerText.trim();
            const qtyText = spans[1].innerText.trim();
            const qty = parseInt(qtyText.replace(/[^\d-]/g, ""));

            if (qty < 0) {
                negatives.push({ slot: slotName, qty: Math.abs(qty) });
            } else if (qty > 0) {
                // Tier 1: Exact Matches
                if (PRIORITY_EXACT_SLOTS.includes(slotName)) {
                    poolExact.push({ slot: slotName, qty: qty });
                }
                // Tier 4: Backroom Prefixes (Checked before generic prefixes if overlapped)
                else if (PRIORITY_BACKROOM_PREFIXES.some((pre) => slotName.toUpperCase().startsWith(pre.toUpperCase()))) {
                    poolBackroom.push({ slot: slotName, qty: qty });
                }
                // Tiers 2 & 3: Standard Prefixes
                else if (PRIORITY_PREFIXES.some((pre) => slotName.toUpperCase().startsWith(pre.toUpperCase()))) {
                    if (btn.classList.contains("nonPrimarySlotButton")) {
                        poolNonPrimary.push({ slot: slotName, qty: qty });
                    } else {
                        poolPrimary.push({ slot: slotName, qty: qty });
                    }
                }
            }
        });

        // Search order: Exact -> Non-Primary -> Primary -> Backroom
        const sourcePools = [poolExact, poolNonPrimary, poolPrimary, poolBackroom];
        let moves = [];

        negatives.forEach((neg) => {
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
            const output = moves.join("\n");
            navigator.clipboard.writeText(output).then(() => {
                showToast("Solution copied to clipboard:\n" + output, "success");
            });
        } else {
            showToast("No fixable negative slots found matching current criteria.", "error");
        }
    }

    function clearDefaults() {
        // 1. Get SKU (adjusting selector to look for typical header if card title is missing)
        const skuTitle = document.querySelector("mat-card-title.mat-card-title, .mat-dialog-title p");
        if (!skuTitle) return;
        const skuMatch = skuTitle.textContent.match(/\d+/);
        const sku = skuMatch ? skuMatch[0] : "UNKNOWN_SKU";

        const container = document.querySelector(".mat-dialog-container") || document;
        const buttons = container.querySelectorAll(".primarySlotButton, .nonPrimarySlotButton");

        let poolExact = []; // Source (Default locations)
        let poolPrimary = []; // Target (Primary locations)

        buttons.forEach((btn) => {
            const spans = btn.querySelectorAll("span");
            if (spans.length < 2) return;

            const slotName = spans[0].innerText.trim();
            const qtyText = spans[1].innerText.trim();
            const qty = parseInt(qtyText.replace(/[^\d-]/g, ""));

            // Source: It's in our Exact list and has items to move
            if (PRIORITY_EXACT_SLOTS.includes(slotName) && qty > 0) {
                poolExact.push({ slot: slotName, qty: qty });
            }

            // Target: It's a Primary Slot (even if qty is 0)
            if (btn.classList.contains("primarySlotButton")) {
                poolPrimary.push({ slot: slotName });
            }
        });

        // 2. Specific Error: No Primary Slot found
        if (poolPrimary.length === 0) {
            showToast("Error: No Primary slot exists for this SKU.", "error");
            return;
        }

        // 3. Specific Error: No Default items to move
        if (poolExact.length === 0) {
            showToast("No items found in Default slots (CAMP, FISH, etc.).", "info");
            return;
        }

        let moves = [];
        // Target the first available primary slot found
        const targetSlot = poolPrimary[0].slot;

        poolExact.forEach((src) => {
            // Move full balance
            moves.push(`${sku},${src.slot},${targetSlot},${src.qty}`);
        });

        if (moves.length > 0) {
            const output = moves.join("\n");
            navigator.clipboard.writeText(output).then(() => {
                showToast("Move to Primary copied:\n" + output, "success");
            });
        }
    }



    function addFixInvButtons(dialog) {
    if (dialog.querySelector(".fix-inv-btn")) return;

    const createBtn = (text, color, rightOffset, clickFn) => {
        const btn = document.createElement("button");
        btn.innerHTML = text;
        btn.className = "fix-inv-btn";
        Object.assign(btn.style, {
            position: "absolute",
            top: "21px",
            right: rightOffset,
            zIndex: "9999",
            padding: "8px 12px",
            cursor: "pointer",
            borderRadius: "4px",
            border: "none",
            backgroundColor: color,
            color: "white",
            fontWeight: "bold",
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
        });
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            clickFn();
        });
        return btn;
    };

    const fixNegBtn = createBtn("Fix Neg", "#4CAF50", "58px", fixNegatives);
    const clearDefBtn = createBtn("Clear Def", "#2196F3", "144px", clearDefaults);

    dialog.style.position = "relative";
    dialog.appendChild(fixNegBtn);
    dialog.appendChild(clearDefBtn);
}


    function addLayoutToggleButton() {
        // Target the end of the first div of the first form inside .mat-card-content
        const targetContainer = document.querySelector(
            ".mat-card-content form div",
        );

        if (!targetContainer || targetContainer.dataset.toggleBtnAdded) return;
        targetContainer.dataset.toggleBtnAdded = "true";

        const btn = document.createElement("button");
        btn.innerHTML = "↔";
        btn.type = "button";
        btn.className = "layout-toggle-btn";

        // Apply your specific attributes
        Object.assign(btn.style, {
            margin: "10px",
            padding: "3px 8px 6px 8px",
            cursor: "pointer",
            borderRadius: "10px",
            borderStyle: "hidden",
            fontSize: "22px",
            backgroundColor: "#b5e5fb",
            outline: "none",
            transition: "filter 0.2s",
        });

        btn.addEventListener("click", () => {
            // 1. Toggle flex-direction on .displayFlex
            document.querySelectorAll(".displayFlex").forEach((el) => {
                const isColumn = el.style.flexDirection === "column";
                el.style.flexDirection = isColumn ? "row" : "column";
            });

            // 2. Toggle width on .tileClass and .alternativeTile
            const tileSelectors = ".tileClass, .alternativeTile";
            document.querySelectorAll(tileSelectors).forEach((el) => {
                const isFullWidth = el.style.width === "100%";
                el.style.width = isFullWidth ? "50%" : "100%";
            });
        });

        targetContainer.appendChild(btn);
    }

    function attachSlotCopyHandlers(buttons) {
        buttons.forEach((button) => {
            if (button.dataset.copyHandlerAdded) return;
            button.dataset.copyHandlerAdded = "true";
            button.style.cursor = "pointer";
            button.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                const slot = this.querySelector("span").innerHTML;
                navigator.clipboard.writeText(slot).then(() => {
                    const originalBg = this.style.backgroundColor;
                    this.style.backgroundColor = "#90EE90";
                    setTimeout(() => {
                        this.style.backgroundColor = originalBg;
                    }, 200);
                });
            });
        });
    }

    function attachSKUCopyHandler(matCardTitle) {
        if (!matCardTitle || matCardTitle.dataset.copyHandlerAdded) return;
        matCardTitle.dataset.copyHandlerAdded = "true";
        matCardTitle.style.cursor = "pointer";
        matCardTitle.addEventListener("click", function (e) {
            const fullText = this.textContent || this.innerText;
            const skuMatch = fullText.match(/\d+$/);
            const sku = skuMatch ? skuMatch[0] : null;
            if (sku) {
                navigator.clipboard.writeText(sku).then(() => {
                    const originalBg = this.style.backgroundColor;
                    this.style.backgroundColor = "#90EE90";
                    setTimeout(() => {
                        this.style.backgroundColor = originalBg;
                    }, 200);
                });
            }
        });
    }

    // Create Toast Container
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    document.body.appendChild(toastContainer);

    // Toast notification function
    function showToast(message, type = "info") {
        const container = document.getElementById("toastContainer");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add("show"), 10);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => container.removeChild(toast), 300);
        }, 3000);
    }

    const observer = new MutationObserver((mutations) => {
        // Run the toggle button injector
        addLayoutToggleButton();

        const productInfoCard = document.querySelector(".productInfoCard");
        if (productInfoCard) productInfoCard.style.height = "auto";

        const buttons = document.querySelectorAll(
            ".primarySlotButton, .nonPrimarySlotButton",
        );
        if (buttons.length > 0) attachSlotCopyHandlers(buttons);

        const skuCard = document.querySelector("mat-card-title.mat-card-title");
        if (skuCard) attachSKUCopyHandler(skuCard);

        const dialog = document.querySelector(".mat-dialog-container");
        if (dialog) addFixInvButtons(dialog);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
