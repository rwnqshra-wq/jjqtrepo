require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Connection
mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost:27017/jusour_admin')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.json({ limit: '20kb' })); // max_payload_bytes equivalent
app.use(express.urlencoded({ extended: true, limit: '20kb' }));
app.use(cookieParser());

// Trust proxy if on Render
app.set('trust proxy', 1);

// CORS for public and dashboard origins
const publicOrigin = process.env.PUBLIC_ORIGIN || '*';
const dashboardOrigin = process.env.DASHBOARD_ORIGIN || 'http://localhost:8080';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (req.path === '/api/submit' || req.path === '/api/poll_commands') {
    // Public routes
    res.header('Access-Control-Allow-Origin', publicOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  } else if (req.path.startsWith('/api/')) {
    // Dashboard routes
    if (origin === dashboardOrigin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  } else {
    next();
  }
});

// Mount Routes
app.use('/api', apiRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
