// popup.js - Lógica del popup de la extensión

let currentResults = null;
let currentTab = null;

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTab();
  setupEventListeners();
});

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  const urlDisplay = document.getElementById('currentUrl');
  
  if (tab.url && (tab.url.includes('samsung.com') || tab.url.includes('p6-'))) {
    urlDisplay.textContent = tab.url;
    document.getElementById('noPage').style.display = 'none';
  } else {
    urlDisplay.textContent = 'No es una página de Samsung';
    document.getElementById('validateBtn').disabled = true;
    document.getElementById('noPage').style.display = 'block';
  }
}

function setupEventListeners() {
  document.getElementById('validateBtn').addEventListener('click', validatePage);
  document.getElementById('exportBtn').addEventListener('click', exportReport);
  document.getElementById('historyBtn').addEventListener('click', showHistory);
  document.getElementById('backBtn').addEventListener('click', hideHistory);
}

async function validatePage() {
  const btn = document.getElementById('validateBtn');
  const btnText = document.getElementById('btnText');
  const errorMsg = document.getElementById('errorMessage');
  
  btn.disabled = true;
  btn.classList.add('validating');
  btnText.innerHTML = '<div class="spinner"></div> Validando...';
  errorMsg.style.display = 'none';

  try {
    // Inyectar y ejecutar el validador en la página
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      function: runValidation
    });

    if (result && result.result) {
      currentResults = result.result;
      await saveToHistory(currentResults);
      displayResults(currentResults);
    } else {
      throw new Error('No se pudo obtener resultados');
    }
  } catch (error) {
    console.error('Error:', error);
    errorMsg.textContent = '❌ Error al validar: ' + error.message;
    errorMsg.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.classList.remove('validating');
    btnText.textContent = '▶️ Validar esta página';
  }
}

