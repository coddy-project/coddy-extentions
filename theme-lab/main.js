export function activate(coddy) {
  // A colour input only accepts #rrggbb, so the HSL transforms of the host
  // are converted back to hex for the per-token pickers.
  const hslToHex = ({ h, s, l }) => {
    const sat = s / 100;
    const light = l / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const f = (n) =>
      light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const byte = (v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${byte(f(0))}${byte(f(8))}${byte(f(4))}`;
  };
  coddy.i18n.registerMessages("en", {
    title: "Theme Lab",
    reset: "Reset",
    note: "The shift and the picked colours persist in the server configuration. Reset clears them.",
    shiftAll: "Shift every colour",
    hue: "Hue",
    saturation: "Saturation",
    lightness: "Lightness",
    tokens: "Tokens",
  });
  coddy.i18n.registerMessages("ru", {
    title: "Лаборатория тем",
    reset: "Сбросить",
    note: "Сдвиг и выбранные цвета сохраняются в конфигурации сервера. Сброс очищает их.",
    shiftAll: "Сдвинуть все цвета",
    hue: "Тон",
    saturation: "Насыщенность",
    lightness: "Яркость",
    tokens: "Токены",
  });
  // The app repaints from its whole token layer. The lab seeds every
  // colour-valued token from `theme.tokens()` and shifts them all at once,
  // with a colour input per token for the fine moves. The shift and the
  // picked tokens persist under extension_values.theme-lab of the server
  // configuration, so a reload or another browser of the same server
  // restores them.
  let base = {};
  let tones = {};
  let custom = {};
  const shift = { hue: 0, sat: 100, light: 0 };
  let handle = null;
  // readBase re-reads the tokens of the active theme and keeps the picks
  // that still name one; seed is the full reset the Reset button runs.
  const readBase = () => {
    base = coddy.theme.tokens();
    tones = {};
    for (const name of Object.keys(base)) {
      const hsl = coddy.theme.parseColor(base[name]);
      if (hsl) tones[name] = hsl;
    }
    for (const name of Object.keys(custom)) if (!tones[name]) delete custom[name];
  };
  const seed = () => {
    readBase();
    custom = {};
    shift.hue = 0;
    shift.sat = 100;
    shift.light = 0;
  };
  seed();

  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const state = JSON.stringify({ shift: { ...shift }, custom: { ...custom } });
      coddy.config
        .set("extension_values.theme-lab.state", state)
        .catch(() => {});
    }, 600);
  };

  const restore = async () => {
    let raw = null;
    try {
      raw = await coddy.config.get("extension_values.theme-lab.state");
    } catch {
      return;
    }
    if (typeof raw !== "string" || !raw) return;
    let state = null;
    try {
      state = JSON.parse(raw);
    } catch {
      return;
    }
    if (!state || typeof state !== "object") return;
    const empty =
      (!state.custom || Object.keys(state.custom).length === 0) &&
      (!state.shift ||
        ((state.shift.hue ?? 0) === 0 &&
          (state.shift.sat ?? 100) === 100 &&
          (state.shift.light ?? 0) === 0));
    if (empty) return;
    if (state.shift && typeof state.shift === "object") {
      shift.hue = Number(state.shift.hue ?? 0) || 0;
      shift.sat = Number(state.shift.sat ?? 100) || 100;
      shift.light = Number(state.shift.light ?? 0) || 0;
    }
    if (state.custom && typeof state.custom === "object") {
      for (const name of Object.keys(state.custom)) {
        if (typeof state.custom[name] === "string" && tones[name])
          custom[name] = state.custom[name];
      }
    }
    apply();
  };
  const neutral = () =>
    shift.hue === 0 &&
    shift.sat === 100 &&
    shift.light === 0 &&
    Object.keys(custom).length === 0;
  const build = () => {
    if (neutral()) return null;
    const out = {};
    for (const name of Object.keys(tones)) {
      if (custom[name]) out[name] = custom[name];
      else if (shift.hue !== 0 || shift.sat !== 100 || shift.light !== 0) {
        const t = tones[name];
        out[name] = coddy.theme.formatColor({
          h: (t.h + shift.hue + 360) % 360,
          s: Math.max(0, Math.min(100, Math.round((t.s * shift.sat) / 100))),
          l: Math.max(0, Math.min(100, t.l + shift.light)),
        });
      }
    }
    return out;
  };
  const apply = () => {
    const out = build();
    if (!out) {
      if (handle) {
        handle.remove();
        handle = null;
      }
    } else if (handle) handle.update(out);
    else handle = coddy.theme.override(out);
    save();
  };
  void restore();

  // The shift and the picks are relative to the host theme, so when the
  // operator switches themes the lab re-reads the base tokens of the new
  // one and reapplies the same moves instead of freezing the old palette
  // over every theme.
  coddy.theme.onChange(() => {
    readBase();
    apply();
  });

  const panel = coddy.ui.registerPanel({
    id: "theme-lab",
    title: coddy.i18n.t("title"),
    placement: "slide-over",
    mount(element) {
      const paint = () => {
        element.replaceChildren();
        const box = document.createElement("section");
        box.className = "ext-theme-lab";

        const heading = document.createElement("h3");
        heading.textContent = coddy.i18n.t("shiftAll");
        box.append(heading);
        const shifters = [
          { key: "hue", min: -180, max: 180 },
          { key: "saturation", min: 0, max: 200 },
          { key: "lightness", min: -50, max: 50 },
        ];
        for (const spec of shifters) {
          const row = document.createElement("div");
          row.className = "ext-theme-lab-row";
          const label = document.createElement("label");
          label.textContent = coddy.i18n.t(spec.key);
          const slider = document.createElement("input");
          slider.type = "range";
          slider.min = String(spec.min);
          slider.max = String(spec.max);
          const current =
            spec.key === "hue"
              ? shift.hue
              : spec.key === "saturation"
                ? shift.sat
                : shift.light;
          slider.value = String(current);
          slider.addEventListener(
            "input",
            () => {
              const value = Number(slider.value);
              if (spec.key === "hue") shift.hue = value;
              else if (spec.key === "saturation") shift.sat = value;
              else shift.light = value;
              apply();
            },
            { signal: coddy.signal },
          );
          row.append(label, slider);
          box.append(row);
        }

        const tokensHead = document.createElement("h3");
        tokensHead.textContent = coddy.i18n.t("tokens");
        box.append(tokensHead);
        for (const name of Object.keys(tones)) {
          const row = document.createElement("div");
          row.className = "ext-theme-lab-row ext-theme-lab-token-row";
          const label = document.createElement("code");
          label.textContent = name;
          const picker = document.createElement("input");
          picker.type = "color";
          picker.value = hslToHex(
            coddy.theme.parseColor(base[name]) ?? { h: 0, s: 0, l: 0 },
          );
          picker.addEventListener(
            "input",
            () => {
              custom[name] = picker.value;
              apply();
            },
            { signal: coddy.signal },
          );
          row.append(label, picker);
          box.append(row);
        }

        const reset = document.createElement("button");
        reset.className = "settings-btn";
        reset.textContent = coddy.i18n.t("reset");
        reset.addEventListener(
          "click",
          () => {
            if (handle) {
              handle.remove();
              handle = null;
            }
            seed();
            coddy.config.set("extension_values.theme-lab.state", "").catch(() => {});
            paint();
          },
          { signal: coddy.signal },
        );
        const note = document.createElement("p");
        note.className = "ext-theme-lab-note";
        note.textContent = coddy.i18n.t("note");
        box.append(reset, note);
        element.append(box);
      };
      paint();
      const watched = coddy.i18n.onChange(paint);
      return () => {
        watched.remove();
        element.replaceChildren();
      };
    },
  });
  const item = coddy.ui.registerMenuItem({
    id: "open-theme-lab",
    title: coddy.i18n.t("title"),
    onSelect: () => coddy.ui.openPanel("theme-lab"),
  });
  const watched = coddy.i18n.onChange(() => {
    panel.update({ title: coddy.i18n.t("title") });
    item.update({ title: coddy.i18n.t("title") });
  });
  return () => {
    watched.remove();
    item.remove();
    panel.remove();
    if (handle) {
      handle.remove();
      handle = null;
    }
  };
}
