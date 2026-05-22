type Habit = {
  id: string;
  name: string;
  emoji: string;
  completedDates: string[];
  checkedToday: boolean;
  streak: number;
};

type StoredHabit = Pick<Habit, "id" | "name" | "emoji" | "completedDates">;

type PremiumState = {
  trialStartTs: number | null;
  premiumUnlocked: boolean;
};

type PopupState = {
  habits: StoredHabit[];
  premium: PremiumState;
};

const STORAGE_KEY = "habit-dots:habits";
const PREMIUM_STORAGE_KEY = "habit-dots:premium";
const FREE_HABIT_LIMIT = 3;
const TRIAL_DAYS = 7;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
const STRIPE_CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_habit_dots_premium";

const app = document.querySelector<HTMLDivElement>("#app");
const appTitle = document.querySelector<HTMLHeadingElement>("#app-title");
const DATE_ROLLOVER_CHECK_MS = 60_000;

function t(messageName: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(messageName, substitutions) || messageName;
}

function getDefaultHabits(): StoredHabit[] {
  return [
    { id: "water", name: t("defaultHabitWater"), emoji: "💧", completedDates: [] },
    { id: "stretch", name: t("defaultHabitStretch"), emoji: "🧘", completedDates: [] },
    { id: "journal", name: t("defaultHabitJournal"), emoji: "✍️", completedDates: [] },
  ];
}

