const mongoose = require("mongoose");

const INITIAL_QUESTS = [
  {
    id: "q1",
    title: "Uống 1 cốc nước lạnh khi thèm thuốc",
    desc: "Dập tắt ngọn lửa nicotine tức thì bằng nước tinh khiết.",
    exp: 5000,
    hp: 5,
    completed: true,
    claimed: false,
    icon: "water_drop"
  },
  {
    id: "q2",
    title: "Hít thở sâu 3 phút với SOS Mode",
    desc: "Hoàn thành 1 lượt hít thở 8-bit để hạ xung thần kinh.",
    exp: 10000,
    hp: 10,
    completed: true,
    claimed: false,
    icon: "air"
  },
  {
    id: "q3",
    title: "24 Giờ Phổi Sạch (Giữ vạch Perfect)",
    desc: "Không chạm 1 điếu thuốc trong 24 giờ liên tiếp.",
    exp: 25000,
    hp: 15,
    completed: true,
    claimed: true,
    icon: "verified"
  },
  {
    id: "q4",
    title: "Tiết kiệm 100k đầu tiên",
    desc: "Dành tiền mua trang bị thực tế thay vì đốt khói.",
    exp: 30000,
    hp: 10,
    completed: true,
    claimed: false,
    icon: "savings"
  },
  {
    id: "q5",
    title: "Vượt ải Boss Cuối Tuần (Chủ Nhật 0 điếu)",
    desc: "Khắc chế tiệc tùng cuối tuần mà không hút điếu nào.",
    exp: 50000,
    hp: 20,
    completed: false,
    claimed: false,
    icon: "military_tech"
  }
];

function generateInitialActivityCalendar() {
  const days = [];
  const today = new Date();
  const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

  for (let i = 59; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const isToday = i === 0;

    days.push({
      date: dateStr,
      count: 0,
      level: "clean",
      dayName: dayNames[d.getDay()],
      fullDayName: `${dayNames[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`,
      isToday,
      isFuture: false
    });
  }
  return days;
}

const SmokeAppStateSchema = new mongoose.Schema(
  {
    startTime: { type: Number, required: true, default: Date.now },
    todayCount: { type: Number, default: 0 },
    cravingsResisted: { type: Number, default: 0 },
    expBonus: { type: Number, default: 0 },
    config: {
      costPerPack: { type: Number, default: 35000 },
      cigsPerPack: { type: Number, default: 20 },
      cigsPerDayOld: { type: Number, default: 15 },
      soundEnabled: { type: Boolean, default: true },
      hapticsEnabled: { type: Boolean, default: true },
      nickname: { type: String, default: "HIỆP SĨ PHỔI" }
    },
    quests: {
      type: Array,
      default: INITIAL_QUESTS
    },
    relapses: {
      type: Array,
      default: []
    },
    activityCalendar: {
      type: Array,
      default: generateInitialActivityCalendar
    }
  },
  { timestamps: true }
);

const SmokeAppState = mongoose.models.SmokeAppState || mongoose.model("SmokeAppState", SmokeAppStateSchema);

module.exports = {
  SmokeAppState,
  INITIAL_QUESTS,
  generateInitialActivityCalendar
};
