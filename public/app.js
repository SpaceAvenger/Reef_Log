// ---------- Bubble field ----------
(function spawnBubbles() {
  const container = document.getElementById("bubbles");
  const COUNT = 22;
  for (let i = 0; i < COUNT; i++) {
    const b = document.createElement("div");
    b.className = "bubble";
    const size = 4 + Math.random() * 14;
    const left = Math.random() * 100;
    const duration = 8 + Math.random() * 10;
    const delay = Math.random() * -18;
    const drift = (Math.random() * 60 - 30).toFixed(0) + "px";
    b.style.width = size + "px";
    b.style.height = size + "px";
    b.style.left = left + "%";
    b.style.setProperty("--drift", drift);
    b.style.animationDuration = duration + "s";
    b.style.animationDelay = delay + "s";
    container.appendChild(b);
  }
})();

// ---------- Form submission ----------
const FIELDS = ["alkalinity", "phosphate", "nitrate", "calcium", "magnesium"];

const form = document.getElementById("paramForm");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {};
  for (const name of FIELDS) {
    const raw = document.getElementById(name).value.trim();
    if (raw !== "") payload[name] = Number(raw);
  }

  if (Object.keys(payload).length === 0) {
    setStatus("Enter at least one parameter.", "err");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Logging...", "busy");

  try {
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Server responded ${res.status}`);
    }

    setStatus("Logged ✓", "ok");
    form.reset();
  } catch (err) {
    setStatus("Failed to log: " + err.message, "err");
  } finally {
    submitBtn.disabled = false;
  }
});
