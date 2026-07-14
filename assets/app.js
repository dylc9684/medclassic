const els = {
  libraryStats: document.querySelector("#libraryStats"),
  librarySearch: document.querySelector("#librarySearch"),
  categoryFilter: document.querySelector("#categoryFilter"),
  sortMode: document.querySelector("#sortMode"),
  categoryRail: document.querySelector("#categoryRail"),
  resultCount: document.querySelector("#resultCount"),
  bookList: document.querySelector("#bookList"),
  bookMeta: document.querySelector("#bookMeta"),
  bookTitle: document.querySelector("#bookTitle"),
  copyLink: document.querySelector("#copyLink"),
  downloadLink: document.querySelector("#downloadLink"),
  bookSearch: document.querySelector("#bookSearch"),
  bookSearchCount: document.querySelector("#bookSearchCount"),
  prevMatch: document.querySelector("#prevMatch"),
  nextMatch: document.querySelector("#nextMatch"),
  fontMinus: document.querySelector("#fontMinus"),
  fontPlus: document.querySelector("#fontPlus"),
  verticalToggle: document.querySelector("#verticalToggle"),
  readerBody: document.querySelector("#readerBody"),
  bookContent: document.querySelector("#bookContent"),
  matchPanel: document.querySelector("#matchPanel"),
};

const collator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

const state = {
  books: [],
  categories: [],
  selectedBook: null,
  currentText: "",
  currentLines: [],
  matches: [],
  matchIndex: -1,
  category: "全部",
  fontSize: 18,
  abortController: null,
};

const encoders = {
  utf8: new TextDecoder("utf-8", { fatal: true }),
  gb18030: createDecoder("gb18030") || createDecoder("gbk") || new TextDecoder("utf-8"),
};

init();

async function init() {
  bindEvents();

  try {
    const manifest = await fetch("data/books.json", { cache: "no-store" }).then((res) => {
      if (!res.ok) {
        throw new Error(`Manifest request failed: ${res.status}`);
      }
      return res.json();
    });

    state.books = manifest.books;
    state.categories = manifest.categories;
    els.libraryStats.textContent = `${manifest.count} 部 · ${formatBytes(
      manifest.totalBytes,
    )}`;

    renderCategoryControls();
    applyFilters();

    const requested = getRequestedBook();
    const initial =
      state.books.find((book) => book.code === requested || book.file === requested) ||
      state.books[0];

    if (initial) {
      await openBook(initial, { replace: true });
    }
  } catch (error) {
    els.bookTitle.textContent = "书目载入失败";
    els.bookMeta.textContent = "Manifest";
    els.bookContent.textContent = error.message;
    els.bookContent.classList.remove("is-loading");
  }
}

function bindEvents() {
  let filterTimer = 0;
  els.librarySearch.addEventListener("input", () => {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(applyFilters, 80);
  });

  els.categoryFilter.addEventListener("change", () => {
    setCategory(els.categoryFilter.value);
  });

  els.sortMode.addEventListener("change", applyFilters);

  els.bookList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-file]");
    if (!button) return;
    const book = state.books.find((item) => item.file === button.dataset.file);
    if (book) {
      openBook(book);
    }
  });

  let bookSearchTimer = 0;
  els.bookSearch.addEventListener("input", () => {
    window.clearTimeout(bookSearchTimer);
    bookSearchTimer = window.setTimeout(updateBookSearch, 120);
  });

  els.bookSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveMatch(event.shiftKey ? -1 : 1);
    }
  });

  els.prevMatch.addEventListener("click", () => moveMatch(-1));
  els.nextMatch.addEventListener("click", () => moveMatch(1));

  els.fontMinus.addEventListener("click", () => setFontSize(state.fontSize - 1));
  els.fontPlus.addEventListener("click", () => setFontSize(state.fontSize + 1));

  els.verticalToggle.addEventListener("change", () => {
    els.readerBody.classList.toggle("is-vertical", els.verticalToggle.checked);
    els.readerBody.scrollTo({ top: 0, left: 0 });
  });

  els.copyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flashButton(els.copyLink, "已复制");
    } catch {
      flashButton(els.copyLink, "复制失败");
    }
  });

  window.addEventListener("hashchange", () => {
    const requested = getRequestedBook();
    const book = state.books.find((item) => item.code === requested || item.file === requested);
    if (book && book.file !== state.selectedBook?.file) {
      openBook(book, { replace: true });
    }
  });
}

