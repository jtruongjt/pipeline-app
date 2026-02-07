const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const ownerFilter = document.getElementById("ownerFilter");
const stageFilter = document.getElementById("stageFilter");
const judgmentFilter = document.getElementById("judgmentFilter");
const dateRangeFilter = document.getElementById("dateRangeFilter");
const searchFilter = document.getElementById("searchFilter");
const resetFilters = document.getElementById("resetFilters");

const metricCount = document.getElementById("metricCount");
const metricTotal = document.getElementById("metricTotal");
const metricAvg = document.getElementById("metricAvg");
const metricMedianAge = document.getElementById("metricMedianAge");
const metricPastDue = document.getElementById("metricPastDue");

const stageCanvas = document.getElementById("stageChart");
const judgmentCanvas = document.getElementById("judgmentChart");
const walkInCanvas = document.getElementById("walkInChart");
const stageTooltip = document.getElementById("stageTooltip");
const walkInTooltip = document.getElementById("walkInTooltip");

const tableBody = document.getElementById("tableBody");
const tableMeta = document.getElementById("tableMeta");

const state = {
  rows: [],
  filtered: [],
  charts: {},
  createdMonthKey: null,
  stageKey: null,
  judgmentKey: null,
  stageChart: {
    labels: [],
    values: [],
  },
  judgmentChart: {
    labels: [],
    values: [],
  },
  walkInChart: {
    labels: [],
    values: [],
    assistedTotals: [],
    monthKeys: [],
  },
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function parseCsv(text) {
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      current.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (field.length || current.length) {
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
      }
      if (char === "\r" && next === "\n") {
        i += 1;
      }
    } else {
      field += char;
    }
  }

  if (field.length || current.length) {
    current.push(field);
    rows.push(current);
  }

  const headers = rows.shift().map((h) => h.trim());
  return rows.map((row) => {
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] ? row[idx].trim() : "";
    });
    return record;
  });
}

function parseDate(value) {
  if (!value) return null;
  const parts = value.split("/");
  if (parts.length !== 3) return null;
  const [month, day, year] = parts.map((part) => Number(part));
  if (!month || !day || !year) return null;
  return new Date(year, month - 1, day);
}

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMonthKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildRows(records) {
  return records.map((record) => {
    const closeDate = parseDate(record["Close Date"]);
    const nextStepDate = parseDate(record["Next Step Date"]);
    const createdDate = parseDate(record["Created Date"]);
    const age = parseNumber(record["Age"]);
    const total = parseNumber(record["Total Quota Relief"]);
    const assisted = parseNumber(record["Assisted iARR (New/Upgrade)"]);

    return {
      name: record["Opportunity Name"],
      account: record["Account Name"],
      stage: record["Stage"],
      owner: record["Opportunity Owner"],
      judgment: record["Manager Forecast Judgment"],
      closeDate,
      closeDateRaw: record["Close Date"],
      nextStep: record["Next Step"],
      nextStepDate,
      createdDate,
      age,
      total,
      assisted,
      notes: record["Sales Notes"],
    };
  });
}