function cloneStoredHabits(habits: StoredHabit[]): StoredHabit[] {
  return habits.map((habit) => ({
    ...habit,
    completedDates: [...habit.completedDates],
  }));
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetDateKey(dateKey: string, offsetDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
}

function calculateStreak(completedDates: string[], todayKey = toDateKey(new Date())): number {
  const completedDateSet = new Set(completedDates);
  let currentDateKey = completedDateSet.has(todayKey) ? todayKey : offsetDateKey(todayKey, -1);
  let streak = 0;

  while (completedDateSet.has(currentDateKey)) {
    streak += 1;
    currentDateKey = offsetDateKey(currentDateKey, -1);
  }

  return streak;
}

function getMonthDateKeys(date: Date): string[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const dateKeys: string[] = [];
  const currentDate = new Date(year, month, 1);

  while (currentDate.getMonth() === month) {
    dateKeys.push(toDateKey(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dateKeys;
}

function normalizeStoredHabit(value: unknown): StoredHabit | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const habit = value as Record<string, unknown>;

  if (
    typeof habit.id !== "string" ||
    typeof habit.name !== "string" ||
    typeof habit.emoji !== "string" ||
    habit.id.trim().length === 0 ||
    habit.name.trim().length === 0 ||
    habit.emoji.trim().length === 0
  ) {
    return null;
  }

  const completedDates = Array.isArray(habit.completedDates)
    ? [...new Set(habit.completedDates.filter(isDateKey))].sort()
    : [];

  return {
    id: habit.id,
    name: habit.name,
    emoji: habit.emoji,
    completedDates,
  };
}

function toHabit(storedHabit: StoredHabit, todayKey: string): Habit {
  return {
    ...storedHabit,
    checkedToday: storedHabit.completedDates.includes(todayKey),
    streak: calculateStreak(storedHabit.completedDates, todayKey),
  };
}

function normalizeStoredHabits(value: unknown): StoredHabit[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedHabits = value
    .map(normalizeStoredHabit)
    .filter((habit): habit is StoredHabit => habit !== null);

  return normalizedHabits;
}

function normalizePremiumState(value: unknown): PremiumState {
  if (!value || typeof value !== "object") {
    return { trialStartTs: null, premiumUnlocked: false };
  }

  const premium = value as Record<string, unknown>;
  const trialStartTs =
    typeof premium.trial_start_ts === "number" && Number.isFinite(premium.trial_start_ts)
      ? premium.trial_start_ts
      : null;

  return {
    trialStartTs,
    premiumUnlocked: premium.premium_unlocked === true,
  };
}

function isTrialActive(premium: PremiumState, now = Date.now()): boolean {
  return premium.trialStartTs !== null && now - premium.trialStartTs < TRIAL_MS;
}

function getTrialDaysLeft(premium: PremiumState, now = Date.now()): number {
  if (!isTrialActive(premium, now) || premium.trialStartTs === null) {
    return 0;
  }

  return Math.max(1, Math.ceil((premium.trialStartTs + TRIAL_MS - now) / (24 * 60 * 60 * 1000)));
}

function hasPremiumAccess(premium: PremiumState): boolean {
  return premium.premiumUnlocked || isTrialActive(premium);
}

function createHabitId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `habit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadPopupState(): Promise<PopupState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY, PREMIUM_STORAGE_KEY], (result) => {
      const normalizedHabits = normalizeStoredHabits(result[STORAGE_KEY]);
      resolve({
        habits: normalizedHabits ?? cloneStoredHabits(getDefaultHabits()),
        premium: normalizePremiumState(result[PREMIUM_STORAGE_KEY]),
      });
    });
  });
}

async function restorePopupState(): Promise<PopupState> {
  const state = await loadPopupState();
  return {
    habits: cloneStoredHabits(state.habits),
    premium: state.premium,
  };
}

function saveStoredHabits(habits: StoredHabit[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: habits }, () => resolve());
  });
}

function savePremiumState(premium: PremiumState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [PREMIUM_STORAGE_KEY]: {
          trial_start_ts: premium.trialStartTs,
          premium_unlocked: premium.premiumUnlocked,
        },
      },
      () => resolve(),
    );
  });
}

function renderHabit(
  habit: Habit,
  onToggleToday: (habit: Habit) => void,
  onEdit: (habit: Habit) => void,
  onDelete: (habit: Habit) => void,
): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "habit-item";

  const icon = document.createElement("span");
  icon.className = "habit-icon";
  icon.textContent = habit.emoji;

  const name = document.createElement("span");
  name.className = "habit-name";
  name.textContent = habit.name;

  const details = document.createElement("span");
  details.className = "habit-details";
  details.textContent = t("streakCount", String(habit.streak));

  const copy = document.createElement("span");
  copy.className = "habit-copy";
  copy.append(name, details);

  const label = document.createElement("label");
  label.className = "today-check";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = habit.checkedToday;
  checkbox.addEventListener("change", () => onToggleToday(habit));

  const checkText = document.createElement("span");
  checkText.textContent = t("today");

  const actions = document.createElement("span");
  actions.className = "habit-actions";

  const editButton = document.createElement("button");
  editButton.className = "habit-action";
  editButton.type = "button";
  editButton.textContent = t("editButton");
  editButton.addEventListener("click", () => onEdit(habit));

  const deleteButton = document.createElement("button");
  deleteButton.className = "habit-action danger";
  deleteButton.type = "button";
  deleteButton.textContent = t("deleteButton");
  deleteButton.addEventListener("click", () => onDelete(habit));

  actions.append(editButton, deleteButton);
  label.append(checkbox, checkText);
  item.append(icon, copy, label, actions);

  return item;
}

function renderMonthCalendar(habits: Habit[], today: Date): HTMLElement {
  const todayKey = toDateKey(today);
  const monthDateKeys = getMonthDateKeys(today);
  const firstWeekday = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const weekdayLabels = [
    t("weekdaySun"),
    t("weekdayMon"),
    t("weekdayTue"),
    t("weekdayWed"),
    t("weekdayThu"),
    t("weekdayFri"),
    t("weekdaySat"),
  ];

  const completedByDate = new Map<string, Habit[]>();
  for (const habit of habits) {
    for (const dateKey of habit.completedDates) {
      const dateHabits = completedByDate.get(dateKey) ?? [];
      dateHabits.push(habit);
      completedByDate.set(dateKey, dateHabits);
    }
  }

  const section = document.createElement("section");
  section.className = "calendar-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = t("monthHeading", [String(today.getFullYear()), String(today.getMonth() + 1)]);

  const calendar = document.createElement("div");
  calendar.className = "month-calendar";
  calendar.setAttribute("role", "grid");
  calendar.setAttribute("aria-label", t("monthCalendarAria"));

  for (const label of weekdayLabels) {
    const weekday = document.createElement("span");
    weekday.className = "calendar-weekday";
    weekday.textContent = label;
    calendar.append(weekday);
  }

  for (let index = 0; index < firstWeekday; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day is-spacer";
    spacer.setAttribute("aria-hidden", "true");
    calendar.append(spacer);
  }

  for (const dateKey of monthDateKeys) {
    const completedHabits = completedByDate.get(dateKey) ?? [];
    const day = document.createElement("span");
    day.className = "calendar-day";
    day.setAttribute("role", "gridcell");
    day.setAttribute(
      "aria-label",
      t("calendarDayAria", [
        dateKey,
        completedHabits.length > 0 ? completedHabits.map((habit) => habit.name).join(t("listSeparator")) : t("noCompletions"),
      ]),
    );

    if (dateKey === todayKey) {
      day.classList.add("is-today");
    }

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(Number(dateKey.slice(-2)));

    const dots = document.createElement("span");
    dots.className = "calendar-dots";

    for (const habit of completedHabits.slice(0, 6)) {
      const dot = document.createElement("span");
      dot.className = "calendar-dot";
      dot.title = habit.name;
      dots.append(dot);
    }

    day.append(dayNumber, dots);
    calendar.append(day);
  }

  section.append(heading, calendar);
  return section;
}

function renderPremiumPanel(premium: PremiumState, habitCount: number, onStartTrial: () => void): HTMLElement {
  const section = document.createElement("section");
  section.className = "premium-panel";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = t("premiumHeading");

  const status = document.createElement("p");
  status.className = "premium-status";

  if (premium.premiumUnlocked) {
    status.textContent = t("premiumActive");
  } else if (isTrialActive(premium)) {
    status.textContent = t("premiumTrialActive", String(getTrialDaysLeft(premium)));
  } else if (premium.trialStartTs !== null) {
    status.textContent = t("premiumTrialExpired");
  } else {
    status.textContent = t("premiumTrialAvailable", String(TRIAL_DAYS));
  }

  const limit = document.createElement("p");
  limit.className = "premium-limit";
  limit.textContent = hasPremiumAccess(premium)
    ? t("premiumUnlimited")
    : t("freeHabitLimit", [String(habitCount), String(FREE_HABIT_LIMIT)]);

  const actions = document.createElement("div");
  actions.className = "premium-actions";

  if (premium.trialStartTs === null && !premium.premiumUnlocked) {
    const trialButton = document.createElement("button");
    trialButton.className = "secondary-button";
    trialButton.type = "button";
    trialButton.textContent = t("startTrialButton");
    trialButton.addEventListener("click", onStartTrial);
    actions.append(trialButton);
  }

  const checkoutLink = document.createElement("a");
  checkoutLink.className = "checkout-link";
  checkoutLink.href = STRIPE_CHECKOUT_URL;
  checkoutLink.target = "_blank";
  checkoutLink.rel = "noopener noreferrer";
  checkoutLink.textContent = t("checkoutButton");
  actions.append(checkoutLink);

  section.append(heading, status, limit, actions);
  return section;
}

function renderStreakHistory(habits: Habit[], premium: PremiumState): HTMLElement {
  const section = document.createElement("section");
  section.className = "history-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = t("streakHistoryHeading");

  if (!hasPremiumAccess(premium)) {
    const locked = document.createElement("p");
    locked.className = "empty-state";
    locked.textContent = t("streakHistoryLocked");
    section.append(heading, locked);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "history-list";

  for (const habit of habits) {
    const item = document.createElement("li");
    item.className = "history-item";

    const label = document.createElement("span");
    label.className = "history-label";
    label.textContent = `${habit.emoji} ${habit.name}`;

    const dates = document.createElement("span");
    dates.className = "history-dates";
    dates.textContent =
      habit.completedDates.length > 0 ? habit.completedDates.slice(-5).reverse().join(t("listSeparator")) : t("noCompletions");

    item.append(label, dates);
    list.append(item);
  }

  section.append(heading, list);
  return section;
}

function renderPopup(
  root: HTMLDivElement,
  storedHabits: StoredHabit[],
  premium: PremiumState,
  today: Date,
  onPopupStateChange: (state: PopupState) => void,
): void {
  root.innerHTML = "";
  const todayKey = toDateKey(today);
  const habits = storedHabits.map((storedHabit) => toHabit(storedHabit, todayKey));
  const premiumAccess = hasPremiumAccess(premium);
  const freeLimitReached = !premiumAccess && storedHabits.length >= FREE_HABIT_LIMIT;

  const style = document.createElement("style");
  style.textContent = `
    :root {
      color: #1f2933;
      background: #ffffff;
    }

    .popup-shell {
      display: grid;
      gap: 14px;
    }

    .today-summary {
      display: grid;
      gap: 4px;
      padding: 10px;
      border: 1px solid #dde3ea;
      border-radius: 8px;
      background: #f7fafc;
    }

    .summary-label {
      color: #5d6b7a;
      font-size: 12px;
    }

    .summary-count {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
    }

    .habit-section {
      display: grid;
      gap: 8px;
    }

    .calendar-section,
    .history-section {
      display: grid;
      gap: 8px;
    }

    .month-calendar {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }

    .calendar-weekday {
      color: #5d6b7a;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
    }

    .calendar-day {
      box-sizing: border-box;
      display: grid;
      grid-template-rows: 16px 1fr;
      gap: 2px;
      min-width: 0;
      min-height: 38px;
      padding: 4px;
      border: 1px solid #dde3ea;
      border-radius: 7px;
      background: #ffffff;
    }

    .calendar-day.is-spacer {
      border-color: transparent;
      background: transparent;
    }

    .calendar-day.is-today {
      border-color: #2563eb;
    }

    .calendar-day-number {
      color: #405160;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      text-align: center;
    }

    .calendar-dots {
      display: flex;
      flex-wrap: wrap;
      align-content: center;
      justify-content: center;
      gap: 2px;
      min-height: 12px;
    }

    .calendar-dot {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: #16a34a;
    }

    .habit-form {
      display: grid;
      grid-template-columns: 44px 1fr auto;
      gap: 8px;
      align-items: end;
      padding: 10px;
      border: 1px solid #dde3ea;
      border-radius: 8px;
    }

    .habit-form.is-locked {
      background: #f7fafc;
    }

    .form-field {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .form-label {
      color: #5d6b7a;
      font-size: 12px;
    }

    .form-input {
      box-sizing: border-box;
      width: 100%;
      min-height: 34px;
      padding: 6px 8px;
      border: 1px solid #c8d2dc;
      border-radius: 6px;
      font: inherit;
      font-size: 14px;
    }

    .primary-button,
    .secondary-button,
    .habit-action {
      min-height: 32px;
      border: 1px solid #c8d2dc;
      border-radius: 6px;
      background: #ffffff;
      color: #1f2933;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .primary-button {
      padding: 0 12px;
      border-color: #2563eb;
      background: #2563eb;
      color: #ffffff;
      font-weight: 700;
    }

    .secondary-button {
      padding: 0 10px;
    }

    .section-heading {
      margin: 0;
      font-size: 14px;
      line-height: 1.4;
    }

    .habit-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .habit-item {
      display: grid;
      grid-template-columns: 32px 1fr auto;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 8px;
      border: 1px solid #dde3ea;
      border-radius: 8px;
    }

    .habit-icon {
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      border-radius: 8px;
      background: #eef5f9;
      font-size: 18px;
    }

    .habit-name {
      min-width: 0;
      font-size: 14px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .habit-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .habit-details {
      color: #5d6b7a;
      font-size: 12px;
      line-height: 1.2;
    }

    .today-check {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #405160;
      font-size: 12px;
      white-space: nowrap;
    }

    .habit-actions {
      grid-column: 2 / -1;
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }

    .habit-action {
      padding: 0 8px;
    }

    .habit-action.danger {
      color: #b42318;
    }

    .empty-state {
      margin: 0;
      padding: 10px;
      border: 1px dashed #c8d2dc;
      border-radius: 8px;
      color: #5d6b7a;
      font-size: 13px;
    }

    .premium-panel {
      display: grid;
      gap: 8px;
      padding: 10px;
      border: 1px solid #dde3ea;
      border-radius: 8px;
      background: #fbfcfe;
    }

    .premium-status,
    .premium-limit {
      margin: 0;
      color: #405160;
      font-size: 12px;
      line-height: 1.4;
    }

    .premium-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .checkout-link {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid #2563eb;
      border-radius: 6px;
      background: #2563eb;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
    }

    .history-list {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .history-item {
      display: grid;
      gap: 3px;
      padding: 8px;
      border: 1px solid #dde3ea;
      border-radius: 8px;
    }

    .history-label {
      font-size: 13px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .history-dates {
      color: #5d6b7a;
      font-size: 12px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
  `;

  let editingId: string | null = null;

  const rerenderWith = (nextHabits: StoredHabit[]): void => {
    renderPopup(root, nextHabits, premium, new Date(), onPopupStateChange);
  };

  const persistAndRender = async (nextHabits: StoredHabit[]): Promise<void> => {
    await saveStoredHabits(nextHabits);
    onPopupStateChange({ habits: nextHabits, premium });
    rerenderWith(nextHabits);
  };

  const startTrial = (): void => {
    const nextPremium = { ...premium, trialStartTs: Date.now() };
    void savePremiumState(nextPremium).then(() => {
      onPopupStateChange({ habits: storedHabits, premium: nextPremium });
      renderPopup(root, storedHabits, nextPremium, new Date(), onPopupStateChange);
    });
  };

  const toggleToday = (habitToToggle: Habit): void => {
    const nextHabits = storedHabits.map((habit) => {
      if (habit.id !== habitToToggle.id) {
        return habit;
      }

      const completedDateSet = new Set(habit.completedDates);

      if (completedDateSet.has(todayKey)) {
        completedDateSet.delete(todayKey);
      } else {
        completedDateSet.add(todayKey);
      }

      return {
        ...habit,
        completedDates: [...completedDateSet].sort(),
      };
    });

    void persistAndRender(nextHabits);
  };

  const shell = document.createElement("main");
  shell.className = "popup-shell";

  const checkedCount = habits.filter((habit) => habit.checkedToday).length;

  const summary = document.createElement("section");
  summary.className = "today-summary";
  summary.setAttribute("aria-label", t("todaySummaryAria"));

  const summaryLabel = document.createElement("span");
  summaryLabel.className = "summary-label";
  summaryLabel.textContent = t("todayCheck");

  const summaryCount = document.createElement("strong");
  summaryCount.className = "summary-count";
  summaryCount.textContent = `${checkedCount}/${habits.length}`;

  summary.append(summaryLabel, summaryCount);

  const habitSection = document.createElement("section");
  habitSection.className = "habit-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = t("habitListHeading");

  const form = document.createElement("form");
  form.className = "habit-form";
  if (freeLimitReached) {
    form.classList.add("is-locked");
  }

  const emojiField = document.createElement("label");
  emojiField.className = "form-field";

  const emojiLabel = document.createElement("span");
  emojiLabel.className = "form-label";
  emojiLabel.textContent = t("emojiLabel");

  const emojiInput = document.createElement("input");
  emojiInput.className = "form-input";
  emojiInput.name = "emoji";
  emojiInput.maxLength = 4;
  emojiInput.required = true;
  emojiInput.value = "✅";

  emojiField.append(emojiLabel, emojiInput);

  const nameField = document.createElement("label");
  nameField.className = "form-field";

  const nameLabel = document.createElement("span");
  nameLabel.className = "form-label";
  nameLabel.textContent = t("nameLabel");

  const nameInput = document.createElement("input");
  nameInput.className = "form-input";
  nameInput.name = "name";
  nameInput.maxLength = 40;
  nameInput.required = true;
  nameInput.placeholder = t("habitNamePlaceholder");

  nameField.append(nameLabel, nameInput);

  const submitButton = document.createElement("button");
  submitButton.className = "primary-button";
  submitButton.type = "submit";
  submitButton.textContent = t("addButton");

  const cancelButton = document.createElement("button");
  cancelButton.className = "secondary-button";
  cancelButton.type = "button";
  cancelButton.textContent = t("cancelButton");
  cancelButton.hidden = true;

  const resetForm = (): void => {
    editingId = null;
    emojiInput.value = "✅";
    nameInput.value = "";
    submitButton.textContent = t("addButton");
    cancelButton.hidden = true;
  };

  cancelButton.addEventListener("click", resetForm);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const emoji = emojiInput.value.trim();
    const name = nameInput.value.trim();

    if (!emoji || !name) {
      return;
    }

    if (!editingId && freeLimitReached) {
      return;
    }

    const nextHabits = editingId
      ? storedHabits.map((habit) => (habit.id === editingId ? { ...habit, emoji, name } : habit))
      : [...storedHabits, { id: createHabitId(), emoji, name, completedDates: [] }];

    void persistAndRender(nextHabits);
  });

  form.append(emojiField, nameField, submitButton, cancelButton);

  const limitNotice = document.createElement("p");
  limitNotice.className = "empty-state";
  limitNotice.textContent = t("freeLimitReached");

  const list = document.createElement("ul");
  list.className = "habit-list";
  list.append(
    ...habits.map((habit) =>
      renderHabit(
        habit,
        toggleToday,
        (habitToEdit) => {
          editingId = habitToEdit.id;
          emojiInput.value = habitToEdit.emoji;
          nameInput.value = habitToEdit.name;
          submitButton.textContent = t("saveButton");
          cancelButton.hidden = false;
          nameInput.focus();
        },
        (habitToDelete) => {
          void persistAndRender(storedHabits.filter((storedHabit) => storedHabit.id !== habitToDelete.id));
        },
      ),
    ),
  );

  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = t("emptyHabits");

  habitSection.append(heading, form);
  if (freeLimitReached) {
    habitSection.append(limitNotice);
  }
  habitSection.append(habits.length > 0 ? list : emptyState);
  shell.append(
    summary,
    renderPremiumPanel(premium, habits.length, startTrial),
    renderMonthCalendar(habits, today),
    renderStreakHistory(habits, premium),
    habitSection,
  );
  root.append(style, shell);
}

if (app) {
  document.title = t("extName");
  if (appTitle) {
    appTitle.textContent = t("extName");
  }

  let currentState: PopupState = {
    habits: [],
    premium: { trialStartTs: null, premiumUnlocked: false },
  };
  let renderedTodayKey = toDateKey(new Date());

  const updatePopupState = (state: PopupState): void => {
    currentState = state;
  };

  const renderCurrentState = (): void => {
    renderPopup(app, currentState.habits, currentState.premium, new Date(), updatePopupState);
  };

  void restorePopupState().then((state) => {
    updatePopupState(state);
    renderCurrentState();

    window.setInterval(() => {
      const nextTodayKey = toDateKey(new Date());
      if (nextTodayKey === renderedTodayKey) {
        return;
      }

      renderedTodayKey = nextTodayKey;
      renderCurrentState();
    }, DATE_ROLLOVER_CHECK_MS);
  });
}
