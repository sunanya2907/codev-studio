import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  const suggest = searchParams.get("suggest");

  if (!domain) {
    return NextResponse.json({ error: "Domain parameter is required." }, { status: 400 });
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 800)); // Simulated network latency

    // If suggestion mode is requested, return an array of alternative domain ideas
    if (suggest === "true") {
      const cleanName = domain.replace(/\.[^/.]+$/, ""); // strip extension like .com
      
      const suggestions = [
        { domain: `get${cleanName}.com`, available: true, price: 1199 },
        { domain: `${cleanName}app.io`, available: true, price: 2999 },
        { domain: `${cleanName}hq.com`, available: true, price: 1499 },
        { domain: `the${cleanName}.tech`, available: true, price: 499 },
      ];

      return NextResponse.json({ suggestions });
    }

    // Standard single check
    const isAvailable = Math.random() > 0.4;
    return NextResponse.json({
      available: isAvailable,
      domain: domain,
      price: isAvailable ? 1199 : null,
    });

  } catch (error: any) {
    console.error("DOMAIN SEARCH ERROR:", error);
    return NextResponse.json({ error: "Failed to verify domain availability." }, { status: 500 });
  }
}