export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error(
      navigator.onLine
        ? "서버에 연결하지 못했어요. 잠시 후 다시 시도하세요."
        : "오프라인입니다. 연결 후 다시 시도하세요.",
    );
  }
  let result: T & { error?: string };
  try {
    result = (await res.json()) as T & { error?: string };
  } catch {
    throw new Error("서버 응답을 읽지 못했어요. 잠시 후 다시 시도하세요.");
  }
  if (!res.ok) {
    if (res.status === 401)
      window.dispatchEvent(new Event("dayflow-unauthorized"));
    throw new Error(result.error || "요청을 처리하지 못했어요.");
  }
  return result;
}
