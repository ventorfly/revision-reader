"use client";

import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  BookOpenText,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
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
  kind: "comparison" | "knowledge";
  original: string;
  changed: string;
  note: string;
  preserveNoteLineBreaks?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  kind: "comparison" | "knowledge";
  original: string;
  changed: string;
  note: string;
  tags: string[];
  customTags: string;
  createdAt: string;
};

type DesktopStorageResult = {
  ok: boolean;
  error?: string;
};

type DesktopBackupResult = DesktopStorageResult & {
  savedAt?: string;
};

type DesktopBackupLoadResult = DesktopStorageResult & {
  entries?: unknown;
  savedAt?: string;
};

type DesktopUpdateResult = DesktopStorageResult & {
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  downloadUrl?: string;
};

declare global {
  interface Window {
    revisionReaderStorage?: {
      loadLatestBackup: () => Promise<DesktopBackupLoadResult>;
      saveBackup: (entries: StudyEntry[]) => Promise<DesktopBackupResult>;
    };
    revisionReaderDesktop?: {
      checkForUpdates: () => Promise<DesktopUpdateResult>;
      openUpdateDownload: (url: string) => Promise<DesktopStorageResult>;
    };
  }
}

type DiffKind = "same" | "removed" | "added";
type DateScope = "all" | "today" | "last7" | "date";

type DiffSegment = {
  text: string;
  kind: DiffKind;
};

const STORAGE_KEY = "revision-reader.entries.v2";
const DEFAULT_TAGS = ["时态", "冠词", "介词", "词汇"];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function matchesDateScope(
  entryDate: string,
  scope: DateScope,
  activeDate: string | null,
  today: string,
  lastSevenStart: string,
) {
  if (scope === "today") return entryDate === today;
  if (scope === "last7") {
    return entryDate >= lastSevenStart && entryDate <= today;
  }
  if (scope === "date") return entryDate === activeDate;
  return true;
}

const sampleEntries: StudyEntry[] = [
  {
    id: "sample-1",
    kind: "comparison",
    original: "She go to the library every Saturday.",
    changed: "She goes to the library every Saturday.",
    note: "一般现在时中，第三人称单数主语后面的动词需要加 -s。",
    tags: ["时态"],
    createdAt: "2026-07-28",
    updatedAt: "2026-07-28",
  },
  {
    id: "sample-2",
    kind: "comparison",
    original: "I have seen him yesterday.",
    changed: "I saw him yesterday.",
    note: "yesterday 表示明确的过去时间，通常使用一般过去时。",
    tags: ["时态"],
    createdAt: "2026-07-26",
    updatedAt: "2026-07-26",
  },
  {
    id: "sample-3",
    kind: "comparison",
    original: "He is good in playing the piano.",
    changed: "He is good at playing the piano.",
    note: "固定搭配是 be good at doing something。",
    tags: ["介词"],
    createdAt: "2026-07-24",
    updatedAt: "2026-07-24",
  },
  {
    id: "sample-4",
    kind: "comparison",
    original: "I bought a umbrella on my way home.",
    changed: "I bought an umbrella on my way home.",
    note: "umbrella 以元音音素开头，前面使用 an。",
    tags: ["冠词"],
    createdAt: "2026-07-22",
    updatedAt: "2026-07-22",
  },
  {
    id: "sample-5",
    kind: "comparison",
    original: "The news make me very exciting.",
    changed: "The news makes me very excited.",
    note: "news 作不可数名词；excited 描述人的感受，exciting 描述事物令人兴奋。",
    tags: ["时态", "词汇"],
    createdAt: "2026-07-19",
    updatedAt: "2026-07-19",
  },
  {
    id: "sample-6",
    kind: "comparison",
    original: "Although it was raining, but we continued the trip.",
    changed: "Although it was raining, we continued the trip.",
    note: "Although 和 but 不在同一个句子里连用。",
    tags: ["词汇"],
    createdAt: "2026-07-16",
    updatedAt: "2026-07-16",
  },
];

const emptyForm = (): FormState => ({
  kind: "comparison",
  original: "",
  changed: "",
  note: "",
  tags: [],
  customTags: "",
  createdAt: localDateKey(),
});

