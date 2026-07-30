"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  CalendarBlank,
  Check,
  DownloadSimple,
  FileArrowUp,
  Info,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  Plus,
  Tag,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type StudyEntry = {
  id: string;
  original: string;
  changed: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  original: string;
  changed: string;
  note: string;
  tags: string[];
  customTags: string;
  createdAt: string;
};

type DiffKind = "same" | "removed" | "added";

type DiffSegment = {
  text: string;
  kind: DiffKind;
};

const STORAGE_KEY = "revision-reader.entries.v2";
const DEFAULT_TAGS = ["时态", "冠词", "介词", "词汇"];

const sampleEntries: StudyEntry[] = [
  {
    id: "sample-1",
    original: "She go to the library every Saturday.",
    changed: "She goes to the library every Saturday.",
    note: "一般现在时中，第三人称单数主语后面的动词需要加 -s。",
    tags: ["时态"],
    createdAt: "2026-07-28",
    updatedAt: "2026-07-28",
  },
  {
    id: "sample-2",
    original: "I have seen him yesterday.",
    changed: "I saw him yesterday.",
    note: "yesterday 表示明确的过去时间，通常使用一般过去时。",
    tags: ["时态"],
    createdAt: "2026-07-26",
    updatedAt: "2026-07-26",
  },
  {
    id: "sample-3",
    original: "He is good in playing the piano.",
    changed: "He is good at playing the piano.",
    note: "固定搭配是 be good at doing something。",
    tags: ["介词"],
    createdAt: "2026-07-24",
    updatedAt: "2026-07-24",
  },
  {
    id: "sample-4",
    original: "I bought a umbrella on my way home.",
    changed: "I bought an umbrella on my way home.",
    note: "umbrella 以元音音素开头，前面使用 an。",
    tags: ["冠词"],
    createdAt: "2026-07-22",
    updatedAt: "2026-07-22",
  },
  {
    id: "sample-5",
    original: "The news make me very exciting.",
    changed: "The news makes me very excited.",
    note: "news 作不可数名词；excited 描述人的感受，exciting 描述事物令人兴奋。",
    tags: ["时态", "词汇"],
    createdAt: "2026-07-19",
    updatedAt: "2026-07-19",
  },
  {
    id: "sample-6",
    original: "Although it was raining, but we continued the trip.",
    changed: "Although it was raining, we continued the trip.",
    note: "Although 和 but 不在同一个句子里连用。",
    tags: ["词汇"],
    createdAt: "2026-07-16",
    updatedAt: "2026-07-16",
  },
];

const emptyForm = (): FormState => ({
  original: "",
  changed: "",
  note: "",
  tags: [],
  customTags: "",
  createdAt: new Date().toISOString().slice(0, 10),
});

function tokenize(text: string) {
  return (
    text.match(
      /\s+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu,
    ) ?? []
  );
}

function appendSegment(
  segments: DiffSegment[],
  text: string,
  kind: DiffKind,
) {
  const last = segments.at(-1);
  if (last?.kind === kind) {
    last.text += text;
  } else {
    segments.push({ text, kind });
  }
}

