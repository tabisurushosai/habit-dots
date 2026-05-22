type Habit = {
  id: string;
  name: string;
  emoji: string;
  checkedToday: boolean;
};

const sampleHabits: Habit[] = [
  { id: "water", name: "水を飲む", emoji: "💧", checkedToday: true },
  { id: "stretch", name: "ストレッチ", emoji: "🧘", checkedToday: false },
  { id: "journal", name: "日記", emoji: "✍️", checkedToday: false },
];

const app = document.querySelector<HTMLDivElement>("#app");

function renderHabit(habit: Habit): HTMLLIElement {
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

  const checkText = document.createElement("span");
  checkText.textContent = "今日";

  label.append(checkbox, checkText);
  item.append(icon, name, label);

  return item;
}

function renderPopup(root: HTMLDivElement): void {
  root.innerHTML = "";

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
  `;

  const shell = document.createElement("main");
  shell.className = "popup-shell";

  const checkedCount = sampleHabits.filter((habit) => habit.checkedToday).length;

  const summary = document.createElement("section");
  summary.className = "today-summary";
  summary.setAttribute("aria-label", "今日の達成状況");

  const summaryLabel = document.createElement("span");
  summaryLabel.className = "summary-label";
  summaryLabel.textContent = "今日のチェック";

  const summaryCount = document.createElement("strong");
  summaryCount.className = "summary-count";
  summaryCount.textContent = `${checkedCount}/${sampleHabits.length}`;

  summary.append(summaryLabel, summaryCount);

  const habitSection = document.createElement("section");
  habitSection.className = "habit-section";

  const heading = document.createElement("h2");
  heading.className = "section-heading";
  heading.textContent = "習慣一覧";

  const list = document.createElement("ul");
  list.className = "habit-list";
  list.append(...sampleHabits.map(renderHabit));

  habitSection.append(heading, list);
  shell.append(summary, habitSection);
  root.append(style, shell);
}

if (app) {
  renderPopup(app);
}
