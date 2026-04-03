const authSection = document.getElementById("auth-section")
const orderSection = document.getElementById("order-section")
const loadingEl = document.getElementById("loading")
const statusEl = document.getElementById("status-message")
const signInForm = document.getElementById("sign-in-form")
const emailInput = document.getElementById("email-input")
const passwordInput = document.getElementById("password-input")
const signInButton = document.getElementById("sign-in-button")
const signOutButton = document.getElementById("sign-out-button")
const orderForm = document.getElementById("order-form")
const phoneInput = document.getElementById("phone-input")
const cashAvailableInput = document.getElementById("cash-available-input")
const itemSelect = document.getElementById("item-select")
const variantSelect = document.getElementById("variant-select")
const notesInput = document.getElementById("notes-input")
const submitOrderButton = document.getElementById("submit-order-button")
const ordersListEl = document.getElementById("orders-list")
const ordersCountEl = document.getElementById("orders-count")
const userNameEl = document.getElementById("user-name")
const userEmailEl = document.getElementById("user-email")
const windowBadgeEl = document.getElementById("window-badge")

let supabaseClient
let activeUser
let currentOrder
let menuItems = []
let teamOrders = []
let timeframe = { startTime: "09:00", endTime: "12:30", dayOfWeek: 5 }
let windowInterval

const DEFAULT_START = "09:00"
const DEFAULT_END = "12:30"
const DEFAULT_DAY = 5

function formatPrice(priceAll) {
  if (typeof priceAll !== "number" || Number.isNaN(priceAll) || priceAll <= 0) return ""
  return ` - ALL ${priceAll}`
}

function getMenuPrice(itemName, variantName) {
  const match = menuItems.find((entry) => entry.item === itemName && entry.variant === variantName)
  return match?.price_all
}

function log(...args) {
  if (typeof DEBUG_LOGGING !== "undefined" && DEBUG_LOGGING) {
    console.log("[Tony Extension]", ...args)
  }
}

function getWeekdayLabel(dayOfWeek) {
  const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  return labels[dayOfWeek] || labels[DEFAULT_DAY]
}

function getNextDateForDay(dayOfWeek) {
  const now = new Date()
  const day = now.getDay()
  const add = (dayOfWeek - day + 7) % 7
  const target = new Date(now)
  target.setDate(now.getDate() + add)
  target.setHours(0, 0, 0, 0)
  return target
}

function setLoading(isLoading, message = "Loading...") {
  if (isLoading) {
    loadingEl.classList.remove("hidden")
    loadingEl.textContent = message
  } else {
    loadingEl.classList.add("hidden")
  }
}

function showStatus(message, type = "error", timeout = 5000) {
  statusEl.textContent = message
  statusEl.classList.remove("hidden", "success", "error")
  statusEl.classList.add(type === "success" ? "success" : "error")
  if (timeout) {
    setTimeout(() => statusEl.classList.add("hidden"), timeout)
  }
}

function hideStatus() {
  statusEl.classList.add("hidden")
}

function showAuth() {
  authSection.classList.remove("hidden")
  orderSection.classList.add("hidden")
}

function showOrder() {
  authSection.classList.add("hidden")
  orderSection.classList.remove("hidden")
}

function ensureConfig() {
  if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
    showStatus("Missing Supabase configuration. Update config.js.")
    throw new Error("Missing Supabase configuration")
  }
  if (SUPABASE_URL.includes("YOUR-PROJECT") || SUPABASE_ANON_KEY.includes("YOUR_PUBLIC")) {
    showStatus("Fill in your Supabase URL and anon key in config.js.")
    throw new Error("Supabase config placeholders in use")
  }
}

async function init() {
  try {
    ensureConfig()
  } catch (err) {
    console.error(err)
    setLoading(false)
    return
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "tonys-orders-extension"
    }
  })

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    log("Auth state changed", _event)
    if (session?.user) {
      void handleSignedIn(session.user)
    } else {
      handleSignedOut()
    }
  })

  const {
    data: { session }
  } = await supabaseClient.auth.getSession()

  if (session?.user) {
    await handleSignedIn(session.user)
  } else {
    handleSignedOut()
  }
}

