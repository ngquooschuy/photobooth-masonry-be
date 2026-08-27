const {
  SmokeAppState,
  INITIAL_QUESTS,
  generateInitialActivityCalendar
} = require("../models/SmokeAppState");

// Helper to check and rollover to today if date changed
function checkAndRolloverDay(state) {
  const todayStr = new Date().toISOString().split("T")[0];
  const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const today = new Date();

  // Ensure activity calendar exists
  if (!state.activityCalendar || state.activityCalendar.length === 0) {
    state.activityCalendar = generateInitialActivityCalendar();
  }

  // Check if today exists in calendar
  let todayEntry = state.activityCalendar.find((d) => d.date === todayStr);

  if (!todayEntry) {
    // Add today to calendar and mark older days as not today
    state.activityCalendar = state.activityCalendar.map((d) => ({ ...d, isToday: false }));
    todayEntry = {
      date: todayStr,
      count: 0,
      level: "clean",
      dayName: dayNames[today.getDay()],
      fullDayName: `${dayNames[today.getDay()]}, ${today.getDate()}/${today.getMonth() + 1}`,
      isToday: true,
      isFuture: false
    };
    state.activityCalendar.push(todayEntry);
    // Keep max 60 days
    if (state.activityCalendar.length > 60) {
      state.activityCalendar = state.activityCalendar.slice(state.activityCalendar.length - 60);
    }
    // Reset today count for the new day
    state.todayCount = 0;
  } else {
    // Make sure isToday flags are strictly accurate
    state.activityCalendar = state.activityCalendar.map((d) => ({
      ...d,
      isToday: d.date === todayStr
    }));
  }

  return state;
}

async function getOrCreateState() {
  let state = await SmokeAppState.findOne();
  if (!state) {
    state = await SmokeAppState.create({
      startTime: Date.now() - (3 * 86400 + 14 * 3600 + 42 * 60 + 59) * 1000,
      todayCount: 0,
      cravingsResisted: 3,
      expBonus: 150000,
      config: {
        costPerPack: 35000,
        cigsPerPack: 20,
        cigsPerDayOld: 15,
        soundEnabled: true,
        hapticsEnabled: true,
        nickname: "HIỆP SĨ PHỔI"
      },
      quests: INITIAL_QUESTS,
      relapses: [],
      activityCalendar: generateInitialActivityCalendar()
    });
  }

  // Auto rollover day if accessed on a new day
  const modified = checkAndRolloverDay(state);
  if (modified.isModified && modified.isModified()) {
    await state.save();
  }

  return state;
}

// GET /api/smoke/state
async function getState(req, res) {
  try {
    const state = await getOrCreateState();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/smoke/record (Ghi nhận 1 lần hút)
async function recordSmoke(req, res) {
  try {
    const { reason = "STRESS" } = req.body;
    const state = await getOrCreateState();
    const newCount = state.todayCount + 1;
    const todayStr = new Date().toISOString().split("T")[0];

    state.activityCalendar = (state.activityCalendar || []).map((d) => {
      if (d.date === todayStr || d.isToday) {
        let level = "clean";
        if (newCount === 1) level = "light";
        else if (newCount <= 3) level = "moderate";
        else level = "heavy";
        return { ...d, count: newCount, level };
      }
      return d;
    });

    state.todayCount = newCount;
    state.startTime = Date.now(); // reset streak timer
    state.relapses.push({
      id: `r_${Date.now()}`,
      time: new Date().toISOString(),
      reason
    });

    await state.save();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/smoke/craving-resisted (Vượt qua cơn thèm SOS 3 phút)
async function recordCravingResisted(req, res) {
  try {
    const state = await getOrCreateState();
    state.cravingsResisted += 1;
    state.expBonus += 10000;

    // Auto complete quest q2 (Hít thở sâu 3 phút SOS)
    state.quests = (state.quests || []).map((q) =>
      q.id === "q2" ? { ...q, completed: true } : q
    );

    await state.save();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/smoke/quests/:questId/claim (Nhận thưởng nhiệm vụ)
async function claimQuest(req, res) {
  try {
    const { questId } = req.params;
    const state = await getOrCreateState();
    const targetQuest = (state.quests || []).find((q) => q.id === questId);

    if (!targetQuest) {
      return res.status(404).json({ message: "Quest not found" });
    }
    if (!targetQuest.completed || targetQuest.claimed) {
      return res.status(400).json({ message: "Quest is not eligible to claim" });
    }

    targetQuest.claimed = true;
    state.expBonus += (targetQuest.exp || 0);

    await state.save();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// PUT /api/smoke/config (Cập nhật cài đặt cấu hình)
async function updateConfig(req, res) {
  try {
    const state = await getOrCreateState();
    state.config = { ...state.config, ...req.body };
    await state.save();
    res.json(state.config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/smoke/reset (Reset toàn bộ dữ liệu)
async function resetState(req, res) {
  try {
    await SmokeAppState.deleteMany({});
    const freshState = await getOrCreateState();
    res.json(freshState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getState,
  recordSmoke,
  recordCravingResisted,
  claimQuest,
  updateConfig,
  resetState
};
