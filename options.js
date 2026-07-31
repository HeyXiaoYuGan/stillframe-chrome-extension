const DEFAULTS = {
  uiLanguage: "zh",
  feature: "images",
  liveScan: true,
  imageFilterLevel: "standard",
  preferOriginalPreview: true,
  previewLayout: "square",
  biliDownloadCover: false,
  biliDownloadAudio: true,
  biliDownloadDanmaku: false,
  biliDownloadSrt: false,
  biliDownloadAss: false,
  biliQuality: "80",
  biliAudioQuality: "30280",
  biliCodec: "avc",
  biliFilenameTemplate: "%title%",
  mode: "visible",
  format: "png",
  delay: "0",
  notificationsEnabled: true,
};

const HIDDEN_SETTINGS = Object.freeze({
  authorSignature: "DINGGE",
});

const controls = Object.fromEntries(
  Object.keys(DEFAULTS).map((key) => [key, document.querySelector(`#${key}`)]),
);
const form = document.querySelector("#settingsForm");
const resetButton = document.querySelector("#resetButton");
const savedIndicator = document.querySelector("#savedIndicator");
const sectionButtons = [...document.querySelectorAll("nav [data-section]")];
const settingsCards = [...document.querySelectorAll(".settings-card")];
document.querySelector("#settingsVersion").textContent =
  `V${chrome.runtime.getManifest().version}`;

function showSection(sectionId) {
  const selectedId = settingsCards.some((card) => card.id === sectionId)
    ? sectionId
    : "general";
  settingsCards.forEach((card) => {
    card.hidden = card.id !== selectedId;
  });
  sectionButtons.forEach((button) => {
    const active = button.dataset.section === selectedId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  history.replaceState(null, "", `#${selectedId}`);
}

function applyValues(values) {
  Object.entries(DEFAULTS).forEach(([key, defaultValue]) => {
    const control = controls[key];
    const value = values[key] ?? defaultValue;
    if (control.type === "checkbox") control.checked = Boolean(value);
    else control.value = String(value);
  });
}

function readValues() {
  return Object.fromEntries(
    Object.entries(controls).map(([key, control]) => [
      key,
      control.type === "checkbox" ? control.checked : control.value,
    ]),
  );
}

let indicatorTimer;
function showSaved(text = "已保存") {
  savedIndicator.textContent = text;
  savedIndicator.hidden = false;
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => {
    savedIndicator.hidden = true;
  }, 1800);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({
    ...readValues(),
    ...HIDDEN_SETTINGS,
  });
  showSaved();
});

resetButton.addEventListener("click", async () => {
  applyValues(DEFAULTS);
  await chrome.storage.local.set({
    ...DEFAULTS,
    ...HIDDEN_SETTINGS,
  });
  showSaved("已恢复默认");
});

chrome.storage.local
  .get({
    ...DEFAULTS,
    ...HIDDEN_SETTINGS,
  })
  .then(async (values) => {
    applyValues(values);
    if (values.authorSignature !== HIDDEN_SETTINGS.authorSignature) {
      await chrome.storage.local.set(HIDDEN_SETTINGS);
    }
  });

sectionButtons.forEach((button) => {
  button.addEventListener("click", () => showSection(button.dataset.section));
});
showSection(location.hash.slice(1));
