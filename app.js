const products = [
  {
    id: 1,
    name: "Original Bun",
    bunsPerBag: 12,
    orderIncrement: 5,
  },
  {
    id: 2,
    name: "Hot Dog Bun",
    bunsPerBag: 6,
    orderIncrement: 9,
  },
  {
    id: 3,
    name: "Junior Bun",
    bunsPerBag: 8,
    orderIncrement: 9,
  },
];

const storageKey = "bun-count-inventory";
const orderHistoryKey = "bun-count-orders";

const selectors = {
  weeklySheet: document.getElementById("weeklySheet"),
  forecastSheet: document.getElementById("forecastSheet"),
  weekStartDate: document.getElementById("weekStartDate"),
  forecastStartDate: document.getElementById("forecastStartDate"),
  orderForm: document.getElementById("orderForm"),
  orderDate: document.getElementById("orderDate"),
  orderSummary: document.getElementById("orderSummary"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll("[data-tab-panel]"),
};

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const shortDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const orderToDelivery = {
  Monday: 3,
  Tuesday: 3,
  Wednesday: 3,
  Thursday: 4,
  Friday: 4,
};

const coverageLength = {
  Monday: 4,
  Tuesday: 4,
  Wednesday: 5,
  Thursday: 5,
  Friday: 6,
};

const deliveryOverrides = {
  Monday: "Thursday",
  Tuesday: "Friday",
  Wednesday: "Saturday",
  Thursday: "Monday",
  Friday: "Tuesday",
};

const storage = {
  loadInventory() {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  },
  saveInventory(data) {
    localStorage.setItem(storageKey, JSON.stringify(data));
  },
  loadOrders() {
    const raw = localStorage.getItem(orderHistoryKey);
    return raw ? JSON.parse(raw) : [];
  },
  saveOrders(data) {
    localStorage.setItem(orderHistoryKey, JSON.stringify(data));
  },
};

const state = {
  inventory: storage.loadInventory(),
  orders: storage.loadOrders(),
};

const toISO = (date) => date.toISOString().slice(0, 10);
const fromISO = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getDayName = (value) => dayNames[new Date(value).getDay()];
const getShortDayName = (value) => shortDayNames[new Date(value).getDay()];

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const getWeekStart = (date = new Date()) => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday;
};

const getDatesBetween = (startDateISO, length) => {
  const start = fromISO(startDateISO);
  return Array.from({ length }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toISO(date);
  });
};

const findInventoryRecord = (productId, date) =>
  state.inventory.find(
    (record) => record.productId === productId && record.date === date
  );

const upsertInventory = (productId, date, updates) => {
  const existing = findInventoryRecord(productId, date) || {
    productId,
    date,
  };
  const merged = {
    ...existing,
    ...updates,
  };

  const rpBags = merged.rpBags ?? 0;
  const pdcBags = merged.pdcBags;
  if (pdcBags !== null && pdcBags !== undefined) {
    const mcBags = getYesterdayEodc(productId, date);
    merged.usedBags = mcBags + rpBags - pdcBags;
  }

  const existingIndex = state.inventory.findIndex(
    (entry) => entry.productId === productId && entry.date === date
  );

  if (existingIndex >= 0) {
    state.inventory[existingIndex] = merged;
  } else {
    state.inventory.push(merged);
  }

  storage.saveInventory(state.inventory);
};

const getYesterdayEodc = (productId, date) => {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  const record = findInventoryRecord(productId, toISO(previous));
  return record?.pdcBags ?? 0;
};

const computeForecastAverage = (productId, date) => {
  const targetDay = getDayName(date);
  const history = state.inventory
    .filter((record) => record.productId === productId)
    .filter((record) => getDayName(record.date) === targetDay)
    .filter((record) => record.usedBags !== null && record.usedBags !== undefined)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);

  if (!history.length) {
    return 0;
  }

  const sum = history.reduce((total, record) => total + record.usedBags, 0);
  return Math.round(sum / history.length);
};

const getForecast = (productId, date) => {
  const record = findInventoryRecord(productId, date);
  if (record?.fcBags !== undefined && record?.fcBags !== null) {
    return record.fcBags;
  }
  return computeForecastAverage(productId, date);
};

const displayValue = (value) => (value === null || value === undefined ? "—" : value);

const buildHeaderRow = (dates) => `
  <tr>
    <th class="section-header">&nbsp;</th>
    ${dates
      .map(
        (date) => `
          <th>
            ${getShortDayName(date)}<br />
            <span class="muted">${formatDate(date)}</span>
          </th>
        `
      )
      .join("")}
  </tr>
`;

