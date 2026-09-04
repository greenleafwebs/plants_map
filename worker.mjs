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

    // =========================================================
    // Threadsアカウント存在確認テスト
    // =========================================================
    if (url.pathname === "/api/test-threads" && request.method === "GET") {
      try {
        const threadsUrl = url.searchParams.get("url");

        if (!threadsUrl) {
          return new Response(
            JSON.stringify({
              error: "urlを指定してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // URLチェック
        let targetUrl;

        try {
          targetUrl = new URL(threadsUrl);
        } catch {
          return new Response(
            JSON.stringify({
              error: "URLの形式が正しくありません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // Threads以外にはアクセスしない
        if (
          targetUrl.protocol !== "https:" ||
          !(
            targetUrl.hostname === "www.threads.com" ||
            targetUrl.hostname === "threads.com"
          )
        ) {
          return new Response(
            JSON.stringify({
              error: "ThreadsのURLのみ指定できます。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // URLからユーザー名を取得
        const pathParts = targetUrl.pathname
          .split("/")
          .filter(Boolean);

        const username =
          pathParts.length > 0
            ? decodeURIComponent(pathParts[0]).replace(/^@/, "")
            : "";

        // Threadsへアクセス
        const response = await fetch(targetUrl.toString(), {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "ja,en-US;q=0.9,en;q=0.8"
          },
          redirect: "follow"
        });

        const html = await response.text();

        // =====================================================
        // HTML内の特徴的な文字列を調査
        // =====================================================

        const lowerHtml = html.toLowerCase();

        const keywords = [
          username,
          "profile",
          "username",
          "og:title",
          "og:description",
          "not found",
          "page not found",
          "見つかりません",
          "ページが見つかりません",
          "instagramアカウントでログイン",
          "ログイン",
          "threads"
        ];

        const matches = [];

        for (const keyword of keywords) {
          if (!keyword) continue;

          const lowerKeyword = keyword.toLowerCase();
          let searchFrom = 0;
          let count = 0;

          while (count < 3) {
            const index = lowerHtml.indexOf(
              lowerKeyword,
              searchFrom
            );

            if (index === -1) {
              break;
            }

            const start = Math.max(0, index - 150);
            const end = Math.min(
              html.length,
              index + keyword.length + 150
            );

            matches.push({
              keyword: keyword,
              context: html.substring(start, end)
            });

            searchFrom = index + lowerKeyword.length;
            count++;
          }
        }

        // 重複した検索結果を削除
        const uniqueMatches = [];
        const seen = new Set();

        for (const item of matches) {
          const key =
            item.keyword + "|" + item.context;

          if (!seen.has(key)) {
            seen.add(key);
            uniqueMatches.push(item);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            requested_url: threadsUrl,
            final_url: response.url,
            status: response.status,
            username: username,
            html_length: html.length,
            matches: uniqueMatches
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

    // =========================================================
    // 投稿データを取得
    // =========================================================
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

    // =========================================================
    // 投稿データを保存
    // =========================================================
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

        // 削除キー4文字チェック
        if (!/^[A-Za-z0-9]{4}$/.test(delete_key)) {
          return new Response(
            JSON.stringify({
              error:
                "削除キーは4文字の英数字で入力してください。"
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
              error:
                "メッセージは140文字以内で入力してください。"
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
          /https?:\/\/|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|jp|co\.jp|info|biz)(\/[^\s]*)?/i.test(
            text
          )
        ) {
          return new Response(
            JSON.stringify({
              error:
                "メッセージにURLを入れることはできません。"
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
              error:
                "使用できない言葉が含まれています。"
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
          "INSERT INTO posts (pref, threads_url, display_name, message, delete_key) VALUES (?, ?, ?, ?, ?)"
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

    // =========================================================
    // 投稿削除
    // =========================================================
    if (url.pathname === "/api/delete" && request.method === "POST") {
      try {
        const body = await request.json();

        const {
          threads,
          delete_key
        } = body;

        if (!threads || !delete_key) {
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

        if (!/^[A-Za-z0-9]{4}$/.test(delete_key)) {
          return new Response(
            JSON.stringify({
              error:
                "削除キーは4文字の英数字で入力してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

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

    // =========================================================
    // API以外は静的ファイルを返す
    // =========================================================
    return env.ASSETS.fetch(request);
  }
};
