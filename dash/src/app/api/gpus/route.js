import { NextResponse } from "next/server";

function toMarkdown(data) {
  const lines = [
    `# virgil — GPU state`,
    `_updated ${data.updatedAt}_`,
    ``,
    `| GPU | name | util | VRAM used | VRAM total | temp | status |`,
    `|-----|------|------|-----------|------------|------|--------|`,
    ...data.gpus.map(
      (g) =>
        `| ${g.index} | ${g.name} | ${g.utilization}% | ${(g.memory_used / 1024).toFixed(1)} GB | ${Math.round(g.memory_total / 1024)} GB | ${g.temperature}°C | ${g.free ? "free" : "in use"} |`,
    ),
  ];
  return lines.join("\n");
}

export async function GET(request) {
  const token = request.headers.get("x-access-token");
  if (token !== process.env.GPU_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(
    `${process.env.UPSTASH_REDIS_REST_URL}/get/gpu:state`,
    {
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      },
    },
  );

  const { result } = await res.json();
  if (!result)
    return NextResponse.json({ error: "No data yet" }, { status: 404 });

  const data = JSON.parse(result);
  const format = new URL(request.url).searchParams.get("format");

  if (format === "text") {
    return new Response(toMarkdown(data), {
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (format === "json") {
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return NextResponse.json(data);
}
