import { NextResponse } from "next/server";

/**
 * Sends the browser to another page of this site after a form post.
 * The address is relative on purpose: behind the hosting proxy the app sees its own
 * internal address (0.0.0.0:3000), so a full address built from the request would be wrong.
 */
export function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: path } });
}
