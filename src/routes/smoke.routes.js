const express = require("express");
const { connectDB } = require("../config/db");
const {
  getState,
  getTimeline,
  recordSmoke,
  recordCravingResisted,
  claimQuest,
  updateConfig,
  resetState
} = require("../controllers/smoke.controller");

const router = express.Router();

// Middleware: ensure DB connection before executing controllers
router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection error:", error.message);
    return res.status(500).json({
      error: "Không thể kết nối đến MongoDB Atlas.",
      details: error.message
    });
  }
});

router.get("/state", getState);
router.get("/timeline", getTimeline);
router.post("/record", recordSmoke);
router.post("/craving-resisted", recordCravingResisted);
router.post("/quests/:questId/claim", claimQuest);
router.put("/config", updateConfig);
router.post("/reset", resetState);

module.exports = router;
