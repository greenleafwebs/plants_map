export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORSヘッダー（通信の許可設定）
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. 投稿データを取得する API (/api/get)
    if (url.pathname === "/api/get" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM posts ORDER BY id DESC"
        ).all();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 2. 投稿データを保存する API (/api/post)
    if (url.pathname === "/api/post" && request.method === "POST") {
      try {
        const body = await request.json();
        const { pref, threads, name, text } = body;

        if (!pref || !threads || !text) {
          return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });
        }

        await env.DB.prepare(
          "INSERT INTO posts (pref, threads, name, text) VALUES (?, ?, ?, ?)"
        ).bind(pref, threads, name || "@Threadsユーザー", text).run();

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 3. API以外のリクエストは静的ファイル（index.html等）を返す
    return env.ASSETS.fetch(request);
  }
};