function normalizeEntries(value: unknown): StudyEntry[] | null {
  if (!Array.isArray(value)) return null;

  const normalized: StudyEntry[] = [];
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("id" in entry) ||
      !("original" in entry) ||
      !("changed" in entry) ||
      !("note" in entry) ||
      !("tags" in entry) ||
      !("createdAt" in entry) ||
      typeof entry.id !== "string" ||
      typeof entry.original !== "string" ||
      typeof entry.changed !== "string" ||
      typeof entry.note !== "string" ||
      !Array.isArray(entry.tags) ||
      !entry.tags.every((tag: unknown) => typeof tag === "string") ||
      typeof entry.createdAt !== "string"
    ) {
      return null;
    }

    normalized.push({
      id: entry.id,
      kind:
        "kind" in entry && entry.kind === "knowledge"
          ? "knowledge"
          : "comparison",
      original: entry.original,
      changed: entry.changed,
      note: entry.note,
      ...("preserveNoteLineBreaks" in entry &&
      entry.preserveNoteLineBreaks === true
        ? { preserveNoteLineBreaks: true }
        : {}),
      tags: [...entry.tags],
      createdAt: entry.createdAt,
      updatedAt:
        "updatedAt" in entry && typeof entry.updatedAt === "string"
          ? entry.updatedAt
          : entry.createdAt,
    });
  }

  return normalized;
}

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

function splitChangedAlternatives(changed: string) {
  const alternatives = changed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return alternatives.length > 0 ? alternatives : [changed];
}

