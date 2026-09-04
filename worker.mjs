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
      return new Response(null, {
        headers: corsHeaders
      });
    }

    // =========================================================
    // Threadsアカウント存在確認
    // =========================================================

    async function checkThreadsAccount(threadsUrl) {
      try {
        const target = new URL(threadsUrl);

        // -----------------------------------------------------
        // ThreadsのURLだけ許可
        // -----------------------------------------------------

        if (
          target.hostname !== "www.threads.com" &&
          target.hostname !== "threads.com"
        ) {
          return {
            success: false,
            exists: false,
            error:
              "ThreadsのURLを指定してください。"
          };
        }

        // -----------------------------------------------------
        // @usernameを取得
        // -----------------------------------------------------

        const match = target.pathname.match(
          /^\/@([^/]+)\/?$/
        );

        if (!match) {
          return {
            success: false,
            exists: false,
            error:
              "ThreadsプロフィールURLの形式が正しくありません。"
          };
        }

        const username = match[1];

        // -----------------------------------------------------
        // Browser Run
        // -----------------------------------------------------

        const browserResponse =
          await env.BROWSER.quickAction(
            "content",
            {
              url: threadsUrl,
              gotoOptions: {
                waitUntil: "networkidle2"
              }
            }
          );

        const renderedHtml =
          await browserResponse.text();

        // -----------------------------------------------------
        // Browser Runのレスポンスを解析
        // -----------------------------------------------------

        let html = renderedHtml;

        try {
          const parsed =
            JSON.parse(renderedHtml);

          if (
            parsed &&
            typeof parsed.result === "string"
          ) {
            html = parsed.result;
          }
        } catch (e) {
          // JSONでなければそのままHTMLとして扱う
        }

        // -----------------------------------------------------
        // HTMLが極端に短い場合
        // -----------------------------------------------------

        if (!html || html.length < 500) {
          return {
            success: true,
            exists: false,
            username,
            reason:
              "プロフィール情報を取得できませんでした。"
          };
        }

        // -----------------------------------------------------
        // title
        // -----------------------------------------------------

        const titleMatch =
          html.match(
            /<title[^>]*>([\s\S]*?)<\/title>/i
          );

        const title =
          titleMatch
            ? titleMatch[1].trim()
            : null;

        // -----------------------------------------------------
        // canonical
        // -----------------------------------------------------

        const canonicalMatch =
          html.match(
            /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
          );

        const canonicalUrl =
          canonicalMatch
            ? canonicalMatch[1]
            : null;

        // -----------------------------------------------------
        // og:type
        // -----------------------------------------------------

        const ogTypeMatch =
          html.match(
            /<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i
          );

        const ogType =
          ogTypeMatch
            ? ogTypeMatch[1]
            : null;

        // -----------------------------------------------------
        // og:title
        // -----------------------------------------------------

        const ogTitleMatch =
          html.match(
            /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
          );

        const ogTitle =
          ogTitleMatch
            ? ogTitleMatch[1]
            : null;

        // -----------------------------------------------------
        // usernameを正規表現用にエスケープ
        // -----------------------------------------------------

        const escapedUsername =
          username.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

        // -----------------------------------------------------
        // プロフィールtitle判定
        // -----------------------------------------------------

        const profileTitlePattern =
          new RegExp(
            "\\(@" +
              escapedUsername +
              "\\)\\s*[•·-]\\s*threads",
            "i"
          );

        const profileTitleFound =
          profileTitlePattern.test(
            title || ""
          );

        // -----------------------------------------------------
        // og:titleプロフィール判定
        // -----------------------------------------------------

        const profileOgTitlePattern =
          new RegExp(
            "\\(@" +
              escapedUsername +
              "\\)\\s*[•·-]\\s*threads",
            "i"
          );

        const profileOgTitleFound =
          profileOgTitlePattern.test(
            ogTitle || ""
          );

        // -----------------------------------------------------
        // canonical判定
        // -----------------------------------------------------

        let canonicalMatches = false;

        if (canonicalUrl) {
          try {
            const canonical =
              new URL(canonicalUrl);

            canonicalMatches =
              (
                canonical.hostname ===
                  "www.threads.com" ||
                canonical.hostname ===
                  "threads.com"
              ) &&
              canonical.pathname.replace(
                /\/$/,
                ""
              ) ===
                target.pathname.replace(
                  /\/$/,
                  ""
                );
          } catch (e) {
            canonicalMatches = false;
          }
        }

        // -----------------------------------------------------
        // og:typeプロフィール判定
        // -----------------------------------------------------

        const ogTypeProfile =
          (ogType || "").toLowerCase() ===
          "profile";

        // -----------------------------------------------------
        // ログインページ判定
        // -----------------------------------------------------

        const loginPage =
          (title || "")
            .toLowerCase()
            .includes("threads • log in") ||
          (canonicalUrl || "")
            .toLowerCase()
            .includes("/login");

        // -----------------------------------------------------
        // 強い判定材料
        // -----------------------------------------------------

        const strongSignals = [
          profileTitleFound,
          profileOgTitleFound,
          canonicalMatches,
          ogTypeProfile
        ].filter(Boolean).length;

        // -----------------------------------------------------
        // 最終判定
        // -----------------------------------------------------

        const exists =
          !loginPage &&
          strongSignals >= 2;

        return {
          success: true,
          exists,
          username,
          strongSignals,
          title,
          canonicalUrl,
          ogType,
          ogTitle,
          loginPage
        };

      } catch (e) {
        return {
          success: false,
          exists: false,
          error: e.message
        };
      }
    }

    // =========================================================
    // Threadsアカウント存在確認テスト
    // =========================================================
    //
    // 本番投稿には使わず、動作確認用として残しておく。
    //
    // =========================================================

    if (
      url.pathname === "/api/test-threads" &&
      request.method === "GET"
    ) {
      try {
        const targetUrl =
          url.searchParams.get("url");

        if (!targetUrl) {
          return new Response(
            JSON.stringify({
              error:
                "urlパラメータがありません。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        const result =
          await checkThreadsAccount(
            targetUrl
          );

        return new Response(
          JSON.stringify(
            result,
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
        const body =
          await request.json();

        const {
          pref,
          threads,
          name,
          text,
          delete_key
        } = body;

        // -----------------------------------------------------
        // 必須項目チェック
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // 削除キー4文字チェック
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // メッセージ140文字以内
        // -----------------------------------------------------

        if (
          [...text].length > 140
        ) {
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

        // -----------------------------------------------------
        // HTMLタグ禁止
        // -----------------------------------------------------

        if (
          /<[^>]*>/i.test(text)
        ) {
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

        // -----------------------------------------------------
        // URL禁止
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // NGワードチェック
        // -----------------------------------------------------

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

        // =====================================================
        // Threadsアカウント存在確認
        // =====================================================
        //
        // D1へ保存する前に確認する。
        //
        // =====================================================

        const threadsCheck =
          await checkThreadsAccount(
            threads
          );

        // -----------------------------------------------------
        // Threads URL自体が不正
        // -----------------------------------------------------

        if (
          !threadsCheck.success
        ) {
          return new Response(
            JSON.stringify({
              error:
                "Threadsアカウントを確認できませんでした。正しいThreadsプロフィールURLを入力してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // -----------------------------------------------------
        // アカウントが存在しない
        // -----------------------------------------------------

        if (
          !threadsCheck.exists
        ) {
          return new Response(
            JSON.stringify({
              error:
                "実在するThreadsアカウントを入力してください。"
            }),
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // =====================================================
        // IPアドレス取得
        // =====================================================

        const ip =
          request.headers.get(
            "CF-Connecting-IP"
          ) ||
          request.headers.get(
            "X-Forwarded-For"
          ) ||
          "unknown";

        // =====================================================
        // 投稿制限
        // 10分間に3回まで
        // =====================================================

        const now =
          Date.now();

        const tenMinutes =
          10 * 60 * 1000;

        const limit =
          await env.DB.prepare(
            "SELECT count, first_post_at FROM post_limits WHERE ip = ?"
          )
            .bind(ip)
            .first();

        if (limit) {
          const elapsed =
            now -
            limit.first_post_at;

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

        // =====================================================
        // 同じThreads URLの投稿を削除
        // =====================================================

        await env.DB.prepare(
          "DELETE FROM posts WHERE threads_url = ?"
        )
          .bind(threads)
          .run();

        // =====================================================
        // 投稿保存
        // =====================================================

        await env.DB.prepare(
          "INSERT INTO posts (pref, threads_url, display_name, message, delete_key) VALUES (?, ?, ?, ?, ?)"
        )
          .bind(
            pref,
            threads,
            name ||
              "@Threadsユーザー",
            text,
            delete_key
          )
          .run();

        // =====================================================
        // 投稿回数更新
        // =====================================================

        if (limit) {
          const elapsed =
            now -
            limit.first_post_at;

          if (
            elapsed >= tenMinutes
          ) {
            await env.DB.prepare(
              "UPDATE post_limits SET count = 1, first_post_at = ? WHERE ip = ?"
            )
              .bind(
                now,
                ip
              )
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
            .bind(
              ip,
              now
            )
            .run();
        }

        // =====================================================
        // 投稿成功
        // =====================================================

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

        // -----------------------------------------------------
        // 必須項目
        // -----------------------------------------------------

        if (
          !threads ||
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

        // -----------------------------------------------------
        // 削除キー4文字チェック
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // 削除
        // -----------------------------------------------------

        const result =
          await env.DB.prepare(
            "DELETE FROM posts WHERE threads_url = ? AND delete_key = ?"
          )
            .bind(
              threads,
              delete_key
            )
            .run();

        // -----------------------------------------------------
        // 削除結果
        // -----------------------------------------------------

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
    // その他は静的ファイル
    // =========================================================

    return env.ASSETS.fetch(request);
  }
};