const buildRow = ({ label, dates, renderCell }) => `
  <tr>
    <td class="row-header">${label}</td>
    ${dates.map((date) => renderCell(date)).join("")}
  </tr>
`;

const renderWeeklySheet = () => {
  const startDateISO = selectors.weekStartDate.value;
  if (!startDateISO) {
    return;
  }
  const dates = getDatesBetween(startDateISO, 7);

  const tableRows = products
    .map((product) => {
      const header = `
        <tr>
          <th class="section-header">${product.name}</th>
          ${dates
            .map((date) => `<th>${getShortDayName(date)}</th>`)
            .join("")}
        </tr>
      `;

      const rows = [
        buildRow({
          label: "Morning Count",
          dates,
          renderCell: (date) => {
            const mc = getYesterdayEodc(product.id, date);
            return `<td>${displayValue(mc)}</td>`;
          },
        }),
        buildRow({
          label: "Received",
          dates,
          renderCell: (date) => {
            const record = findInventoryRecord(product.id, date);
            const rpValue = record?.rpBags ?? "";
            return `
              <td>
                <input
                  type="number"
                  min="0"
                  step="1"
                  data-field="rpBags"
                  data-product="${product.id}"
                  data-date="${date}"
                  value="${rpValue}"
                />
              </td>
            `;
          },
        }),
        buildRow({
          label: "Total (IST)",
          dates,
          renderCell: (date) => {
            const record = findInventoryRecord(product.id, date);
            const rp = record?.rpBags ?? 0;
            const mc = getYesterdayEodc(product.id, date);
            return `<td>${displayValue(mc + rp)}</td>`;
          },
        }),
        buildRow({
          label: "Night Count (EODC)",
          dates,
          renderCell: (date) => {
            const record = findInventoryRecord(product.id, date);
            const pdcValue = record?.pdcBags ?? "";
            return `
              <td>
                <input
                  type="number"
                  min="0"
                  step="1"
                  data-field="pdcBags"
                  data-product="${product.id}"
                  data-date="${date}"
                  value="${pdcValue}"
                />
              </td>
            `;
          },
        }),
        buildRow({
          label: "Used",
          dates,
          renderCell: (date) => {
            const record = findInventoryRecord(product.id, date);
            const rp = record?.rpBags ?? 0;
            const mc = getYesterdayEodc(product.id, date);
            const pdc = record?.pdcBags;
            if (pdc === null || pdc === undefined) {
              return `<td>—</td>`;
            }
            return `<td>${mc + rp - pdc}</td>`;
          },
        }),
        buildRow({
          label: "RMS Forecast (FC)",
          dates,
          renderCell: (date) => `<td>${displayValue(getForecast(product.id, date))}</td>`,
        }),
      ];

      return `${header}${rows.join("")}`;
    })
    .join("");

  selectors.weeklySheet.innerHTML = `
    <table class="sheet-table">
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
};

const renderForecastSheet = () => {
  const startDateISO = selectors.forecastStartDate.value;
  if (!startDateISO) {
    return;
  }
  const dates = getDatesBetween(startDateISO, 14);

  const rows = products
    .map((product) => {
      const headerRow = `
        <tr>
          <th class="section-header">${product.name}</th>
          ${dates
            .map(
              (date) => `
                <th>
                  ${getShortDayName(date)}<br />
                  <span class="muted">${formatDate(date)}</span>
                </th>
              `
            )
            .join("")}
        </tr>
      `;

      const rpRow = buildRow({
        label: "Received (RP)",
        dates,
        renderCell: (date) => {
          const record = findInventoryRecord(product.id, date);
          const rpValue = record?.rpBags ?? "";
          return `
            <td>
              <input
                type="number"
                min="0"
                step="1"
                data-field="rpBags"
                data-product="${product.id}"
                data-date="${date}"
                value="${rpValue}"
              />
            </td>
          `;
        },
      });

      const fcRow = buildRow({
        label: "Forecast (FC)",
        dates,
        renderCell: (date) => {
          const record = findInventoryRecord(product.id, date);
          const fcValue = record?.fcBags ?? "";
          return `
            <td>
              <input
                type="number"
                min="0"
                step="1"
                data-field="fcBags"
                data-product="${product.id}"
                data-date="${date}"
                value="${fcValue}"
              />
            </td>
          `;
        },
      });

      return `${headerRow}${rpRow}${fcRow}`;
    })
    .join("");

  selectors.forecastSheet.innerHTML = `
    <table class="sheet-table">
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

const handleSheetInput = (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const { field, product, date } = target.dataset;
  if (!field || !product || !date) {
    return;
  }
  const value = target.value === "" ? null : Number(target.value);
  upsertInventory(Number(product), date, { [field]: value });
  renderWeeklySheet();
};

const getCoverageDays = (orderDateISO) => {
  const orderDayName = getDayName(orderDateISO);
  const days = [];
  const totalDays = coverageLength[orderDayName];
  if (!totalDays) {
    return days;
  }

  const startDate = fromISO(orderDateISO);
  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + offset);
    days.push(toISO(date));
  }
  return days;
};