function emphasizeInsertedInfinitive(segments: DiffSegment[]) {
  return segments.map((segment, index) => {
    const isSingleSharedWord =
      /^\s*[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*\s*$/u.test(segment.text);
    const followsAddedTo =
      segments[index - 1]?.kind === "added" &&
      segments[index - 1]?.text.trim().toLocaleLowerCase() === "to";

    return segment.kind === "same" &&
      isSingleSharedWord &&
      followsAddedTo
      ? { ...segment, kind: "added" as const }
      : segment;
  });
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

function ReviewSession({ entries, onClose }: {
  entries: StudyEntry[];
  onClose: () => void;
}) {
  const [round, setRound] = useState(() => entries.slice(0, 5));
  const [remaining, setRemaining] = useState(() => entries.slice(5));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [retry, setRetry] = useState<StudyEntry[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const entry = round[index];
  const complete = !entry;

  useEffect(() => {
    headingRef.current?.focus();
  }, [index, roundNumber]);

  useEffect(() => {
    if (revealed) actionRef.current?.focus();
  }, [revealed]);

  const grade = (again: boolean) => {
    if (!revealed || !entry) return;
    if (again) setRetry((current) => [...current, entry]);
    setRevealed(false);
    setIndex((current) => current + 1);
  };

  const startRound = (items: StudyEntry[], rest: StudyEntry[]) => {
    setRound(items.slice(0, 5));
    setRemaining(rest);
    setRetry([]);
    setRevealed(false);
    setIndex(0);
    setRoundNumber((current) => current + 1);
  };

  const alternatives = entry ? splitChangedAlternatives(entry.changed) : [];
  const primaryDiff = entry && revealed
    ? diffText(entry.original, alternatives[0] ?? entry.changed) : null;

  return (
    <main className="review-shell">
      <header className="review-topbar">
        <div className="brand">
          <div className="brand-mark"><BookOpenText size={22} /></div>
          <div><h1>复习模式</h1><p>每轮最多 5 条 · 先回忆，再揭晓</p></div>
        </div>
        <button className="review-button" onClick={onClose} type="button">
          <X size={16} />退出复习
        </button>
      </header>
      <div className="review-body">
        <div className="review-progress-row">
          <span>第 {roundNumber} 轮</span>
          <span>{complete ? `已完成 ${round.length} 条` : `第 ${index + 1} / ${round.length} 条`}</span>
        </div>
        <progress aria-label="本轮复习进度" max={round.length} value={index} />
        {complete ? (
          <section className="review-complete">
            <Check size={36} className="review-success" />
            <h2 ref={headingRef} tabIndex={-1}>这一轮完成了</h2>
            <p>本轮会了 {round.length - retry.length} 条，还有 {retry.length} 条想再练。</p>
            <div className="review-actions">
              {retry.length > 0 && (
                <button className="primary-button" onClick={() => startRound(retry, remaining)} type="button">
                  重练这 {retry.length} 条
                </button>
              )}
              {remaining.length > 0 && (
                <button className="review-button" onClick={() => startRound(remaining, [...remaining.slice(5), ...retry])} type="button">
                  继续下一组（{Math.min(5, remaining.length)} 条）
                </button>
              )}
              <button className="review-button" onClick={onClose} type="button">结束复习</button>
            </div>
            <p className="review-caption">本次标记只用于这次复习；退出后不保留进度。</p>
          </section>
        ) : (
          <>
            <h2 className="review-prompt" ref={headingRef} tabIndex={-1}>
              {revealed ? "对照答案，看看自己掌握了吗" : "先试着改一改这句话"}
            </h2>
            <p className="review-caption">有些原句本身也正确。意思符合、表达正确即可，不必逐字一致。</p>
            <article className="comparison-card review-card" key={`${roundNumber}-${entry.id}`}>
              <div className="entry-meta"><time dateTime={entry.createdAt}>{entry.createdAt}</time></div>
              <div className="sentence-panel original-panel">
                <span className="review-panel-label original-heading">Original · 我的原句</span>
                {primaryDiff ? <HighlightedSentence segments={primaryDiff.left} side="left" /> : (
                  <p className="sentence-text review-original">{entry.original}</p>
                )}
              </div>
              <div className="sentence-panel changed-panel">
                <span className="review-panel-label changed-heading">Changed · 修改后的句子</span>
                {revealed ? (
                  <div className="changed-alternatives">
                    {alternatives.map((alternative, alternativeIndex) => (
                      <HighlightedSentence key={alternativeIndex} segments={emphasizeInsertedInfinitive(diffText(entry.original, alternative).right)} side="right" />
                    ))}
                  </div>
                ) : (
                  <div className="review-covered">
                    <span>答案和备注已隐藏</span>
                    <button className="primary-button" onClick={() => setRevealed(true)} type="button">显示答案</button>
                    <small>先自己说一句，再点击揭晓</small>
                  </div>
                )}
              </div>
              {revealed && entry.note && (
                <div className={`note-row${entry.preserveNoteLineBreaks ? " preserve-line-breaks" : ""}`}>
                  <Info aria-hidden="true" size={17} weight="fill" />
                  <span className="note-label">Why it changed</span><p>{entry.note}</p>
                </div>
              )}
            </article>
            {revealed && (
              <div className="review-actions">
                <button className="review-button" ref={actionRef} onClick={() => grade(true)} type="button">再练</button>
                <button className="primary-button" onClick={() => grade(false)} type="button"><Check size={18} />会了</button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  const [entries, setEntries] = useState<StudyEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [reviewEntries, setReviewEntries] = useState<StudyEntry[] | null>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("全部");
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [dateScope, setDateScope] = useState<DateScope>("all");
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    localDateKey().slice(0, 7),
  );
  const [sortNewest, setSortNewest] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState("");
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const dateFilterButtonRef = useRef<HTMLButtonElement>(null);
  const backupWarningShownRef = useRef(false);

  /* Client-only hydration avoids a server/client mismatch while restoring
     persisted entries after the first mount. */
  useEffect(() => {
    let active = true;

    const restoreEntries = async () => {
      let restoredEntries: StudyEntry[] | null = null;
      let recoveredFromBackup = false;

      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          restoredEntries = normalizeEntries(JSON.parse(stored));
        }
      } catch {
        restoredEntries = null;
      }

      if (!restoredEntries && window.revisionReaderStorage) {
        try {
          const result =
            await window.revisionReaderStorage.loadLatestBackup();
          if (result.ok) {
            restoredEntries = normalizeEntries(result.entries);
            recoveredFromBackup = Boolean(restoredEntries);
          }
        } catch {
          restoredEntries = null;
        }
      }

      if (!active) return;
      setEntries(restoredEntries ?? sampleEntries);
      setReady(true);
      if (recoveredFromBackup) {
        setToast("已从最近的自动备份恢复");
      }
    };

    void restoreEntries();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    let localStorageSaved = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      localStorageSaved = false;
    }

    const desktopStorage = window.revisionReaderStorage;
    if (desktopStorage) {
      void desktopStorage
        .saveBackup(entries)
        .then((result) => {
          if (result.ok && result.savedAt) return;

          if (!backupWarningShownRef.current) {
            backupWarningShownRef.current = true;
            setToast("自动备份暂时未成功，请导出一份备份文件");
          }
        })
        .catch(() => {
          if (!backupWarningShownRef.current) {
            backupWarningShownRef.current = true;
            setToast("自动备份暂时未成功，请导出一份备份文件");
          }
        });
    } else if (!localStorageSaved && !backupWarningShownRef.current) {
      backupWarningShownRef.current = true;
      setToast("本地保存失败，请立即导出备份文件");
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

  useEffect(() => {
    if (!dateMenuOpen) return;

    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !dateFilterRef.current?.contains(event.target)
      ) {
        setDateMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDateMenuOpen(false);
        window.requestAnimationFrame(() => dateFilterButtonRef.current?.focus());
      }
    };

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenClickingOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [dateMenuOpen]);

  const [todayDateKey, setTodayDateKey] = useState(localDateKey);

  useEffect(() => {
    const refreshLocalDate = () => setTodayDateKey(localDateKey());
    refreshLocalDate();
    const interval = window.setInterval(refreshLocalDate, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const allTags = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_TAGS, ...entries.flatMap((entry) => entry.tags)]),
      ),
    [entries],
  );

  const dateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
      if (!entry.createdAt) return;
      counts.set(entry.createdAt, (counts.get(entry.createdAt) ?? 0) + 1);
    });

    return Array.from(counts, ([date, count]) => ({ date, count })).sort(
      (left, right) => right.date.localeCompare(left.date),
    );
  }, [entries]);

  const monthOptions = useMemo(
    () =>
      Array.from(new Set(dateOptions.map(({ date }) => date.slice(0, 7)))),
    [dateOptions],
  );

  const displayedMonth = monthOptions.includes(visibleMonth)
    ? visibleMonth
    : (monthOptions[0] ?? visibleMonth);

  const lastSevenStart = useMemo(() => {
    const [year, month, day] = todayDateKey.split("-").map(Number);
    const start = new Date(year, month - 1, day);
    start.setDate(start.getDate() - 6);
    return localDateKey(start);
  }, [todayDateKey]);

  const visibleMonthDates = useMemo(
    () => dateOptions.filter(({ date }) => date.startsWith(displayedMonth)),
    [dateOptions, displayedMonth],
  );

  const visibleMonthIndex = monthOptions.indexOf(displayedMonth);
  const canShowOlderMonth =
    visibleMonthIndex >= 0 && visibleMonthIndex < monthOptions.length - 1;
  const canShowNewerMonth = visibleMonthIndex > 0;

  const dateScopeLabel =
    dateScope === "today"
      ? "今天"
      : dateScope === "last7"
        ? "最近7天"
        : dateScope === "date" && activeDate
          ? activeDate
          : "全部句子";

  const dateScopeCount = useMemo(
    () =>
      entries.filter((entry) =>
        matchesDateScope(
          entry.createdAt,
          dateScope,
          activeDate,
          todayDateKey,
          lastSevenStart,
        ),
      ).length,
    [activeDate, dateScope, entries, lastSevenStart, todayDateKey],
  );

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingEntries = entries
      .filter((entry) => activeTag === "全部" || entry.tags.includes(activeTag))
      .filter((entry) =>
        matchesDateScope(
          entry.createdAt,
          dateScope,
          activeDate,
          todayDateKey,
          lastSevenStart,
        ),
      )
      .filter((entry) => {
        if (!normalizedQuery) return true;
        return [
          entry.original,
          entry.changed,
          entry.note,
          entry.tags.join(" "),
        ].some((field) => field.toLowerCase().includes(normalizedQuery));
      });
    return matchingEntries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const dateOrder = a.entry.createdAt.localeCompare(b.entry.createdAt);
        if (dateOrder !== 0) return sortNewest ? -dateOrder : dateOrder;

        return sortNewest ? b.index - a.index : a.index - b.index;
      })
      .map(({ entry }) => entry);
  }, [
    activeDate,
    activeTag,
    dateScope,
    entries,
    lastSevenStart,
    query,
    sortNewest,
    todayDateKey,
  ]);

  const chooseDate = (date: string | null) => {
    setActiveDate(date);
    setDateScope(date ? "date" : "all");
    if (date) setVisibleMonth(date.slice(0, 7));
    setDateMenuOpen(false);
    window.requestAnimationFrame(() => dateFilterButtonRef.current?.focus());
  };

  const chooseDateScope = (scope: Exclude<DateScope, "date">) => {
    setActiveDate(null);
    setDateScope(scope);
    setDateMenuOpen(false);
    window.requestAnimationFrame(() => dateFilterButtonRef.current?.focus());
  };

  const clearFilters = () => {
    setQuery("");
    setActiveTag("全部");
    setActiveDate(null);
    setDateScope("all");
  };

  const openNewEntry = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const checkForUpdates = async () => {
    if (checkingForUpdates) return;

    const desktop = window.revisionReaderDesktop;
    if (!desktop) {
      window.open(
        "https://github.com/ventorfly/revision-reader/releases/latest",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    setCheckingForUpdates(true);
    try {
      const result = await desktop.checkForUpdates();
      if (!result.ok) {
        setToast("暂时无法检查更新，请稍后再试");
        return;
      }

      if (
        result.updateAvailable &&
        result.latestVersion &&
        result.downloadUrl
      ) {
        const shouldDownload = window.confirm(
          `发现新版本 v${result.latestVersion}。\n当前版本：v${result.currentVersion ?? "未知"}\n\n是否打开下载页面？`,
        );
        if (!shouldDownload) return;

        const opened = await desktop.openUpdateDownload(result.downloadUrl);
        if (!opened.ok) setToast("无法打开下载页面，请稍后再试");
        return;
      }

      setToast(`已是最新版本 v${result.currentVersion ?? ""}`.trim());
    } catch {
      setToast("暂时无法检查更新，请稍后再试");
    } finally {
      setCheckingForUpdates(false);
    }
  };

  const openEditEntry = (entry: StudyEntry) => {
    const customTags = entry.tags.filter(
      (tagName) => !DEFAULT_TAGS.includes(tagName),
    );
    setEditingId(entry.id);
    setForm({
      kind: entry.kind,
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
      const editingEntry = entries.find((entry) => entry.id === editingId);
      if (
        editingEntry &&
        activeDate === editingEntry.createdAt &&
        form.createdAt !== editingEntry.createdAt &&
        entries.filter((entry) => entry.createdAt === editingEntry.createdAt)
          .length === 1
      ) {
        setActiveDate(null);
        setDateScope("all");
      }

      setEntries((current) =>
        current.map((entry) =>
          entry.id === editingId
            ? {
                ...entry,
                kind: form.kind,
                original: form.original.trim(),
                changed:
                  form.kind === "knowledge" ? "" : form.changed.trim(),
                note: form.note.trim(),
                preserveNoteLineBreaks: true,
                tags: nextTags,
                createdAt: form.createdAt,
                updatedAt: now,
              }
            : entry,
        ),
      );
      setToast(form.kind === "knowledge" ? "知识点已更新" : "这一组已更新");
    } else {
      setEntries((current) => [
        {
          id: crypto.randomUUID(),
          kind: form.kind,
          original: form.original.trim(),
          changed: form.kind === "knowledge" ? "" : form.changed.trim(),
          note: form.note.trim(),
          preserveNoteLineBreaks: true,
          tags: nextTags,
          createdAt: form.createdAt,
          updatedAt: now,
        },
        ...current,
      ]);
      setToast(form.kind === "knowledge" ? "新知识点已加入" : "新错句已加入");
    }

    setModalOpen(false);
  };

  const deleteEntry = (entry: StudyEntry) => {
    if (
      !window.confirm(
        `${entry.kind === "knowledge" ? "确定删除这个知识点吗？" : "确定删除这组句子吗？"}\n\n${entry.original}`,
      )
    ) {
      return;
    }
    if (
      activeDate === entry.createdAt &&
      entries.filter((item) => item.createdAt === entry.createdAt).length === 1
    ) {
      setActiveDate(null);
      setDateScope("all");
    }
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
      const parsed = normalizeEntries(JSON.parse(await file.text()));
      if (!parsed) throw new Error("Invalid data");
      if (parsed.length === 0) {
        setToast("备份文件中没有句子");
        return;
      }

      const usedIds = new Set(entries.map((entry) => entry.id));
      const importedEntries = parsed.map((entry) => {
        if (!usedIds.has(entry.id)) {
          usedIds.add(entry.id);
          return entry;
        }

        let nextId = crypto.randomUUID();
        while (usedIds.has(nextId)) {
          nextId = crypto.randomUUID();
        }
        usedIds.add(nextId);
        return { ...entry, id: nextId };
      });

      if (
        entries.length > 0 &&
        !window.confirm(
          `将把 ${importedEntries.length} 组句子追加到现有 ${entries.length} 组句子后面，是否继续？`,
        )
      ) {
        return;
      }

      setEntries((current) => [...current, ...importedEntries]);
      setToast(
        `已追加 ${importedEntries.length} 组句子，共 ${
          entries.length + importedEntries.length
        } 组`,
      );
    } catch {
      window.alert("无法导入：请选择由本应用导出的 JSON 文件。");
    } finally {
      event.target.value = "";
    }
  };

  const reviewCandidates = visibleEntries.filter(
    (entry) => entry.kind === "comparison" && entry.changed.trim(),
  );

  const startReview = () => {
    const shuffled = [...reviewCandidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setDateMenuOpen(false);
    setReviewEntries(shuffled);
  };

  if (reviewEntries) {
    return <ReviewSession entries={reviewEntries} onClose={() => {
      setReviewEntries(null);
      window.requestAnimationFrame(() => reviewButtonRef.current?.focus());
    }} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <BookOpenText size={22} weight="duotone" />
          </div>
          <div className="brand-copy">
            <div className="brand-title-row">
              <h1>Revision Reader</h1>
              <button
                aria-label="检查软件更新"
                className={`update-button${checkingForUpdates ? " checking" : ""}`}
                disabled={checkingForUpdates}
                onClick={() => void checkForUpdates()}
                title="检查软件更新"
                type="button"
              >
                <ArrowClockwise aria-hidden="true" size={13} weight="bold" />
                {checkingForUpdates ? "检查中" : "检查更新"}
              </button>
            </div>
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
        <div className="filter-actions">
          <button
            className="review-start-button"
            disabled={!ready || reviewCandidates.length === 0}
            onClick={startReview}
            ref={reviewButtonRef}
            title={reviewCandidates.length ? `从当前筛选的 ${reviewCandidates.length} 条对照句中抽取，每轮最多 5 条` : "当前范围没有可复习的对照句"}
            type="button"
          >
            <BookOpenText size={17} />复习模式
          </button>
          <div className="date-filter" ref={dateFilterRef}>
            <button
              aria-controls="date-filter-menu"
              aria-expanded={dateMenuOpen}
              aria-haspopup="dialog"
              className={`date-filter-button${dateMenuOpen ? " open" : ""}`}
              onClick={() => {
                if (!dateMenuOpen && activeDate) {
                  setVisibleMonth(activeDate.slice(0, 7));
                }
                setDateMenuOpen((current) => !current);
              }}
              ref={dateFilterButtonRef}
              type="button"
            >
              <CalendarBlank aria-hidden="true" size={17} />
              显示：{dateScopeLabel}
              <CaretDown
                aria-hidden="true"
                className={dateMenuOpen ? "open" : ""}
                size={13}
                weight="bold"
              />
            </button>

            {dateMenuOpen && (
              <div
                aria-label="选择句子显示范围"
                className="date-filter-menu"
                id="date-filter-menu"
                role="dialog"
              >
                <span className="date-filter-title">选择显示范围</span>

                <div
                  aria-label="快速显示范围"
                  className="date-scope-switch"
                  role="group"
                >
                  {[
                    { label: "全部", scope: "all" as const },
                    { label: "今天", scope: "today" as const },
                    { label: "最近7天", scope: "last7" as const },
                  ].map((option) => (
                    <button
                      aria-pressed={dateScope === option.scope}
                      className={
                        dateScope === option.scope ? "selected" : ""
                      }
                      key={option.scope}
                      onClick={() => chooseDateScope(option.scope)}
                      type="button"
                    >
                      {dateScope === option.scope && (
                        <Check aria-hidden="true" size={14} weight="bold" />
                      )}
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="date-scope-summary">
                  <span className="date-scope-icon">
                    <BookOpenText aria-hidden="true" size={17} />
                  </span>
                  <strong>{dateScopeLabel}</strong>
                  <span>{dateScopeCount} 条</span>
                </div>

                <div className="date-month-picker">
                  <button
                    aria-label="上一个有内容的月份"
                    className="month-arrow"
                    disabled={!canShowOlderMonth}
                    onClick={() =>
                      setVisibleMonth(monthOptions[visibleMonthIndex + 1])
                    }
                    type="button"
                  >
                    <CaretLeft aria-hidden="true" size={18} weight="bold" />
                  </button>
                  <strong>{formatMonthLabel(displayedMonth)}</strong>
                  <button
                    aria-label="下一个有内容的月份"
                    className="month-arrow"
                    disabled={!canShowNewerMonth}
                    onClick={() =>
                      setVisibleMonth(monthOptions[visibleMonthIndex - 1])
                    }
                    type="button"
                  >
                    <CaretRight aria-hidden="true" size={18} weight="bold" />
                  </button>
                </div>

                <div className="date-filter-grid">
                  {visibleMonthDates.map((dateOption) => {
                    const isSelected =
                      dateScope === "date" && activeDate === dateOption.date;
                    const isToday = dateOption.date === todayDateKey;
                    return (
                      <button
                        aria-current={isToday ? "date" : undefined}
                        aria-pressed={isSelected}
                        className={`${isSelected ? "selected " : ""}${
                          isToday ? "today" : ""
                        }`.trim()}
                        key={dateOption.date}
                        onClick={() => chooseDate(dateOption.date)}
                        type="button"
                      >
                        <strong>{Number(dateOption.date.slice(8))}日</strong>
                        {isToday && (
                          <span className="date-today">
                            <i aria-hidden="true" />今天
                          </span>
                        )}
                        <span className="date-grid-count">
                          {dateOption.count} 条
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            className="sort-button"
            onClick={() => {
              setDateMenuOpen(false);
              setSortNewest((current) => !current);
            }}
            type="button"
          >
            <CalendarBlank size={17} />
            日期：{sortNewest ? "最新在前" : "最早在前"}
            {sortNewest ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
          </button>
        </div>
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
              <span>试试其他关键词、标签或日期。</span>
              <button onClick={clearFilters} type="button">
                清除筛选
              </button>
            </div>
          ) : (
            <div className="comparison-list">
              {visibleEntries.map((entry, index) => {
                const changedAlternatives =
                  entry.kind === "comparison"
                    ? splitChangedAlternatives(entry.changed)
                    : [];
                const primaryDiff =
                  entry.kind === "comparison"
                    ? diffText(
                        entry.original,
                        changedAlternatives[0] ?? entry.changed,
                      )
                    : null;
                const changedDiffs =
                  entry.kind === "comparison"
                    ? changedAlternatives.map(
                        (alternative) =>
                          emphasizeInsertedInfinitive(
                            diffText(entry.original, alternative).right,
                          ),
                      )
                    : [];
                return (
                  <article
                    className={`comparison-card${
                      entry.kind === "knowledge" ? " knowledge-card" : ""
                    }`}
                    key={entry.id}
                  >
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
                          label={
                            entry.kind === "knowledge"
                              ? "编辑知识点"
                              : "编辑这组句子"
                          }
                          onClick={() => openEditEntry(entry)}
                        >
                          <PencilSimple size={18} />
                        </IconButton>
                        <IconButton
                          label={
                            entry.kind === "knowledge"
                              ? "删除知识点"
                              : "删除这组句子"
                          }
                          onClick={() => deleteEntry(entry)}
                          tone="danger"
                        >
                          <Trash size={18} />
                        </IconButton>
                      </div>
                    </div>

                    {entry.kind === "knowledge" ? (
                      <div className="knowledge-panel">
                        <span className="knowledge-label">Knowledge point</span>
                        <h3>{entry.original}</h3>
                        {entry.note && (
                          <p className="knowledge-note">{entry.note}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="sentence-panel original-panel">
                          <span className="mobile-panel-label">Original</span>
                          <HighlightedSentence
                            segments={primaryDiff?.left ?? []}
                            side="left"
                          />
                        </div>
                        <div className="sentence-panel changed-panel">
                          <span className="mobile-panel-label">Changed</span>
                          <div className="changed-alternatives">
                            {changedDiffs.map((segments, alternativeIndex) => (
                              <HighlightedSentence
                                key={`${entry.id}-alternative-${alternativeIndex}`}
                                segments={segments}
                                side="right"
                              />
                            ))}
                          </div>
                        </div>

                        {entry.note && (
                          <div
                            className={`note-row${
                              entry.preserveNoteLineBreaks
                                ? " preserve-line-breaks"
                                : ""
                            }`}
                          >
                            <Info aria-hidden="true" size={17} weight="fill" />
                            <span className="note-label">Why it changed</span>
                            <p>{entry.note}</p>
                          </div>
                        )}
                      </>
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
          aria-label={
            editingId
              ? form.kind === "knowledge"
                ? "编辑知识点"
                : "编辑错句"
              : form.kind === "knowledge"
                ? "新增知识点"
                : "新增错句"
          }
          aria-modal="true"
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
          role="dialog"
        >
          <form className="entry-modal" onSubmit={submitEntry}>
            <div className="modal-header">
              <div className="modal-title-block">
                <span className="modal-kicker">
                  {editingId ? "EDIT ENTRY" : "NEW ENTRY"}
                </span>
                <div className="modal-title-row">
                  <h2>
                    {editingId
                      ? form.kind === "knowledge"
                        ? "编辑知识点"
                        : "编辑这一组"
                      : form.kind === "knowledge"
                        ? "新增知识点"
                        : "新增一组错句"}
                  </h2>
                  <div
                    aria-label="记录类型"
                    className="entry-type-toggle"
                    role="group"
                  >
                    <button
                      aria-pressed={form.kind === "comparison"}
                      className={form.kind === "comparison" ? "active" : ""}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          kind: "comparison",
                        }))
                      }
                      type="button"
                    >
                      错句对照
                    </button>
                    <button
                      aria-pressed={form.kind === "knowledge"}
                      className={form.kind === "knowledge" ? "active" : ""}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          kind: "knowledge",
                        }))
                      }
                      type="button"
                    >
                      知识点
                    </button>
                  </div>
                </div>
              </div>
              <IconButton label="关闭" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </IconButton>
            </div>

            {form.kind === "knowledge" ? (
              <label className="sentence-field knowledge-field">
                <span>
                  <i aria-hidden="true" />
                  Knowledge point
                </span>
                <textarea
                  autoFocus
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      original: event.target.value,
                    }))
                  }
                  placeholder="输入想要记录的知识点…"
                  required
                  value={form.original}
                />
              </label>
            ) : (
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
            )}

            <label className="note-field">
              <span>
                <NotePencil size={17} />
                {form.kind === "knowledge"
                  ? "解释、例句或备注"
                  : "错误原因或备注"}{" "}
                <small>可选</small>
              </span>
              <textarea
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder={
                  form.kind === "knowledge"
                    ? "补充解释、例句或使用场景…"
                    : "例如：第三人称单数后面的动词需要加 -s"
                }
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
              <span>
                {form.kind === "knowledge"
                  ? "保存后将以知识点卡片显示"
                  : "保存后会自动高亮两边的不同内容"}
              </span>
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
                  {editingId
                    ? "保存修改"
                    : form.kind === "knowledge"
                      ? "加入知识点"
                      : "加入错句本"}
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
