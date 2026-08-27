const express = require("express");
const {
  getState,
  recordSmoke,
  recordCravingResisted,
  claimQuest,
  updateConfig,
  resetState
} = require("../controllers/smoke.controller");

const router = express.Router();

router.get("/state", getState);
router.post("/record", recordSmoke);
router.post("/craving-resisted", recordCravingResisted);
router.post("/quests/:questId/claim", claimQuest);
router.put("/config", updateConfig);
router.post("/reset", resetState);

module.exports = router;
