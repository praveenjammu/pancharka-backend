const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());


// 🔥 MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("🔥 MongoDB Connected Successfully");
})
.catch(err => {
  console.error("❌ MongoDB Connection Error:");
  console.error(err.message);
});


// 📦 Order Model
const Order = mongoose.model("Order", {
  name: String,
  phone: String,
  address: String,
  product: String,
  amount: Number,
  paymentId: String,
  paymentStatus: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});


// 🧪 Test route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});


// 📦 SAVE ORDER
app.post("/api/orders", async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 📊 GET ORDERS (REAL DATA)
app.get("/api/orders", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
