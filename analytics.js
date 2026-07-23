// analytics.js - nothing in here runs until the visitor accepts the cookie banner.
// Keeping this in its own file (rather than inline in <head>) means the whole
// tracking surface can be read, audited, or deleted in one place.

const GA_MEASUREMENT_ID = 'G-RZJJT37E4Z';
const CLARITY_PROJECT_ID = 'xq5fky39uk';

function loadGA() {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

function loadVercelAnalytics() {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  const s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);
}

function loadClarity() {
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
}

function loadAllAnalytics() {
  loadGA();
  loadVercelAnalytics();
  loadClarity();
}

function initCookieConsent() {
  const banner = document.getElementById('cookieBanner');
  const acceptBtn = document.getElementById('cookieAccept');
  const declineBtn = document.getElementById('cookieDecline');

  let decision = null;
  try { decision = localStorage.getItem('commitIssuesCookieConsent'); } catch (e) {}

  if (decision === 'accepted') { loadAllAnalytics(); return; }
  if (decision === 'declined') { return; }

  banner.classList.remove('hidden');

  acceptBtn.addEventListener('click', () => {
    try { localStorage.setItem('commitIssuesCookieConsent', 'accepted'); } catch (e) {}
    banner.classList.add('hidden');
    loadAllAnalytics();
    if (typeof inputEl !== 'undefined') inputEl.focus();
  });

  declineBtn.addEventListener('click', () => {
    try { localStorage.setItem('commitIssuesCookieConsent', 'declined'); } catch (e) {}
    banner.classList.add('hidden');
    if (typeof inputEl !== 'undefined') inputEl.focus();
  });
}
