// background.js - Service Worker de la extensión

// Escuchar cuando la extensión se instala
chrome.runtime.onInstalled.addListener(() => {
  console.log('Samsung PDP Validator instalado correctamente');
});

// Escuchar mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    chrome.action.openPopup();
  }
  return true;
});