import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();

// ═══════════════════════════════════════════
// CORS — allow your frontend domain
// ═══════════════════════════════════════════
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://pancharka.com",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "null" // for file:// testing
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, true); // allow all for now; tighten in production
  },
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));

// ═══════════════════════════════════════════
// MONGODB CONNECTION
// ═══════════════════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI;
let db;

async function connectDB() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in environment variables");
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(); // uses the database name from the URI
    console.log("🍊 MongoDB Connected Successfully");

    // Create default admin if none exists
    const adminCount = await db.collection("admins").countDocuments();
    if (adminCount === 0) {
      await db.collection("admins").insertOne({
        user: process.env.ADMIN_USER || "admin",
        pass: process.env.ADMIN_PASS || "pancharka123",
        displayName: "Admin",
        role: "owner",
        createdAt: new Date()
      });
      console.log("✓ Default admin created");
    }

    // Create default settings if none exist
    const settingsCount = await db.collection("settings").countDocuments();
    if (settingsCount === 0) {
      await db.collection("settings").insertOne({
        pricing: [
          { label: "1 Bottle", desc: "1 Litre · 20-day supply", sale: 499, orig: 699, qty: 1 },
          { label: "3 Bottles", desc: "3 Litres · 60-day programme", sale: 1299, orig: 2097, qty: 3 },
          { label: "6 Bottles", desc: "6 Litres · 120-day ritual", sale: 2399, orig: 4194, qty: 6 }
        ],
        content: {
          headline: "Restore Your Gut. Reclaim Your Energy.",
          subtext: "A refined Ayurvedic formulation crafted from five time-tested herbs to support digestion, reduce inflammation, and restore internal balance — naturally and gently.",
          cta: "Start Your Gut Healing — ₹499",
          pdesc: "A refined Ayurvedic formulation of five time-tested herbs — Ajwain, Saunf, Pudina, Dried Rose Petals & Borage Flowers. Free from artificial colours, preservatives, and additives.",
          phone: "+91 98765 43210",
          email: "hello@pancharka.in",
          wa: "91XXXXXXXXXX",
          copyright: "© 2025 PANCHARKA™. All rights reserved.",
          tagline: "Ancient Ayurvedic wisdom, reimagined for modern life. Balance begins within.",
          shipThresh: "199",
          shipCharge: "60"
        },
        payments: {
          upiId: "", upiName: "PANCHARKA Ayurveda", upiQR: null,
          phonepe: "", gpay: "", paytm: "", bhim: "",
          rzpKey: "", rzpName: "PANCHARKA Ayurveda"
        },
        coupons: [],
        inventory: { stock: 0, alert: 20, cost: 0 },
        policies: { privacy: "", refund: "", terms: "", contact: "" },
        tracking: {},
        createdAt: new Date()
      });
      console.log("✓ Default settings created");
    }
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
}

connectDB();

// ═══════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    db: db ? "connected" : "disconnected",
    uptime: Math.floor(process.uptime()) + "s"
  });
});

// ═══════════════════════════════════════════
// ADMIN AUTH
// ═══════════════════════════════════════════
app.post("/api/admin/login", async (req, res) => {
  try {
    const { user, pass } = req.body;
    if (!user || !pass) return res.status(400).json({ error: "Username and password required" });

    const admin = await db.collection("admins").findOne({ user, pass });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    // Simple token (for production, use JWT)
    const token = Date.now().toString(36) + Math.random().toString(36).substr(2);
    await db.collection("admins").updateOne({ _id: admin._id }, { $set: { token, lastLogin: new Date() } });

    res.json({ success: true, token, displayName: admin.displayName || admin.user, role: admin.role || "owner" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple auth middleware
async function authAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  const admin = await db.collection("admins").findOne({ token });
  if (!admin) return res.status(401).json({ error: "Invalid token" });
  req.admin = admin;
  next();
}

// ═══════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════

// Place order (public — no auth needed)
app.post("/api/orders", async (req, res) => {
  try {
    const order = req.body;

    // Generate order ID
    const count = await db.collection("orders").countDocuments();
    order.orderId = "PCK-" + String(count + 1001).padStart(6, "0");
    order.status = order.status || "Pending";
    order.createdAt = new Date();

    await db.collection("orders").insertOne(order);
    res.json({ success: true, orderId: order.orderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all orders (admin only)
app.get("/api/orders", authAdmin, async (req, res) => {
  try {
    const orders = await db.collection("orders").find().sort({ createdAt: -1 }).toArray();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status (admin only)
app.patch("/api/orders/:id", authAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await db.collection("orders").updateOne(
      { orderId: req.params.id },
      { $set: { status, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// SETTINGS (pricing, content, payments, coupons, etc.)
// ═══════════════════════════════════════════

// Get settings (public — frontend needs pricing/content)
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await db.collection("settings").findOne();
    if (!settings) return res.status(404).json({ error: "No settings found" });
    // Remove sensitive fields for public access
    const { _id, ...safe } = settings;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings (admin only)
app.put("/api/settings", authAdmin, async (req, res) => {
  try {
    const updates = req.body;
    updates.updatedAt = new Date();
    await db.collection("settings").updateOne({}, { $set: updates });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// COUPONS
// ═══════════════════════════════════════════

// Validate coupon (public)
app.post("/api/coupons/validate", async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const settings = await db.collection("settings").findOne();
    const coupon = (settings?.coupons || []).find(c => c.code === code.toUpperCase());

    if (!coupon) return res.status(404).json({ error: "Invalid code" });
    if (orderAmount < (coupon.min || 0)) return res.status(400).json({ error: `Minimum order ₹${coupon.min} required` });

    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// ADMIN PASSWORD CHANGE
// ═══════════════════════════════════════════
app.post("/api/admin/change-password", authAdmin, async (req, res) => {
  try {
    const { currentPass, newPass } = req.body;
    if (req.admin.pass !== currentPass) return res.status(400).json({ error: "Current password incorrect" });
    if (!newPass || newPass.length < 8) return res.status(400).json({ error: "Password must be 8+ characters" });

    await db.collection("admins").updateOne({ _id: req.admin._id }, { $set: { pass: newPass } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
