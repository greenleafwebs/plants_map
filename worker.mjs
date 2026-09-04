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
    // Threadsアカウント存在確認用・診断API
    // ※現在はテスト専用。本番の投稿処理には使用しない
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

        // Threads URLからユーザー名を取得
        let username = "";

        try {
          const parsed = new URL(targetUrl);
          const match = parsed.pathname.match(/^\/@?([^/]+)/);

          if (match) {
            username = decodeURIComponent(match[1]);
          }
        } catch (e) {
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

        if (!username) {
          return new Response(
            JSON.stringify({
              error: "ユーザー名を取得できませんでした。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // Threadsページを取得
        const response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
          },
          redirect: "follow"
        });

        const html = await response.text();

        // -----------------------------------------------------
        // まず「対象ユーザー名そのもの」がHTMLに
        // 何回登場しているかを確認
        // -----------------------------------------------------

        const exactRegex = new RegExp(
          username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi"
        );

        const exactMatches = html.match(exactRegex) || [];

        // -----------------------------------------------------
        // 各パターンを検索
        // -----------------------------------------------------

        const escapedUsername = username.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        const patterns = {
          exact_username: escapedUsername,
          quoted_username:
            `"username":"${escapedUsername}"`,
          quoted_username_space:
            `"username": "${escapedUsername}"`,
          at_username:
            `@${escapedUsername}`,
          handle:
            `"handle":"${escapedUsername}"`,
          handle_space:
            `"handle": "${escapedUsername}"`,
          name:
            `"name":"${escapedUsername}"`,
          name_space:
            `"name": "${escapedUsername}"`
        };

        const patternResults = {};

        for (const [key, pattern] of Object.entries(patterns)) {
          try {
            const regex = new RegExp(pattern, "gi");
            const matches = html.match(regex) || [];

            patternResults[key] = {
              count: matches.length,
              found: matches.length > 0
            };
          } catch (e) {
            patternResults[key] = {
              count: 0,
              found: false,
              error: e.message
            };
          }
        }

        // -----------------------------------------------------
        // ユーザー名が見つかった周辺のHTMLを取得
        // 最大10か所
        // -----------------------------------------------------

        const contexts = [];

        let searchPosition = 0;

        while (contexts.length < 10) {
          const index = html
            .toLowerCase()
            .indexOf(username.toLowerCase(), searchPosition);

          if (index === -1) {
            break;
          }

          const start = Math.max(0, index - 300);
          const end = Math.min(
            html.length,
            index + username.length + 300
          );

          contexts.push({
            position: index,
            text: html.substring(start, end)
          });

          searchPosition =
            index + Math.max(username.length, 1);
        }

        // -----------------------------------------------------
        // HTML内のJSON scriptを調査
        // -----------------------------------------------------

        const scriptMatches =
          html.match(
            /<script[^>]*type=["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi
          ) || [];

        const jsonScriptInfo = [];

        for (let i = 0; i < scriptMatches.length; i++) {
          const script = scriptMatches[i];

          const lowerScript =
            script.toLowerCase();

          if (
            lowerScript.includes(
              username.toLowerCase()
            )
          ) {
            jsonScriptInfo.push({
              index: i,
              length: script.length,
              username_found: true,
              preview: script.substring(
                0,
                1000
              )
            });
          }
        }

        // -----------------------------------------------------
        // Threadsページ内でプロフィール関連と思われる
        // データを少しだけ確認
        // -----------------------------------------------------

        const profileRelated = [];

        const profileRegex =
          /.{0,200}(profile|username|user_id|handle).{0,300}/gi;

        let profileMatch;

        while (
          (profileMatch =
            profileRegex.exec(html)) !== null &&
          profileRelated.length < 30
        ) {
          const text = profileMatch[0];

          // 対象ユーザー名そのものを含むものを優先
          profileRelated.push(text);
        }

        // -----------------------------------------------------
        // 基本情報
        // -----------------------------------------------------

        const titleMatch =
          html.match(
            /<title[^>]*>([\s\S]*?)<\/title>/i
          );

        const descriptionMatch =
          html.match(
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
          );

        const ogTitleMatch =
          html.match(
            /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i
          );

        const ogDescriptionMatch =
          html.match(
            /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
          );

        return new Response(
          JSON.stringify(
            {
              target_url: targetUrl,
              final_url: response.url,

              status: response.status,
              ok: response.ok,

              username: username,

              html_length: html.length,

              title: titleMatch
                ? titleMatch[1]
                : null,

              description:
                descriptionMatch
                  ? descriptionMatch[1]
                  : null,

              og_title:
                ogTitleMatch
                  ? ogTitleMatch[1]
                  : null,

              og_description:
                ogDescriptionMatch
                  ? ogDescriptionMatch[1]
                  : null,

              // ユーザー名の単純な出現回数
              exact_username_count:
                exactMatches.length,

              // 各パターンの検索結果
              pattern_results:
                patternResults,

              // ユーザー名周辺のHTML
              username_contexts:
                contexts,

              // ユーザー名を含むJSON script
              json_scripts_containing_username:
                jsonScriptInfo,

              // JSON script総数
              json_script_count:
                scriptMatches.length,

              // プロフィール関連の断片
              profile_related_samples:
                profileRelated
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
            stack: e.stack
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
    if (
      url.pathname === "/api/get" &&
      request.method === "GET"
    ) {
      try {
        const { results } =
          await env.DB.prepare(
            "SELECT * FROM posts ORDER BY id DESC"
          ).all();

        return new Response(
          JSON.stringify(results),
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
    // 投稿データを保存
    // =========================================================
    if (
      url.pathname === "/api/post" &&
      request.method === "POST"
    ) {
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
        if (
          !pref ||
          !threads ||
          !text ||
          !delete_key
        ) {
          return new Response(
            JSON.stringify({
              error:
                "必要な項目が入力されていません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // 削除キー4文字チェック
        if (
          !/^[A-Za-z0-9]{4}$/.test(
            delete_key
          )
        ) {
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
              error:
                "HTMLタグは使用できません。"
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
        const normalizedText =
          text.toLowerCase();

        const ngWord =
          NG_WORDS.find(word =>
            normalizedText.includes(
              word.toLowerCase()
            )
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
          request.headers.get(
            "CF-Connecting-IP"
          ) ||
          request.headers.get(
            "X-Forwarded-For"
          ) ||
          "unknown";

        const now = Date.now();
        const tenMinutes =
          10 * 60 * 1000;

        // IPの投稿制限を確認
        const limit =
          await env.DB.prepare(
            "SELECT count, first_post_at FROM post_limits WHERE ip = ?"
          )
            .bind(ip)
            .first();

        if (limit) {
          const elapsed =
            now - limit.first_post_at;

          // 10分以内に3回以上投稿していたら制限
          if (
            elapsed < tenMinutes &&
            limit.count >= 3
          ) {
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
          const elapsed =
            now - limit.first_post_at;

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
    if (
      url.pathname === "/api/delete" &&
      request.method === "POST"
    ) {
      try {
        const body =
          await request.json();

        const {
          threads,
          delete_key
        } = body;

        if (!threads || !delete_key) {
          return new Response(
            JSON.stringify({
              error:
                "必要な項目が入力されていません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        if (
          !/^[A-Za-z0-9]{4}$/.test(
            delete_key
          )
        ) {
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

        const result =
          await env.DB.prepare(
            "DELETE FROM posts WHERE threads_url = ? AND delete_key = ?"
          )
            .bind(
              threads,
              delete_key
            )
            .run();

        if (
          !result.meta ||
          result.meta.changes === 0
        ) {
          return new Response(
            JSON.stringify({
              error:
                "削除キーが一致しません。"
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
