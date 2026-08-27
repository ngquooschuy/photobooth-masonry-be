const {
  SmokeAppState,
  INITIAL_QUESTS,
  generateCleanActivityCalendar
} = require("../models/SmokeAppState");

function checkAndRolloverDay(state) {
  const todayStr = new Date().toISOString().split("T")[0];
  const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const today = new Date();

  if (!state.activityCalendar || state.activityCalendar.length === 0) {
    state.activityCalendar = generateCleanActivityCalendar();
  }

  const todayEntry = state.activityCalendar.find((d) => d.date === todayStr);

  if (!todayEntry) {
    state.activityCalendar = state.activityCalendar.map((d) => ({ ...d, isToday: false }));
    state.activityCalendar.push({
      date: todayStr,
      count: 0,
      level: "clean",
      dayName: dayNames[today.getDay()],
      fullDayName: `${dayNames[today.getDay()]}, ${today.getDate()}/${today.getMonth() + 1}`,
      isToday: true,
      isFuture: false
    });
    if (state.activityCalendar.length > 60) {
      state.activityCalendar = state.activityCalendar.slice(state.activityCalendar.length - 60);
    }
    state.todayCount = 0;
  } else {
    state.activityCalendar = state.activityCalendar.map((d) => ({
      ...d,
      isToday: d.date === todayStr
    }));
  }

  return state;
}

function getInitialCleanStateData() {
  return {
    startTime: Date.now(),
    todayCount: 0,
    cravingsResisted: 0,
    expBonus: 0,
    config: {
      costPerPack: 35000,
      cigsPerPack: 20,
      cigsPerDayOld: 15,
      soundEnabled: true,
      hapticsEnabled: true,
      nickname: "HIỆP SĨ PHỔI"
    },
    quests: INITIAL_QUESTS.map((q) => ({ ...q, completed: false, claimed: false })),
    relapses: [],
    activityCalendar: generateCleanActivityCalendar()
  };
}

async function getOrCreateState() {
  let state = await SmokeAppState.findOne();
  if (!state) {
    state = await SmokeAppState.create(getInitialCleanStateData());
  }

  checkAndRolloverDay(state);
  return state;
}

// GET /api/state hoặc /api/smoke/state
async function getState(req, res) {
  try {
    let state = await SmokeAppState.findOne().lean();
    if (!state) {
      const created = await getOrCreateState();
      return res.json(created);
    }
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// GET /api/timeline hoặc /api/smoke/timeline
async function getTimeline(req, res) {
  try {
    const state = await getOrCreateState();
    const relapses = state.relapses || [];
    const totalSmoked = relapses.length;
    const hp = Math.max(0, 100 - totalSmoked * 10);

    const reasonLabels = {
      STRESS: 'Căng thẳng / Áp lực',
      AFTER_MEAL: 'Sau khi ăn no',
      SOCIAL: 'Tiệc tùng / Bạn bè rủ',
      BOREDOM: 'Buồn chán / Trống rỗng',
      HABIT: 'Thói quen vô thức',
      COFFEE: 'Uống cà phê'
    };

    // Format events chronologically (newest first)
    const timeline = relapses
      .map((item, index) => {
        const itemDate = new Date(item.time);
        return {
          id: item.id || `relapse_${index}`,
          type: 'SMOKE',
          title: 'Hút 1 điếu thuốc',
          reason: reasonLabels[item.reason] || item.reason || 'Không rõ lý do',
          rawReason: item.reason,
          time: item.time,
          formattedTime: itemDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          formattedDate: itemDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          hpImpact: -10,
          hpText: '-10% Máu'
        };
      })
      .reverse();

    res.json({
      totalSmoked,
      hp,
      cravingsResisted: state.cravingsResisted || 0,
      timeline
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/smoke/record
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
    state.startTime = Date.now();
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

// POST /api/smoke/craving-resisted
async function recordCravingResisted(req, res) {
  try {
    const state = await getOrCreateState();
    state.cravingsResisted += 1;
    state.expBonus += 10000;

    state.quests = (state.quests || []).map((q) =>
      q.id === "q2" ? { ...q, completed: true } : q
    );

    await state.save();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/smoke/quests/:questId/claim
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

// PUT /api/smoke/config
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

// POST /api/smoke/reset
async function resetState(req, res) {
  try {
    await SmokeAppState.deleteMany({});
    const freshState = await SmokeAppState.create(getInitialCleanStateData());
    res.json(freshState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getState,
  getTimeline,
  recordSmoke,
  recordCravingResisted,
  claimQuest,
  updateConfig,
  resetState
};
