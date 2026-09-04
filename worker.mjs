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

        // メッセージ140文字チェック
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

        // 投稿回数確認
        const limit = await env.DB.prepare(
          "SELECT count, first_post_at FROM post_limits WHERE ip = ?"
        )
          .bind(ip)
          .first();

        if (limit) {
          const elapsed = now - limit.first_post_at;

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

        // 同じThreads URLの既存投稿を削除
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

        // 投稿回数を更新
        if (limit) {
          const elapsed = now - limit.first_post_at;

          if (elapsed >= tenMinutes) {
            await env.DB.prepare(
              "UPDATE post_limits SET count = 1, first_post_at = ? WHERE ip = ?"
            )
              .bind(now, ip)
              .run();
          } else {
            await env.DB.prepare(
              "UPDATE post_limits SET count = count + 1 WHERE ip = ?"
            )
              .bind(ip)
              .run();
          }

        } else {
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

        // 削除
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
    // Threads存在確認テスト
    //
    // ※まだ投稿処理には組み込まない
    // =========================================================
    if (
      url.pathname === "/api/test-threads" &&
      request.method === "GET"
    ) {
      try {
        const targetUrl = url.searchParams.get("url");

        if (!targetUrl) {
          return new Response(
            JSON.stringify({
              error: "urlパラメータがありません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // ThreadsのURLだけ許可
        const target = new URL(targetUrl);

        if (
          target.hostname !== "www.threads.com" &&
          target.hostname !== "threads.com"
        ) {
          return new Response(
            JSON.stringify({
              error:
                "ThreadsのURLを指定してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // @usernameを取得
        const match = target.pathname.match(
          /^\/@([^/]+)\/?$/
        );

        const username = match ? match[1] : null;

        // -----------------------------------------------------
        // Browser Runで完全レンダリングされたHTMLを取得
        // -----------------------------------------------------
        const browserResponse =
          await env.BROWSER.quickAction("content", {
            url: targetUrl,
            gotoOptions: {
              waitUntil: "networkidle2"
            }
          });

        // Browser Runのレスポンスをテキスト化
        const renderedHtml =
          await browserResponse.text();

        // HTML内の情報を調査
        const lowerHtml =
          renderedHtml.toLowerCase();

        const titleMatch =
          renderedHtml.match(
            /<title[^>]*>([\s\S]*?)<\/title>/i
          );

        const title =
          titleMatch
            ? titleMatch[1].trim()
            : null;

        // usernameそのもの
        const exactUsernameCount =
          username
            ? (
                renderedHtml.match(
                  new RegExp(
                    username.replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    ),
                    "gi"
                  )
                ) || []
              ).length
            : 0;

        // @username
        const atUsernameCount =
          username
            ? (
                renderedHtml.match(
                  new RegExp(
                    "@" +
                      username.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                      ),
                    "gi"
                  )
                ) || []
              ).length
            : 0;

        // 404関連文字列
        const errorPatterns = [
          "404",
          "page not found",
          "sorry, this page isn't available",
          "this profile doesn't exist",
          "profile doesn't exist",
          "couldn't find this profile",
          "something went wrong"
        ];

        const errorResults =
          errorPatterns.map(pattern => ({
            pattern,
            found: lowerHtml.includes(pattern)
          }));

        // プロフィール関連文字列
        const profilePatterns = [
          "followers",
          "following",
          "threads",
          "replies",
          "posts"
        ];

        const profileResults =
          profilePatterns.map(pattern => ({
            pattern,
            found: lowerHtml.includes(pattern)
          }));

        return new Response(
          JSON.stringify(
            {
              target_url: targetUrl,
              final_url: targetUrl,
              username: username,

              browser_run: true,

              rendered_html_length:
                renderedHtml.length,

              title,

              exact_username_count:
                exactUsernameCount,

              at_username_count:
                atUsernameCount,

              error_results:
                errorResults,

              profile_results:
                profileResults,

              // HTMLの先頭5000文字
              html_head:
                renderedHtml.slice(0, 5000)
            },
            null,
            2
          ),
          {
            headers: corsHeaders
          }
        );

      } catch (e) {
        return new Response(
          JSON.stringify({
            error: e.message,
            stack: e.stack || null
          }),
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }

    // =========================================================
    // その他
    // =========================================================
    return env.ASSETS.fetch(request);
  }
};
