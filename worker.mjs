const NG_WORDS = [
  "セフレ",
  "エロ",
  "エッチ",
  "出会い",
  "パパ活",
  "ママ活",
  "風俗",
  "アダルト",
  "闇バイト",
  "カジノ",
  "オンラインカジノ",
  "パチンコ",
  "パチスロ"
];

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

        const {
          pref,
          threads,
          name,
          text,
          delete_key
        } = body;

        // 必須項目チェック
        if (!pref || !threads || !text || !delete_key) {
          return new Response(
            JSON.stringify({
              error: "必要な項目が入力されていません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // 削除キーは4桁の数字のみ
        if (!/^\d{4}$/.test(delete_key)) {
          return new Response(
            JSON.stringify({
              error: "削除キーは4桁の数字で入力してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // 140文字制限
        if ([...text].length > 140) {
          return new Response(
            JSON.stringify({
              error: "メッセージは140文字以内で入力してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // HTMLタグ禁止
        if (/<[^>]*>/i.test(text)) {
          return new Response(
            JSON.stringify({
              error: "HTMLタグは使用できません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // URL禁止
        if (
          /https?:\/\/|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|jp|co\.jp|info|biz)(\/[^\s]*)?/i.test(text)
        ) {
          return new Response(
            JSON.stringify({
              error: "メッセージにURLを入れることはできません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // NGワードチェック
        const normalizedText = text.toLowerCase();

        const ngWord = NG_WORDS.find(word =>
          normalizedText.includes(word.toLowerCase())
        );

        if (ngWord) {
          return new Response(
            JSON.stringify({
              error: "使用できない言葉が含まれています。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // IPアドレス取得
        const ip =
          request.headers.get("CF-Connecting-IP") ||
          request.headers.get("X-Forwarded-For") ||
          "unknown";

        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;

        // IPの投稿制限を確認
        const limit = await env.DB.prepare(
          "SELECT count, first_post_at FROM post_limits WHERE ip = ?"
        )
          .bind(ip)
          .first();

        if (limit) {
          const elapsed = now - limit.first_post_at;

          // 10分以内に3回以上投稿していたら制限
          if (elapsed < tenMinutes && limit.count >= 3) {
            return new Response(
              JSON.stringify({
                error:
                  "短時間に投稿できる回数を超えました。10分ほど待ってから再度お試しください。"
              }),
              {
                status: 429,
                headers: corsHeaders
              }
            );
          }
        }

        // 同じThreadsアカウントの既存投稿を削除
        await env.DB.prepare(
          "DELETE FROM posts WHERE threads_url = ?"
        )
          .bind(threads)
          .run();

        // 新しい投稿を保存
        await env.DB.prepare(
          `INSERT INTO posts
           (pref, threads_url, display_name, message, delete_key)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(
            pref,
            threads,
            name || "@Threadsユーザー",
            text,
            delete_key
          )
          .run();

        // DBへの保存が成功した後に投稿回数をカウント
        if (limit) {
          const elapsed = now - limit.first_post_at;

          // 10分経過していたら新しいカウントを開始
          if (elapsed >= tenMinutes) {
            await env.DB.prepare(
              "UPDATE post_limits SET count = 1, first_post_at = ? WHERE ip = ?"
            )
              .bind(now, ip)
              .run();

          } else {
            // 投稿回数を1回増やす
            await env.DB.prepare(
              "UPDATE post_limits SET count = count + 1 WHERE ip = ?"
            )
              .bind(ip)
              .run();
          }

        } else {
          // 初回投稿
          await env.DB.prepare(
            "INSERT INTO post_limits (ip, count, first_post_at) VALUES (?, 1, ?)"
          )
            .bind(ip, now)
            .run();
        }

        return new Response(
          JSON.stringify({
            success: true
          }),
          {
            headers: corsHeaders
          }
        );

      } catch (e) {
        return new Response(
          JSON.stringify({
            error: e.message
          }),
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }

    // 投稿を削除
    if (url.pathname === "/api/delete" && request.method === "POST") {
      try {
        const body = await request.json();

        const {
          threads,
          delete_key
        } = body;

        // 必須項目チェック
        if (!threads || !delete_key) {
          return new Response(
            JSON.stringify({
              error: "Threads URLと削除キーを入力してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // 削除キーは4桁の数字のみ
        if (!/^\d{4}$/.test(delete_key)) {
          return new Response(
            JSON.stringify({
              error: "削除キーは4桁の数字で入力してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // Threads URLと削除キーが一致する投稿だけ削除
        const result = await env.DB.prepare(
          "DELETE FROM posts WHERE threads_url = ? AND delete_key = ?"
        )
          .bind(threads, delete_key)
          .run();

        if (!result.meta || result.meta.changes === 0) {
          return new Response(
            JSON.stringify({
              error: "削除キーが一致しません。"
            }),
            {
              status: 403,
              headers: corsHeaders
            }
          );
        }

        return new Response(
          JSON.stringify({
            success: true
          }),
          {
            headers: corsHeaders
          }
        );

      } catch (e) {
        return new Response(
          JSON.stringify({
            error: e.message
          }),
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
