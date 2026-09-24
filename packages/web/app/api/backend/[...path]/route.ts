import { NextResponse } from "next/server";
import { accessToken, trustedOrigin, readBounded } from "@/lib/server-auth";
export const dynamic = "force-dynamic";
async function handler(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!["GET", "HEAD"].includes(request.method) && !trustedOrigin(request))
    return NextResponse.json(
      { message: "Origin not allowed." },
      { status: 403 },
    );
  const { path } = await params;
  if (path.join("/") === "drafts/generate")
    return NextResponse.json(
      { message: "Generate replies from your paired browser extension." },
      { status: 403 },
    );
  if (path.some((p) => !/^[-a-zA-Z0-9]+$/.test(p)))
    return NextResponse.json({ message: "Invalid path." }, { status: 400 });
  if (
    ![
      "workspace",
      "auth",
      "drafts",
      "macros",
      "knowledge",
      "team",
      "billing",
      "extension",
      "admin",
    ].includes(path[0])
  )
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  try {
    const token = await accessToken();
    if (!token)
      return NextResponse.json(
        { message: "Please sign in to continue." },
        { status: 401 },
      );
    const endpoint = process.env.API_INTERNAL_URL;
    if (!endpoint)
      return NextResponse.json(
        { message: "API is not configured." },
        { status: 503 },
      );
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await readBounded(request, 220000);
    if (body && body.length > 220000)
      return NextResponse.json(
        { message: "Request too large." },
        { status: 413 },
      );
    const response = await fetch(
      endpoint.replace(/\/$/, "") +
        "/" +
        path.join("/") +
        new URL(request.url).search,
      {
        method: request.method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
        redirect: "error",
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "The service is unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
