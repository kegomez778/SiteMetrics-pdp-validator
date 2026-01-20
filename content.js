// content.js - Script que se inyecta en las páginas de Samsung

// Añadir indicador visual cuando la extensión está activa
(() => {
  const indicator = document.createElement('div');
  indicator.id = 'samsung-validator-indicator';
  indicator.innerHTML = '🔍';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
    z-index: 999999;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
    transition: transform 0.3s;
  `;

  indicator.addEventListener('mouseenter', () => {
    indicator.style.transform = 'scale(1.1)';
  });

  indicator.addEventListener('mouseleave', () => {
    indicator.style.transform = 'scale(1)';
  });

  indicator.addEventListener('click', () => {
    // Abrir el popup de la extensión
    chrome.runtime.sendMessage({ action: 'openPopup' });
  });

  // Solo añadir si estamos en una página de Samsung
  if (window.location.href.includes('samsung.com') || window.location.href.includes('p6-')) {
    document.body.appendChild(indicator);
  }
})();

// Escuchar mensajes del popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'validate') {
    // Esta validación se ejecutará desde popup.js directamente
    sendResponse({ success: true });
  }
  return true;
});