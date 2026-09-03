export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 投稿データを取得
    if (url.pathname === "/api/get" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM posts ORDER BY id DESC"
        ).all();

        return new Response(JSON.stringify(results), {
          headers: corsHeaders
        });

      } catch (e) {
        return new Response(
          JSON.stringify({ error: e.message }),
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }

    // 投稿データを保存
    if (url.pathname === "/api/post" && request.method === "POST") {
      try {
        const body = await request.json();

        const { pref, threads, name, text } = body;

        if (!pref || !threads || !text) {
          return new Response(
            JSON.stringify({ error: "Missing fields" }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // 同じThreadsアカウントの既存投稿を削除
        await env.DB.prepare(
          "DELETE FROM posts WHERE threads_url = ?"
        )
          .bind(threads)
          .run();

        // 新しい投稿を保存
        await env.DB.prepare(
          "INSERT INTO posts (pref, threads_url, display_name, message) VALUES (?, ?, ?, ?)"
        )
          .bind(
            pref,
            threads,
            name || "@Threadsユーザー",
            text
          )
          .run();

        return new Response(
          JSON.stringify({ success: true }),
          {
            headers: corsHeaders
          }
        );

      } catch (e) {
        return new Response(
          JSON.stringify({ error: e.message }),
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }

    // API以外は静的ファイルを返す
    return env.ASSETS.fetch(request);
  }
};
