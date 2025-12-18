export class TagInputManager {
  constructor(containerId, inputId, options = {}) {
    this.container = document.getElementById(containerId);
    this.input = document.getElementById(inputId);
    this.tags = new Set();

    this.storageKey = `${containerId}_suggestions`;  // chiave specifica per contesto
    const storedSuggestions = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    const defaultSuggestions = options.suggestions || [];

    this.suggestions = Array.from(new Set([...storedSuggestions, ...defaultSuggestions]));
    this.maxTags = options.maxTags || Infinity;
    this.onChange = options.onChange || (() => {});

    this.highlightIndex = -1;
    this.suggestionItems = [];

    if (!this.container || !this.input) {
      console.error(`[TagInputManager] Elemento non trovato. Controlla containerId e inputId`);
      return;
    }

    this.renderSuggestionBox();
    this.attachEvents();
  }

  renderSuggestionBox() {
    this.suggestionBox = document.createElement("ul");
    this.suggestionBox.className = "tag-suggestions hidden";
    Object.assign(this.suggestionBox.style, {
      position: "absolute",
      zIndex: 999,
      listStyle: "none",
      margin: 0,
      padding: "4px",
      backgroundColor: "var(--nav-hover)",
      border: "1px solid var(--grid-color)",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      display: "none"
    });

    document.body.appendChild(this.suggestionBox);
  }

  attachEvents() {
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveHighlight(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveHighlight(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (this.highlightIndex >= 0 && this.suggestionItems[this.highlightIndex]) {
          this.addTag(this.suggestionItems[this.highlightIndex].textContent);
        } else if (this.input.value.trim()) {
          this.addTag(this.input.value.trim());
        }
      } else if (e.key === "Backspace" && this.input.value === "") {
        this.removeLastTag();
      }
    });

    this.input.addEventListener("input", () => this.updateSuggestions());

    document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target) && !this.suggestionBox.contains(e.target)) {
        this.hideSuggestions();
      }
    });
  }

  moveHighlight(direction) {
    if (!this.suggestionItems.length) return;

    this.highlightIndex += direction;
    if (this.highlightIndex < 0) this.highlightIndex = this.suggestionItems.length - 1;
    if (this.highlightIndex >= this.suggestionItems.length) this.highlightIndex = 0;

    this.suggestionItems.forEach((li, idx) => {
      li.style.backgroundColor = idx === this.highlightIndex ? "var(--grid-color)" : "transparent";
    });
  }

  updateSuggestions() {
    const value = this.input.value.toLowerCase();
    this.suggestionBox.innerHTML = "";
    this.suggestionItems = [];
    this.highlightIndex = -1;

    if (!value) {
      this.hideSuggestions();
      return;
    }

    const matches = this.suggestions.filter(
      tag => tag.toLowerCase().includes(value) && !this.tags.has(tag)
    );

    if (matches.length === 0) {
      this.hideSuggestions();
      return;
    }

    matches.forEach(tag => {
      const li = document.createElement("li");
      li.textContent = tag;
      Object.assign(li.style, {
        cursor: "pointer",
        padding: "6px 10px"
      });

      li.addEventListener("click", () => this.addTag(tag));
      this.suggestionBox.appendChild(li);
      this.suggestionItems.push(li);
    });

    const rect = this.input.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    this.suggestionBox.style.top = `${rect.bottom + scrollTop}px`;
    this.suggestionBox.style.left = `${rect.left + scrollLeft}px`;
    this.suggestionBox.style.display = "block";
    this.suggestionBox.classList.remove("hidden");
  }

  hideSuggestions() {
    this.suggestionBox.style.display = "none";
    this.suggestionBox.classList.add("hidden");
    this.highlightIndex = -1;
  }

  addTag(tag) {
    if (!tag || this.tags.size >= this.maxTags || this.tags.has(tag)) return;

    this.tags.add(tag);
    const tagEl = this.renderTag(tag);
    this.input.closest('.tag-container').insertBefore(tagEl, this.input);
    this.input.value = "";
    this.hideSuggestions();
    this.updateStateClass();
    this.onChange(this.getTags());

    this.saveSuggestion(tag);
  }

  removeLastTag() {
    const lastTag = Array.from(this.tags).pop();
    if (!lastTag) return;

    const tagEl = [...this.container.querySelectorAll(".tag-pill")].find(t => t.textContent.includes(lastTag));
    this.tags.delete(lastTag);
    if (tagEl) tagEl.remove();

    this.updateStateClass();
    this.onChange(this.getTags());
  }

  renderTag(name) {
    const tag = document.createElement("span");
    tag.className = "tag-pill";
    tag.innerHTML = `${name} <span class="remove">&times;</span>`;

    tag.querySelector(".remove").addEventListener("click", () => {
      this.tags.delete(name);
      tag.remove();
      this.updateStateClass();
      this.onChange(this.getTags());
    });

    return tag;
  }

  getTags() {
    return Array.from(this.tags);
  }

  setTags(list) {
    this.tags.clear();
    this.container.querySelectorAll(".tag-pill").forEach(e => e.remove());
    list.forEach(tag => this.addTag(tag));
  }

  updateStateClass() {
    const button = document.getElementById(`${this.input.id.replace('_tagInput', '')}_searchtags`);
    if (button) {
      if (this.tags.size > 0) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    }
  }

  saveSuggestion(tag) {
    if (!this.suggestions.includes(tag)) {
      this.suggestions.push(tag);
      localStorage.setItem(this.storageKey, JSON.stringify(this.suggestions));
    }
  }

  resetSuggestions() {
    localStorage.removeItem(this.storageKey);
  }
}