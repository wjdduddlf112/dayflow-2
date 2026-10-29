import { useEffect, useState, useRef } from "react";
import {
  ArrowUp,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  Inbox,
  LayoutDashboard,
  Plus,
  Settings2,
  Sparkles,
  X,
  Trash2,
  Pencil,
  Sun,
  Moon,
  Monitor,
  Bell,
  LogOut,
  Repeat2,
  Clock3,
  WifiOff,
} from "lucide-react";
import { api } from "./api";
import {
  defaults,
  occursOn,
  seoulDay,
  topThree,
  type Analysis,
  type Item,
  type ItemInput,
  type Settings,
} from "../shared/domain";
type State = {
  items: Item[];
  settings: Settings;
  aiMode: "mock" | "gemini" | "unavailable";
  vapidPublicKey: string | null;
  development: boolean;
};
type Preview = Analysis & { id: string | null; candidates: Item[] };
const initial: ItemInput = {
  type: "task",
  title: "",
  description: "",
  scheduledDate: null,
  startAt: null,
  endAt: null,
  dueAt: null,
  estimatedMinutes: null,
  priority: "medium",
  recurrence: null,
};
const labels = { event: "일정", task: "할 일", routine: "루틴" };
const time = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(s))
    : "";
const localInput = (s: string | null) =>
  s ? `${seoulDay(new Date(s))}T${time(s)}` : "";
