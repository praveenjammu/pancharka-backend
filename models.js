const mongoose = require('mongoose');

// ═══════════════════════════════════════════
// ADMIN USER
// ═══════════════════════════════════════════
const adminSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName:  { type: String, default: 'Admin' },
  role:         { type: String, enum: ['owner', 'manager', 'support'], default: 'owner' },
  securityQ:    { type: String, default: 'What is your brand name?' },
  securityAHash:{ type: String },  // bcrypt hash of answer
  isActive:     { type: Boolean, default: true },
  lastLogin:    { type: Date },
  createdAt:    { type: Date, default: Date.now }
});
const Admin = mongoose.model('Admin', adminSchema);

// ═══════════════════════════════════════════
// ORDER
// ═══════════════════════════════════════════
const orderSchema = new mongoose.Schema({
  orderId:     { type: String, required: true, unique: true },  // PCK-001001
  customer: {
    name:      { type: String, required: true },
    phone:     { type: String, required: true },
    email:     { type: String },
    address:   { type: String, required: true },
    city:      { type: String, required: true },
    state:     { type: String, required: true },
    pincode:   { type: String, required: true },
  },
  pack:        { type: String, required: true },    // "1 Bottle", "3 Bottles", "6 Bottles"
  qty:         { type: Number, required: true },
  productAmt:  { type: Number, required: true },
  shipping:    { type: Number, default: 0 },
  total:       { type: Number, required: true },
  coupon:      { type: String },
  payMethod:   { type: String, enum: ['COD', 'UPI/QR', 'Razorpay', 'WhatsApp'], default: 'COD' },
  status:      { type: String, enum: ['Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'], default: 'Pending' },
  statusHistory: [{
    status:    { type: String },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: String }
  }],
  trackingId:  { type: String },
  notes:       { type: String },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now }
});
orderSchema.index({ 'customer.phone': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
const Order = mongoose.model('Order', orderSchema);

// ═══════════════════════════════════════════
// SETTINGS (single document — all store config)
// ═══════════════════════════════════════════
const settingsSchema = new mongoose.Schema({
  _id:         { type: String, default: 'store_settings' },
  pricing: [{
    label:     String,
    desc:      String,
    sale:      Number,
    orig:      Number,
    qty:       Number
  }],
  content: {
    headline:  String,
    subtext:   String,
    cta:       String,
    pdesc:     String,
    phone:     String,
    email:     String,
    wa:        String,
    copyright: String,
    tagline:   String,
    shipThresh:String,
    shipCharge:String
  },
  ingredients: [{
    emoji:     String,
    name:      String,
    cat:       String,
    desc:      String
  }],
  payments: {
    upiId:     String,
    upiName:   String,
    upiQR:     String,    // URL to QR image
    phonepe:   String,
    gpay:      String,
    paytm:     String,
    bhim:      String,
    rzpKey:    String,
    rzpName:   String
  },
  tracking: {
    metaId:    String,
    metaCode:  String,
    metaOn:    String,
    gaId:      String,
    gaOn:      String,
    gadsId:    String,
    gadsLabel: String,
    custom:    String
  },
  policies: {
    privacy:   String,
    refund:    String,
    terms:     String,
    contact:   String
  },
  brand: {
    name:      String,
    prod:      String,
    tag1:      String,
    tag2:      String,
    story:     String,
    fssai:     String,
    ayush:     String,
    gst:       String
  },
  social: {
    ig: String, fb: String, yt: String, li: String
  },
  shipping: {
    provider:  String,
    url:       String,
    key:       String,
    secret:    String,
    pickup:    String,
    addr:      String,
    weight:    String,
    dims:      String
  },
  updatedAt: { type: Date, default: Date.now }
});
const Settings = mongoose.model('Settings', settingsSchema);

// ═══════════════════════════════════════════
// COUPON
// ═══════════════════════════════════════════
const couponSchema = new mongoose.Schema({
  code:      { type: String, required: true, unique: true, uppercase: true, trim: true },
  type:      { type: String, enum: ['percent', 'flat'], required: true },
  value:     { type: Number, required: true },
  minOrder:  { type: Number, default: 0 },
  uses:      { type: Number, default: 0 },
  maxUses:   { type: Number, default: 0 },  // 0 = unlimited
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Coupon = mongoose.model('Coupon', couponSchema);

// ═══════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════
const logSchema = new mongoose.Schema({
  user:      { type: String, required: true },
  category:  { type: String, required: true },
  detail:    { type: String, required: true },
  ip:        { type: String },
  createdAt: { type: Date, default: Date.now, expires: 2592000 }  // Auto-delete after 30 days
});
logSchema.index({ createdAt: -1 });
const ActivityLog = mongoose.model('ActivityLog', logSchema);

// ═══════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════
const inventorySchema = new mongoose.Schema({
  _id:       { type: String, default: 'main_inventory' },
  stock:     { type: Number, default: 0 },   // litres
  alertAt:   { type: Number, default: 20 },
  costPerL:  { type: Number, default: 0 },
  batch:     { type: String },
  mfgDate:   { type: Date },
  expDate:   { type: Date },
  restocks: [{
    qty:       Number,
    batch:     String,
    notes:     String,
    date:      { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
});
const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = { Admin, Order, Settings, Coupon, ActivityLog, Inventory };
