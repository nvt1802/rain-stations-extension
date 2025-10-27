const API_URL = "https://data.vrain.vn/public/current/31.json";

chrome.runtime.onInstalled.addListener(() => {
  // Tạo alarm cập nhật mỗi 15 phút
  chrome.alarms.create("updateRain", { periodInMinutes: 15 });
  fetchRainData(); // chạy ngay khi cài đặt
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "updateRain") {
    console.log("🔄 Cập nhật nền mỗi 15 phút...");
    fetchRainData(true);
  }
});

async function fetchRainData(showNotification = false) {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Không thể tải dữ liệu nền");
    const json = await res.json();
    const now = Date.now();

    const stored = await chrome.storage.local.get([
      "rainData",
      "rainHistory",
      "rainChanges",
      "lastRainDay", // ✅ Thêm lưu ngày mưa gần nhất
    ]);

    const oldData = stored.rainData || {};
    const rainHistory = stored.rainHistory || {};
    let rainChanges = stored.rainChanges || {};
    const rainDay = getRainDay();
    const lastRainDay = stored.lastRainDay;

    const updatedData = {};
    const changedStations = [];

    // 🧹 Reset rainChanges nếu qua ngày mới (so với lần fetch trước)
    if (lastRainDay && lastRainDay !== rainDay) {
      console.log("🧹 Qua ngày mới, reset rainChanges...");
      rainChanges = {}; // Xóa toàn bộ thay đổi cũ
    }

    for (const item of json) {
      const id = item.station?.uuid;
      const name = item.station?.name || "Không rõ";
      const value = item.sumDepth ?? 0;
      const previous = oldData[id];

      // Lưu vào lịch sử khi qua ngày mới (sau 19h)
      if (previous && previous.day !== rainDay) {
        if (!rainHistory[id]) rainHistory[id] = [];
        rainHistory[id].push({
          day: previous.day,
          value: previous.value,
          timestamp: previous.timestamp,
        });
        rainHistory[id] = rainHistory[id].slice(-7);
      }

      // ✅ Tính lượng thay đổi
      let diff = 0;
      if (previous && typeof previous.value === "number") {
        diff = parseFloat((value - previous.value).toFixed(1));

        if (diff !== 0) {
          changedStations.push({ name, diff, newValue: value });

          if (!rainChanges[id]) rainChanges[id] = [];
          rainChanges[id].push({
            time: new Date(now).toLocaleString("vi-VN"),
            oldValue: previous.value,
            newValue: value,
            diff,
          });

          rainChanges[id] = rainChanges[id].slice(-10);
        }
      }

      updatedData[id] = { name, value, day: rainDay, timestamp: now };
    }

    await chrome.storage.local.set({
      rainData: updatedData,
      rainHistory,
      rainChanges,
      lastFetch: now,
      lastRainDay: rainDay, // ✅ Lưu ngày hiện tại lại
    });

    console.log(
      "✅ Dữ liệu nền đã cập nhật:",
      new Date(now).toLocaleString("vi-VN")
    );

    // 🔔 Gửi thông báo nếu có thay đổi
    if (showNotification && changedStations.length > 0) {
      const topChange = changedStations.slice(0, 3);
      const message =
        topChange
          .map(
            (s) =>
              `${s.name}: ${s.diff > 0 ? "▲ +" : "▼ "}${Math.abs(s.diff)} mm`
          )
          .join("\n") +
        (changedStations.length > 3
          ? `\n…và ${changedStations.length - 3} trạm khác`
          : "");

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "🌧️ Cập nhật lượng mưa",
        message,
        priority: 2,
      });
    }
  } catch (err) {
    console.error("❌ Lỗi cập nhật nền:", err);
  }
}

function getRainDay() {
  const now = new Date();
  if (now.getHours() < 19) now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}