function handleSignedOut() {
  clearInterval(windowInterval)
  windowInterval = undefined
  activeUser = undefined
  currentOrder = undefined
  menuItems = []
  teamOrders = []
  emailInput.value = ""
  passwordInput.value = ""
  phoneInput.value = ""
  cashAvailableInput.value = ""
  notesInput.value = ""
  hideStatus()
  showAuth()
  setLoading(false)
}

async function handleSignedIn(user) {
  activeUser = user
  hideStatus()
  showOrder()
  await refreshAllData()
}

function getCurrentFriday() {
  const dayOfWeek =
    typeof timeframe.dayOfWeek === "number" && timeframe.dayOfWeek >= 0 && timeframe.dayOfWeek <= 6
      ? timeframe.dayOfWeek
      : DEFAULT_DAY
  return getNextDateForDay(dayOfWeek)
}

function formatFridayDate(date) {
  return date.toISOString().split("T")[0]
}

async function getOrderingTimeframe() {
  try {
    const { data, error } = await supabaseClient
      .from("settings")
      .select("key, value")
      .in("key", ["ordering_start_time", "ordering_end_time", "ordering_day_of_week"])

    if (error) throw error
    const map = Object.fromEntries((data || []).map((entry) => [entry.key, entry.value]))
    const parsedDay = Number(map.ordering_day_of_week)
    const dayOfWeek = Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay <= 6 ? parsedDay : DEFAULT_DAY
    return {
      startTime: map.ordering_start_time || DEFAULT_START,
      endTime: map.ordering_end_time || DEFAULT_END,
      dayOfWeek
    }
  } catch (err) {
    log("Falling back to defaults", err)
    return { startTime: DEFAULT_START, endTime: DEFAULT_END, dayOfWeek: DEFAULT_DAY }
  }
}

async function isOrderingWindowOpen() {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))
  const targetDay =
    typeof timeframe.dayOfWeek === "number" && timeframe.dayOfWeek >= 0 && timeframe.dayOfWeek <= 6
      ? timeframe.dayOfWeek
      : DEFAULT_DAY
  if (tiranaNow.getDay() !== targetDay) return false

  const [sh, sm] = timeframe.startTime.split(":").map(Number)
  const [eh, em] = timeframe.endTime.split(":").map(Number)
  const currentMinutes = tiranaNow.getHours() * 60 + tiranaNow.getMinutes()
  return currentMinutes >= sh * 60 + sm && currentMinutes <= eh * 60 + em
}

function diffUntilNextWindow() {
  const now = new Date()
  const tiranaNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Tirane" }))
  const [sh, sm] = timeframe.startTime.split(":").map(Number)

  const next = new Date(tiranaNow)
  const day = tiranaNow.getDay()
  const targetDay =
    typeof timeframe.dayOfWeek === "number" && timeframe.dayOfWeek >= 0 && timeframe.dayOfWeek <= 6
      ? timeframe.dayOfWeek
      : DEFAULT_DAY
  const current = tiranaNow.getHours() * 60 + tiranaNow.getMinutes()
  const startMinutes = sh * 60 + sm

  if (day === targetDay && current < startMinutes) {
    next.setHours(sh, sm, 0, 0)
  } else {
    const add = (targetDay - day + 7) % 7 || 7
    next.setDate(tiranaNow.getDate() + add)
    next.setHours(sh, sm, 0, 0)
  }

  const diffMs = next.getTime() - tiranaNow.getTime()
  const days = Math.floor(diffMs / 86_400_000)
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
  return { days, hours, minutes }
}

function updateWindowBadge(canOrder) {
  if (!windowBadgeEl) return
  const countdown = diffUntilNextWindow()
  windowBadgeEl.className = "window-badge " + (canOrder ? "window-open" : "window-closed")
  const dayLabel =
    typeof timeframe.dayOfWeek === "number" && timeframe.dayOfWeek >= 0 && timeframe.dayOfWeek <= 6
      ? getWeekdayLabel(timeframe.dayOfWeek)
      : getWeekdayLabel(DEFAULT_DAY)
  if (canOrder) {
    windowBadgeEl.textContent = `Ordering window open until ${timeframe.endTime} ${dayLabel} (Tirane)`
  } else {
    const parts = []
    if (countdown.days) parts.push(`${countdown.days}d`)
    if (countdown.hours) parts.push(`${countdown.hours}h`)
    parts.push(`${countdown.minutes}m`)
    windowBadgeEl.textContent = `Window closed - opens in ${parts.join(" ")}`
  }
}

