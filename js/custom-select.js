/**
 * Custom Select Component
 * Replaces native <select> elements with a premium, styled alternative.
 */

const _customSelectsMap = new Map();

/**
 * Transforms a native <select> into a custom dropdown or refreshes it.
 * @param {HTMLSelectElement} select - The native select element.
 */
export function syncCustomSelect(select) {
  if (!select || select.tagName !== 'SELECT') return;

  let container = _customSelectsMap.get(select);
  
  if (!container) {
    // Initial wrap
    container = document.createElement('div');
    container.className = 'custom-select-container';
    select.parentNode.insertBefore(container, select);
    container.appendChild(select);
    select.style.display = 'none';

    // Trigger
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.tabIndex = 0;
    container.appendChild(trigger);

    // Options Popover
    const popover = document.createElement('div');
    popover.className = 'custom-select-options';
    container.appendChild(popover);

    // Click to toggle
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = container.classList.contains('open');
      closeAllCustomSelects();
      if (!isOpen) container.classList.add('open');
    });

    // Handle keys
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      }
    });

    _customSelectsMap.set(select, container);
  }

  // Refresh items
  const trigger = container.querySelector('.custom-select-trigger');
  const popover = container.querySelector('.custom-select-options');
  const options = Array.from(select.options);
  
  const selectedOption = options.find(o => o.selected) || options[0];
  trigger.innerHTML = `<span>${selectedOption ? selectedOption.innerText : 'Select...'}</span><span class="custom-select-arrow">▼</span>`;

  popover.innerHTML = '';
  options.forEach((opt, idx) => {
    const item = document.createElement('div');
    item.className = 'custom-select-option';
    if (opt.selected) item.classList.add('selected');
    if (opt.disabled) item.classList.add('disabled');
    item.innerText = opt.innerText;
    
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (opt.disabled) return;
      
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      container.classList.remove('open');
      syncCustomSelect(select); // Refresh UI
    });
    
    popover.appendChild(item);
  });
}

/**
 * Closes all open custom selects.
 */
export function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select-container.open').forEach(el => {
    el.classList.remove('open');
  });
}

// Global click-outside
document.addEventListener('click', () => closeAllCustomSelects());

// Auto-initialize any select with class 'cat-select' or 'backlog-select'
export function initAllCustomSelects() {
  document.querySelectorAll('select.cat-select, select.backlog-select, .backlog-cat-select').forEach(sel => {
    syncCustomSelect(sel);
  });
}
