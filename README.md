# Jusour — MERN Architecture (Frontend, Server, Dashboard)

This project has been restructured into three completely independent, decoupled components: a public frontend, a Node.js backend server (MongoDB), and an admin dashboard.

---

## 1. Architecture & Top-Level Directories

The repository is divided into:

- **`frontend/`**: The public-facing HTML website. Completely separated from the server.
- **`server/`**: The Node.js (Express) backend, providing APIs, real-time events via SSE, and connecting to a MongoDB database.
- **`dashboard/`**: The admin interface for managing user submissions. Completely separated from the frontend and server.

```text
/frontend
  ├── assets/ (images, icons, fonts)
  ├── css/    (public stylesheets)
  ├── js/     (public scripts)
  ├── ...html (public pages)
  ├── config.js
  └── frontend-config.js (Deployment config)

/server
  ├── models/    (Mongoose Schemas: Admin, User, Submission, etc.)
  ├── routes/    (API logic)
  ├── server.js  (Express entry point)
  ├── package.json
  └── .env       (Server configuration and secrets)

/dashboard
  ├── assets/
  ├── index.html
  ├── login.html
  └── dashboard-config.js (Deployment config)
```

The three sections communicate with each other exclusively through the server API. 

---

## 2. Server Deployment (Render)

The server is built with Node.js and is designed to be deployed as a **Web Service on Render**.

### Render Setup
1. Create a new **Web Service** on Render connected to this repository.
2. Set the Root Directory to `server`.
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. **Environment Variables**:
   - `DATABASE_URL`: Your MongoDB connection string (e.g., MongoDB Atlas).
   - `JWT_SECRET`: A secure random string for signing admin sessions.
   - `PUBLIC_ORIGIN`: The URL where your `/frontend` is hosted (e.g., `https://www.example.com`).
   - `DASHBOARD_ORIGIN`: The URL where your `/dashboard` is hosted (e.g., `https://admin.example.com`).

### Initial Admin Setup
On its very first run, the Node.js server will generate a random password for the `admin` user and print it to the Render Console Logs:
```text
--- INITIAL ADMIN CREATED ---
Username: admin
Password: <random_hex>
```
Log in to the dashboard using these credentials, and the session will be securely stored via an HTTP-Only cookie.

---

## 3. Frontend & Dashboard Deployment

The `frontend/` and `dashboard/` directories contain completely static files (HTML, CSS, JS). They can be hosted anywhere, such as Render (Static Site), Vercel, Netlify, or AWS S3.

Before deploying, update the configuration files to point to your new Render server URL:

**`frontend/frontend-config.js`**:
```js
window.FRONTEND_CONFIG = {
  apiBaseUrl: 'https://your-render-app-url.onrender.com'
};
```

**`dashboard/dashboard-config.js`**:
```js
window.DASHBOARD_CONFIG = {
  apiBaseUrl: 'https://your-render-app-url.onrender.com'
};
```

---

## 4. Real-time Events (SSE)

The server pushes real-time events to the dashboard using **Server-Sent Events (SSE)** via `/api/stream`. Node.js natively handles these long-lived HTTP connections efficiently. Admin actions use standard REST POST requests; SSE is exclusively for server-to-dashboard real-time updates.