const getDeliveryDate = (orderDateISO) => {
  const orderDayName = getDayName(orderDateISO);
  const deliveryDay = deliveryOverrides[orderDayName];
  if (!deliveryDay) {
    return null;
  }

  const orderDate = fromISO(orderDateISO);
  const delivery = new Date(orderDate);
  delivery.setDate(orderDate.getDate() + orderToDelivery[orderDayName]);
  return { deliveryDate: toISO(delivery), deliveryDay };
};

const clampToIncrement = (value, increment) =>
  Math.max(0, Math.round(value / increment) * increment);

const calculateOrderForProduct = (product, orderDateISO) => {
  const deliveryInfo = getDeliveryDate(orderDateISO);
  if (!deliveryInfo) {
    return null;
  }

  const istRecord = findInventoryRecord(product.id, orderDateISO);
  const startingIST =
    (getYesterdayEodc(product.id, orderDateISO) || 0) +
    (istRecord?.rpBags ?? 0);

  const deliveryDateISO = deliveryInfo.deliveryDate;
  let rpTotal = 0;
  const cursor = fromISO(orderDateISO);
  const endDate = fromISO(deliveryDateISO);

  while (cursor < endDate) {
    const cursorISO = toISO(cursor);
    const record = findInventoryRecord(product.id, cursorISO);
    if (record) {
      rpTotal += record.rpBags || 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const coverageDays = getCoverageDays(orderDateISO);
  const totalForecast = coverageDays.reduce(
    (sum, date) => sum + getForecast(product.id, date),
    0
  );

  const totalOnHand = startingIST + rpTotal;
  const needed = totalForecast - totalOnHand;
  const ordered = clampToIncrement(needed, product.orderIncrement);

  return {
    productName: product.name,
    increment: product.orderIncrement,
    needed: Math.max(0, needed),
    ordered,
    deliveryDate: deliveryDateISO,
  };
};

const handleOrderSubmit = (event) => {
  event.preventDefault();
  const orderDateISO = selectors.orderDate.value;
  if (!orderDateISO) {
    selectors.orderSummary.textContent = "Select a valid order date.";
    return;
  }

  const orderDay = getDayName(orderDateISO);
  if (!["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(orderDay)) {
    selectors.orderSummary.textContent =
      "Orders can only be placed Monday through Friday.";
    return;
  }

  const results = products
    .map((product) => calculateOrderForProduct(product, orderDateISO))
    .filter(Boolean);

  const deliveryDate = results[0]?.deliveryDate;

  selectors.orderSummary.innerHTML = `
    <strong>Delivery Date:</strong> ${deliveryDate ? formatDate(deliveryDate) : "N/A"}<br />
    ${results
      .map(
        (result) =>
          `<div>${result.productName}: Need ${result.needed} bags → Order <strong>${result.ordered}</strong> (increment ${result.increment})</div>`
      )
      .join("")}
  `;

  state.orders.push({
    orderDate: orderDateISO,
    deliveryDate,
    items: results,
  });
  storage.saveOrders(state.orders);
};

const initializeDates = () => {
  const monday = getWeekStart(new Date());
  const todayISO = toISO(new Date());
  selectors.weekStartDate.value = toISO(monday);
  selectors.forecastStartDate.value = toISO(monday);
  selectors.orderDate.value = todayISO;
};

const setupTabs = () => {
  selectors.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectors.tabButtons.forEach((btn) => btn.classList.remove("is-active"));
      button.classList.add("is-active");
      const target = button.dataset.tab;
      selectors.tabPanels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== target;
      });
    });
  });
};

selectors.weeklySheet.addEventListener("input", handleSheetInput);
selectors.forecastSheet.addEventListener("input", handleSheetInput);
selectors.weekStartDate.addEventListener("change", renderWeeklySheet);
selectors.forecastStartDate.addEventListener("change", renderForecastSheet);
selectors.orderForm.addEventListener("submit", handleOrderSubmit);

initializeDates();
setupTabs();
renderWeeklySheet();
renderForecastSheet();
