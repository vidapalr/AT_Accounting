
import { NextResponse } from "next/server";
import { inspectAccountingSchema } from "@/lib/schema-inspector";

export async function GET() {
  // Only available during local development.
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", {
      status: 404,
    });
  }

  try {
    const result = await inspectAccountingSchema();

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Schema inspection failed:", error);

    return NextResponse.json(
      {
        status: "failed",
        message: "Unable to inspect accounting schema.",
      },
      { status: 500 }
    );
  }
}
