const API_URL = "https://data.vrain.vn/public/current/31.json";

chrome.runtime.onInstalled.addListener(() => {
  // Cập nhật mỗi 15 phút
  chrome.alarms.create("updateRain", { periodInMinutes: 15 });
  fetchRainData(); // chạy ngay khi cài đặt
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "updateRain") {
    console.log("🔄 Cập nhật nền mỗi 15 phút...");
    fetchRainData();
  }
});

async function fetchRainData() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Không thể tải dữ liệu nền");
    const json = await res.json();
    const now = Date.now();

    const stored = await chrome.storage.local.get([
      "rainData",
      "rainHistory",
      "rainChanges",
    ]);
    const oldData = stored.rainData || {};
    const rainHistory = stored.rainHistory || {};
    const rainChanges = stored.rainChanges || {}; // ✅ Thêm object lưu thay đổi
    const rainDay = getRainDay();

    const updatedData = {};

    for (const item of json) {
      const id = item.station?.uuid;
      const name = item.station?.name || "Không rõ";
      const value = item.sumDepth ?? 0;
      const previous = oldData[id];

      // ✅ Lưu vào lịch sử khi qua ngày mới (sau 19h)
      if (previous && previous.day !== rainDay) {
        if (!rainHistory[id]) rainHistory[id] = [];
        rainHistory[id].push({
          day: previous.day,
          value: previous.value,
          timestamp: previous.timestamp,
        });

        // Giữ tối đa 7 ngày lịch sử
        rainHistory[id] = rainHistory[id].slice(-7);
      }

      // ✅ Tính lượng thay đổi (diff)
      let diff = 0;
      if (previous && typeof previous.value === "number") {
        diff = parseFloat((value - previous.value).toFixed(1));

        // Nếu có thay đổi
        if (diff !== 0) {
          if (!rainChanges[id]) rainChanges[id] = [];
          rainChanges[id].push({
            time: new Date(now).toLocaleString("vi-VN"),
            oldValue: previous.value,
            newValue: value,
            diff,
          });

          // Giữ tối đa 10 bản ghi thay đổi gần nhất
          rainChanges[id] = rainChanges[id].slice(-10);
        }
      }

      updatedData[id] = { name, value, day: rainDay, timestamp: now };
    }

    await chrome.storage.local.set({
      rainData: updatedData,
      rainHistory,
      rainChanges, // ✅ Lưu thêm vào storage
      lastFetch: now,
    });

    console.log(
      "✅ Dữ liệu nền đã cập nhật:",
      new Date(now).toLocaleString("vi-VN")
    );
  } catch (err) {
    console.error("❌ Lỗi cập nhật nền:", err);
  }
}

function getRainDay() {
  const now = new Date();
  if (now.getHours() < 19) now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}
