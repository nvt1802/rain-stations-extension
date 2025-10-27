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
            <span>${
              item?.timestamp
                ? new Date(item?.timestamp)
                    ?.toLocaleDateString("en-GB")
                    ?.replace(/\//g, "/")
                : ""
            }</span>
            <span>${item?.value?.toFixed(1)} mm</span>
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
    .slice(-10)
    .reverse()
    .map(
      (ch) => `
      <div class="change-item">
        <span>${ch.time}</span>
        <span>${ch.oldValue?.toFixed(1)} mm → ${ch.newValue?.toFixed(1)} mm</span>
        <span style="color:${ch.diff > 0 ? "red" : "green"}">
          ${ch.diff > 0 ? "▲" : "▼"} ${Math.abs(ch.diff)} mm
        </span>
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
    const rainChanges = stored.rainChanges || {};

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

      // So sánh với giá trị cũ
      if (previous && typeof previous.value === "number") {
        const diff = currentDepth - previous.value;

        if (diff !== 0) {
          const time = new Date().toLocaleTimeString("vi-VN");
          if (!rainChanges[stationId]) rainChanges[stationId] = [];

          rainChanges[stationId].push({
            time,
            diff: parseFloat(diff.toFixed(1)),
            newValue: currentDepth,
            oldValue: previous.value,
          });

          // Giữ lại 10 thay đổi gần nhất
          rainChanges[stationId] = rainChanges[stationId].slice(-10);
        }
        let icon = `<span style="color:${diff > 0 ? "red" : "green"}"> ${diff > 0 ? "▲" : "▼"} </span>`;
        if (diff > 0) {
          changeText = ` (${icon} +${diff.toFixed(1)} mm)`;
          updated = true;
        } else if (diff < 0) {
          changeText = ` (${icon} ${diff.toFixed(1)} mm)`;
          updated = true;
        } else {
        }

        if (rainChanges[stationId]?.length > 0) {
          const listData = rainChanges[stationId];
          const listDataSorted = [...listData].sort((a, b) => {
            const toDate = (t) => {
              const [time, date] = t?.split(" ");
              console.log({ time, date });
              if (!time || !date) return new Date(0);
              const [h, m, s] = time?.split(":");
              const [day, month, year] = date?.split("/");
              return new Date(`${year}-${month}-${day}T${h}:${m}:${s}`);
            };
            return toDate(b.time) - toDate(a.time); // mới nhất trước
          });
          const lastChange = listDataSorted[0];
          if (lastChange?.diff > 0) {
            changeText = ` (<span style="color:red">▲</span> +${lastChange?.diff.toFixed(1)} mm)`;
            updated = true;
          } else if (lastChange?.diff < 0) {
            changeText = ` (<span style="color:red">▲</span> +${lastChange?.diff.toFixed(1)} mm)`;
            updated = true;
          } else {
            changeText = "";
            updated = false;
          }
        } else {
          changeText = "";
          updated = false;
        }

        const lastUpdate = new Date(previous.timestamp).toLocaleTimeString(
          "vi-VN"
        );
        lastUpdatedText = `<p><em>Cập nhật lần cuối: ${lastUpdate}</em></p>`;
      }

      // Lưu vào lịch sử nếu qua ngày mới
      if (previous && previous?.day !== rainDay) {
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
        <p><strong>Lượng mưa:</strong> <span class="depth">${showDepth}</span> ${changeText}</p>
        <p><strong>Mức độ:</strong> ${level}</p>
        ${lastUpdatedText}
        <p>
          <a href="#" class="view-history" data-id="${stationId}">📊 Xem lịch sử theo ngày</a> |
          <a href="#" class="view-changes" data-id="${stationId}">🌀 Xem thay đổi trong ngày</a>
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
      rainChanges,
    });

    // Sự kiện xem lịch sử
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

    // Sự kiện xem thay đổi
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
