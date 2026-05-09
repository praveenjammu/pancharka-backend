/**
 * ═══════════════════════════════════════════
 * PANCHARKA™ Backend Server
 * Node.js + Express + MongoDB
 * ═══════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { Admin, Order, Settings, Coupon, ActivityLog, Inventory } = require('./models');
const { auth, ownerOnly } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: [process.env.FRONTEND_URL || 'https://pancharka.com', 'http://localhost:3000', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Stricter limit on auth routes
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts. Try again in 15 minutes.' } });

// ═══════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✓ MongoDB connected'))
  .catch(err => console.error('✗ MongoDB error:', err.message));

// ═══════════════════════════════════════════
// SETUP: Create default admin on first run
// ═══════════════════════════════════════════
async function setupDefaults() {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASS || 'pancharka123', 12);
      const secAHash = await bcrypt.hash('pancharka', 12);
      await Admin.create({
        username: process.env.ADMIN_USER || 'admin',
        passwordHash: hash,
        displayName: 'Admin',
        role: 'owner',
        securityQ: 'What is your brand name?',
        securityAHash: secAHash
      });
      console.log('✓ Default admin created');
    }

    // Create default settings if none exist
    const settings = await Settings.findById('store_settings');
    if (!settings) {
      await Settings.create({
        _id: 'store_settings',
        pricing: [
          { label: '1 Bottle', desc: '1 Litre · 20-day supply', sale: 499, orig: 699, qty: 1 },
          { label: '3 Bottles', desc: '3 Litres · 60-day programme', sale: 1299, orig: 2097, qty: 3 },
          { label: '6 Bottles', desc: '6 Litres · 120-day ritual', sale: 2399, orig: 4194, qty: 6 }
        ],
        content: {
          headline: 'Restore Your Gut. Reclaim Your Energy.',
          subtext: 'A refined Ayurvedic formulation crafted from five time-tested herbs to support digestion, reduce inflammation, and restore internal balance.',
          cta: 'Start Your Gut Healing — ₹499',
          phone: '', email: '', wa: '',
          shipThresh: '199', shipCharge: '60'
        }
      });
      console.log('✓ Default settings created');
    }

    // Create default inventory
    const inv = await Inventory.findById('main_inventory');
    if (!inv) {
      await Inventory.create({ _id: 'main_inventory', stock: 0, alertAt: 20, costPerL: 0 });
      console.log('✓ Default inventory created');
    }
  } catch (err) {
    console.error('Setup error:', err.message);
  }
}

// ═══════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'PANCHARKA™ Backend', version: '1.0.0' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ═══════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════

// POST /api/auth/check-username
app.post('/api/auth/check-username', authLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required.' });
    const admin = await Admin.findOne({ username: username.toLowerCase(), isActive: true });
    if (!admin) return res.status(404).json({ error: 'Username not found.' });
    res.json({ exists: true, displayName: admin.displayName });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const admin = await Admin.findOne({ username: username.toLowerCase(), isActive: true });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate JWT (24h expiry)
    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role, displayName: admin.displayName },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log activity
    await ActivityLog.create({ user: admin.username, category: 'Auth', detail: 'Login successful', ip: req.ip });

    res.json({
      token,
      admin: { username: admin.username, displayName: admin.displayName, role: admin.role }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/forgot — Step 1: Get security question
app.post('/api/auth/forgot', authLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    const admin = await Admin.findOne({ username: username.toLowerCase() });
    if (!admin) return res.status(404).json({ error: 'Username not found.' });
    res.json({ question: admin.securityQ || 'What is your brand name?' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/forgot/verify — Step 2: Verify answer + reset
app.post('/api/auth/forgot/verify', authLimiter, async (req, res) => {
  try {
    const { username, answer, newPassword } = req.body;
    const admin = await Admin.findOne({ username: username.toLowerCase() });
    if (!admin) return res.status(404).json({ error: 'Username not found.' });

    const valid = await bcrypt.compare(answer.toLowerCase(), admin.securityAHash);
    if (!valid) return res.status(401).json({ error: 'Incorrect answer.' });

    if (newPassword) {
      if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters.' });
      admin.passwordHash = await bcrypt.hash(newPassword, 12);
      await admin.save();
      await ActivityLog.create({ user: admin.username, category: 'Security', detail: 'Password reset via security question', ip: req.ip });
      return res.json({ success: true, message: 'Password reset successfully.' });
    }

    res.json({ verified: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found.' });

    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect.' });

    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters.' });

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await admin.save();

    await ActivityLog.create({ user: admin.username, category: 'Security', detail: 'Password changed', ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ═══════════════════════════════════════════
// ORDER ROUTES
// ═══════════════════════════════════════════

// POST /api/orders — Place new order (public)
app.post('/api/orders', async (req, res) => {
  try {
    const { customer, pack, qty, productAmt, shipping, total, coupon, payMethod, notes } = req.body;

    // Validate required fields
    if (!customer?.name || !customer?.phone || !customer?.address || !customer?.city || !customer?.state || !customer?.pincode) {
      return res.status(400).json({ error: 'Missing required customer details.' });
    }

    // Phone validation
    const phone = customer.phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number.' });
    }

    // Duplicate check — same phone within 5 minutes
    const recentOrder = await Order.findOne({
      'customer.phone': phone,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
    });
    if (recentOrder) {
      return res.status(429).json({ error: 'Order recently placed from this number. Please wait.' });
    }

    // COD restriction — 2+ bottles = online only
    if (payMethod === 'COD' && qty >= 2) {
      return res.status(400).json({ error: 'COD available for single bottle only. Use UPI or Card for multi-bottle packs.' });
    }

    // Generate order ID
    const count = await Order.countDocuments();
    const orderId = 'PCK-' + String(count + 1001).padStart(6, '0');

    // Apply coupon if provided
    if (coupon) {
      const cpn = await Coupon.findOne({ code: coupon.toUpperCase(), isActive: true });
      if (cpn) {
        cpn.uses += 1;
        await cpn.save();
      }
    }

    // Create order
    const order = await Order.create({
      orderId,
      customer: { ...customer, phone },
      pack, qty, productAmt, shipping, total, coupon, payMethod, notes,
      status: 'Pending',
      statusHistory: [{ status: 'Pending', timestamp: new Date() }]
    });

    // Update inventory
    try {
      await Inventory.findByIdAndUpdate('main_inventory', { $inc: { stock: -qty } });
    } catch (e) { /* inventory optional */ }

    // Log
    await ActivityLog.create({ user: 'customer', category: 'Orders', detail: `New order ${orderId} — ${pack} — ₹${total}` });

    res.status(201).json({
      success: true,
      orderId: order.orderId,
      message: 'Order placed successfully!'
    });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ error: 'Failed to place order. Please try again.' });
  }
});

