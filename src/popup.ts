type Habit = {
  id: string;
  name: string;
  emoji: string;
  checkedToday: boolean;
};

type StoredHabit = Pick<Habit, "id" | "name" | "emoji">;

const STORAGE_KEY = "habit-dots:habits";

const defaultHabits: StoredHabit[] = [
  { id: "water", name: "水を飲む", emoji: "💧" },
  { id: "stretch", name: "ストレッチ", emoji: "🧘" },
  { id: "journal", name: "日記", emoji: "✍️" },
];

const app = document.querySelector<HTMLDivElement>("#app");

function isStoredHabit(value: unknown): value is StoredHabit {
  if (!value || typeof value !== "object") {
    return false;
  }

  const habit = value as Record<string, unknown>;
  return (
    typeof habit.id === "string" &&
    typeof habit.name === "string" &&
    typeof habit.emoji === "string" &&
    habit.id.trim().length > 0 &&
    habit.name.trim().length > 0 &&
    habit.emoji.trim().length > 0
  );
}

function toHabit(storedHabit: StoredHabit): Habit {
  return {
    ...storedHabit,
    checkedToday: false,
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
      resolve(Array.isArray(savedHabits) && savedHabits.every(isStoredHabit) ? savedHabits : defaultHabits);
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

  const label = document.createElement("label");
  label.className = "today-check";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = habit.checkedToday;
  checkbox.disabled = true;

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
  item.append(icon, name, label, actions);

  return item;
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
      : [...storedHabits, { id: createHabitId(), emoji, name }];

    void persistAndRender(nextHabits);
  });

  form.append(emojiField, nameField, submitButton, cancelButton);

  const list = document.createElement("ul");
  list.className = "habit-list";
  list.append(
    ...habits.map((habit) =>
      renderHabit(
        habit,
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
  shell.append(summary, habitSection);
  root.append(style, shell);
}

if (app) {
  void loadStoredHabits().then((habits) => renderPopup(app, habits));
}