function renderCategoryControls() {
  const options = ["全部", ...state.categories.map((category) => category.name)];
  els.categoryFilter.innerHTML = options
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");

  els.categoryRail.replaceChildren(
    ...options.map((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-pill";
      button.textContent = name;
      button.setAttribute("aria-pressed", name === state.category ? "true" : "false");
      button.addEventListener("click", () => setCategory(name));
      return button;
    }),
  );
}

function setCategory(category) {
  state.category = category;
  els.categoryFilter.value = category;
  for (const pill of els.categoryRail.querySelectorAll(".category-pill")) {
    pill.setAttribute("aria-pressed", pill.textContent === category ? "true" : "false");
  }
  applyFilters();
}

function applyFilters() {
  const query = normalize(els.librarySearch.value);
  let books = state.books;

  if (state.category !== "全部") {
    books = books.filter((book) => book.category === state.category);
  }

  if (query) {
    books = books.filter((book) => {
      const haystack = normalize(
        `${book.code} ${book.title} ${book.category} ${book.file}`,
      );
      return haystack.includes(query);
    });
  }

  books = [...books].sort((a, b) => {
    switch (els.sortMode.value) {
      case "title":
        return collator.compare(a.title, b.title);
      case "size-desc":
        return b.size - a.size;
      case "size-asc":
        return a.size - b.size;
      case "number":
      default:
        return a.id - b.id || collator.compare(a.file, b.file);
    }
  });

  els.resultCount.textContent = `${books.length} 部`;
  renderBookList(books);
}

function renderBookList(books) {
  const fragment = document.createDocumentFragment();

  for (const book of books) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `book-item${book.file === state.selectedBook?.file ? " is-active" : ""}`;
    button.dataset.file = book.file;
    button.innerHTML = `
      <span class="book-item-title">${escapeHtml(book.title)}</span>
      <span class="book-item-meta">
        <span>${escapeHtml(book.code)}</span>
        <span>${escapeHtml(book.category)}</span>
        <span>${formatBytes(book.size)}</span>
      </span>
    `;
    fragment.append(button);
  }

  els.bookList.replaceChildren(fragment);
}

async function openBook(book, options = {}) {
  state.abortController?.abort();
  const controller = new AbortController();
  state.abortController = controller;
  state.selectedBook = book;
  state.currentText = "";
  state.currentLines = [];
  state.matches = [];
  state.matchIndex = -1;

  document.title = `${book.title} · 中医古籍浏览器`;
  els.bookMeta.textContent = `${book.code} · ${book.category} · ${formatBytes(book.size)}`;
  els.bookTitle.textContent = book.title;
  els.downloadLink.href = encodeURI(book.file);
  els.downloadLink.download = book.file;
  els.bookSearch.value = "";
  els.bookSearch.disabled = true;
  els.bookSearchCount.textContent = "";
  els.prevMatch.disabled = true;
  els.nextMatch.disabled = true;
  els.matchPanel.hidden = true;
  els.bookContent.classList.add("is-loading");
  els.bookContent.textContent = "载入中...";
  els.readerBody.scrollTo({ top: 0, left: 0 });
  updateBookListActiveState();
  updateUrl(book, options.replace);

  try {
    const response = await fetch(encodeURI(book.file), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Text request failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const text = normalizeText(decodeBuffer(buffer));
    state.currentText = text;
    state.currentLines = text.split("\n");
    els.bookContent.textContent = text;
    els.bookContent.classList.remove("is-loading");
    els.bookSearch.disabled = false;
  } catch (error) {
    if (error.name === "AbortError") return;
    els.bookContent.textContent = `无法载入 ${book.file}\n${error.message}`;
    els.bookContent.classList.remove("is-loading");
  }
}

function updateBookListActiveState() {
  for (const item of els.bookList.querySelectorAll(".book-item")) {
    item.classList.toggle("is-active", item.dataset.file === state.selectedBook?.file);
  }
}

function updateBookSearch() {
  const query = els.bookSearch.value.trim();
  state.matches = [];
  state.matchIndex = -1;

  if (!query || !state.currentText) {
    els.bookSearchCount.textContent = "";
    els.prevMatch.disabled = true;
    els.nextMatch.disabled = true;
    els.matchPanel.hidden = true;
    return;
  }

  const queryLower = normalize(query);
  state.currentLines.forEach((line, index) => {
    if (normalize(line).includes(queryLower)) {
      state.matches.push({
        lineNumber: index + 1,
        text: line.trim() || " ",
      });
    }
  });

  state.matchIndex = state.matches.length ? 0 : -1;
  els.bookSearchCount.textContent = `${state.matches.length} 处`;
  els.prevMatch.disabled = !state.matches.length;
  els.nextMatch.disabled = !state.matches.length;
  renderMatchPanel(query);

  if (state.matches.length) {
    scrollToMatch(0, false);
  }
}

function renderMatchPanel(query) {
  if (!query) {
    els.matchPanel.hidden = true;
    return;
  }

  const visibleMatches = state.matches.slice(0, 200);
  const capped = state.matches.length > visibleMatches.length;
  els.matchPanel.hidden = false;
  els.matchPanel.innerHTML = `
    <h3>${state.matches.length} 处</h3>
    <div class="match-list">
      ${
        visibleMatches.length
          ? visibleMatches
              .map(
                (match, index) => `
                  <button class="match-item${
                    index === state.matchIndex ? " is-active" : ""
                  }" type="button" data-match="${index}">
                    <span class="match-line">第 ${match.lineNumber} 行</span>
                    <span class="match-snippet">${highlightSnippet(match.text, query)}</span>
                  </button>
                `,
              )
              .join("")
          : `<div class="match-snippet">无结果</div>`
      }
      ${capped ? `<div class="match-snippet">仅显示前 200 处</div>` : ""}
    </div>
  `;

  for (const button of els.matchPanel.querySelectorAll("[data-match]")) {
    button.addEventListener("click", () => {
      state.matchIndex = Number(button.dataset.match);
      renderMatchPanel(query);
      scrollToMatch(state.matchIndex);
    });
  }
}

