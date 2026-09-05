// Chumma List — a to-do list that then generates the most unproductive
// possible schedule for you, via Groq's chat API.

// ============================================================================
// PASTE YOUR GROQ API KEY HERE (put it between the quotes, e.g. "gsk_..."):
// ============================================================================
const GROQ_API_KEY = "YOUR_API_KEY_HERE";
// ============================================================================
// Get a free key at https://console.groq.com/keys
//
// IMPORTANT: this is a plain static site with no server, so a key pasted here
// ships straight to every visitor's browser and is visible in the page's
// network tab / source. That's fine for playing around on your own machine,
// but do NOT deploy this publicly with a real key in it — anyone could copy
// it and spend your Groq quota. If you ever put this online for real, move
// this fetch call behind a small serverless function (Vercel/Netlify/etc.)
// that holds the key server-side instead.
// ============================================================================

// llama-3.1-8b-instant was retired by Groq. openai/gpt-oss-20b (with low
// reasoning effort) is fast, currently available, and works well for this.
const GROQ_MODEL = "openai/gpt-oss-20b";

const $ = (id) => document.getElementById(id);

const inputEl = $("clInput");
const addBtn = $("clAddBtn");
const listEl = $("clList");
const emptyEl = $("clEmpty");
const scheduleBtn = $("clScheduleBtn");
const scheduleOut = $("clScheduleOut");
const scheduleTitle = $("clScheduleTitle");
const scheduleLines = $("clScheduleLines");

const STORAGE_KEY = "chummalist.items";

let items = loadItems();

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — list just won't persist, not fatal */
  }
}

function renderList() {
  listEl.innerHTML = "";
  emptyEl.style.display = items.length ? "none" : "block";

  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "cl-item" + (item.done ? " checked" : "");

    const box = document.createElement("button");
    box.className = "cl-checkbox" + (item.done ? " checked" : "");
    box.setAttribute("aria-label", "toggle done");
    box.addEventListener("click", () => {
      items[i].done = !items[i].done;
      saveItems();
      renderList();
    });

    const text = document.createElement("span");
    text.className = "cl-item-text";
    text.textContent = item.text;

    const remove = document.createElement("button");
    remove.className = "cl-remove-btn";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", "delete");
    remove.addEventListener("click", () => {
      items.splice(i, 1);
      saveItems();
      renderList();
    });

    li.appendChild(box);
    li.appendChild(text);
    li.appendChild(remove);
    listEl.appendChild(li);
  });
}

function addItem() {
  const text = inputEl.value.trim();
  if (!text) return;
  items.push({ text, done: false });
  saveItems();
  inputEl.value = "";
  renderList();
}

addBtn.addEventListener("click", addItem);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addItem();
});

renderList();

// ---------------------------------------------------------------------------
// GET SCHEDULE
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are chummaDO's "Unproductivity Coach." You NEVER give helpful, productive,
or motivational advice. Given a person's to-do list, you generate a mocking,
funny, roast-style DAILY SCHEDULE that is deliberately, aggressively
unproductive and guarantees they get nothing done.

Rules:
- Output ONLY 6 to 8 lines, one per schedule entry. Nothing else.
- Each line MUST be formatted exactly as: "TIME - ACTIVITY".
- Activities should be absurd, lazy, self-sabotaging, and funny — e.g. waking
  up just to prove a point then going back to sleep, opening one to-do item
  and immediately closing the laptop, scheduling a nap to recover from a nap.
- If given real to-do items, roast them specifically and schedule time to
  actively avoid doing them.