function diffText(original: string, changed: string) {
  const leftTokens = tokenize(original);
  const rightTokens = tokenize(changed);
  const lcs = Array.from({ length: leftTokens.length + 1 }, () =>
    Array(rightTokens.length + 1).fill(0),
  );

  for (let i = leftTokens.length - 1; i >= 0; i -= 1) {
    for (let j = rightTokens.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        leftTokens[i] === rightTokens[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const left: DiffSegment[] = [];
  const right: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < leftTokens.length || j < rightTokens.length) {
    if (
      i < leftTokens.length &&
      j < rightTokens.length &&
      leftTokens[i] === rightTokens[j]
    ) {
      appendSegment(left, leftTokens[i], "same");
      appendSegment(right, rightTokens[j], "same");
      i += 1;
      j += 1;
    } else if (
      i < leftTokens.length &&
      (j >= rightTokens.length || lcs[i + 1][j] >= lcs[i][j + 1])
    ) {
      appendSegment(left, leftTokens[i], "removed");
      i += 1;
    } else if (j < rightTokens.length) {
      appendSegment(right, rightTokens[j], "added");
      j += 1;
    }
  }

  return { left, right };
}

function HighlightedSentence({
  segments,
  side,
}: {
  segments: DiffSegment[];
  side: "left" | "right";
}) {
  return (
    <p className="sentence-text">
      {segments.map((segment, index) => {
        const isChanged =
          (side === "left" && segment.kind === "removed") ||
          (side === "right" && segment.kind === "added");
        return (
          <span
            className={isChanged ? `diff-${segment.kind}` : undefined}
            key={`${index}-${segment.text}`}
          >
            {segment.text}
          </span>
        );
      })}
    </p>
  );
}

function IconButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button${tone === "danger" ? " danger" : ""}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export default function Home() {
  const [entries, setEntries] = useState<StudyEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("全部");
  const [sortNewest, setSortNewest] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Client-only hydration avoids a server/client mismatch while restoring
     persisted entries after the first mount. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StudyEntry[];
        setEntries(Array.isArray(parsed) ? parsed : sampleEntries);
      } else {
        setEntries(sampleEntries);
      }
    } catch {
      setEntries(sampleEntries);
    } finally {
      setReady(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  }, [entries, ready]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const allTags = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_TAGS, ...entries.flatMap((entry) => entry.tags)]),
      ),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...entries]
      .filter((entry) => activeTag === "全部" || entry.tags.includes(activeTag))
      .filter((entry) => {
        if (!normalizedQuery) return true;
        return [
          entry.original,
          entry.changed,
          entry.note,
          entry.tags.join(" "),
        ].some((field) => field.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) =>
        sortNewest
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt),
      );
  }, [activeTag, entries, query, sortNewest]);

  const openNewEntry = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEditEntry = (entry: StudyEntry) => {
    const customTags = entry.tags.filter(
      (tagName) => !DEFAULT_TAGS.includes(tagName),
    );
    setEditingId(entry.id);
    setForm({
      original: entry.original,
      changed: entry.changed,
      note: entry.note,
      tags: entry.tags.filter((tagName) => DEFAULT_TAGS.includes(tagName)),
      customTags: customTags.join("、"),
      createdAt: entry.createdAt,
    });
    setModalOpen(true);
  };

  const submitEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const customTags = form.customTags
      .split(/[,，、]/)
      .map((tagName) => tagName.trim())
      .filter(Boolean);
    const nextTags = Array.from(new Set([...form.tags, ...customTags]));
    const now = new Date().toISOString().slice(0, 10);

    if (editingId) {
      setEntries((current) =>
        current.map((entry) =>
          entry.id === editingId
            ? {
                ...entry,
                original: form.original.trim(),
                changed: form.changed.trim(),
                note: form.note.trim(),
                tags: nextTags,
                createdAt: form.createdAt,
                updatedAt: now,
              }
            : entry,
        ),
      );
      setToast("这一组已更新");
    } else {
      setEntries((current) => [
        {
          id: crypto.randomUUID(),
          original: form.original.trim(),
          changed: form.changed.trim(),
          note: form.note.trim(),
          tags: nextTags,
          createdAt: form.createdAt,
          updatedAt: now,
        },
        ...current,
      ]);
      setToast("新错句已加入");
    }

    setModalOpen(false);
  };

  const deleteEntry = (entry: StudyEntry) => {
    if (!window.confirm(`确定删除这组句子吗？\n\n${entry.original}`)) return;
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setToast("已删除");
  };

  const toggleFormTag = (tagName: string) => {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tagName)
        ? current.tags.filter((tag) => tag !== tagName)
        : [...current.tags, tagName],
    }));
  };

  const exportEntries = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revision-reader-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("备份文件已导出");
  };

  const importEntries = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as StudyEntry[];
      const isValid =
        Array.isArray(parsed) &&
        parsed.every(
          (entry) =>
            typeof entry.id === "string" &&
            typeof entry.original === "string" &&
            typeof entry.changed === "string" &&
            typeof entry.note === "string" &&
            Array.isArray(entry.tags) &&
            typeof entry.createdAt === "string",
        );

      if (!isValid) throw new Error("Invalid data");
      if (
        entries.length > 0 &&
        !window.confirm("导入会替换当前全部内容，是否继续？")
      ) {
        return;
      }
      setEntries(parsed);
      setToast(`已导入 ${parsed.length} 组句子`);
    } catch {
      window.alert("无法导入：请选择由本应用导出的 JSON 文件。");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <BookOpenText size={22} weight="duotone" />
          </div>
          <div>
            <h1>Revision Reader</h1>
            <p>我的英语错句对照本</p>
          </div>
        </div>

        <label className="search-box">
          <MagnifyingGlass aria-hidden="true" size={18} />
          <input
            aria-label="搜索句子、备注或标签"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索句子、备注或标签"
            type="search"
            value={query}
          />
          {query && (
            <button
              aria-label="清除搜索"
              onClick={() => setQuery("")}
              type="button"
            >
              <X size={16} />
            </button>
          )}
        </label>

        <div className="topbar-actions">
          <input
            accept=".json,application/json"
            className="visually-hidden"
            onChange={importEntries}
            ref={fileInputRef}
            type="file"
          />
          <IconButton
            label="导入备份"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileArrowUp size={20} />
          </IconButton>
          <IconButton label="导出备份" onClick={exportEntries}>
            <DownloadSimple size={20} />
          </IconButton>
          <button className="primary-button" onClick={openNewEntry} type="button">
            <Plus size={18} weight="bold" />
            新增一组
          </button>
        </div>
      </header>

      <section className="filterbar" aria-label="筛选与排序">
        <div className="tag-filters">
          <Tag aria-hidden="true" size={17} />
          {["全部", ...allTags].map((tagName) => (
            <button
              aria-pressed={activeTag === tagName}
              className={activeTag === tagName ? "active" : ""}
              key={tagName}
              onClick={() => setActiveTag(tagName)}
              type="button"
            >
              {tagName}
            </button>
          ))}
        </div>
        <button
          className="sort-button"
          onClick={() => setSortNewest((current) => !current)}
          type="button"
        >
          <CalendarBlank size={17} />
          {sortNewest ? "最新在前" : "最早在前"}
          {sortNewest ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
        </button>
      </section>

      <section className="reader-shell">
        <div className="column-headings" aria-hidden="true">
          <div className="column-heading original-heading">
            <span className="heading-dot" />
            <strong>Original</strong>
            <span>我的原句</span>
          </div>
          <div className="column-heading changed-heading">
            <span className="heading-dot" />
            <strong>Changed</strong>
            <span>修改后的句子</span>
          </div>
        </div>

        <div className="reader-scroll">
          <div className="reader-summary">
            <span>
              Showing <strong>{visibleEntries.length}</strong> of {entries.length}
            </span>
            <span>Changes are highlighted automatically</span>
          </div>

          {!ready ? (
            <div className="empty-state">正在打开你的错句本…</div>
          ) : visibleEntries.length === 0 ? (
            <div className="empty-state">
              <MagnifyingGlass size={28} />
              <strong>没有找到匹配的句子</strong>
              <span>试试其他关键词或标签。</span>
              <button onClick={() => setQuery("")} type="button">
                清除筛选
              </button>
            </div>
          ) : (
            <div className="comparison-list">
              {visibleEntries.map((entry, index) => {
                const diff = diffText(entry.original, entry.changed);
                return (
                  <article className="comparison-card" key={entry.id}>
                    <div className="entry-meta">
                      <div className="entry-identity">
                        <span className="entry-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <time dateTime={entry.createdAt}>{entry.createdAt}</time>
                        <div className="entry-tags">
                          {entry.tags.map((tagName) => (
                            <button
                              key={tagName}
                              onClick={() => setActiveTag(tagName)}
                              type="button"
                            >
                              {tagName}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="entry-actions">
                        <IconButton
                          label="编辑这组句子"
                          onClick={() => openEditEntry(entry)}
                        >
                          <PencilSimple size={18} />
                        </IconButton>
                        <IconButton
                          label="删除这组句子"
                          onClick={() => deleteEntry(entry)}
                          tone="danger"
                        >
                          <Trash size={18} />
                        </IconButton>
                      </div>
                    </div>

                    <div className="sentence-panel original-panel">
                      <span className="mobile-panel-label">Original</span>
                      <HighlightedSentence segments={diff.left} side="left" />
                    </div>
                    <div className="sentence-panel changed-panel">
                      <span className="mobile-panel-label">Changed</span>
                      <HighlightedSentence segments={diff.right} side="right" />
                    </div>

                    {entry.note && (
                      <div className="note-row">
                        <Info aria-hidden="true" size={17} weight="fill" />
                        <span className="note-label">Why it changed</span>
                        <p>{entry.note}</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div
          aria-label={editingId ? "编辑错句" : "新增错句"}
          aria-modal="true"
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
          role="dialog"
        >
          <form className="entry-modal" onSubmit={submitEntry}>
            <div className="modal-header">
              <div>
                <span className="modal-kicker">
                  {editingId ? "EDIT ENTRY" : "NEW ENTRY"}
                </span>
                <h2>{editingId ? "编辑这一组" : "新增一组错句"}</h2>
              </div>
              <IconButton label="关闭" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </IconButton>
            </div>

            <div className="modal-pair">
              <label className="sentence-field original-field">
                <span>
                  <i aria-hidden="true" />
                  Original
                </span>
                <textarea
                  autoFocus
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      original: event.target.value,
                    }))
                  }
                  placeholder="输入你原来写错的句子…"
                  required
                  value={form.original}
                />
              </label>
              <label className="sentence-field changed-field">
                <span>
                  <i aria-hidden="true" />
                  Changed
                </span>
                <textarea
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      changed: event.target.value,
                    }))
                  }
                  placeholder="输入改正后的句子…"
                  required
                  value={form.changed}
                />
              </label>
            </div>

            <label className="note-field">
              <span>
                <NotePencil size={17} />
                错误原因或备注 <small>可选</small>
              </span>
              <textarea
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="例如：第三人称单数后面的动词需要加 -s"
                value={form.note}
              />
            </label>

            <div className="form-details">
              <fieldset>
                <legend>标签</legend>
                <div className="tag-options">
                  {DEFAULT_TAGS.map((tagName) => (
                    <button
                      aria-pressed={form.tags.includes(tagName)}
                      className={form.tags.includes(tagName) ? "selected" : ""}
                      key={tagName}
                      onClick={() => toggleFormTag(tagName)}
                      type="button"
                    >
                      {form.tags.includes(tagName) && (
                        <Check size={13} weight="bold" />
                      )}
                      {tagName}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="自定义标签"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customTags: event.target.value,
                    }))
                  }
                  placeholder="自定义标签，用逗号分隔"
                  value={form.customTags}
                />
              </fieldset>
              <label className="date-field">
                <span>日期</span>
                <input
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      createdAt: event.target.value,
                    }))
                  }
                  required
                  type="date"
                  value={form.createdAt}
                />
              </label>
            </div>

            <div className="modal-footer">
              <span>保存后会自动高亮两边的不同内容</span>
              <div>
                <button
                  className="secondary-button"
                  onClick={() => setModalOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <button className="primary-button" type="submit">
                  <Check size={18} weight="bold" />
                  {editingId ? "保存修改" : "加入错句本"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={17} weight="bold" />
          {toast}
        </div>
      )}
    </main>
  );
}
