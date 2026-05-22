type Habit = {
  id: string;
  name: string;
  emoji: string;
  completedDates: string[];
  checkedToday: boolean;
  streak: number;
};

type StoredHabit = Pick<Habit, "id" | "name" | "emoji" | "completedDates">;

const STORAGE_KEY = "habit-dots:habits";

const defaultHabits: StoredHabit[] = [
  { id: "water", name: "水を飲む", emoji: "💧", completedDates: [] },
  { id: "stretch", name: "ストレッチ", emoji: "🧘", completedDates: [] },
  { id: "journal", name: "日記", emoji: "✍️", completedDates: [] },
];

const app = document.querySelector<HTMLDivElement>("#app");

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

function toHabit(storedHabit: StoredHabit): Habit {
  const todayKey = toDateKey(new Date());

  return {
    ...storedHabit,
    checkedToday: storedHabit.completedDates.includes(todayKey),
    streak: calculateStreak(storedHabit.completedDates, todayKey),
  };
}

function createHabitId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `habit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadStoredHabits(): Promise<StoredHabit[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const savedHabits = result[STORAGE_KEY];
      if (!Array.isArray(savedHabits)) {
        resolve(defaultHabits);
        return;
      }

      const normalizedHabits = savedHabits.map(normalizeStoredHabit);
      resolve(normalizedHabits.every((habit) => habit !== null) ? normalizedHabits : defaultHabits);
    });
  });
}

function saveStoredHabits(habits: StoredHabit[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: habits }, () => resolve());
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
  details.textContent = `${habit.streak}日連続`;

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
  checkText.textContent = "今日";

  const actions = document.createElement("span");
  actions.className = "habit-actions";

  const editButton = document.createElement("button");
  editButton.className = "habit-action";
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", () => onEdit(habit));

  const deleteButton = document.createElement("button");
  deleteButton.className = "habit-action danger";
  deleteButton.type = "button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => onDelete(habit));

  actions.append(editButton, deleteButton);
  label.append(checkbox, checkText);
  item.append(icon, copy, label, actions);

  return item;
}

function renderMonthCalendar(habits: Habit[]): HTMLElement {
  const today = new Date();
  const todayKey = toDateKey(today);
  const monthDateKeys = getMonthDateKeys(today);
  const firstWeekday = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

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
  heading.textContent = `${today.getFullYear()}年${today.getMonth() + 1}月`;

  const calendar = document.createElement("div");
  calendar.className = "month-calendar";
  calendar.setAttribute("role", "grid");
  calendar.setAttribute("aria-label", "月カレンダー");

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
      `${dateKey}: ${completedHabits.length > 0 ? completedHabits.map((habit) => habit.name).join("、") : "達成なし"}`,
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

function renderPopup(root: HTMLDivElement, storedHabits: StoredHabit[]): void {
  root.innerHTML = "";
  const habits = storedHabits.map(toHabit);

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

    .calendar-section {
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
  `;

  let editingId: string | null = null;

  const rerenderWith = (nextHabits: StoredHabit[]): void => {
    renderPopup(root, nextHabits);
  };

  const persistAndRender = async (nextHabits: StoredHabit[]): Promise<void> => {
    await saveStoredHabits(nextHabits);
    rerenderWith(nextHabits);
  };

  const toggleToday = (habitToToggle: Habit): void => {
    const todayKey = toDateKey(new Date());
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
  summary.setAttribute("aria-label", "今日の達成状況");

  const summaryLabel = document.createElement("span");
  summaryLabel.className = "summary-label";
  summaryLabel.textContent = "今日のチェック";

  const summaryCount = document.createElement("strong");
  summaryCount.className = "summary-count";
  summaryCount.textContent = `${checkedCount}/${habits.length}`;

  summary.append(summaryLabel, summaryCount);

  const habitSection = document.createElement("section");
  habitSection.className = "habit-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = "習慣一覧";

  const form = document.createElement("form");
  form.className = "habit-form";

  const emojiField = document.createElement("label");
  emojiField.className = "form-field";

  const emojiLabel = document.createElement("span");
  emojiLabel.className = "form-label";
  emojiLabel.textContent = "絵文字";

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
  nameLabel.textContent = "名前";

  const nameInput = document.createElement("input");
  nameInput.className = "form-input";
  nameInput.name = "name";
  nameInput.maxLength = 40;
  nameInput.required = true;
  nameInput.placeholder = "習慣を入力";

  nameField.append(nameLabel, nameInput);

  const submitButton = document.createElement("button");
  submitButton.className = "primary-button";
  submitButton.type = "submit";
  submitButton.textContent = "追加";

  const cancelButton = document.createElement("button");
  cancelButton.className = "secondary-button";
  cancelButton.type = "button";
  cancelButton.textContent = "取消";
  cancelButton.hidden = true;

  const resetForm = (): void => {
    editingId = null;
    emojiInput.value = "✅";
    nameInput.value = "";
    submitButton.textContent = "追加";
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

    const nextHabits = editingId
      ? storedHabits.map((habit) => (habit.id === editingId ? { ...habit, emoji, name } : habit))
      : [...storedHabits, { id: createHabitId(), emoji, name, completedDates: [] }];

    void persistAndRender(nextHabits);
  });

  form.append(emojiField, nameField, submitButton, cancelButton);

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
          submitButton.textContent = "保存";
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
  emptyState.textContent = "習慣がありません。";

  habitSection.append(heading, form, habits.length > 0 ? list : emptyState);
  shell.append(summary, renderMonthCalendar(habits), habitSection);
  root.append(style, shell);
}

if (app) {
  void loadStoredHabits().then((habits) => renderPopup(app, habits));
}
