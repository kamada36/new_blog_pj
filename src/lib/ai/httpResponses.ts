import "server-only";

/** 認証済みの管理者がいなければ401のJSONを返す(proxy.tsの/admin保護に加えた、Route Handler側の検証)。 */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "セッションが切れました。ログインし直してください。" }, { status: 401 });
}

export function badRequestResponse(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
