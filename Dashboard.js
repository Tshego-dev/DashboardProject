/* ── World Bank API config ──────────────────────────────────── */
/*
  This dashboard connects to the World Bank Open Data REST API.
  It is a free, public API — no API key or login is required.
  Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392

  URL structure:
    https://api.worldbank.org/v2/country/{COUNTRY}/indicator/{INDICATOR}

  Parameters used:
    - format=json     → returns data as JSON instead of XML
    - per_page=50     → return up to 50 records per request
    - mrv=20          → most recent 20 values only

  Country code: ZW = Zimbabwe
*/
const BASE_URL =
  "https://api.worldbank.org/v2/country/ZW/indicator/{INDICATOR}?format=json&per_page=50&mrv=20";

/*
  Indicator codes tell the API which dataset to return.
  Each code maps to a specific World Bank dataset:
    NY.GDP.MKTP.CD  → GDP in current US dollars
    SP.POP.TOTL     → Total population count
    SP.DYN.LE00.IN  → Life expectancy at birth in years
*/
const INDICATORS = {
  gdp:        "NY.GDP.MKTP.CD",   /* GDP in current USD */
  population: "SP.POP.TOTL",      /* Total population */
  lifeExp:    "SP.DYN.LE00.IN",   /* Life expectancy at birth */
};

/* ── DOM references ─────────────────────────────────────────── */
const loadingEl   = document.getElementById("loading");
const errorEl     = document.getElementById("error");
const dashboardEl = document.getElementById("dashboard");

/* Stat card value elements — filled with the latest data point */
const valGdp  = document.getElementById("valGdp");
const valPop  = document.getElementById("valPop");
const valLife = document.getElementById("valLife");

/* ── Sidebar toggle (mobile hamburger) ──────────────────────── */
/* Adds/removes .sidebar-open so the sidebar slides in on mobile */
document.getElementById("menuBtn").addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("sidebar-open");
});

/* ── State helpers ──────────────────────────────────────────── */
/* Show the error banner and hide loading */
function showError() {
  loadingEl.classList.add("hidden");
  errorEl.classList.remove("hidden");
}

/* Hide loading, reveal the full dashboard */
function showDashboard() {
  loadingEl.classList.add("hidden");
  dashboardEl.classList.remove("hidden");
}

/* Format large numbers into readable strings e.g. $21.4B, 15.3M */
function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  return n.toLocaleString();
}

/* ── Data fetching ──────────────────────────────────────────── */
/*
  fetchIndicator() is the function that makes the actual API call.

  How it works step by step:
    1. Builds the full URL by replacing {INDICATOR} with the real code
    2. Uses the browser's built-in fetch() to send an HTTP GET request
    3. Checks the HTTP status — if not 200 OK, throws an error
    4. Parses the JSON response body
    5. The World Bank always returns a 2-element array:
         json[0] = metadata (page info, total count)
         json[1] = the actual data records array
    6. Filters out years where the value is null (data not available)
    7. Sorts records oldest to newest so charts read left to right
    8. Returns a clean { years[], values[] } object for Chart.js
*/
async function fetchIndicator(indicatorCode) {
  /* Step 1: build the full API URL for this indicator */
  const url = BASE_URL.replace("{INDICATOR}", indicatorCode);

  /* Step 2: send the HTTP GET request to the World Bank API */
  const response = await fetch(url);

  /* Step 3: if the server returned an error status, stop here */
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  /* Step 4-5: parse JSON — records are in index [1] of the response array */
  const json = await response.json();
  const records = json[1];

  if (!records) {
    throw new Error("No data returned from API");
  }

  /* Step 6-7: remove nulls and sort by year ascending */
  const cleaned = records
    .filter((r) => r.value !== null)
    .sort((a, b) => a.date - b.date);

  /* Step 8: return only what Chart.js needs — labels and data points */
  return {
    years:  cleaned.map((r) => r.date),
    values: cleaned.map((r) => r.value),
  };
}

/* ── Chart rendering ────────────────────────────────────────── */
/* Creates a Chart.js chart on the given canvas id
   type: "line" or "bar"
   label: dataset legend label
   color: hex string for border/background */
function renderChart(canvasId, type, label, years, values, color) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  new Chart(ctx, {
    type,
    data: {
      labels: years,
      datasets: [
        {
          label,
          data: values,
          borderColor: color,
          /* Bar charts get a semi-transparent fill; lines get a light fill */
          backgroundColor: type === "bar" ? color + "99" : color + "22",
          borderWidth: 2,
          pointRadius: type === "line" ? 3 : 0,
          fill: type === "line",
          tension: 0.3, /* Slight curve on line charts */
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8 }, /* Avoid crowded x-axis labels */
        },
        y: {
          beginAtZero: false,
        },
      },
    },
  });
}

/* ── Main: fetch all three indicators then render charts ─────── */
async function init() {
  try {
    /*
      Promise.all() fires all three API requests at the same time.
      This means we wait ~1 request's time instead of 3x in sequence.
      If any single request fails, the whole Promise.all rejects and
      jumps to the catch block below, showing the error banner.
    */
    const [gdp, population, lifeExp] = await Promise.all([
      fetchIndicator(INDICATORS.gdp),
      fetchIndicator(INDICATORS.population),
      fetchIndicator(INDICATORS.lifeExp),
    ]);

    /* Populate stat cards with the most recent value from each dataset */
    valGdp.textContent  = "$" + formatNumber(gdp.values.at(-1));
    valPop.textContent  = formatNumber(population.values.at(-1));
    valLife.textContent = lifeExp.values.at(-1).toFixed(1) + " yrs";

    /* All fetches succeeded — reveal the dashboard */
    showDashboard();

    /* Chart 1: GDP — line chart in blue */
    renderChart(
      "gdpChart", "line",
      "GDP (Current USD)",
      gdp.years, gdp.values,
      "#1a73e8"
    );

    /* Chart 2: Population — bar chart in green */
    renderChart(
      "populationChart", "bar",
      "Population",
      population.years, population.values,
      "#34a853"
    );

    /* Chart 3: Life Expectancy — line chart in orange */
    renderChart(
      "lifeExpChart", "line",
      "Life Expectancy (Years)",
      lifeExp.years, lifeExp.values,
      "#f4a261"
    );

  } catch (error) {
    /* Any fetch or parse failure lands here — show the error banner */
    console.error("Dashboard error:", error);
    showError();
  }
}

/* ── Entry point ────────────────────────────────────────────── */
/* Wait for the DOM to be fully parsed before running */
document.addEventListener("DOMContentLoaded", init);
