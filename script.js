const API_URL = "https://data.vrain.vn/public/current/31.json";
const listEl = document.getElementById("station-list");
const loadingEl = document.getElementById("loading");

// 🕒 Tính "ngày mưa" theo mốc 19h
function getRainDay() {
  const now = new Date();
  if (now.getHours() < 19) now.setDate(now.getDate() - 1);
  return now.toISOString().split("T")[0];
}

// 📊 Hiển thị lịch sử mưa 7 ngày
function showHistory(stationId, history) {
  const container = document.querySelector(`#history-${stationId}`);
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = "<p><em>Chưa có dữ liệu lịch sử.</em></p>";
    return;
  }

  const list = history
    .slice(-7)
    .reverse()
    .map(
      (item) => `
      <div class="history-item">
        <span>${item.day}</span>
        <span>${item.value} mm</span>
      </div>
    `
    )
    .join("");

  container.innerHTML = `
    <div class="history-list">
      ${list}
    </div>
  `;
}

// 📈 Hiển thị lịch sử thay đổi trong ngày
function showChanges(stationId, changes) {
  const container = document.querySelector(`#changes-${stationId}`);
  if (!container) return;

  if (!changes || changes.length === 0) {
    container.innerHTML = "<p><em>Chưa có thay đổi trong ngày.</em></p>";
    return;
  }

  const list = changes
    .slice(-5)
    .reverse()
    .map(
      (ch) => `
      <div class="change-item">
        <span>${ch.time}</span>
        <span>${ch.diff > 0 ? "▲" : "▼"} ${ch.diff} mm</span>
      </div>
    `
    )
    .join("");

  container.innerHTML = `
    <div class="change-list">
      ${list}
    </div>
  `;
}

async function fetchRainData() {
  try {
    loadingEl.textContent = "Đang tải dữ liệu...";

    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Không thể tải dữ liệu");
    const json = await response.json();

    listEl.innerHTML = "";
    loadingEl.style.display = "none";

    if (!json || json.length === 0) {
      listEl.innerHTML = "<p>Không có dữ liệu trạm mưa.</p>";
      return;
    }

    // 🔹 Lấy dữ liệu cũ
    const stored = await chrome.storage.local.get([
      "rainData",
      "rainHistory",
      "rainChanges",
    ]);
    const oldData = stored.rainData || {};
    const rainHistory = stored.rainHistory || {};
    const rainChanges = stored.rainChanges || {}; // ✅ thêm phần lấy thay đổi

    const now = Date.now();
    const rainDay = getRainDay();
    const updatedData = {};

    json.forEach((item) => {
      const stationId = item.station?.uuid;
      const name = item.station?.name || "Không rõ";
      const address = item.station?.address || "N/A";
      const currentDepth = item.sumDepth ?? 0;
      const level = item.level || "Không xác định";
      const color = item.color || "#ccc";
      const previous = oldData[stationId];

      let changeText = "";
      let showDepth = `${currentDepth.toFixed(1)} mm`;
      let lastUpdatedText = "";
      let updated = false;

      if (previous && typeof previous.value === "number") {
        const diff = currentDepth - previous.value;
        if (diff > 0) {
          changeText = ` (▲ +${diff.toFixed(1)} mm)`;
          updated = true;
        } else if (diff < 0) {
          changeText = ` (▼ ${diff.toFixed(1)} mm)`;
          updated = true;
        } else {
          changeText = " (– 0 mm)";
        }

        const lastUpdate = new Date(previous.timestamp).toLocaleTimeString(
          "vi-VN"
        );
        lastUpdatedText = `<p><em>Cập nhật lần cuối: ${lastUpdate}</em></p>`;
      }

      if (previous && previous.day !== rainDay) {
        if (!rainHistory[stationId]) rainHistory[stationId] = [];
        rainHistory[stationId].push({
          day: previous.day,
          value: previous.value,
          timestamp: previous.timestamp,
        });
        rainHistory[stationId] = rainHistory[stationId].slice(-7);
      }

      const shouldUpdate = !previous || previous.value !== currentDepth;
      updatedData[stationId] = {
        name,
        value: shouldUpdate ? currentDepth : previous.value,
        timestamp: shouldUpdate ? now : previous.timestamp,
        day: rainDay,
      };

      // 🧱 Render UI
      const div = document.createElement("div");
      div.className = "station";
      div.style.setProperty("--level-color", color);
      if (updated) div.style.background = "#e9f7ef";

      div.innerHTML = `
        <h3>${name}</h3>
        <p><strong>Địa chỉ:</strong> ${address}</p>
        <p><strong>Lượng mưa:</strong> ${showDepth}${changeText}</p>
        <p><strong>Mức độ:</strong> ${level}</p>
        ${lastUpdatedText}
        <p>
          <a href="#" class="view-history" data-id="${stationId}">📊 Xem lịch sử</a> |
          <a href="#" class="view-changes" data-id="${stationId}">🌀 Xem thay đổi</a>
        </p>
        <div class="history" id="history-${stationId}" style="display:none;"></div>
        <div class="changes" id="changes-${stationId}" style="display:none;"></div>
      `;

      listEl.appendChild(div);
    });

    // ✅ Lưu dữ liệu mới
    await chrome.storage.local.set({
      rainData: updatedData,
      rainHistory,
    });

    // 🔹 Sự kiện click “Xem lịch sử”
    document.querySelectorAll(".view-history").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const el = document.querySelector(`#history-${id}`);
        const isVisible = el.style.display === "block";
        el.style.display = isVisible ? "none" : "block";
        if (!isVisible) showHistory(id, rainHistory[id]);
      });
    });

    // 🔹 Sự kiện click “Xem thay đổi”
    document.querySelectorAll(".view-changes").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const el = document.querySelector(`#changes-${id}`);
        const isVisible = el.style.display === "block";
        el.style.display = isVisible ? "none" : "block";
        if (!isVisible) showChanges(id, rainChanges[id]);
      });
    });
  } catch (err) {
    loadingEl.textContent = "❌ Lỗi khi tải dữ liệu!";
    console.error(err);
  }
}

// 🚀 Khi mở popup
fetchRainData();
