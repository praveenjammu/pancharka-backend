import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("🔥 MongoDB Connected Successfully");
})
.catch(err => {
  console.error("❌ MongoDB Connection Error:");
  console.error(err.message);
});

// Test route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// Test orders route (temporary)
app.get("/api/orders", (req, res) => {
  res.json([]);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
