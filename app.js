const products = [
  {
    id: 1,
    name: "Original Buns",
    bunsPerBag: 12,
    orderIncrement: 5,
  },
  {
    id: 2,
    name: "Hot Dog Buns",
    bunsPerBag: 6,
    orderIncrement: 9,
  },
  {
    id: 3,
    name: "Junior Buns",
    bunsPerBag: 8,
    orderIncrement: 9,
  },
];

const storageKey = "bun-count-inventory";
const orderHistoryKey = "bun-count-orders";

const selectors = {
  productCards: document.getElementById("productCards"),
  entryProduct: document.getElementById("entryProduct"),
  entryDate: document.getElementById("entryDate"),
  entryEodc: document.getElementById("entryEodc"),
  entryRp: document.getElementById("entryRp"),
  entrySummary: document.getElementById("entrySummary"),
  dailyEntryForm: document.getElementById("dailyEntryForm"),
  inventoryTable: document.getElementById("inventoryTable"),
  viewStartDate: document.getElementById("viewStartDate"),
  orderForm: document.getElementById("orderForm"),
  orderDate: document.getElementById("orderDate"),
  orderSummary: document.getElementById("orderSummary"),
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

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const getDayName = (value) => dayNames[new Date(value).getDay()];

const getProductById = (id) => products.find((product) => product.id === id);

const clampToIncrement = (value, increment) =>
  Math.max(0, Math.round(value / increment) * increment);

const findInventoryRecord = (productId, date) =>
  state.inventory.find(
    (record) => record.productId === productId && record.date === date
  );

const getYesterdayEodc = (productId, date) => {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  const record = findInventoryRecord(productId, toISO(previous));
  return record ? record.pdcBags : 0;
};

const computeForecast = (productId, date) => {
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

const upsertInventory = (productId, date, pdcBags, rpBags) => {
  const mcBags = getYesterdayEodc(productId, date);
  const istBags = mcBags + rpBags;
  const usedBags = istBags - pdcBags;
  const fcBags = computeForecast(productId, date);

  const record = {
    productId,
    date,
    pdcBags,
    rpBags,
    mcBags,
    istBags,
    usedBags,
    fcBags,
  };

  const existingIndex = state.inventory.findIndex(
    (entry) => entry.productId === productId && entry.date === date
  );

  if (existingIndex >= 0) {
    state.inventory[existingIndex] = record;
  } else {
    state.inventory.push(record);
  }

  storage.saveInventory(state.inventory);
  return record;
};

const refreshInventoryTable = () => {
  const startDate = selectors.viewStartDate.value
    ? fromISO(selectors.viewStartDate.value)
    : new Date();
  const rows = [];

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + offset);
    const dateISO = toISO(date);

    products.forEach((product) => {
      const record = findInventoryRecord(product.id, dateISO);
      rows.push({
        date: dateISO,
        productName: product.name,
        mcBags: record ? record.mcBags : "—",
        rpBags: record ? record.rpBags : "—",
        istBags: record ? record.istBags : "—",
        pdcBags: record ? record.pdcBags : "—",
        usedBags: record ? record.usedBags : "—",
        fcBags: record ? record.fcBags : computeForecast(product.id, dateISO),
      });
    });
  }

  selectors.inventoryTable.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${formatDate(row.date)}</td>
          <td>${row.productName}</td>
          <td>${row.mcBags}</td>
          <td>${row.rpBags}</td>
          <td>${row.istBags}</td>
          <td>${row.pdcBags}</td>
          <td>${row.usedBags}</td>
          <td>${row.fcBags}</td>
        </tr>
      `
    )
    .join("");
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

const calculateOrderForProduct = (product, orderDateISO) => {
  const deliveryInfo = getDeliveryDate(orderDateISO);
  if (!deliveryInfo) {
    return null;
  }

  const istRecord = findInventoryRecord(product.id, orderDateISO);
  const startingIST = istRecord ? istRecord.istBags : 0;

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
    (sum, date) => sum + computeForecast(product.id, date),
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

const renderProducts = () => {
  selectors.productCards.innerHTML = products
    .map(
      (product) => `
        <div class="product-card">
          <strong>${product.name}</strong>
          <span>Buns per bag: ${product.bunsPerBag}</span>
          <span>Order increment: ${product.orderIncrement} bags</span>
        </div>
      `
    )
    .join("");

  selectors.entryProduct.innerHTML = products
    .map(
      (product) => `<option value="${product.id}">${product.name}</option>`
    )
    .join("");
};

const handleEntrySubmit = (event) => {
  event.preventDefault();
  const productId = Number(selectors.entryProduct.value);
  const date = selectors.entryDate.value;
  const pdcBags = Number(selectors.entryEodc.value);
  const rpBags = Number(selectors.entryRp.value || 0);

  if (!date) {
    selectors.entrySummary.textContent = "Please select a date.";
    return;
  }

  const record = upsertInventory(productId, date, pdcBags, rpBags);
  const product = getProductById(productId);

  selectors.entrySummary.innerHTML = `
    <strong>${product.name}</strong> — ${formatDate(record.date)}<br />
    MC: ${record.mcBags} bags · RP: ${record.rpBags} bags · IST: ${record.istBags} bags<br />
    EODC: ${record.pdcBags} bags · Used: ${record.usedBags} bags · FC: ${record.fcBags} bags
  `;
  refreshInventoryTable();
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
  const todayISO = toISO(new Date());
  selectors.entryDate.value = todayISO;
  selectors.orderDate.value = todayISO;
  selectors.viewStartDate.value = todayISO;
};

selectors.dailyEntryForm.addEventListener("submit", handleEntrySubmit);
selectors.orderForm.addEventListener("submit", handleOrderSubmit);
selectors.viewStartDate.addEventListener("change", refreshInventoryTable);

renderProducts();
initializeDates();
refreshInventoryTable();