- Never suggest anything genuinely productive. Never break character.
- Absolutely no intro sentence, no outro sentence, no numbering, no markdown,
  no code fences/backticks — just the raw schedule lines, nothing before or after.`;

function buildUserPrompt() {
  if (items.length === 0) {
    return "This person has no to-do items at all. Roast their lack of ambition and build them an unproductive schedule anyway.";
  }
  const list = items.map((it) => `- ${it.text}`).join("\n");
  return `Here is my to-do list:\n${list}\n\nBuild me the least productive schedule possible, roasting these items.`;
}

// Matches lines like "9:00 AM - activity" or "14:30 - activity", tolerating
// a leading bullet/backtick and either a hyphen or an en dash as separator.
const SCHEDULE_LINE_RE =
  /^[\s"'`*\-•]*\d{1,2}(:\d{2})?\s*(AM|PM|am|pm)?\s*[–-]\s*.+$/;

async function fetchGroqSchedule() {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 1,
      max_tokens: 500,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt() },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq request failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  const lines = text
    .split("\n")
    .map((l) => l.trim().replace(/^```.*$/, ""))
    .filter(Boolean);

  // Prefer lines that actually look like "TIME - ACTIVITY"; if the model
  // ignored formatting entirely, fall back to whatever text came back
  // rather than showing nothing.
  const scheduleLines = lines.filter((l) => SCHEDULE_LINE_RE.test(l));
  return scheduleLines.length ? scheduleLines : lines;
}

// Works even with no API key set, so the feature isn't dead out of the box.
const FALLBACK_POOL = [
  "5:00 AM – Wake up dramatically, achieve nothing, go back to sleep by 5:15.",
  "7:30 AM – Open your to-do list, feel a wave of ambition, close the laptop.",
  "9:00 AM – Reheat yesterday's coffee. Do not drink it. Just hold it.",
  "10:15 AM – Schedule a meeting with yourself to discuss why you're behind.",
  "11:00 AM – Stare at task #1 for 45 minutes. Rename the file instead.",
  "12:30 PM – Lunch. Extend lunch until it becomes dinner planning.",
  "2:00 PM – Nap, to recover from the nap you took at 9 AM.",
  "3:30 PM – Google how other people stay productive. Bookmark it. Never open again.",
  "5:00 PM – Declare today a 'research day.' Research nothing.",
  "7:00 PM – Write tomorrow's to-do list. Copy today's, unchanged.",
  "8:30 PM – Feel motivated for exactly 4 minutes. Go watch one more episode.",
  "11:45 PM – Promise yourself tomorrow will be different. It will not.",
];

function fallbackSchedule() {
  const shuffled = [...FALLBACK_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 7);
}

function renderSchedule(lines) {
  scheduleLines.innerHTML = "";
  lines.forEach((line) => {
    const div = document.createElement("div");
    div.className = "cl-schedule-line";
    const dashMatch = line.match(/\s[–-]\s/);
    if (dashMatch) {
      const dashIndex = dashMatch.index;
      const time = line.slice(0, dashIndex).trim();
      const rest = line.slice(dashIndex + dashMatch[0].length).trim();
      div.innerHTML = `<b>${escapeHtml(time)}</b> — ${escapeHtml(rest)}`;
    } else {
      div.textContent = line;
    }
    scheduleLines.appendChild(div);
  });
  scheduleOut.classList.add("show");
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

scheduleBtn.addEventListener("click", async () => {
  scheduleBtn.disabled = true;
  const originalLabel = scheduleBtn.textContent;
  scheduleBtn.textContent = "CONSULTING THE COUNCIL OF LAZINESS...";

  const hasKey = GROQ_API_KEY && GROQ_API_KEY.trim().length > 0;

  try {
    const lines = hasKey ? await fetchGroqSchedule() : fallbackSchedule();
    scheduleTitle.textContent = "Your Extremely Unproductive Schedule";
    renderSchedule(lines);
  } catch (err) {
    console.error(err);
    scheduleTitle.textContent = "Your Extremely Unproductive Schedule (offline edition)";
    renderSchedule(fallbackSchedule());
  } finally {
    scheduleBtn.disabled = false;
    scheduleBtn.textContent = originalLabel;
  }
});
