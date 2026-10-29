export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401)
      window.dispatchEvent(new Event("dayflow-unauthorized"));
    throw new Error(result.error || "연결 오류입니다.");
  }
  return result;
}