async function refreshAllData() {
  if (!activeUser) return
  setLoading(true)
  try {
    timeframe = await getOrderingTimeframe()
    await Promise.all([loadProfile(), loadMenu(), loadOrders()])
    synchronizeMenu()
    refreshForm()
    scheduleWindowRefresh()
    hideStatus()
  } catch (err) {
    console.error(err)
    showStatus(err.message || "Failed to load data")
  } finally {
    setLoading(false)
  }
}

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("users")
    .select("id, name, email, phone")
    .eq("id", activeUser.id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Profile not found")
  userNameEl.textContent = data.name
  userEmailEl.textContent = data.email
  phoneInput.value = data.phone || ""
}

async function loadMenu() {
  const { data, error } = await supabaseClient
    .from("menu_items")
    .select("*")
    .eq("active", true)
    .order("item", { ascending: true })
    .order("variant", { ascending: true })

  if (error) throw error
  menuItems = data || []
}

async function loadOrders() {
  const fridayDate = formatFridayDate(getCurrentFriday())

  const [{ data: orderData, error: orderError }, { data: teamData, error: teamError }] = await Promise.all([
    supabaseClient
      .from("orders")
      .select("id, item, variant, notes, cash_available_all, locked, friday_date")
      .eq("user_id", activeUser.id)
      .eq("friday_date", fridayDate)
      .maybeSingle(),
    supabaseClient
      .from("orders")
      .select("id, item, variant, notes, cash_available_all, locked, user:users(name)")
      .eq("friday_date", fridayDate)
      .order("created_at", { ascending: true })
  ])

  if (orderError) throw orderError
  if (teamError) throw teamError
  currentOrder = orderData || null
  teamOrders = teamData || []
  updateSummary()
}

function synchronizeMenu() {
  populateItems()
  populateVariants()
  notesInput.value = currentOrder?.notes || ""
  cashAvailableInput.value = currentOrder?.cash_available_all > 0 ? String(currentOrder.cash_available_all) : ""
}

function populateItems() {
  itemSelect.innerHTML = ""
  const uniqueItems = [...new Set(menuItems.map((item) => item.item))]
  uniqueItems.forEach((item) => {
    const option = document.createElement("option")
    option.value = item
    option.textContent = item
    itemSelect.appendChild(option)
  })

  if (currentOrder?.item && uniqueItems.includes(currentOrder.item)) {
    itemSelect.value = currentOrder.item
  } else if (uniqueItems.length) {
    itemSelect.value = uniqueItems[0]
  }
}

function populateVariants() {
  variantSelect.innerHTML = ""
  const currentItem = itemSelect.value
  if (!currentItem) return
  const variants = menuItems.filter((entry) => entry.item === currentItem)
  variants.forEach((entry) => {
    const option = document.createElement("option")
    option.value = entry.variant
    option.textContent = `${entry.variant || "Standard"}${formatPrice(entry.price_all)}`
    variantSelect.appendChild(option)
  })

  if (currentOrder?.variant && variants.some((v) => v.variant === currentOrder.variant)) {
    variantSelect.value = currentOrder.variant
  } else if (variants.length) {
    variantSelect.value = variants[0].variant
  }
}

function refreshForm() {
  if (!currentOrder) {
    submitOrderButton.textContent = "Place Order"
  } else {
    submitOrderButton.textContent = currentOrder.locked ? "Orders Locked" : "Update Order"
  }

  ;(async () => {
    const canOrder = await isOrderingWindowOpen()
    const locked = Boolean(currentOrder?.locked)
    const disabled = !canOrder || locked
    submitOrderButton.disabled = disabled
    itemSelect.disabled = disabled
    variantSelect.disabled = disabled
    notesInput.disabled = disabled
    cashAvailableInput.disabled = disabled
    if (locked) {
      showStatus("Orders are locked for this week.", "error", 4000)
    }
    updateWindowBadge(canOrder)
  })()
}