export default function App() {
  const createKey = useRef(crypto.randomUUID());
  const [session, setSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({
    items: [],
    settings: defaults,
    aiMode: "unavailable",
    vapidPublicKey: null,
    development: false,
  });
  const [tab, setTab] = useState("Today");
  const [day, setDay] = useState(seoulDay());
  const [month, setMonth] = useState(seoulDay().slice(0, 7));
  const [theme, setTheme] = useState(
    () => localStorage.getItem("dayflow-theme") || "system",
  );
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [editor, setEditor] = useState<
    (ItemInput & { id?: string; version?: number }) | null
  >(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [install, setInstall] = useState(false);
  async function refresh(selected = tab === "Calendar" ? day : seoulDay()) {
    const s = await api<State>(`/state?day=${selected}`);
    setState(s);
    sessionStorage.setItem("dayflow-offline", JSON.stringify(s));
  }
  useEffect(() => {
    api<{ authenticated: boolean }>("/session")
      .then((s) => setSession(s.authenticated))
      .catch((e) => {
        if (!navigator.onLine && sessionStorage.getItem("dayflow-offline"))
          setSession(true);
        else setError(e.message);
      });
    const logout = () => {
      setSession(false);
      sessionStorage.removeItem("dayflow-offline");
    };
    window.addEventListener("dayflow-unauthorized", logout);
    return () => window.removeEventListener("dayflow-unauthorized", logout);
  }, []);
  useEffect(() => {
    if (session)
      refresh().catch((e) => {
        if (!navigator.onLine) {
          const cache = sessionStorage.getItem("dayflow-offline");
          if (cache) setState(JSON.parse(cache));
        }
        setError(e.message);
      });
  }, [session, day, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      theme === "system" ? "light dark" : theme;
    localStorage.setItem("dayflow-theme", theme);
  }, [theme]);
  useEffect(() => {
    const on = () => {
      setOffline(false);
    };
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const handle = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
    }
  };
  const today = seoulDay();
  const todayItems = state.items.filter((i) => occursOn(i, today));
  const top = topThree(state.items);
  const done = todayItems.filter((i) => i.completed).length;
  async function complete(item: Item) {
    if (pending.includes(item.id) || offline) return;
    setPending((p) => [...p, item.id]);
    setState((s) => ({
      ...s,
      items: s.items.map((i) =>
        i.id === item.id ? { ...i, completed: !i.completed } : i,
      ),
    }));
    try {
      await api(`/items/${item.id}/complete`, "POST", {
        completed: !item.completed,
        day: tab === "Calendar" ? day : today,
        version: item.version,
      });
      await refresh();
    } catch (e) {
      setState((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === item.id ? item : i)),
      }));
      setError(e instanceof Error ? e.message : "완료 저장 실패");
    } finally {
      setPending((p) => p.filter((id) => id !== item.id));
    }
  }
  async function analyze() {
    if (!input.trim() || busy) return;
    setBusy(true);
    await handle(async () => {
      setPreview(await api<Preview>("/ai/analyze", "POST", { text: input }));
    });
    setBusy(false);
  }
  useEffect(() => {
    if (editor) createKey.current = crypto.randomUUID();
  }, [!!editor]); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveEditor() {
    if (!editor || busy) return;
    setBusy(true);
    await handle(async () => {
      if (editor.id)
        await api(`/items/${editor.id}`, "PUT", {
          item: editor,
          version: editor.version,
        });
      else
        await api("/items", "POST", editor, {
          "Idempotency-Key": createKey.current,
        });
      await refresh();
      setEditor(null);
      setNotice("저장했어요.");
    });
    setBusy(false);
  }
  async function updateSettings(patch: Partial<Settings>) {
    const updated = { ...state.settings, ...patch };
    await handle(async () => {
      await api("/settings", "PUT", updated);
      setState((s) => ({ ...s, settings: updated }));
    });
  }
  async function enablePush() {
    await handle(async () => {
      if (!("PushManager" in window) || !("Notification" in window))
        throw new Error(
          "iOS 16.4 이상에서는 홈 화면에 설치한 앱에서 알림을 켜 주세요.",
        );
      if (!state.vapidPublicKey)
        throw new Error("서버에 VAPID 키 설정이 필요합니다.");
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "알림 권한이 허용되지 않았습니다. 기기 설정을 확인하세요.",
        );
      const reg = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(
        atob(state.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      await api("/push/subscribe", "POST", sub.toJSON());
      await updateSettings({ notificationsEnabled: true });
      setNotice("이 기기의 알림을 활성화했어요.");
    });
  }
  async function disablePush() {
    await handle(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/push/subscribe", "DELETE", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      await updateSettings({ notificationsEnabled: false });
    });
  }
  function itemRow(item: Item) {
    return (
      <article
        className={`item ${item.completed ? "completed" : ""}`}
        key={item.id}
      >
        <button
          className="check-button"
          disabled={pending.includes(item.id) || offline}
          onClick={() => complete(item)}
          aria-label={`${item.title} ${item.completed ? "완료 취소" : "완료"}`}
        >
          {item.completed ? (
            <Check size={18} />
          ) : item.type === "routine" ? (
            <Repeat2 size={18} />
          ) : (
            <Circle size={21} />
          )}
        </button>
        <button className="item-main" onClick={() => setEditor({ ...item })}>
          <strong>{item.title}</strong>
          <span>
            {item.startAt
              ? time(item.startAt)
              : item.scheduledDate
                ? `${item.scheduledDate} · 시간 미정`
                : item.dueAt
                  ? `${seoulDay(new Date(item.dueAt))} 마감`
                  : "시간 미정"}
            {item.estimatedMinutes ? ` · ${item.estimatedMinutes}분` : ""} ·{" "}
            {labels[item.type]}
          </span>
        </button>
        {item.priority === "high" && (
          <span className="priority-dot" title="높은 우선순위" />
        )}
        <button
          className="icon-button subtle"
          aria-label={`${item.title} 삭제`}
          onClick={() => setDeleting(item)}
        >
          <Trash2 size={16} />
        </button>
      </article>
    );
  }
  const composer = (
    <div className="composer">
      <Sparkles size={20} />
      <textarea
        aria-label="자연어 일정 입력"
        placeholder="내일 오후 3시 면접, 지원서는 금요일까지…"
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            analyze();
          }
        }}
      />
      <button
        className="send"
        aria-label="AI 분석"
        disabled={
          busy ||
          offline ||
          !input.trim() ||
          !state.settings.aiEnabled ||
          state.aiMode === "unavailable"
        }
        onClick={analyze}
      >
        {busy ? <span className="spinner" /> : <ArrowUp size={20} />}
      </button>
    </div>
  );
  if (session === null)
    return (
      <main className="login">
        <div className="brand">
          <span className="brand-icon">d</span>Dayflow
          <span className="version">2.0</span>
        </div>
        <p role="status">하루를 준비하고 있어요…</p>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button onClick={() => location.reload()}>다시 연결</button>
          </div>
        )}
      </main>
    );
  if (!session)
    return (
      <main className="login">
        <div className="brand">
          <span className="brand-icon">d</span>Dayflow
          <span className="version">2.0</span>
        </div>
        <h1>나만의 하루로 들어가기</h1>
        <p>개인 일정을 안전하게 보호합니다.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handle(async () => {
              await api("/login", "POST", { password });
              setPassword("");
              setSession(true);
            });
          }}
        >
          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary">로그인</button>
        </form>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
      </main>
    );
  return (
    <div className="app">
      <aside className="desktop-sidebar">
        <div className="brand">
          <span className="brand-icon">d</span>Dayflow
          <span className="version">2.0</span>
        </div>
        <p className="sidebar-label">YOUR PERSONAL SPACE</p>
        <nav>
          {(
            [
              ["Today", LayoutDashboard],
              ["Calendar", CalendarDays],
              ["Inbox", Inbox],
              ["Settings", Settings2],
            ] as const
          ).map(([name, Icon]) => (
            <button
              key={String(name)}
              className={tab === name ? "active" : ""}
              onClick={() => setTab(String(name))}
            >
              <Icon size={20} />
              {String(name)}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="online-dot" /> 조금 더 가벼운 하루
          <br />
          <small>Made for your everyday.</small>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="mobile-brand brand">
            <span className="brand-icon">d</span>Dayflow
          </div>
          <div className="breadcrumb">
            MY WORKSPACE <span>/</span> {tab}
          </div>
          <div className="header-actions">
            <span className="status-pill">
              {state.aiMode === "mock"
                ? "개발용 Mock"
                : state.aiMode === "gemini"
                  ? "Gemini 설정됨"
                  : "AI 연결 필요"}
            </span>
            <button
              className="avatar"
              onClick={() => setTab("Settings")}
              aria-label="설정 열기"
            >
              나
            </button>
          </div>
        </header>
        {state.development && (
          <div className="dev-banner">
            개발 모드 · 로그인 없이 로컬 테스트 중입니다. 실제 개인정보를
            입력하지 마세요.
          </div>
        )}
        {offline && (
          <div className="alert" role="status">
            <WifiOff size={16} /> 오프라인 · 이 세션에서 읽은 일정만 볼 수
            있어요. 변경은 연결 후 가능합니다.
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="오류 닫기"
              onClick={() => setError("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button
              className="icon-button"
              aria-label="알림 닫기"
              onClick={() => setNotice("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {tab === "Today" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  }).format(new Date())}
                </p>
                <h1>
                  좋은 하루의 시작<span className="blue">.</span>
                </h1>
                <p>복잡한 생각은 내려놓고, 오늘에 집중해요.</p>
              </div>
              <button
                className="primary add-button"
                onClick={() => setEditor({ ...initial })}
              >
                <Plus size={18} /> 새 일정
              </button>
            </section>
            <section className="briefing">
              <div className="briefing-title">
                <span className="sparkle-badge">
                  <Sparkles size={21} />
                </span>
                <span>
                  오늘의 브리핑 <small>YOUR DAILY FLOW</small>
                </span>
              </div>
              <h2>
                {todayItems.length
                  ? `오늘은 ${todayItems.length}개의 흐름이 기다려요.`
                  : "아직 비어 있는 오늘, 나답게 채워요."}
              </h2>
              <p>
                {top.length
                  ? `먼저 ‘${top[0].item.title}’부터 시작해 볼까요? ${top[0].reason}`
                  : "하고 싶은 일을 말해 주세요. Dayflow가 하나씩 정리해 드릴게요."}
              </p>
              <div className="briefing-stats">
                <span>
                  <CalendarDays size={16} /> 오늘 일정{" "}
                  <b>{todayItems.filter((i) => i.type === "event").length}</b>
                </span>
                <span>
                  <CheckCheck size={16} /> 남은 할 일{" "}
                  <b>
                    {
                      state.items.filter(
                        (i) => !i.completed && i.type === "task",
                      ).length
                    }
                  </b>
                </span>
                <span>
                  <Repeat2 size={16} /> 오늘 루틴{" "}
                  <b>{todayItems.filter((i) => i.type === "routine").length}</b>
                </span>
              </div>
            </section>
            <div className="section-heading">
              <h2>
                오늘의 Top 3 <span className="tiny-badge">FOCUS</span>
              </h2>
              <span>가장 중요한 일부터</span>
            </div>
            <section className="top-grid">
              {top.length ? (
                top.map(({ item, reason }, i) => (
                  <button
                    className="focus-card"
                    key={item.id}
                    onClick={() => setEditor({ ...item })}
                  >
                    <span className={`rank rank-${i}`}>0{i + 1}</span>
                    <span className="focus-type">
                      {labels[item.type]}
                      <ArrowRight size={16} />
                    </span>
                    <h3>{item.title}</h3>
                    <p>{reason}</p>
                    <span className="focus-meta">
                      <Clock3 size={14} />
                      {item.estimatedMinutes
                        ? `${item.estimatedMinutes}분 예상`
                        : "나의 속도로"}
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty wide">
                  <Sparkles size={26} />
                  <p>마음을 비우고, 첫 할 일을 담아 보세요.</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setTab("Inbox");
                    }}
                  >
                    자연어로 시작하기 <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
            <div className="today-columns">
              <section>
                <div className="section-heading">
                  <h2>
                    오늘의 흐름{" "}
                    <span className="count">{todayItems.length}</span>
                  </h2>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDay(today);
                      setTab("Calendar");
                    }}
                  >
                    캘린더 <ArrowRight size={14} />
                  </button>
                </div>
                <div className="panel item-list">
                  {todayItems.length ? (
                    todayItems
                      .sort((a, b) =>
                        (a.startAt || "z").localeCompare(b.startAt || "z"),
                      )
                      .map(itemRow)
                  ) : (
                    <div className="empty">
                      <CalendarDays size={28} />
                      <p>오늘 예정된 일정이 없어요.</p>
                      <small>새로운 계획을 추가해 보세요.</small>
                    </div>
                  )}
                </div>
                <div className="section-heading">
                  <h2>
                    할 일{" "}
                    <span className="count">
                      {
                        state.items.filter(
                          (i) => i.type === "task" && !i.completed,
                        ).length
                      }
                    </span>
                  </h2>
                </div>
                <div className="panel item-list">
                  {state.items.filter((i) => i.type === "task").map(itemRow)}
                  {!state.items.some((i) => i.type === "task") && (
                    <div className="empty">
                      <p>첫 번째 할 일을 기다리고 있어요.</p>
                    </div>
                  )}
                </div>
              </section>
              <aside>
                <div className="section-heading">
                  <h2>오늘의 발자국</h2>
                </div>
                <div className="panel progress-panel">
                  <div
                    className="progress-ring"
                    style={{
                      background: `conic-gradient(var(--blue) ${todayItems.length ? (done / todayItems.length) * 100 : 0}%, var(--line) 0)`,
                    }}
                  >
                    <div>
                      <strong>
                        {done}
                        <small> / {todayItems.length}</small>
                      </strong>
                      <span>완료한 일정</span>
                    </div>
                  </div>
                  <h3>
                    {done
                      ? "차근차근, 잘하고 있어요."
                      : "작은 시작이 쌓이는 하루"}
                  </h3>
                  <p>
                    한 번의 체크로
                    <br />
                    하루에 작은 성취를 더해요.
                  </p>
                </div>
                <div className="gentle-note">
                  <span>✦</span> 모든 것을 끝내지 않아도 괜찮아요.
                  <br />
                  중요한 것 하나부터 시작해요.
                </div>
              </aside>
            </div>
            <section className="quick-input">
              <div className="section-heading">
                <h2>어떤 계획이 떠올랐나요?</h2>
                <span>
                  {state.aiMode === "mock" ? "MOCK PREVIEW" : "QUICK CAPTURE"}
                </span>
              </div>
              {composer}
              <p className="input-hint">
                말하듯 입력하세요. 저장하기 전, 정리된 내용을 확인할 수 있어요.
              </p>
            </section>
          </>
        )}
        {tab === "Calendar" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">PLAN YOUR DAYS</p>
                <h1>
                  나의 캘린더<span className="blue">.</span>
                </h1>
                <p>하루의 약속을 한눈에.</p>
              </div>
              <button
                className="primary"
                onClick={() =>
                  setEditor({
                    ...initial,
                    type: "event",
                    startAt: `${day}T09:00:00+09:00`,
                  })
                }
              >
                <Plus size={18} /> 일정 추가
              </button>
            </section>
            <section className="panel calendar">
              <div className="calendar-heading">
                <button
                  className="icon-button"
                  aria-label="이전 달"
                  onClick={() => {
                    const d = new Date(month + "-15");
                    d.setMonth(d.getMonth() - 1);
                    setMonth(d.toISOString().slice(0, 7));
                  }}
                >
                  <ChevronLeft />
                </button>
                <h2>{month.replace("-", "년 ")}월</h2>
                <button
                  className="icon-button"
                  aria-label="다음 달"
                  onClick={() => {
                    const d = new Date(month + "-15");
                    d.setMonth(d.getMonth() + 1);
                    setMonth(d.toISOString().slice(0, 7));
                  }}
                >
                  <ChevronRight />
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setMonth(today.slice(0, 7));
                    setDay(today);
                  }}
                >
                  오늘
                </button>
              </div>
              <div className="calendar-grid">
                {"일월화수목금토".split("").map((x) => (
                  <span className="weekday" key={x}>
                    {x}
                  </span>
                ))}
                {Array.from(
                  { length: new Date(month + "-01T12:00:00+09:00").getDay() },
                  (_, i) => (
                    <span key={`blank${i}`} />
                  ),
                )}
                {Array.from(
                  {
                    length: new Date(
                      Number(month.slice(0, 4)),
                      Number(month.slice(5, 7)),
                      0,
                    ).getDate(),
                  },
                  (_, i) => {
                    const d = `${month}-${String(i + 1).padStart(2, "0")}`;
                    return (
                      <button
                        aria-label={d}
                        aria-pressed={day === d}
                        className={`${day === d ? "selected" : ""} ${d === today ? "is-today" : ""}`}
                        key={d}
                        onClick={() => setDay(d)}
                      >
                        <span>{i + 1}</span>
                        <small>
                          {state.items.some((it) => occursOn(it, d)) ? "•" : ""}
                        </small>
                      </button>
                    );
                  },
                )}
              </div>
            </section>
            <div className="section-heading">
              <h2>
                {day} <span className="count">일간 일정</span>
              </h2>
            </div>
            <div className="panel">
              {state.items.filter((i) => occursOn(i, day)).map(itemRow)}
              {!state.items.some((i) => occursOn(i, day)) && (
                <div className="empty">
                  <p>여유로운 하루예요.</p>
                </div>
              )}
            </div>
          </>
        )}
        {tab === "Inbox" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">CLEAR YOUR MIND</p>
                <h1>
                  생각을 일정으로<span className="blue">.</span>
                </h1>
                <p>떠오르는 그대로 말해 주세요. 하나씩 정리해 드릴게요.</p>
              </div>
              <button
                className="secondary"
                onClick={() => setEditor({ ...initial })}
              >
                <Pencil size={16} /> 직접 입력
              </button>
            </section>
            <section className="panel inbox-composer">
              <div className="section-heading">
                <h2>
                  <Sparkles size={19} /> Dayflow에게 말하기
                </h2>
                <span className="tiny-badge">{state.aiMode.toUpperCase()}</span>
              </div>
              {composer}
              <div className="example-chips">
                {[
                  "내일 GSAT 두 시간 공부하고 금요일까지 지원서 마무리해야 해. 운동은 매일 하자.",
                  "내일 오후 3시에 면접 일정 추가해",
                  "다음 주 일정 중 급한 것부터 알려 줘",
                ].map((t) => (
                  <button key={t} onClick={() => setInput(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="input-hint">
                {state.aiMode === "mock"
                  ? "개발용 규칙 기반 Mock입니다. 실제 Gemini 분석이 아닙니다."
                  : state.aiMode === "unavailable"
                    ? "Gemini 서버 연결이 필요합니다. 직접 입력은 계속 사용할 수 있어요."
                    : "Gemini에 입력 내용과 관련 일정 일부를 보냅니다. 민감한 개인정보는 입력하지 마세요."}
              </p>
            </section>
            <div className="section-heading">
              <h2>
                아직 날짜가 없는 일 <span className="count">INBOX</span>
              </h2>
            </div>
            <div className="panel">
              {state.items
                .filter(
                  (i) =>
                    !i.scheduledDate &&
                    !i.startAt &&
                    !i.dueAt &&
                    i.type !== "routine",
                )
                .map(itemRow)}
              {!state.items.some(
                (i) =>
                  !i.scheduledDate &&
                  !i.startAt &&
                  !i.dueAt &&
                  i.type !== "routine",
              ) && (
                <div className="empty">
                  <Inbox size={30} />
                  <p>생각이 깔끔하게 정리되어 있어요.</p>
                </div>
              )}
            </div>
          </>
        )}
        {tab === "Settings" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">MAKE IT YOURS</p>
                <h1>
                  나에게 맞춘 Dayflow<span className="blue">.</span>
                </h1>
                <p>편안하게, 안전하게 나의 하루를 관리하세요.</p>
              </div>
            </section>
            <section className="panel settings-panel">
              <h2>화면 스타일</h2>
              <p>원하는 밝기로 하루를 바라보세요.</p>
              <div className="theme-picker">
                {(
                  [
                    ["light", "라이트", Sun],
                    ["dark", "다크", Moon],
                    ["system", "시스템", Monitor],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={String(value)}
                    aria-pressed={theme === value}
                    className={theme === value ? "selected" : ""}
                    onClick={() => setTheme(String(value))}
                  >
                    <Icon size={23} />
                    {String(label)}
                  </button>
                ))}
              </div>
            </section>
            <section className="panel settings-panel">
              <h2>
                <Bell size={19} /> 알림
              </h2>
              <p>매일 오전 9시 브리핑 · 일정 시작 30분 전 · Asia/Seoul</p>
              <div className="settings-row">
                <span>
                  자동 알림{" "}
                  <small>
                    {state.settings.notificationsEnabled
                      ? "계정 알림 활성화"
                      : "알림 꺼짐"}
                  </small>
                </span>
                <button className="secondary" onClick={enablePush}>
                  이 기기 알림 허용
                </button>
              </div>
              <div className="settings-row">
                <label>
                  루틴 알림{" "}
                  <input
                    type="checkbox"
                    checked={state.settings.routineNotifications}
                    onChange={(e) =>
                      updateSettings({ routineNotifications: e.target.checked })
                    }
                  />
                </label>
                <button className="text-button" onClick={disablePush}>
                  알림 해제
                </button>
              </div>
              <button
                className="secondary"
                onClick={() =>
                  handle(async () => {
                    await api("/push/test", "POST", {});
                    setNotice(
                      "Push 서비스가 발송을 수락했어요. 기기에서 수신을 확인하세요.",
                    );
                  })
                }
              >
                테스트 알림 보내기
              </button>
              <p className="input-hint">
                iOS 16.4 이상에서 홈 화면에 설치한 뒤 허용해 주세요. 잠금
                화면에는 일정 제목을 표시하지 않습니다. 실제 수신은 기기 확인이
                필요합니다.
              </p>
            </section>
            <section className="panel settings-panel">
              <h2>
                <Sparkles size={19} /> AI와 개인정보
              </h2>
              <div className="settings-row">
                <span>
                  Gemini 자연어 분석{" "}
                  <small>
                    {state.aiMode === "mock"
                      ? "개발용 Mock 사용 중"
                      : state.aiMode === "gemini"
                        ? "API 키 설정됨 · 실제 호출 검증은 별도"
                        : "서버 API 키 필요"}
                  </small>
                </span>
                <input
                  aria-label="AI 활성화"
                  type="checkbox"
                  checked={state.settings.aiEnabled}
                  onChange={(e) =>
                    updateSettings({ aiEnabled: e.target.checked })
                  }
                />
              </div>
              <p>
                무료 Gemini API에 보낸 데이터에는 Google의 데이터 이용 정책이
                적용될 수 있어요. 민감한 내용을 입력하지 마세요. AI를 꺼도 직접
                일정 관리와 규칙 기반 Top 3는 사용할 수 있습니다.
              </p>
              <a
                href="https://ai.google.dev/gemini-api/terms"
                target="_blank"
                rel="noreferrer"
              >
                Google Gemini API 이용 정책 ↗
              </a>
            </section>
            <section className="panel settings-panel">
              <h2>앱 정보</h2>
              <div className="settings-row">
                <span>시간대</span>
                <strong>Asia/Seoul (UTC+9)</strong>
              </div>
              <div className="settings-row">
                <span>버전</span>
                <span>Dayflow 2.0 · MVP 0.1.0</span>
              </div>
              <button className="secondary" onClick={() => setInstall(true)}>
                iPhone 홈 화면에 설치하기
              </button>
              <p>
                오프라인에서는 현재 세션에서 읽은 일정만 표시합니다. 변경과 AI는
                연결이 필요하며, 로그아웃하면 임시 읽기 데이터를 지웁니다.
              </p>
              <button
                className="text-button danger"
                onClick={() =>
                  handle(async () => {
                    await api("/logout", "POST", {});
                    sessionStorage.removeItem("dayflow-offline");
                    setState((s) => ({ ...s, items: [] }));
                    setSession(false);
                  })
                }
              >
                <LogOut size={16} /> 로그아웃
              </button>
            </section>
          </>
        )}
        <footer className="page-footer">
          <span>Dayflow</span> 오늘의 작은 흐름이, 더 나은 내일로.
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="주요 화면">
        {(
          [
            ["Today", LayoutDashboard, "오늘"],
            ["Calendar", CalendarDays, "캘린더"],
            ["Inbox", Inbox, "인박스"],
            ["Settings", Settings2, "설정"],
          ] as const
        ).map(([name, Icon, label]) => (
          <button
            key={String(name)}
            aria-current={tab === name ? "page" : undefined}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(String(name))}
          >
            <Icon size={21} />
            <span>{String(label)}</span>
          </button>
        ))}
      </nav>
      {editor && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <div className="modal-heading">
              <h2 id="editor-title">
                {editor.id ? "일정 수정" : "새로운 계획"}
              </h2>
              <button
                className="icon-button"
                aria-label="편집 닫기"
                onClick={() => setEditor(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveEditor();
              }}
            >
              <label>
                제목
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={editor.title}
                  onChange={(e) =>
                    setEditor({ ...editor, title: e.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  종류
                  <select
                    value={editor.type}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        type: e.target.value as ItemInput["type"],
                        recurrence:
                          e.target.value === "routine"
                            ? { frequency: "daily", weekdays: [], time: null }
                            : null,
                      })
                    }
                  >
                    {Object.entries(labels).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  중요도
                  <select
                    value={editor.priority}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        priority: e.target.value as ItemInput["priority"],
                      })
                    }
                  >
                    <option value="high">높음</option>
                    <option value="medium">보통</option>
                    <option value="low">낮음</option>
                  </select>
                </label>
              </div>
              <label>
                날짜만 지정 (시작시간 미정)
                <input
                  type="date"
                  value={editor.scheduledDate || ""}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      scheduledDate: e.target.value || null,
                    })
                  }
                />
              </label>
              {(["startAt", "endAt", "dueAt"] as const).map((field, i) => (
                <label key={field}>
                  {["시작 (선택)", "종료 (선택)", "마감 (선택)"][i]}
                  <input
                    type="datetime-local"
                    value={localInput(editor[field])}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        [field]: e.target.value
                          ? e.target.value + ":00+09:00"
                          : null,
                      })
                    }
                  />
                </label>
              ))}
              <label>
                예상 소요시간 (분)
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={editor.estimatedMinutes ?? ""}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      estimatedMinutes: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </label>
              {editor.recurrence && (
                <>
                  <label>
                    반복
                    <select
                      value={editor.recurrence.frequency}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          recurrence: {
                            ...editor.recurrence!,
                            frequency: e.target.value as "daily" | "weekly",
                          },
                        })
                      }
                    >
                      <option value="daily">매일</option>
                      <option value="weekly">매주</option>
                    </select>
                  </label>
                  {editor.recurrence.frequency === "weekly" && (
                    <div className="weekday-picker">
                      {"일월화수목금토".split("").map((d, i) => (
                        <button
                          type="button"
                          aria-pressed={editor.recurrence!.weekdays.includes(i)}
                          className={
                            editor.recurrence!.weekdays.includes(i)
                              ? "selected"
                              : ""
                          }
                          key={d}
                          onClick={() =>
                            setEditor({
                              ...editor,
                              recurrence: {
                                ...editor.recurrence!,
                                weekdays: editor.recurrence!.weekdays.includes(
                                  i,
                                )
                                  ? editor.recurrence!.weekdays.filter(
                                      (n) => n !== i,
                                    )
                                  : [...editor.recurrence!.weekdays, i],
                              },
                            })
                          }
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                  <label>
                    루틴 알림 시간
                    <input
                      type="time"
                      value={editor.recurrence.time || ""}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          recurrence: {
                            ...editor.recurrence!,
                            time: e.target.value || null,
                          },
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setEditor({ ...editor, type: "task", recurrence: null })
                    }
                  >
                    반복 해제
                  </button>
                </>
              )}
              <label>
                메모
                <textarea
                  value={editor.description}
                  onChange={(e) =>
                    setEditor({ ...editor, description: e.target.value })
                  }
                />
              </label>
              {error && (
                <p role="alert" className="alert">
                  {error}
                </p>
              )}
              <button className="primary full" disabled={busy || offline}>
                {busy ? "저장 중…" : "저장하기"}
              </button>
            </form>
          </section>
        </div>
      )}
      {preview && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
          >
            <div className="modal-heading">
              <h2 id="preview-title">
                <Sparkles size={21} /> 이렇게 정리했어요
              </h2>
              <button
                className="icon-button"
                aria-label="미리보기 닫기"
                onClick={() => setPreview(null)}
              >
                <X />
              </button>
            </div>
            <p className="preview-message">{preview.message}</p>
            {preview.actions.map((a, i) => (
              <div className="preview-card" key={i}>
                <div className="preview-tags">
                  <span>
                    {
                      {
                        create: "추가",
                        update: "수정",
                        delete: "삭제",
                        complete: "완료",
                      }[a.operation]
                    }
                  </span>
                  <span>{labels[a.item.type]}</span>
                </div>
                <label>
                  정리된 제목
                  <input
                    value={a.item.title}
                    onChange={(e) =>
                      setPreview({
                        ...preview,
                        actions: preview.actions.map((v, j) =>
                          i === j
                            ? {
                                ...v,
                                item: { ...v.item, title: e.target.value },
                              }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
                <p>
                  {a.item.startAt
                    ? `${seoulDay(new Date(a.item.startAt))} ${time(a.item.startAt)}`
                    : a.item.scheduledDate
                      ? `${a.item.scheduledDate} · 시간 미정`
                      : "시작 미정"}
                  {a.item.dueAt
                    ? ` · ${seoulDay(new Date(a.item.dueAt))} 마감`
                    : ""}
                  {a.item.estimatedMinutes
                    ? ` · ${a.item.estimatedMinutes}분`
                    : ""}
                  {a.item.recurrence
                    ? ` · ${a.item.recurrence.frequency === "daily" ? "매일" : "매주"}`
                    : ""}
                </p>
                <label>
                  날짜만 지정
                  <input
                    type="date"
                    value={a.item.scheduledDate || ""}
                    onChange={(e) =>
                      setPreview({
                        ...preview,
                        actions: preview.actions.map((v, j) =>
                          i === j
                            ? {
                                ...v,
                                item: {
                                  ...v.item,
                                  scheduledDate: e.target.value || null,
                                },
                              }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
                <div className="form-grid">
                  {(["startAt", "dueAt"] as const).map((field, n) => (
                    <label key={field}>
                      {n === 0 ? "시작 (선택)" : "마감 (선택)"}
                      <input
                        type="datetime-local"
                        value={localInput(a.item[field])}
                        onChange={(e) =>
                          setPreview({
                            ...preview,
                            actions: preview.actions.map((v, j) =>
                              i === j
                                ? {
                                    ...v,
                                    item: {
                                      ...v.item,
                                      [field]: e.target.value
                                        ? e.target.value + ":00+09:00"
                                        : null,
                                    },
                                  }
                                : v,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                {a.operation !== "create" && (
                  <label>
                    적용 대상
                    <select
                      value={a.targetId || ""}
                      onChange={(e) =>
                        setPreview({
                          ...preview,
                          actions: preview.actions.map((v, j) =>
                            i === j
                              ? { ...v, targetId: e.target.value || null }
                              : v,
                          ),
                        })
                      }
                    >
                      <option value="">기존 항목 선택</option>
                      {state.items.map((it) => (
                        <option value={it.id} key={it.id}>
                          {it.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {a.warning && <p className="warning">{a.warning}</p>}
              </div>
            ))}
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            {preview.actions.length > 0 && (
              <button
                className="primary full"
                disabled={
                  busy ||
                  offline ||
                  preview.actions.some(
                    (a) => a.operation !== "create" && !a.targetId,
                  )
                }
                onClick={async () => {
                  setBusy(true);
                  await handle(async () => {
                    await api("/ai/apply", "POST", {
                      id: preview.id,
                      actions: preview.actions,
                    });
                    await refresh();
                    setPreview(null);
                    setInput("");
                    setNotice("확인한 내용을 저장했어요.");
                  });
                  setBusy(false);
                }}
              >
                확인하고 반영하기
              </button>
            )}
            <p className="input-hint">
              확인하기 전에는 데이터가 바뀌지 않습니다. 날짜와 제목을 확인한 후
              반영해 주세요.
            </p>
          </section>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">이 계획을 삭제할까요?</h2>
            <p>
              ‘{deleting.title}’
              {deleting.type === "routine" ? " 및 날짜별 완료 이력" : ""}을
              삭제합니다. 되돌릴 수 없어요.
            </p>
            <div className="button-row">
              <button className="secondary" onClick={() => setDeleting(null)}>
                취소
              </button>
              <button
                className="primary destructive"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await handle(async () => {
                    await api(`/items/${deleting.id}`, "DELETE", undefined, {
                      "If-Match": String(deleting.version),
                    });
                    await refresh();
                    setDeleting(null);
                  });
                  setBusy(false);
                }}
              >
                삭제하기
              </button>
            </div>
          </section>
        </div>
      )}
      {install && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
          >
            <div className="modal-heading">
              <h2 id="install-title">iPhone에 Dayflow 담기</h2>
              <button
                className="icon-button"
                aria-label="설치 안내 닫기"
                onClick={() => setInstall(false)}
              >
                <X />
              </button>
            </div>
            <ol>
              <li>Safari에서 HTTPS로 배포한 Dayflow를 여세요.</li>
              <li>공유 버튼 → ‘홈 화면에 추가’를 선택하세요.</li>
              <li>홈 화면의 Dayflow 아이콘으로 실행하세요.</li>
              <li>설정에서 ‘이 기기 알림 허용’을 누르세요.</li>
            </ol>
            <p>
              설치하면 주소창 없이 앱처럼 실행됩니다. Safari 탭에서는 iPhone
              Push가 제한됩니다. iOS 16.4 이상과 실제 기기 테스트가 필요해요.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
