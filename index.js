require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const nodemailer = require('nodemailer');

const app = express();
const { connectDB } = require("./src/config/db");
const smokeRoutes = require("./src/routes/smoke.routes");
connectDB();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/smoke", smokeRoutes);

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Multer: dùng bộ nhớ để đẩy buffer lên Cloudinary qua upload_stream
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper parse tags từ body:
 * - Ưu tiên JSON array (e.g. '["party","booth1"]')
 * - Fallback comma-separated (e.g. 'party,booth1')
 */
function parseTags(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed)
      ? parsed.map((x) => String(x).trim()).filter(Boolean)
      : [];
  } catch {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

/**
 * POST /api/upload
 * multipart/form-data:
 *   - file: image file
 *   - tags: optional, JSON array hoặc comma-separated
 */
app.post("/api/upload", upload.array("file", 10), async (req, res) => {
  try {
    const files = req.files; // mảng các file
    if (!files || !files.length) {
      return res.status(400).json({ error: "Missing files" });
    }

    const tags = parseTags(req.body.tags);

    // upload từng file lên Cloudinary
    const uploads = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                resource_type: "image",
                folder: "photobooth",
                tags,
                use_filename: true,
                unique_filename: true,
                overwrite: false,
              },
              (err, result) => (err ? reject(err) : resolve(result))
            );
            stream.end(file.buffer);
          })
      )
    );

    const items = uploads.map((u) => ({
      id: u.public_id,
      name: u.original_filename || u.public_id,
      url: u.secure_url,
      size: u.bytes,
      createdAt: new Date(u.created_at).getTime(),
      tags: u.tags || [],
    }));

    res.json(items); // trả về mảng thay vì 1 object
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

/**
 * GET /api/images?max=50&next_cursor=xxx
 * Trả về: { items: ImgItem[], next_cursor }
 */
app.get("/api/images", async (req, res) => {
  try {
    const max = Math.min(Number(req.query.max) || 50, 100);
    const next_cursor = req.query.next_cursor
      ? String(req.query.next_cursor)
      : undefined;

    const r = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix: "photobooth/", // chỉ lấy ảnh trong folder
      max_results: max,
      next_cursor,
      tags: true,
    });

    const items = (r.resources || []).map((x) => ({
      id: x.public_id,
      name: x.filename || x.public_id,
      url: x.secure_url,
      size: x.bytes,
      createdAt: new Date(x.created_at).getTime(),
      tags: x.tags || [],
      width: x.width,
      height: x.height,
    }));

    res.json({ items, next_cursor: r.next_cursor || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "List failed" });
  }
});

app.get("/api/tags", async (req, res) => {
  try {
    // Lấy tất cả resources để extract tags
    const r = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix: "photobooth/",
      max_results: 500, // Tăng limit để lấy nhiều ảnh hơn
      tags: true,
    });

    // Tạo Set để lưu unique tags
    const uniqueTags = new Set();

    // Extract tags từ mỗi resource
    (r.resources || []).forEach((resource) => {
      (resource.tags || []).forEach((tag) => uniqueTags.add(tag));
    });

    // Convert Set thành Array để trả về
    res.json({ tags: Array.from(uniqueTags) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to get tags" });
  }
});

/**
 * DELETE /api/images/:publicId
 */
app.delete("/api/images/:publicId", async (req, res) => {
  try {
    const publicId = req.params.publicId;
    if (!publicId) return res.status(400).json({ error: "Missing publicId" });

    const r = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });

    res.json({ ok: true, result: r });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Delete failed" });
  }
});

const port = Number(process.env.PORT) || 4000;

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

// Export app cho Vercel
module.exports = app;
