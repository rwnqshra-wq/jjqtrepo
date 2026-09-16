/* ============================================================
   API client.
   Thin wrapper over fetch that keeps the CSRF token, always sends
   the session cookie, and normalises error handling.

   Loaded as a plain script, so everything it exposes lives on the
   global scope for the other dashboard scripts to use.
   ============================================================ */

'use strict';

/** Base path of the backend, read from window.DASHBOARD_CONFIG. */
const API_BASE = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.apiBaseUrl)
    ? window.DASHBOARD_CONFIG.apiBaseUrl.replace(/\/$/, '')
    : 'https://api.example.com';

/** CSRF token bound to the current session. Set after login or bootstrap. */
let apiCsrfToken = '';

/** Store the CSRF token returned by login/bootstrap. */
function apiSetCsrf(token) {
  apiCsrfToken = typeof token === 'string' ? token : '';
}

/** Current CSRF token. */
function apiGetCsrf() {
  return apiCsrfToken;
}

/**
 * Perform a request against the backend.
 *
 * @param {string} path      endpoint file name, e.g. 'conversations'
 * @param {object} [options] { method, body, query }
 * @returns {Promise<object>} the parsed success payload
 * @throws {Error} with a `.status` property on failure
 */
async function apiRequest(path, options) {
  const opts = options || {};
  const method = opts.method || 'GET';

  const url = new URL(API_BASE + '/' + path, window.location.href);

  if (opts.query) {
    Object.keys(opts.query).forEach(function (key) {
      const value = opts.query[key];
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const headers = {};
  if (opts.body !== undefined && opts.body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && apiCsrfToken) {
    headers['X-CSRF-Token'] = apiCsrfToken;
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      method: method,
      headers: headers,
      credentials: 'include',
      body: opts.body !== undefined && opts.body !== null
        ? JSON.stringify(opts.body)
        : undefined
    });
  } catch (networkError) {
    const error = new Error('NETWORK');
    error.status = 0;
    error.cause = networkError;
    throw error;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (parseError) {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const message = (payload && payload.error) ? payload.error : ('HTTP ' + response.status);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

/* ------------------------------------------------------------------
   Endpoints
   ------------------------------------------------------------------ */

const api = {
  /** Exchange credentials for a session. */
  login: function (username, password) {
    return apiRequest('login', {
      method: 'POST',
      body: { username: username, password: password }
    });
  },

  /** Destroy the current session server-side. */
  logout: function () {
    return apiRequest('logout', { method: 'POST', body: {} });
  },

  /** Current auth state, used to decide between login and dashboard. */
  session: function () {
    return apiRequest('session');
  },

  /** Everything needed for the first paint of the dashboard. */
  bootstrap: function () {
    return apiRequest('bootstrap');
  },

  /** Conversation list only. */
  conversations: function (limit) {
    return apiRequest('conversations', { query: { limit: limit } });
  },

  /** One full conversation: profile, navigation, submissions, commands. */
  conversation: function (id) {
    return apiRequest('conversation', { query: { id: id } });
  },

  /** Mark one conversation read, or all of them. */
  markRead: function (id, isRead) {
    const body = { read: isRead === false ? 0 : 1 };
    if (id === 'all') {
      body.all = 1;
    } else {
      body.id = id;
    }
    return apiRequest('mark_read', { method: 'POST', body: body });
  },

  /** Move a conversation into a different status. */
  setStatus: function (id, status) {
    return apiRequest('set_status', {
      method: 'POST',
      body: { id: id, status: status }
    });
  },

  /** Send a remote-control command to the visitor's browser. */
  issueCommand: function (id, command) {
    return apiRequest('issue_command', {
      method: 'POST',
      body: { id: id, command: command }
    });
  },

  /** URL of the realtime event stream. */
  streamUrl: function (lastEventId) {
    const url = new URL(API_BASE + '/stream', window.location.href);
    if (lastEventId) {
      url.searchParams.set('last_id', String(lastEventId));
    }
    return url.toString();
  }
};
