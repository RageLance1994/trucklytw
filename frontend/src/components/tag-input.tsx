import React from "react";

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  maxTags?: number;
  placeholder?: string;
  storageKey?: string;
};

const normalizeTag = (tag: string) => tag.trim();

export function TagInput({
  value,
  onChange,
  suggestions = [],
  maxTags = Infinity,
  placeholder = "Aggiungi un tag...",
  storageKey = "vehicleTags_suggestions",
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [storedSuggestions, setStoredSuggestions] = React.useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        setStoredSuggestions(parsed.filter((item) => typeof item === "string"));
      }
    } catch {}
  }, [storageKey]);

  const mergedSuggestions = React.useMemo(() => {
    const merged = new Set<string>();
    suggestions.forEach((tag) => merged.add(tag));
    storedSuggestions.forEach((tag) => merged.add(tag));
    return Array.from(merged);
  }, [suggestions, storedSuggestions]);

  const matches = React.useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return [];
    return mergedSuggestions.filter(
      (tag) =>
        tag.toLowerCase().includes(query) && !value.includes(tag),
    );
  }, [inputValue, mergedSuggestions, value]);

  const persistSuggestion = React.useCallback(
    (tag: string) => {
      if (typeof window === "undefined") return;
      if (!tag || storedSuggestions.includes(tag)) return;
      const next = [...storedSuggestions, tag];
      setStoredSuggestions(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
    },
    [storageKey, storedSuggestions],
  );

  const addTag = React.useCallback(
    (raw: string) => {
      const tag = normalizeTag(raw);
      if (!tag) return;
      if (value.includes(tag)) {
        setInputValue("");
        return;
      }
      if (value.length >= maxTags) return;
      const next = [...value, tag];
      onChange(next);
      setInputValue("");
      setHighlightIndex(-1);
      persistSuggestion(tag);
    },
    [maxTags, onChange, persistSuggestion, value],
  );

  const removeTag = React.useCallback(
    (tag: string) => {
      onChange(value.filter((item) => item !== tag));
    },
    [onChange, value],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!matches.length) return;
      setHighlightIndex((prev) => (prev + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!matches.length) return;
      setHighlightIndex((prev) =>
        prev <= 0 ? matches.length - 1 : prev - 1,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (highlightIndex >= 0 && matches[highlightIndex]) {
        addTag(matches[highlightIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
      return;
    }
    if (event.key === "Backspace" && !inputValue) {
      const last = value[value.length - 1];
      if (last) removeTag(last);
    }
  };

  const showSuggestions = inputValue.trim().length > 0 && matches.length > 0;

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/80">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-white/60 hover:text-white"
              aria-label={`Rimuovi ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 min-w-[140px] bg-transparent text-xs text-white/90 outline-none"
        />
      </div>
      {showSuggestions && (
        <ul className="absolute left-0 right-0 z-30 mt-2 max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-[#121212] text-xs text-white/80 shadow-[0_16px_30px_rgba(0,0,0,0.35)]">
          {matches.map((tag, index) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => addTag(tag)}
                className={`w-full px-3 py-2 text-left transition ${
                  index === highlightIndex ? "bg-white/10 text-white" : "hover:bg-white/5"
                }`}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