function updateSummary() {
  if (!teamOrders.length) {
    ordersCountEl.textContent = "No orders yet."
    ordersListEl.innerHTML = ""
    return
  }
  const weekdayLabel =
    typeof timeframe.dayOfWeek === "number" && timeframe.dayOfWeek >= 0 && timeframe.dayOfWeek <= 6
      ? getWeekdayLabel(timeframe.dayOfWeek)
      : getWeekdayLabel(DEFAULT_DAY)
  ordersCountEl.textContent = `${teamOrders.length} orders placed this ${weekdayLabel}.`
  ordersListEl.innerHTML = ""
  teamOrders.forEach((order) => {
    const li = document.createElement("li")
    const name = order.user?.name || "Unknown"
    const cashLabel =
      typeof order.cash_available_all === "number" && order.cash_available_all > 0
        ? ` | Cash ALL ${order.cash_available_all}`
        : ""
    li.textContent = `${name}: ${order.item}${order.variant ? ` (${order.variant})` : ""}${formatPrice(
      getMenuPrice(order.item, order.variant)
    )}${cashLabel}`
    ordersListEl.appendChild(li)
  })
}

function scheduleWindowRefresh() {
  if (windowInterval) return
  windowInterval = setInterval(async () => {
    const canOrder = await isOrderingWindowOpen()
    updateWindowBadge(canOrder)
    const locked = Boolean(currentOrder?.locked)
    const disabled = !canOrder || locked
    submitOrderButton.disabled = disabled
  }, 60_000)
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  hideStatus()
  signInButton.disabled = true
  setLoading(true, "Signing in...")
  try {
    const email = emailInput.value.trim()
    const password = passwordInput.value
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password })
    if (error) throw error
    showStatus("Signed in successfully", "success", 2500)
  } catch (err) {
    console.error(err)
    showStatus(err.message || "Unable to sign in")
  } finally {
    signInButton.disabled = false
    setLoading(false)
  }
})

signOutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut()
  showStatus("Signed out", "success", 2000)
})

itemSelect.addEventListener("change", () => {
  populateVariants()
})

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  hideStatus()
  submitOrderButton.disabled = true
  setLoading(true, "Saving order...")
  try {
    const canOrder = await isOrderingWindowOpen()
    if (!canOrder) throw new Error("Ordering window is closed.")
    if (currentOrder?.locked) throw new Error("Orders are locked by admin.")

    const item = itemSelect.value
    const variant = variantSelect.value
    const notes = notesInput.value.trim()
    const cashAvailableValue = cashAvailableInput.value.trim()
    const cashAvailableAll = cashAvailableValue === "" ? 0 : Number(cashAvailableValue)
    if (!item || !variant) throw new Error("Pick a menu item and variant.")
    if (notes.length > 100) throw new Error("Notes must be 100 characters or fewer.")
    if (!Number.isInteger(cashAvailableAll) || cashAvailableAll < 0) {
      throw new Error("Cash today must be a whole number or left blank.")
    }

    const fridayDate = formatFridayDate(getCurrentFriday())
    const payload = {
      user_id: activeUser.id,
      friday_date: fridayDate,
      item,
      variant,
      notes: notes || null,
      cash_available_all: cashAvailableAll
    }

    if (currentOrder) {
      const { error } = await supabaseClient.from("orders").update(payload).eq("id", currentOrder.id)
      if (error) throw error
      await supabaseClient.from("events").insert({
        type: "order_updated",
        user_id: activeUser.id,
        payload: { order_id: currentOrder.id, ...payload }
      })
    } else {
      const { data, error } = await supabaseClient
        .from("orders")
        .insert(payload)
        .select("id")
        .single()
      if (error) throw error
      currentOrder = { ...payload, id: data.id, locked: false }
      await supabaseClient.from("events").insert({
        type: "order_created",
        user_id: activeUser.id,
        payload
      })
    }

    const phone = phoneInput.value.trim()
    const { error: phoneError } = await supabaseClient
      .from("users")
      .update({ phone: phone || null })
      .eq("id", activeUser.id)
    if (phoneError) throw phoneError

    showStatus("Order saved!", "success", 2500)
    await loadOrders()
    synchronizeMenu()
    refreshForm()
  } catch (err) {
    console.error(err)
    showStatus(err.message || "Unable to save order")
  } finally {
    submitOrderButton.disabled = false
    setLoading(false)
  }
})

init().catch((err) => {
  console.error("Failed to initialize extension", err)
  showStatus(err.message || "Failed to initialize extension")
  setLoading(false)
})