// GET /api/orders — List all orders (admin)
app.get('/api/orders', auth, async (req, res) => {
  try {
    const { status, limit = 50, skip = 0, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).skip(+skip).limit(+limit);
    const total = await Order.countDocuments(filter);

    res.json({ orders, total, limit: +limit, skip: +skip });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// PATCH /api/orders/:id — Update order status (admin)
app.patch('/api/orders/:id', auth, async (req, res) => {
  try {
    const { status, trackingId } = req.body;
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (status) {
      order.status = status;
      order.statusHistory.push({ status, timestamp: new Date(), updatedBy: req.admin.username });
    }
    if (trackingId) order.trackingId = trackingId;
    order.updatedAt = new Date();
    await order.save();

    await ActivityLog.create({ user: req.admin.username, category: 'Orders', detail: `Order ${order.orderId} → ${status}`, ip: req.ip });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

// GET /api/orders/stats — Dashboard stats (admin)
app.get('/api/orders/stats', auth, async (req, res) => {
  try {
    const all = await Order.find({ status: { $ne: 'Cancelled' } });
    const totalRevenue = all.reduce((s, o) => s + o.total, 0);
    const totalOrders = await Order.countDocuments();
    const pending = await Order.countDocuments({ status: 'Pending' });
    const avgOrder = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;
    const totalBottles = all.reduce((s, o) => s + o.qty, 0);

    // Revenue by pack
    const byPack = {};
    all.forEach(o => {
      if (!byPack[o.pack]) byPack[o.pack] = { count: 0, revenue: 0 };
      byPack[o.pack].count++;
      byPack[o.pack].revenue += o.total;
    });

    // Revenue by payment
    const byPayment = {};
    all.forEach(o => {
      if (!byPayment[o.payMethod]) byPayment[o.payMethod] = { count: 0, revenue: 0 };
      byPayment[o.payMethod].count++;
      byPayment[o.payMethod].revenue += o.total;
    });

    // By status
    const allOrders = await Order.find();
    const byStatus = {};
    allOrders.forEach(o => {
      if (!byStatus[o.status]) byStatus[o.status] = 0;
      byStatus[o.status]++;
    });

    res.json({ totalRevenue, totalOrders, pending, avgOrder, totalBottles, byPack, byPayment, byStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// ═══════════════════════════════════════════
// CUSTOMER ROUTES
// ═══════════════════════════════════════════
app.get('/api/customers', auth, async (req, res) => {
  try {
    const customers = await Order.aggregate([
      { $group: {
        _id: '$customer.phone',
        name: { $last: '$customer.name' },
        phone: { $first: '$customer.phone' },
        email: { $last: '$customer.email' },
        city: { $last: '$customer.city' },
        state: { $last: '$customer.state' },
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        lastOrder: { $max: '$createdAt' }
      }},
      { $sort: { lastOrder: -1 } }
    ]);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers.' });
  }
});

// ═══════════════════════════════════════════
// SETTINGS ROUTES
// ═══════════════════════════════════════════
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Settings.findById('store_settings');
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

app.put('/api/settings', auth, async (req, res) => {
  try {
    const updates = req.body;
    updates.updatedAt = new Date();
    const settings = await Settings.findByIdAndUpdate('store_settings', updates, { new: true, upsert: true });
    await ActivityLog.create({ user: req.admin.username, category: 'Settings', detail: 'Store settings updated', ip: req.ip });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

// ═══════════════════════════════════════════
// COUPON ROUTES
// ═══════════════════════════════════════════

// GET /api/coupons — public (validate) or admin (list all)
app.get('/api/coupons', async (req, res) => {
  try {
    const { code } = req.query;
    if (code) {
      // Public: validate single code
      const cpn = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
      if (!cpn) return res.status(404).json({ error: 'Invalid code.' });
      return res.json({ code: cpn.code, type: cpn.type, value: cpn.value, minOrder: cpn.minOrder });
    }
    // Admin: list all (requires token but we'll allow listing for simplicity)
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coupons.' });
  }
});

app.post('/api/coupons', auth, async (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses } = req.body;
    if (!code || !type || !value) return res.status(400).json({ error: 'Code, type, and value required.' });
    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(409).json({ error: 'Code already exists.' });
    const coupon = await Coupon.create({ code: code.toUpperCase(), type, value, minOrder: minOrder || 0, maxUses: maxUses || 0 });
    await ActivityLog.create({ user: req.admin.username, category: 'Coupons', detail: `Created: ${code}`, ip: req.ip });
    res.status(201).json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create coupon.' });
  }
});

app.delete('/api/coupons/:code', auth, async (req, res) => {
  try {
    await Coupon.deleteOne({ code: req.params.code.toUpperCase() });
    await ActivityLog.create({ user: req.admin.username, category: 'Coupons', detail: `Deleted: ${req.params.code}`, ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete coupon.' });
  }
});

// ═══════════════════════════════════════════
// INVENTORY ROUTES
// ═══════════════════════════════════════════
app.get('/api/inventory', auth, async (req, res) => {
  try {
    const inv = await Inventory.findById('main_inventory');
    const sold = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$qty' } } }
    ]);
    const totalSold = sold[0]?.total || 0;
    res.json({ inventory: inv, totalSold, currentStock: Math.max(0, (inv?.stock || 0) - totalSold) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory.' });
  }
});

app.put('/api/inventory', auth, async (req, res) => {
  try {
    const updates = req.body;
    updates.updatedAt = new Date();
    const inv = await Inventory.findByIdAndUpdate('main_inventory', updates, { new: true, upsert: true });
    await ActivityLog.create({ user: req.admin.username, category: 'Inventory', detail: `Stock updated to ${inv.stock}L`, ip: req.ip });
    res.json({ success: true, inventory: inv });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update inventory.' });
  }
});

app.post('/api/inventory/restock', auth, async (req, res) => {
  try {
    const { qty, batch, notes } = req.body;
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Valid quantity required.' });
    const inv = await Inventory.findByIdAndUpdate('main_inventory', {
      $inc: { stock: qty },
      $push: { restocks: { qty, batch: batch || '', notes: notes || '', date: new Date() } }
    }, { new: true });
    await ActivityLog.create({ user: req.admin.username, category: 'Inventory', detail: `Restocked +${qty}L`, ip: req.ip });
    res.json({ success: true, inventory: inv });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restock.' });
  }
});

// ═══════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════
app.get('/api/logs', auth, async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(200);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

app.delete('/api/logs', auth, ownerOnly, async (req, res) => {
  try {
    await ActivityLog.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear logs.' });
  }
});

// ═══════════════════════════════════════════
// ADMIN USER MANAGEMENT
// ═══════════════════════════════════════════
app.get('/api/admins', auth, ownerOnly, async (req, res) => {
  try {
    const admins = await Admin.find({}, '-passwordHash -securityAHash').sort({ createdAt: 1 });
    res.json({ admins });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admins.' });
  }
});

app.post('/api/admins', auth, ownerOnly, async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters.' });

    const existing = await Admin.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Username already exists.' });

    const hash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({
      username: username.toLowerCase(),
      passwordHash: hash,
      displayName: displayName || username,
      role: role || 'manager'
    });

    await ActivityLog.create({ user: req.admin.username, category: 'Admin Users', detail: `Created: ${username} (${role})`, ip: req.ip });
    res.status(201).json({ success: true, admin: { username: admin.username, displayName: admin.displayName, role: admin.role } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create admin.' });
  }
});

app.delete('/api/admins/:username', auth, ownerOnly, async (req, res) => {
  try {
    if (req.params.username === req.admin.username) {
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    }
    await Admin.deleteOne({ username: req.params.username });
    await ActivityLog.create({ user: req.admin.username, category: 'Admin Users', detail: `Deleted: ${req.params.username}`, ip: req.ip });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete admin.' });
  }
});

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
app.listen(PORT, async () => {
  console.log(`\n  ═══════════════════════════════════════`);
  console.log(`  🌿 PANCHARKA™ Backend`);
  console.log(`  ═══════════════════════════════════════`);
  console.log(`  ✓ Server running on port ${PORT}`);
  console.log(`  ✓ Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`  ═══════════════════════════════════════\n`);
  await setupDefaults();
});
