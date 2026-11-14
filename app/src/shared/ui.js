import "../../arcade.js";

export const ui = window.Arcade;

const escapeMarkup = value => String(value).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function choiceField(label, options, { value = "", name, attributes = "", disabled = false } = {}) {
  return `<veritas-choice class="field" label="${escapeMarkup(label)}" choices="${escapeMarkup(JSON.stringify(options))}" value="${escapeMarkup(value)}"${name ? ` name="${escapeMarkup(name)}"` : ""}${disabled ? " disabled" : ""} ${attributes}></veritas-choice>`;
}

let nextChoiceId = 0;

class VeritasChoice extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["disabled", "value"];

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  get value() { return this.getAttribute("value") ?? ""; }
  set value(value) { this.setAttribute("value", String(value)); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(disabled) { this.toggleAttribute("disabled", disabled); }

  connectedCallback() {
    if (this.buttons) return;
    this.options = JSON.parse(this.getAttribute("choices"));
    this.segmented = this.options.length <= 4;
    if (!this.options.some(([value]) => value === this.value)) this.value = this.options[0]?.[0] ?? "";
    const id = `veritas-choice-${++nextChoiceId}`;
    const label = escapeMarkup(this.getAttribute("label"));
    this.innerHTML = `<span class="field-label" id="${id}-label">${label}</span>
      ${this.segmented ? "" : `<button type="button" class="inset choice-trigger" aria-labelledby="${id}-label ${id}-value" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-options"><span id="${id}-value"></span></button>`}
      <div id="${id}-options" class="${this.segmented ? "segmented inset" : "choice-options inset"}" role="${this.segmented ? "radiogroup" : "listbox"}" aria-labelledby="${id}-label"${this.segmented ? "" : " hidden"}>
        ${this.options.map(([, text], i) => `<button type="button" data-choice-index="${i}" role="${this.segmented ? "radio" : "option"}" class="${this.segmented ? "tile" : "choice-option"}">${escapeMarkup(text)}</button>`).join("")}
      </div>`;
    this.buttons = [...this.querySelectorAll("[data-choice-index]")];
    this.trigger = this.querySelector(".choice-trigger");
    this.list = this.querySelector("[role=listbox]");
    this.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (button && button === this.trigger) {
        if (this.list.hidden) this.openList();
        else this.closeList(true);
      } else if (button?.dataset.choiceIndex !== undefined) {
        this.choose(Number(button.dataset.choiceIndex));
      }
    });
    this.addEventListener("keydown", event => this.handleKey(event));
    this.addEventListener("focusout", event => {
      if (!this.contains(event.relatedTarget)) this.closeList();
    });
    this.sync();
  }

  attributeChangedCallback() { this.sync(); }
  formDisabledCallback(disabled) { this.formDisabled = disabled; this.sync(); }
  formResetCallback() { this.value = this.initialValue; }

  sync() {
    if (!this.buttons) return;
    this.initialValue ??= this.value;
    const disabled = this.disabled || this.formDisabled;
    this.internals.setFormValue(disabled || !this.getAttribute("name") ? null : this.value);
    this.buttons.forEach((button, index) => {
      const selected = this.value === this.options[index][0];
      button.toggleAttribute("disabled", Boolean(disabled));
      button.setAttribute(this.segmented ? "aria-checked" : "aria-selected", String(selected));
      button.tabIndex = this.segmented && selected ? 0 : -1;
    });
    if (this.trigger) {
      this.trigger.disabled = Boolean(disabled);
      this.trigger.firstElementChild.textContent = this.options.find(([value]) => value === this.value)?.[1] ?? "";
      if (disabled) this.closeList();
    }
  }

  choose(index) {
    const [value] = this.options[index];
    const changed = this.value !== value;
    this.value = value;
    if (this.trigger) this.closeList(true);
    if (changed) {
      this.dispatchEvent(new Event("input", { bubbles: true }));
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  openList() {
    if (!this.buttons.length) return;
    this.list.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    const selected = this.buttons.find(button => button.getAttribute("aria-selected") === "true");
    (selected ?? this.buttons[0]).focus();
  }

  closeList(restoreFocus = false) {
    if (!this.list || this.list.hidden) return;
    this.list.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.trigger.focus();
  }

  handleKey(event) {
    const { key, target } = event;
    if (key === "Escape" && this.list && !this.list.hidden) {
      event.preventDefault();
      event.stopPropagation();
      this.closeList(true);
      return;
    }
    if (key === "Tab" && this.list && !this.list.hidden) {
      this.closeList(true);
      return;
    }
    const direction = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[key];
    if (!direction && key !== "Home" && key !== "End") return;
    const index = this.buttons.indexOf(target);
    if (index < 0 && target === this.trigger && direction) {
      event.preventDefault();
      this.openList();
      return;
    }
    if (index < 0) return;
    event.preventDefault();
    const next = key === "Home" ? 0 : key === "End" ? this.buttons.length - 1 :
      (index + direction + this.buttons.length) % this.buttons.length;
    this.buttons[next].focus();
    if (this.segmented) this.choose(next);
  }
}
customElements.define("veritas-choice", VeritasChoice);
