
import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db-check";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", {
      status: 404,
    });
  }

  try {
    const result = await checkDatabaseConnection();

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Database check failed:", error);

    return NextResponse.json(
      {
        status: "failed",
        message: "Database connection failed.",
        errorType:
          error instanceof Error
            ? error.name
            : "UnknownError",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