function moveMatch(delta) {
  if (!state.matches.length) return;
  state.matchIndex = (state.matchIndex + delta + state.matches.length) % state.matches.length;
  renderMatchPanel(els.bookSearch.value.trim());
  scrollToMatch(state.matchIndex);
}

function scrollToMatch(index, smooth = true) {
  const match = state.matches[index];
  if (!match) return;

  const maxTop = els.readerBody.scrollHeight - els.readerBody.clientHeight;
  const maxLeft = els.readerBody.scrollWidth - els.readerBody.clientWidth;
  const ratio =
    state.currentLines.length > 1 ? (match.lineNumber - 1) / (state.currentLines.length - 1) : 0;

  if (els.readerBody.classList.contains("is-vertical")) {
    els.readerBody.scrollTo({
      left: maxLeft * ratio,
      top: 0,
      behavior: smooth ? "smooth" : "auto",
    });
  } else {
    els.readerBody.scrollTo({
      top: maxTop * ratio,
      left: 0,
      behavior: smooth ? "smooth" : "auto",
    });
  }
}

function updateUrl(book, replace = false) {
  const params = new URLSearchParams();
  params.set("book", book.code || book.file);
  const next = `${window.location.pathname}${window.location.search}#${params.toString()}`;
  if (replace) {
    window.history.replaceState(null, "", next);
  } else {
    window.history.pushState(null, "", next);
  }
}

function getRequestedBook() {
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("book");
}

function setFontSize(size) {
  state.fontSize = Math.min(26, Math.max(15, size));
  document.documentElement.style.setProperty("--reader-font-size", `${state.fontSize}px`);
}

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function decodeBuffer(buffer) {
  try {
    return encoders.utf8.decode(buffer);
  } catch {
    return encoders.gb18030.decode(buffer);
  }
}

function createDecoder(label) {
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
}

function normalizeText(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "");
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("zh-Hans-CN");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightSnippet(text, query) {
  const clean = text.replace(/\s+/g, " ").trim();
  const haystack = normalize(clean);
  const needle = normalize(query);
  const index = haystack.indexOf(needle);

  if (index === -1) {
    return escapeHtml(clean.slice(0, 120));
  }

  const start = Math.max(0, index - 36);
  const end = Math.min(clean.length, index + query.length + 66);
  const before = clean.slice(start, index);
  const hit = clean.slice(index, index + query.length);
  const after = clean.slice(index + query.length, end);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < clean.length ? "..." : "";

  return `${escapeHtml(prefix + before)}<mark>${escapeHtml(hit)}</mark>${escapeHtml(
    after + suffix,
  )}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units.shift();
  while (value >= 1024 && units.length) {
    value /= 1024;
    unit = units.shift();
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}