// Esta función se ejecuta en el contexto de la página
function runValidation() {
  const results = {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // ========== SEO VALIDATION ==========
  results.checks.seo = {};
  
  const title = document.querySelector('title');
  results.checks.seo.title = title ? {
    status: title.textContent.length >= 50 && title.textContent.length <= 60 ? 'pass' : 'warning',
    message: title ? `Meta title: ${title.textContent.length} caracteres` : 'Meta title no encontrado',
    value: title?.textContent || ''
  } : { status: 'fail', message: 'Meta title no encontrado' };

  const metaDesc = document.querySelector('meta[name="description"]');
  results.checks.seo.description = metaDesc ? {
    status: metaDesc.content.length >= 150 && metaDesc.content.length <= 160 ? 'pass' : 'warning',
    message: `Meta description: ${metaDesc.content.length} caracteres`
  } : { status: 'fail', message: 'Meta description no encontrada' };

  const h1s = document.querySelectorAll('h1');
  results.checks.seo.h1 = {
    status: h1s.length === 1 ? 'pass' : h1s.length === 0 ? 'fail' : 'warning',
    message: `${h1s.length} H1 encontrado(s)${h1s.length === 1 ? '' : ' (debe haber exactamente 1)'}`
  };

  const canonical = document.querySelector('link[rel="canonical"]');
  results.checks.seo.canonical = canonical ? {
    status: 'pass',
    message: 'Canonical tag presente',
    value: canonical.href
  } : { status: 'warning', message: 'Canonical tag no encontrado' };

  // ========== CONTENT VALIDATION ==========
  results.checks.content = {};

  const productTitle = document.querySelector('h1, .product-title, [class*="product-name"]');
  results.checks.content.productTitle = productTitle ? {
    status: productTitle.offsetHeight < productTitle.scrollHeight ? 'warning' : 'pass',
    message: productTitle.offsetHeight < productTitle.scrollHeight ? 'Título puede estar cortado' : 'Título completo',
    value: productTitle.textContent.trim()
  } : { status: 'fail', message: 'Título de producto no encontrado' };

  const price = document.querySelector('[class*="price"], .product-price');
  results.checks.content.price = price ? {
    status: 'pass',
    message: 'Precio visible',
    value: price.textContent.trim()
  } : { status: 'warning', message: 'Precio no encontrado claramente' };

  const ctaButtons = document.querySelectorAll('button[class*="buy"], button[class*="cart"], a[class*="buy"]');
  results.checks.content.cta = {
    status: ctaButtons.length > 0 ? 'pass' : 'fail',
    message: `${ctaButtons.length} botón(es) CTA encontrado(s)`
  };

  const placeholders = document.body.textContent.match(/lorem ipsum|placeholder|todo|tbd|\[.*?\]|xxx/gi);
  results.checks.content.noPlaceholders = {
    status: !placeholders || placeholders.length === 0 ? 'pass' : 'fail',
    message: placeholders ? `${placeholders.length} placeholder(s) encontrado(s)` : 'Sin placeholders',
    details: placeholders?.slice(0, 5)
  };

  // ========== IMAGES VALIDATION ==========
  results.checks.images = {};

  const images = document.querySelectorAll('img');
  const imagesWithoutAlt = Array.from(images).filter(img => !img.alt || img.alt.trim() === '');
  
  results.checks.images.altText = {
    status: imagesWithoutAlt.length === 0 ? 'pass' : imagesWithoutAlt.length <= 2 ? 'warning' : 'fail',
    message: `${imagesWithoutAlt.length} de ${images.length} imágenes sin alt text`,
    details: imagesWithoutAlt.slice(0, 5).map(img => img.src.split('/').pop())
  };

  const heroImage = document.querySelector('[class*="hero"] img, .product-image img, [class*="main-image"] img');
  results.checks.images.hero = heroImage ? {
    status: 'pass',
    message: `Imagen hero: ${heroImage.naturalWidth}x${heroImage.naturalHeight}`,
    value: heroImage.src
  } : { status: 'warning', message: 'Imagen hero no identificada claramente' };

  const brokenImages = Array.from(images).filter(img => !img.complete || img.naturalWidth === 0);
  results.checks.images.broken = {
    status: brokenImages.length === 0 ? 'pass' : 'fail',
    message: brokenImages.length === 0 ? 'Todas las imágenes cargan' : `${brokenImages.length} imagen(es) rota(s)`,
    details: brokenImages.slice(0, 5).map(img => img.src.split('/').pop())
  };

  // ========== LINKS VALIDATION ==========
  results.checks.links = {};

  const links = document.querySelectorAll('a[href]');
  const internalLinks = Array.from(links).filter(a => a.hostname === window.location.hostname);
  const externalLinks = Array.from(links).filter(a => a.hostname !== window.location.hostname);
  
  results.checks.links.internal = {
    status: 'pass',
    message: `${internalLinks.length} enlaces internos encontrados`
  };

  results.checks.links.external = {
    status: 'pass',
    message: `${externalLinks.length} enlaces externos encontrados`
  };

  const emptyLinks = Array.from(links).filter(a => !a.href || a.href === '#' || a.href === 'javascript:void(0)');
  results.checks.links.empty = {
    status: emptyLinks.length === 0 ? 'pass' : 'warning',
    message: emptyLinks.length === 0 ? 'Sin enlaces vacíos' : `${emptyLinks.length} enlace(s) vacío(s)`
  };

  // ========== LANGUAGE VALIDATION ==========
  results.checks.language = {};

  const htmlLang = document.documentElement.lang;
  results.checks.language.htmlLang = {
    status: htmlLang ? 'pass' : 'warning',
    message: htmlLang ? `Idioma HTML: ${htmlLang}` : 'Atributo lang no definido'
  };

  const bodyText = document.body.textContent;
  const spanishWords = (bodyText.match(/\b(el|la|los|las|de|en|con|para|por)\b/gi) || []).length;
  const englishWords = (bodyText.match(/\b(the|and|for|with|from|this|that)\b/gi) || []).length;
  const portugueseWords = (bodyText.match(/\b(o|a|os|as|de|em|para|com)\b/gi) || []).length;

  const detectedLang = spanishWords > englishWords && spanishWords > portugueseWords ? 'Español' :
                        englishWords > spanishWords && englishWords > portugueseWords ? 'Inglés' : 'Portugués';

  results.checks.language.detected = {
    status: 'pass',
    message: `Idioma detectado: ${detectedLang}`
  };

  // ========== RESPONSIVE ==========
  results.checks.responsive = {};

  const viewport = document.querySelector('meta[name="viewport"]');
  results.checks.responsive.viewport = viewport ? {
    status: 'pass',
    message: 'Meta viewport presente'
  } : { status: 'fail', message: 'Meta viewport no encontrado' };

  // ========== ACCESSIBILITY ==========
  results.checks.accessibility = {};

  const buttonsWithoutAriaOrText = Array.from(document.querySelectorAll('button')).filter(btn => 
    !btn.textContent.trim() && !btn.getAttribute('aria-label')
  );

  results.checks.accessibility.ariaLabels = {
    status: buttonsWithoutAriaOrText.length === 0 ? 'pass' : 'warning',
    message: buttonsWithoutAriaOrText.length === 0 ? 'Todos los botones tienen texto/ARIA' : `${buttonsWithoutAriaOrText.length} botón(es) sin aria-label`
  };

  // Calcular score y contadores
  let passCount = 0, warningCount = 0, failCount = 0;
  
  Object.values(results.checks).forEach(category => {
    Object.values(category).forEach(check => {
      if (check.status === 'pass') passCount++;
      else if (check.status === 'warning') warningCount++;
      else if (check.status === 'fail') failCount++;
    });
  });

  const totalChecks = passCount + warningCount + failCount;
  results.score = Math.round((passCount / totalChecks) * 100);
  results.passCount = passCount;
  results.warningCount = warningCount;
  results.failCount = failCount;

  return results;
}

function displayResults(results) {
  document.getElementById('noPage').style.display = 'none';
  document.getElementById('results').style.display = 'block';

  // Score
  const scoreCircle = document.getElementById('scoreCircle');
  scoreCircle.className = 'score-circle';
  if (results.score < 70) scoreCircle.classList.add('fail');
  else if (results.score < 90) scoreCircle.classList.add('warning');
  
  document.getElementById('scoreValue').textContent = results.score + '%';
  document.getElementById('passCount').textContent = results.passCount;
  document.getElementById('warningCount').textContent = results.warningCount;
  document.getElementById('failCount').textContent = results.failCount;

  // Categories
  const categoriesDiv = document.getElementById('categories');
  categoriesDiv.innerHTML = '';

  const categoryIcons = {
    seo: '🔍',
    content: '📄',
    images: '🖼️',
    links: '🔗',
    language: '🌐',
    responsive: '📱',
    accessibility: '♿'
  };

  const categoryNames = {
    seo: 'SEO',
    content: 'Contenido',
    images: 'Imágenes',
    links: 'Enlaces',
    language: 'Idioma',
    responsive: 'Responsive',
    accessibility: 'Accesibilidad'
  };

  Object.entries(results.checks).forEach(([catKey, checks]) => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category';

    const worstStatus = Object.values(checks).reduce((worst, check) => {
      if (check.status === 'fail') return 'fail';
      if (check.status === 'warning' && worst !== 'fail') return 'warning';
      return worst;
    }, 'pass');

    categoryDiv.innerHTML = `
      <div class="category-header">
        <div class="category-title">
          <span>${categoryIcons[catKey]}</span>
          <span>${categoryNames[catKey]}</span>
        </div>
        <span class="category-badge ${worstStatus}">${worstStatus === 'pass' ? '✓' : worstStatus === 'warning' ? '⚠' : '✗'}</span>
      </div>
      <div class="checks">
        ${Object.entries(checks).map(([key, check]) => `
          <div class="check-item">
            <span class="check-icon">${check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'}</span>
            <div style="flex: 1;">
              <div>${check.message}</div>
              ${check.value ? `<div class="check-details" style="margin-top: 4px; font-style: italic;">"${check.value.substring(0, 80)}${check.value.length > 80 ? '...' : ''}"</div>` : ''}
              ${check.details ? `<ul class="check-details">${check.details.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    categoriesDiv.appendChild(categoryDiv);
  });
}

async function saveToHistory(results) {
  const history = await chrome.storage.local.get(['validationHistory']) || { validationHistory: [] };
  const historyArray = history.validationHistory || [];
  
  historyArray.unshift({
    ...results,
    id: Date.now()
  });

  // Mantener solo últimos 50
  if (historyArray.length > 50) historyArray.pop();

  await chrome.storage.local.set({ validationHistory: historyArray });
}

async function showHistory() {
  const history = await chrome.storage.local.get(['validationHistory']);
  const historyArray = history.validationHistory || [];

  document.getElementById('mainView').style.display = 'none';
  document.getElementById('historyView').style.display = 'block';

  const historyList = document.getElementById('historyList');
  
  if (historyArray.length === 0) {
    historyList.innerHTML = '<div class="empty-history">📂 No hay validaciones guardadas</div>';
    return;
  }

  historyList.innerHTML = historyArray.map(item => `
    <div class="history-item" data-id="${item.id}">
      <div class="history-item-url">${new URL(item.url).pathname.split('/').pop() || 'página'}</div>
      <div class="history-item-meta">
        <span>${new Date(item.timestamp).toLocaleDateString('es-PE')} ${new Date(item.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
        <div class="history-badges">
          <span class="history-badge" style="background: #d1fae5; color: #065f46;">✓ ${item.passCount}</span>
          <span class="history-badge" style="background: #fef3c7; color: #92400e;">⚠ ${item.warningCount}</span>
          <span class="history-badge" style="background: #fee2e2; color: #991b1b;">✗ ${item.failCount}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Event listeners para items
  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = parseInt(item.dataset.id);
      const selected = historyArray.find(h => h.id === id);
      if (selected) {
        currentResults = selected;
        hideHistory();
        displayResults(selected);
      }
    });
  });
}

function hideHistory() {
  document.getElementById('historyView').style.display = 'none';
  document.getElementById('mainView').style.display = 'block';
}

function exportReport() {
  if (!currentResults) return;

  const report = {
    url: currentResults.url,
    fecha: new Date(currentResults.timestamp).toLocaleString('es-PE'),
    puntuacion: currentResults.score,
    aprobados: currentResults.passCount,
    advertencias: currentResults.warningCount,
    errores: currentResults.failCount,
    resultados: currentResults.checks
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: `samsung-validation-${Date.now()}.json`,
    saveAs: true
  });
}