function populateFilter(select, values) {
  select.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = "All";
  select.appendChild(defaultOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function getSelectedValue(select) {
  return select.value && select.value !== "all" ? select.value : null;
}

function applyFilters() {
  const owner = getSelectedValue(ownerFilter);
  const stage = getSelectedValue(stageFilter);
  const judgment = getSelectedValue(judgmentFilter);
  const search = searchFilter.value.trim().toLowerCase();
  const range = dateRangeFilter.value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  state.filtered = state.rows.filter((row) => {
    if (owner && row.owner !== owner) return false;
    if (stage && row.stage !== stage) return false;
    if (judgment && row.judgment !== judgment) return false;
    if (state.stageKey && row.stage !== state.stageKey) return false;
    if (state.judgmentKey && row.judgment !== state.judgmentKey) return false;
    if (state.createdMonthKey) {
      if (!row.createdDate) return false;
      if (getMonthKey(row.createdDate) !== state.createdMonthKey) return false;
    }

    if (search) {
      const haystack = `${row.name} ${row.account}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (range !== "all") {
      if (!row.closeDate) return false;
      const diffDays = Math.floor((row.closeDate - today) / (1000 * 60 * 60 * 24));
      if (range === "overdue") {
        if (diffDays >= 0) return false;
      } else {
        if (diffDays < 0 || diffDays > Number(range)) return false;
      }
    }

    return true;
  });

  render();
}

function getMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function updateMetrics() {
  const count = state.filtered.length;
  const total = state.filtered.reduce((sum, row) => sum + row.assisted, 0);
  const avg = count ? total / count : 0;
  const ages = state.filtered.map((row) => row.age).filter((age) => age > 0);
  const medianAge = getMedian(ages);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pastDue = state.filtered.filter((row) => row.closeDate && row.closeDate < today).length;

  metricCount.textContent = numberFormatter.format(count);
  metricTotal.textContent = currencyFormatter.format(total);
  metricAvg.textContent = currencyFormatter.format(avg);
  metricMedianAge.textContent = `${numberFormatter.format(medianAge)}d`;
  metricPastDue.textContent = numberFormatter.format(pastDue);
}

function drawBarChart(canvas, labels, values, options = {}) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth;
  const height = canvas.height = canvas.clientHeight;

  ctx.clearRect(0, 0, width, height);

  if (!labels.length) {
    return { rects: [] };
  }

  const padding = 30;
  const maxValue = Math.max(...values, 1);
  const barWidth = (width - padding * 2) / labels.length;

  const rects = [];

  labels.forEach((label, index) => {
    const value = values[index];
    const barHeight = (value / maxValue) * (height - padding * 2);
    const x = padding + index * barWidth;
    const y = height - padding - barHeight;

    ctx.fillStyle = options.color || "#e64b3d";
    ctx.fillRect(x + 8, y, barWidth - 16, barHeight);
    rects.push({ x: x + 8, y, width: barWidth - 16, height: barHeight });

    ctx.fillStyle = "#5f5b5f";
    ctx.font = "12px 'Space Grotesk', sans-serif";
    ctx.save();
    ctx.translate(x + barWidth / 2, height - padding + 10);
    ctx.rotate(-0.4);
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  return { rects, padding, barWidth, height, width };
}

function drawHorizontalChart(canvas, labels, values, options = {}) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth;
  const height = canvas.height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (!labels.length) {
    return { rects: [] };
  }

  const padding = 20;
  const maxValue = Math.max(...values, 1);
  const rowHeight = (height - padding * 2) / labels.length;
  const rects = [];

  labels.forEach((label, index) => {
    const value = values[index];
    const barWidth = (value / maxValue) * (width - padding * 2);
    const y = padding + index * rowHeight;

    ctx.fillStyle = options.color || "#f4b63c";
    ctx.fillRect(padding, y + 6, barWidth, rowHeight - 12);
    rects.push({ x: padding, y: y + 6, width: barWidth, height: rowHeight - 12 });

    ctx.fillStyle = "#141213";
    ctx.font = "12px 'Space Grotesk', sans-serif";
    ctx.fillText(label, padding, y + rowHeight - 8);
    ctx.textAlign = "right";
    ctx.fillText(numberFormatter.format(value), width - padding, y + rowHeight - 8);
    ctx.textAlign = "left";
  });

  return { rects };
}

function drawHistogram(canvas, bins, values) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth;
  const height = canvas.height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  if (!bins.length) {
    return { rects: [] };
  }

  const padding = 30;
  const maxValue = Math.max(...values, 1);
  const barWidth = (width - padding * 2) / bins.length;
  const rects = [];

  bins.forEach((label, index) => {
    const value = values[index];
    const barHeight = (value / maxValue) * (height - padding * 2);
    const x = padding + index * barWidth;
    const y = height - padding - barHeight;

    ctx.fillStyle = "#e64b3d";
    ctx.fillRect(x + 8, y, barWidth - 16, barHeight);
    rects.push({ x: x + 8, y, width: barWidth - 16, height: barHeight });

    ctx.fillStyle = "#5f5b5f";
    ctx.font = "11px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + barWidth / 2, height - padding + 12);
  });

  return { rects };
}

function updateCharts() {
  const stageTotals = new Map();
  const judgmentTotals = new Map();
  const monthBuckets = new Map();
  const monthAssisted = new Map();

  state.filtered.forEach((row) => {
    stageTotals.set(row.stage, (stageTotals.get(row.stage) || 0) + row.total);
    if (row.judgment && row.judgment !== "Closed Lost") {
      judgmentTotals.set(row.judgment, (judgmentTotals.get(row.judgment) || 0) + row.total);
    }

    if (row.createdDate) {
      const key = getMonthKey(row.createdDate);
      monthBuckets.set(key, (monthBuckets.get(key) || 0) + 1);
      monthAssisted.set(key, (monthAssisted.get(key) || 0) + row.assisted);
    }
  });

  const monthsToShow = 6;
  const monthLabels = [];
  const monthValues = [];
  const monthAssistedTotals = [];
  const monthKeys = [];
  const now = new Date();
  for (let i = monthsToShow - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = getMonthKey(date);
    const label = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthLabels.push(label);
    monthValues.push(monthBuckets.get(key) || 0);
    monthAssistedTotals.push(monthAssisted.get(key) || 0);
    monthKeys.push(key);
  }

  state.stageChart.labels = [...stageTotals.keys()];
  state.stageChart.values = [...stageTotals.values()];
  const stageRender = drawBarChart(stageCanvas, state.stageChart.labels, state.stageChart.values, { color: "#e64b3d" });
  state.stageChart.rects = stageRender.rects;
  state.judgmentChart.labels = [...judgmentTotals.keys()];
  state.judgmentChart.values = [...judgmentTotals.values()];
  const judgmentRender = drawHorizontalChart(judgmentCanvas, state.judgmentChart.labels, state.judgmentChart.values, { color: "#f4b63c" });
  state.judgmentChart.rects = judgmentRender.rects;
  state.walkInChart.labels = monthLabels;
  state.walkInChart.values = monthValues;
  state.walkInChart.assistedTotals = monthAssistedTotals;
  state.walkInChart.monthKeys = monthKeys;
  const walkInRender = drawHistogram(walkInCanvas, monthLabels, monthValues);
  state.walkInChart.rects = walkInRender.rects;
}

function updateTable() {
  tableBody.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  state.filtered.forEach((row) => {
    const tr = document.createElement("tr");
    const closePastDue = row.closeDate && row.closeDate < today;
    const nextStepPastDue = row.nextStepDate && row.nextStepDate < today;
    const missingNextStep = !row.nextStepDate && !row.nextStep;

    if (closePastDue || nextStepPastDue) {
      tr.classList.add("row--past-due");
    }
    if (missingNextStep) {
      tr.classList.add("row--missing-next");
    }
    tr.innerHTML = `
      <td>${row.name || ""}</td>
      <td>${row.account || ""}</td>
      <td>${row.owner || ""}</td>
      <td>${currencyFormatter.format(row.total)}</td>
      <td>${currencyFormatter.format(row.assisted)}</td>
      <td>${row.stage || ""}</td>
      <td>${row.judgment || ""}</td>
      <td class="${closePastDue ? "cell--past-due" : ""}">${row.closeDateRaw || ""}</td>
      <td class="${nextStepPastDue ? "cell--past-due" : ""}">${row.nextStepDate ? row.nextStepDate.toLocaleDateString("en-US") : ""}</td>
      <td>${row.nextStep || ""}</td>
      <td>${row.notes || ""}</td>
      <td>${row.createdDate ? row.createdDate.toLocaleDateString("en-US") : ""}</td>
      <td>${numberFormatter.format(row.age)}</td>
    `;
    tableBody.appendChild(tr);
  });

  tableMeta.textContent = `${state.filtered.length} rows`;
}

function render() {
  updateMetrics();
  updateCharts();
  updateTable();
}

function initFilters() {
  const owners = [...new Set(state.rows.map((row) => row.owner).filter(Boolean))].sort();
  const stages = [...new Set(state.rows.map((row) => row.stage).filter(Boolean))].sort();
  const judgments = [...new Set(state.rows.map((row) => row.judgment).filter(Boolean))].sort();

  populateFilter(ownerFilter, owners);
  populateFilter(stageFilter, stages);
  populateFilter(judgmentFilter, judgments);
}

function handleFile(file) {
  if (!file) return;
  fileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const records = parseCsv(text);
    state.rows = buildRows(records);
    state.filtered = [...state.rows];
    initFilters();
    render();
  };
  reader.readAsText(file);
}

fileInput.addEventListener("change", (event) => {
  handleFile(event.target.files[0]);
});

[ownerFilter, stageFilter, judgmentFilter, dateRangeFilter].forEach((select) => {
  select.addEventListener("change", applyFilters);
});

searchFilter.addEventListener("input", () => {
  window.clearTimeout(searchFilter._timer);
  searchFilter._timer = window.setTimeout(applyFilters, 200);
});

resetFilters.addEventListener("click", () => {
  ownerFilter.value = "all";
  stageFilter.value = "all";
  judgmentFilter.value = "all";
  dateRangeFilter.value = "all";
  searchFilter.value = "";
  state.createdMonthKey = null;
  state.stageKey = null;
  state.judgmentKey = null;
  applyFilters();
});

function hideStageTooltip() {
  stageTooltip.classList.remove("is-visible");
  stageTooltip.setAttribute("aria-hidden", "true");
}

stageCanvas.addEventListener("mousemove", (event) => {
  if (!state.stageChart.rects || !state.stageChart.rects.length) {
    hideStageTooltip();
    return;
  }

  const rect = stageCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let hitIndex = -1;
  state.stageChart.rects.forEach((bar, index) => {
    if (
      x >= bar.x &&
      x <= bar.x + bar.width &&
      y >= bar.y &&
      y <= bar.y + bar.height
    ) {
      hitIndex = index;
    }
  });

  if (hitIndex === -1) {
    hideStageTooltip();
    return;
  }

  const label = state.stageChart.labels[hitIndex];
  const value = state.stageChart.values[hitIndex];
  stageTooltip.textContent = `${label}: ${currencyFormatter.format(value)}`;

  const cardRect = stageCanvas.parentElement.getBoundingClientRect();
  stageTooltip.style.left = `${event.clientX - cardRect.left + 12}px`;
  stageTooltip.style.top = `${event.clientY - cardRect.top - 12}px`;
  stageTooltip.classList.add("is-visible");
  stageTooltip.setAttribute("aria-hidden", "false");
});

stageCanvas.addEventListener("mouseleave", hideStageTooltip);

stageCanvas.addEventListener("click", (event) => {
  if (!state.stageChart.rects || !state.stageChart.rects.length) return;

  const rect = stageCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let hitIndex = -1;
  state.stageChart.rects.forEach((bar, index) => {
    if (
      x >= bar.x &&
      x <= bar.x + bar.width &&
      y >= bar.y &&
      y <= bar.y + bar.height
    ) {
      hitIndex = index;
    }
  });

  if (hitIndex === -1) return;

  const stageKey = state.stageChart.labels[hitIndex];
  state.stageKey = state.stageKey === stageKey ? null : stageKey;
  applyFilters();
});

function hideWalkInTooltip() {
  walkInTooltip.classList.remove("is-visible");
  walkInTooltip.setAttribute("aria-hidden", "true");
}

walkInCanvas.addEventListener("mousemove", (event) => {
  if (!state.walkInChart.rects || !state.walkInChart.rects.length) {
    hideWalkInTooltip();
    return;
  }

  const rect = walkInCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let hitIndex = -1;
  state.walkInChart.rects.forEach((bar, index) => {
    if (
      x >= bar.x &&
      x <= bar.x + bar.width &&
      y >= bar.y &&
      y <= bar.y + bar.height
    ) {
      hitIndex = index;
    }
  });

  if (hitIndex === -1) {
    hideWalkInTooltip();
    return;
  }

  const label = state.walkInChart.labels[hitIndex];
  const value = state.walkInChart.values[hitIndex];
  const assisted = state.walkInChart.assistedTotals[hitIndex];
  const suffix = value === 1 ? "opp" : "opps";
  walkInTooltip.textContent = `${label}: ${numberFormatter.format(value)} ${suffix} · ${currencyFormatter.format(assisted)} iARR`;

  const cardRect = walkInCanvas.parentElement.getBoundingClientRect();
  const tooltipWidth = walkInTooltip.offsetWidth || 0;
  const tooltipHeight = walkInTooltip.offsetHeight || 0;
  const padding = 12;
  const maxLeft = cardRect.width - tooltipWidth - padding;
  const maxTop = cardRect.height - tooltipHeight - padding;
  const rawLeft = event.clientX - cardRect.left + padding;
  const rawTop = event.clientY - cardRect.top - padding;
  const clampedLeft = Math.max(padding, Math.min(rawLeft, maxLeft));
  const clampedTop = Math.max(padding, Math.min(rawTop, maxTop));

  walkInTooltip.style.left = `${clampedLeft}px`;
  walkInTooltip.style.top = `${clampedTop}px`;
  walkInTooltip.classList.add("is-visible");
  walkInTooltip.setAttribute("aria-hidden", "false");
});

walkInCanvas.addEventListener("mouseleave", hideWalkInTooltip);

walkInCanvas.addEventListener("click", (event) => {
  if (!state.walkInChart.rects || !state.walkInChart.rects.length) return;

  const rect = walkInCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let hitIndex = -1;
  state.walkInChart.rects.forEach((bar, index) => {
    if (
      x >= bar.x &&
      x <= bar.x + bar.width &&
      y >= bar.y &&
      y <= bar.y + bar.height
    ) {
      hitIndex = index;
    }
  });

  if (hitIndex === -1) return;

  const monthKey = state.walkInChart.monthKeys[hitIndex];
  state.createdMonthKey = state.createdMonthKey === monthKey ? null : monthKey;
  applyFilters();
});

judgmentCanvas.addEventListener("click", (event) => {
  if (!state.judgmentChart.rects || !state.judgmentChart.rects.length) return;

  const rect = judgmentCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let hitIndex = -1;
  state.judgmentChart.rects.forEach((bar, index) => {
    if (
      x >= bar.x &&
      x <= bar.x + bar.width &&
      y >= bar.y &&
      y <= bar.y + bar.height
    ) {
      hitIndex = index;
    }
  });

  if (hitIndex === -1) return;

  const judgmentKey = state.judgmentChart.labels[hitIndex];
  state.judgmentKey = state.judgmentKey === judgmentKey ? null : judgmentKey;
  applyFilters();
});
