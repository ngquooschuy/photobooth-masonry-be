require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const nodemailer = require('nodemailer');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.post('/confirm', async (req, res) => {
  try {
    const { name, phone } = req.body;

    /**
     * Validate
     */
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing name or phone'
      });
    }

    /**
     * Send email to person 1
     */
    await transporter.sendMail({
      from: `"Anniversary Event" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO_1,
      subject: `${name} đã xác nhận tham gia 💌`,
      html: `
        <div
  style="
    font-family: 'Segoe UI', Arial, sans-serif;
    max-width: 520px;
    margin: auto;
    background: linear-gradient(135deg, #fff7f9 0%, #fffdfd 100%);
    border-radius: 24px;
    padding: 36px 32px;
    color: #2d2d2d;
    border: 1px solid #ffd9e2;
    box-shadow: 0 10px 35px rgba(255, 120, 160, 0.12);
  "
>
  <div
    style="
      width: 64px;
      height: 64px;
      line-height: 64px;
      text-align: center;
      font-size: 30px;
      border-radius: 50%;
      margin: 0 auto 20px;
      background: linear-gradient(135deg, #ff7eb3, #ffb6c9);
      color: white;
      box-shadow: 0 6px 18px rgba(255, 126, 179, 0.35);
    "
  >
    💌
  </div>

  <h2
    style="
      margin: 0 0 12px;
      text-align: center;
      font-size: 28px;
      color: #ff4f87;
      font-weight: 700;
    "
  >
    Đồng chí mdukiu đã xác nhận tham gia  ✨
  </h2>

  <p
    style="
      text-align: center;
      margin: 0 0 28px;
      color: #666;
      font-size: 15px;
      line-height: 1.6;
    "
  >
    Một thông báo nhỏ xinh dành riêng cho anh 💕
  </p>

  <p
    style="
      margin-top: 28px;
      text-align: center;
      font-size: 14px;
      color: #888;
      line-height: 1.7;
    "
  >
    Chúc hai đứa mình sẽ luôn có thật nhiều khoảnh khắc đáng nhớ cùng nhau 🌷
  </p>
</div>
      `
    });

    /**
     * Send email to person 2
     */
    await transporter.sendMail({
      from: `"Anniversary Event" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO_2,
      subject: `${name} đã xác nhận tham gia 💌`,
      html: `
            <div
  style="
    font-family: 'Segoe UI', Arial, sans-serif;
    max-width: 520px;
    margin: auto;
    background: linear-gradient(135deg, #fff7f9 0%, #fffdfd 100%);
    border-radius: 24px;
    padding: 36px 32px;
    color: #2d2d2d;
    border: 1px solid #ffd9e2;
    box-shadow: 0 10px 35px rgba(255, 120, 160, 0.12);
  "
>
  <div
    style="
      width: 64px;
      height: 64px;
      line-height: 64px;
      text-align: center;
      font-size: 30px;
      border-radius: 50%;
      margin: 0 auto 20px;
      background: linear-gradient(135deg, #ff7eb3, #ffb6c9);
      color: white;
      box-shadow: 0 6px 18px rgba(255, 126, 179, 0.35);
    "
  >
    💌
  </div>

  <h2
    style="
      margin: 0 0 12px;
      text-align: center;
      font-size: 28px;
      color: #ff4f87;
      font-weight: 700;
    "
  >
    Đồng chí mdukiu đã xác nhận tham gia  ✨
  </h2>

  <p
    style="
      text-align: center;
      margin: 0 0 28px;
      color: #666;
      font-size: 15px;
      line-height: 1.6;
    "
  >
    Hẹn gặp đồng chí vào ngày mai💕
  </p>
</div>
      `
    });

    return res.json({
      success: true,
      message: 'Confirmation sent successfully'
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
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
