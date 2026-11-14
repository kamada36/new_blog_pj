// X & Threads API 投稿システム - Google Apps Script

// グローバル変数
const SHEET_NAME_POSTS = "投稿管理";
const SHEET_NAME_SETTINGS = "設定";
const SHEET_NAME_LOG = "ログ";
const SHEET_NAME_RANDOM_POSTS = "ランダム投稿";

const STATUS_PENDING = "未投稿";
const STATUS_POSTED = "投稿済み";
const STATUS_ERROR = "エラー";

// 予定投稿時間を過ぎてから、何分までなら「投稿し損ねた分」として投稿するか。
// 毎分のトリガーが1回飛んだ場合や、ツリー投稿(返信)の親の投稿が少し遅れた場合に、その分を取りこぼさないための猶予。
const CATCHUP_WINDOW_MINUTES = 30;

// CSVで返信(ツリー)の予定投稿時間が空のとき、メイン投稿の何分後にするか
const DEFAULT_REPLY_DELAY_MINUTES = 5;

// 「投稿管理」シートの T列: サイトID。サイト側の投稿IDをCSVから受け取って記録し、同じ投稿を二重に取り込まないために使う
const SITE_ID_COLUMN = 20;

const X_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Referer": "https://x.com/",
  "Origin": "https://x.com",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
};

const THREADS_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Referer": "https://www.threads.com/",
  "Origin": "https://www.threads.com",
  "Accept-Language": "ja-JP,ja;q=0.9"
};

/**
 * メニューを追加する
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('投稿システム')
    .addItem('予定投稿時間を設定する', 'setScheduledTimes')
    .addItem('投稿状態を初期化', 'initializePostStatus')
    .addSeparator()
    .addItem('時間枠設定', 'showTimeFrameSettingsDialog')
    .addItem('デフォルト投稿先設定', 'showDefaultPostDestinationDialog')
    .addItem('ランダム投稿設定', 'showRandomPostSettings')
    .addSeparator()
    .addItem('CSV変換', 'showCsvConversionDialog')
    .addItem('CSVインポート', 'showImportDialog')
    .addItem('テンプレート作成', 'showTemplateDialog')
    .addSeparator()
    .addItem('API設定', 'showApiSettingsDialog')
    .addItem('APIテスト', 'showApiTestDialog')
    .addToUi();
}

/**
 * トリガーの設定（初期セットアップ用）
 */
function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    // 古いトリガーは一旦全て削除
    ScriptApp.deleteTrigger(trigger);
  }
  // X投稿用のトリガー
  ScriptApp.newTrigger('checkAndPost_X')
    .timeBased()
    .everyMinutes(1)
    .create();
  // Threads投稿用のトリガー
  ScriptApp.newTrigger('checkAndPost_Threads')
    .timeBased()
    .everyMinutes(1)
    .create();
  // ランダム投稿スケジューリング用のトリガー
  ScriptApp.newTrigger('scheduleRandomPostsForToday')
    .timeBased()
    .everyMinutes(1)
    .create();
  
  // Threadsアクセストークン自動更新用のトリガー（週次）
  ScriptApp.newTrigger('refreshAccessToken')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  // onEditトリガーはSimple Triggerとして自動で動作しますが、
  // 他のトリガーと合わせて管理しやすくするためにInstallable Triggerとしても設定します。
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  logAction("トリガーを再設定しました（X投稿、Threads投稿、ランダム投稿スケジュール、トークン更新）");
}



/**
 * 投稿時間をランダムに設定する
 */
function setScheduledTimes(showAlert = true) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
  if (!postsSheet) {
    return;
  }
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const timeRanges = getTimeRanges(settingsSheet);
  const dataRange = postsSheet.getDataRange();
  const values = dataRange.getValues();
  let updatedCount = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    // 新しい列レイアウトに合わせてインデックスを調整
    const postId = row[0];
    const timeFrame = row[3];
    const scheduledTime = row[4];
    const xStatus = row[6];
    const thrStatus = row[8];
    const postToX = row[11];
    const postToThr = row[12];

    const isXPending = postToX == 1 && (xStatus === STATUS_PENDING || xStatus === '' || xStatus === null);
    const isThrPending = postToThr == 1 && (thrStatus === STATUS_PENDING || thrStatus === '' || thrStatus === null);

    // 投稿IDと時間枠があり、予定投稿時間が空欄で、かつ投稿対象のプラットフォームのいずれかが未投稿の場合
    if (
      postId &&
      timeFrame &&
      (scheduledTime === null || scheduledTime === '') &&
      (isXPending || isThrPending)
    ) {
      const timeRange = timeRanges[timeFrame - 1];
      if (!timeRange) continue;
      const randomTime = getRandomTime(timeRange.start, timeRange.end);
      postsSheet.getRange(i + 1, 5).setValue(randomTime);
      updatedCount++;
    }
  }

  if (showAlert) {
    SpreadsheetApp.getUi().alert(`${updatedCount}件の投稿時間を設定しました`);
  }
  logAction(`${updatedCount}件の投稿時間を設定しました`);
}

/**
 * 予定投稿時間(HH:mm)が「今(HH:mm)」までに来ていて、かつ猶予(CATCHUP_WINDOW_MINUTES)以内かを判定する。
 * 日付が今日であることは、呼び出し側で確認する。
 */
function isDueNow(scheduledTime, currentTime) {
  if (!scheduledTime || !/^\d{2}:\d{2}$/.test(scheduledTime)) return false;
  if (scheduledTime > currentTime) return false;
  return timeToMinutes_(currentTime) - timeToMinutes_(scheduledTime) <= CATCHUP_WINDOW_MINUTES;
}

function timeToMinutes_(time) {
  const parts = time.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * CSVの予定投稿時間("7:30" "07:30" "07:30:00" など)を "HH:mm" にそろえる。読み取れなければ空文字。
 */
function normalizeCsvTime_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return '';
  return String(hours).padStart(2, '0') + ':' + match[2];
}

/**
 * "HH:mm" に分を足す。同じ日(23:59まで)に収まらなければ空文字。
 */
function addMinutesToTime_(time, minutes) {
  const total = timeToMinutes_(time) + minutes;
  if (total > 23 * 60 + 59) return '';
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

/**
 * 設定シートから時間帯の範囲を取得
 */
function getTimeRanges(settingsSheet) {
  const timeRangesData = settingsSheet.getRange("B4:D6").getDisplayValues();
  const timeRanges = [];
  for (const row of timeRangesData) {
    timeRanges.push({
      timeFrame: row[0],
      start: row[1],
      end: row[2]
    });
  }
  return timeRanges;
}

/**
 * 指定された時間範囲内でランダムな時間を生成する
 */
function getRandomTime(startTime, endTime) {
  const startDate = new Date();
  const [startHours, startMinutes] = startTime.split(':');
  startDate.setHours(parseInt(startHours, 10), parseInt(startMinutes, 10), 0, 0);

  const endDate = new Date();
  const [endHours, endMinutes] = endTime.split(':');
  endDate.setHours(parseInt(endHours, 10), parseInt(endMinutes, 10), 0, 0);
  
  const timeDiff = endDate.getTime() - startDate.getTime();
  const randomTime = startDate.getTime() + Math.random() * timeDiff;
  const randomDate = new Date(randomTime);
  const hours = randomDate.getHours().toString().padStart(2, '0');
  const minutes = randomDate.getMinutes().toString().padStart(2, '0');
  const seconds = randomDate.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Xの投稿予定時間になったものを投稿する
 */
function checkAndPost_X() {
  const now = new Date();
  const currentTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm");
  const currentDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
  const dataRange = postsSheet.getDataRange();
  const values = dataRange.getValues();
  
  // 投稿IDをキーにしたマップを作成して、親投稿を効率的に検索できるようにする
  const postMap = new Map(values.map((row, index) => [row[0], {data: row, rowIndex: index + 1}]));

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowIndex = i + 1;
    // 新しい列レイアウトに合わせてインデックスを調整
    const postId = row[0];
    const treeId = row[1]; // B列: ツリーID
    const postDate = row[2];
    const scheduledTime = row[4];
    const content = row[5];
    const xStatus = row[6]; // G列: X_状態
    const postToXFlag = row[11]; // L列: to_X
    const videoUrls = row[13]; // N列: X(共通)動画
    const imageUrls = row[14]; // O列: X(共通)画像
    const xPostIdCol = 18; // R列: X_Post_ID

    let formattedDate = "";
    if (postDate instanceof Date && !isNaN(postDate.getTime())) {
      formattedDate = Utilities.formatDate(postDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (typeof postDate === "string") {
      formattedDate = postDate.replace(/\\\//g, "-");
    }

    let normalizedScheduledTime = "";
    if (scheduledTime) {
      if (typeof scheduledTime === "string") {
        normalizedScheduledTime = scheduledTime.substring(0, 5);
      } else if (scheduledTime instanceof Date && !isNaN(scheduledTime.getTime())) {
        normalizedScheduledTime = Utilities.formatDate(scheduledTime, Session.getScriptTimeZone(), "HH:mm");
      }
    }

    if (
      formattedDate === currentDate &&
      isDueNow(normalizedScheduledTime, currentTime) &&
      postToXFlag == 1 &&
      (xStatus === STATUS_PENDING || xStatus === "" || xStatus === null) &&
      content && content.trim() !== ""
    ) {
      // 処理開始前にステータスを「実行中」に設定
      postsSheet.getRange(rowIndex, 7).setValue("実行中");
      SpreadsheetApp.flush(); // 変更を即座に反映

      try {
        let replyToTweetId = null;
        // ツリー投稿の場合、親投稿のIDを取得
        if (treeId) {
          const parentPost = postMap.get(treeId);
          if (parentPost) {
            const parentXPostId = parentPost.data[xPostIdCol - 1]; // マップのデータは0-indexed
            if (parentXPostId) {
              replyToTweetId = parentXPostId;
            } else {
              Logger.log(`投稿ID ${postId}: 親投稿(ID: ${treeId})がまだXに投稿されていないため、スキップします。`);
              postsSheet.getRange(rowIndex, 7).setValue(STATUS_PENDING); // 実行中にしたステータスを未投稿に戻す
              continue; // 親がまだ投稿されていないのでスキップ
            }
          } else {
            Logger.log(`投稿ID ${postId}: 親投稿(ID: ${treeId})が見つからないため、スキップします。`);
            postsSheet.getRange(rowIndex, 7).setValue(STATUS_PENDING); // 実行中にしたステータスを未投稿に戻す
            continue; // 親が見つからないのでスキップ
          }
        }

        Logger.log(`投稿ID ${postId}: X APIで投稿を試みます。リプライ先: ${replyToTweetId || 'なし'}`);
        const response = postToX(content, videoUrls, imageUrls, replyToTweetId);
        
        // 投稿成功後、返されたIDを保存
        if (response && response.data && response.data.id) {
          postsSheet.getRange(rowIndex, xPostIdCol).setValue(response.data.id);
        }

        postsSheet.getRange(rowIndex, 7).setValue(STATUS_POSTED); // G列: X_状態
        postsSheet.getRange(rowIndex, 8).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss")); // H列: X_投稿時間
        logAction(`投稿ID ${postId} を X に投稿しました`);
      } catch (e) {
        const errorMessage = `X投稿エラー: ${e.message}`;
        postsSheet.getRange(rowIndex, 7).setValue(STATUS_ERROR); // G列: X_状態
        logAction(`投稿ID ${postId} の ${errorMessage}`);
        Logger.log(`投稿ID ${postId}: ${errorMessage}`);
      }
    }
  }
}

/**
 * Threadsの投稿予定時間になったものを投稿する
 */
function checkAndPost_Threads() {
  const now = new Date();
  const currentTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm");
  const currentDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
  const dataRange = postsSheet.getDataRange();
  const values = dataRange.getValues();

  // 投稿IDをキーにしたマップを作成
  const postMap = new Map(values.map((row, index) => [row[0], {data: row, rowIndex: index + 1}]));

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowIndex = i + 1;
    // 新しい列レイアウトに合わせてインデックスを調整
    const postId = row[0];
    const treeId = row[1]; // B列: ツリーID
    const postDate = row[2];
    const scheduledTime = row[4];
    const content = row[5];
    const threadsStatus = row[8]; // I列: Thr_状態
    const postToThreadsFlag = row[12]; // M列: to_Thr
    const videoUrlsM = row[13]; // N列: X(共通)動画
    const imageUrlsN = row[14]; // O列: X(共通)画像
    const videoUrlsO = row[15]; // P列: Threads(専用)動画
    const imageUrlsP = row[16]; // Q列: Threads(専用)画像
    const threadsPostIdCol = 19; // S列: Threads_Post_ID

    let formattedDate = "";
    if (postDate instanceof Date && !isNaN(postDate.getTime())) {
      formattedDate = Utilities.formatDate(postDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (typeof postDate === "string") {
      formattedDate = postDate.replace(/\\\//g, "-");
    }

    let normalizedScheduledTime = "";
    if (scheduledTime) {
      if (typeof scheduledTime === "string") {
        normalizedScheduledTime = scheduledTime.substring(0, 5);
      } else if (scheduledTime instanceof Date && !isNaN(scheduledTime.getTime())) {
        normalizedScheduledTime = Utilities.formatDate(scheduledTime, Session.getScriptTimeZone(), "HH:mm");
      }
    }

    if (
      formattedDate === currentDate &&
      isDueNow(normalizedScheduledTime, currentTime) &&
      postToThreadsFlag == 1 &&
      (threadsStatus === STATUS_PENDING || threadsStatus === "" || threadsStatus === null) &&
      content && content.trim() !== ""
    ) {
      // 処理開始前にステータスを「実行中」に設定
      postsSheet.getRange(rowIndex, 9).setValue("実行中");
      SpreadsheetApp.flush(); // 変更を即座に反映

      try {
        let replyToThreadsId = null;
        // ツリー投稿の場合、親投稿のIDを取得
        if (treeId) {
          const parentPost = postMap.get(treeId);
          if (parentPost) {
            const parentThreadsPostId = parentPost.data[threadsPostIdCol - 1]; // マップのデータは0-indexed
            if (parentThreadsPostId) {
              replyToThreadsId = parentThreadsPostId;
            } else {
              Logger.log(`投稿ID ${postId}: 親投稿(ID: ${treeId})がまだThreadsに投稿されていないため、スキップします。`);
              postsSheet.getRange(rowIndex, 9).setValue(STATUS_PENDING); // 実行中にしたステータスを未投稿に戻す
              continue; // 親がまだ投稿されていないのでスキップ
            }
          } else {
            Logger.log(`投稿ID ${postId}: 親投稿(ID: ${treeId})が見つからないため、スキップします。`);
            postsSheet.getRange(rowIndex, 9).setValue(STATUS_PENDING); // 実行中にしたステータスを未投稿に戻す
            continue; // 親が見つからないのでスキップ
          }
        }

        Logger.log(`投稿ID ${postId}: Threads APIで投稿を試みます。リプライ先: ${replyToThreadsId || 'なし'}`);
        const response = postToThreads(content, imageUrlsN, imageUrlsP, videoUrlsM, videoUrlsO, replyToThreadsId);

        // 投稿成功後、返されたIDを保存
        if (response && response.id) {
          postsSheet.getRange(rowIndex, threadsPostIdCol).setValue(response.id);
        }

        postsSheet.getRange(rowIndex, 9).setValue(STATUS_POSTED); // I列: Thr_状態
        postsSheet.getRange(rowIndex, 10).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss")); // J列: Thr_投稿時間
        logAction(`投稿ID ${postId} を Threads に投稿しました`);
      } catch (e) {
        const errorMessage = `Threads投稿エラー: ${e.message}`;
        postsSheet.getRange(rowIndex, 9).setValue(STATUS_ERROR); // I列: Thr_状態
        logAction(`投稿ID ${postId} の ${errorMessage}`);
        Logger.log(`投稿ID ${postId}: ${errorMessage}`);
      }
    }
  }
}

/**
 * Xに投稿する
 */
function postToX(text, videoUrls, imageUrls, in_reply_to_tweet_id = null) {
  Logger.log(`postToX 関数実行: text=${text}, videoUrls=${videoUrls}, imageUrls=${imageUrls}, in_reply_to_tweet_id=${in_reply_to_tweet_id}`);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const apiSettings = getXApiSettings(settingsSheet);
  if (!apiSettings.apiKey || !apiSettings.apiSecret || !apiSettings.accessToken || !apiSettings.accessTokenSecret) {
    throw new Error("X APIの設定が不完全です。設定シートでAPIキーとトークンを確認してください。");
  }

  let mediaIds = [];
  // M列（動画）を優先
  if (videoUrls) {
    // 動画は1つだけ
    const urls = processVideoUrls(videoUrls).slice(0, 1);
    if (urls.length > 0) {
      Logger.log(`Uploading 1 video to X.`);
      try {
        const url = urls[0];
        Logger.log(`Fetching video from URL: ${url}`);
        let videoBlob;

        // Google DriveのURLの場合、OAuthトークンを付与してフェッチする
        if (url.includes("drive.google.com")) {

          //追加
          let fileId = null;
          let match = url.match(/\/d\/(.+?)(?:\/|$)/);
          if(match && match[1]) {
            fileId = match[1];
          }else{
            match = url.match(/[?&]id=([^&]+)/);
            if(match && match[1]) {
              fileId = match[1];
            }
          }

          if (!fileId) {
            throw new Error("Google DriveのURLからファイルIDを抽出出来ませんでした。");
          }

          const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

          const options = {
            headers: {
              Authorization: "Bearer " + ScriptApp.getOAuthToken(),
            },
            muteHttpExceptions: true // エラーを自分でハンドリングするため
          };

          //元の「url」から変更
          const response = UrlFetchApp.fetch(downloadUrl, options);

          const responseCode = response.getResponseCode();
          if (responseCode === 200) {
            videoBlob = response.getBlob();
          } else {
            // 失敗した場合、より詳細なエラーを投げる
            throw new Error(`Failed to fetch Google Drive video. Response code: ${responseCode}. Response: ${response.getContentText()}`);
          }
        } else {
          // Google Drive以外のURLはこれまで通り
          videoBlob = UrlFetchApp.fetch(url).getBlob();
        }
        
        const mediaId = uploadVideoToX(videoBlob, apiSettings);
        mediaIds.push(mediaId);
      } catch (e) {
        throw new Error(`Failed to upload video from ${urls[0]}. Error: ${e.message}`);
      }
      Logger.log(`Finished uploading video. Media ID: ${mediaIds[0]}`);
    }
  }
  // M列が空でN列（画像）にURLがある場合
  else if (imageUrls) {
    const urls = processImageUrls(imageUrls).slice(0, 4); // Max 4 images
    if (urls.length > 0) {
      Logger.log(`Uploading ${urls.length} images to X.`);
      for (const url of urls) {
        try {
          Logger.log(`Fetching image from URL: ${url}`);
          const imageBlob = UrlFetchApp.fetch(url).getBlob();
          const mediaId = uploadMediaToX(imageBlob, apiSettings);
          mediaIds.push(mediaId);
        } catch (e) {
          throw new Error(`Failed to upload image from ${url}. Error: ${e.message}`);
        }
      }
      Logger.log(`Finished uploading images. Media IDs: ${mediaIds.join(',')}`);
    }
  }

  const endpoint = "https://api.twitter.com/2/tweets";
  const data = { text: text };

  if (mediaIds.length > 0) {
    data.media = { media_ids: mediaIds };
  }
  
  if (in_reply_to_tweet_id) {
    data.reply = { in_reply_to_tweet_id: in_reply_to_tweet_id };
  }

  if (mediaIds.length === 0 && (!text || text.trim() === "")) {
    throw new Error("ツイートのテキストが空または未定義です");
  }

  const oauthHeader = generateOAuthHeader(endpoint, "POST", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret);
  const options = {
    method: "POST",
    headers: {
      ...X_FETCH_HEADERS, // 追加
      "Authorization": oauthHeader,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(endpoint, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode >= 200 && responseCode < 300) {
    Logger.log("X post successful: " + responseText);
    return JSON.parse(responseText);
  } else {
    throw new Error(`X API エラー (${responseCode}): ${responseText}`);
  }
}


/**
 * Uploads a single media file to Twitter and returns the media_id.
 * @param {Blob} mediaBlob The media file as a blob.
 * @param {object} apiSettings X API settings.
 * @return {string} The media_id_string.
 */
function uploadMediaToX(mediaBlob, apiSettings) {
  const UPLOAD_ENDPOINT = "https://upload.twitter.com/1.1/media/upload.json";

  // Declare variables once
  let oauthHeader, options, response, responseCode, responseText;

  // 1. INIT
  Logger.log("X Media Upload: INIT");
  const initParams = {
    command: "INIT",
    total_bytes: mediaBlob.getBytes().length,
    media_type: mediaBlob.getContentType(),
    media_category: "tweet_image"
  };
  
  oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "POST", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret, initParams);
  options = {
    method: "POST",

    // 【修正後】メディアアップロード専用の最小限ヘッダー
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Authorization": oauthHeader 
    },  
      muteHttpExceptions: true
  };

  response = UrlFetchApp.fetch(UPLOAD_ENDPOINT + "?" + Object.keys(initParams).map(k => `${k}=${encodeURIComponent(initParams[k])}`).join('&'), options);
  responseCode = response.getResponseCode();
  responseText = response.getContentText();

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`X Media INIT Error (${responseCode}): ${responseText}`);
  }
  const mediaId = JSON.parse(responseText).media_id_string;
  Logger.log("X Media INIT successful. Media ID: " + mediaId);

  // 2. APPEND
  Logger.log("X Media Upload: APPEND");
  const appendParams = {
    command: "APPEND",
    media_id: mediaId,
    segment_index: 0
  };
  
  // For multipart posts, body parameters are not included in the OAuth signature.
  oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "POST", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret);
  
  const boundary = "----" + Utilities.getUuid();
  let data = "";
  for (const key in appendParams) {
      data += "--" + boundary + "\r\n";
      data += "Content-Disposition: form-data; name=\"" + key + "\"\r\n\r\n";
      data += appendParams[key] + "\r\n";
  }
  data += "--" + boundary + "\r\n";
  data += "Content-Disposition: form-data; name=\"media\"; filename=\"blob\"\r\n";
  data += "Content-Type: " + mediaBlob.getContentType() + "\r\n\r\n";

  const payloadBytes = Utilities.newBlob(data).getBytes()
      .concat(mediaBlob.getBytes())
      .concat(Utilities.newBlob("\r\n--" + boundary + "--\r\n").getBytes());

  options = {
      method: "POST",
      contentType: "multipart/form-data; boundary=" + boundary,
      payload: payloadBytes,
      // 【修正後】メディアアップロード専用の最小限ヘッダー
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Authorization": oauthHeader 
      },
    muteHttpExceptions: true
  };

  response = UrlFetchApp.fetch(UPLOAD_ENDPOINT, options);
  responseCode = response.getResponseCode();
  responseText = response.getContentText();

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`X Media APPEND Error (${responseCode}): ${responseText}`);
  }
  Logger.log("X Media APPEND successful for Media ID: " + mediaId);

  // 3. FINALIZE
  Logger.log("X Media Upload: FINALIZE");
  const finalizeParams = {
    command: "FINALIZE",
    media_id: mediaId
  };
  oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "POST", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret, finalizeParams);
  options = {
    method: "POST",
    // 【修正後】メディアアップロード専用の最小限ヘッダー
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Authorization": oauthHeader 
    },
    muteHttpExceptions: true
  };

  response = UrlFetchApp.fetch(UPLOAD_ENDPOINT + "?" + Object.keys(finalizeParams).map(k => `${k}=${encodeURIComponent(finalizeParams[k])}`).join('&'), options);
  responseCode = response.getResponseCode();
  responseText = response.getContentText();
  
  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`X Media FINALIZE Error (${responseCode}): ${responseText}`);
  }
  Logger.log("X Media FINALIZE response: " + responseText);
  const finalizeData = JSON.parse(responseText);

  // 4. STATUS (if needed)
  if (finalizeData.processing_info) {
    Logger.log("Media requires processing. Polling STATUS...");
    const statusParams = {
      command: "STATUS",
      media_id: mediaId
    };
    
    let processingState = finalizeData.processing_info.state;
    let processingData = finalizeData;

    while (processingState === "pending" || processingState === "in_progress") {
      const checkAfterSecs = processingData.processing_info.check_after_secs || 5;
      Utilities.sleep(checkAfterSecs * 1000);

      oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "GET", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret, statusParams);
      options = {
        method: "GET",
        // 【修正後】メディアアップロード専用の最小限ヘッダー
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Authorization": oauthHeader 
        },
        muteHttpExceptions: true
      };

      response = UrlFetchApp.fetch(UPLOAD_ENDPOINT + "?" + Object.keys(statusParams).map(k => `${k}=${encodeURIComponent(statusParams[k])}`).join('&'), options);
      responseText = response.getContentText();
      processingData = JSON.parse(responseText);
      
      if (processingData.processing_info) {
        processingState = processingData.processing_info.state;
        Logger.log("Current processing state: " + processingState);

        if (processingState === "failed") {
          throw new Error("X Media processing failed: " + processingData.processing_info.error.message);
        }
      } else {
        // If processing_info is suddenly gone, assume it's done.
        processingState = "succeeded";
        Logger.log("Processing info not found in STATUS response, assuming success.");
      }
    }
  }

  Logger.log("Media upload and processing finished for Media ID: " + mediaId);
  return mediaId;
}

/**
 * Uploads a single video file to Twitter using chunked upload and returns the media_id.
 * @param {Blob} mediaBlob The video file as a blob.
 * @param {object} apiSettings X API settings.
 * @return {string} The media_id_string.
 */
function uploadVideoToX(mediaBlob, apiSettings) {
  Logger.log("--- uploadVideoToX function started ---");
  const UPLOAD_ENDPOINT = "https://upload.twitter.com/1.1/media/upload.json";
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

  let oauthHeader, options, response, responseCode, responseText;

  // 1. INIT
  Logger.log("X Video Upload: INIT");
  const totalBytes = mediaBlob.getBytes().length;
  const mediaType = mediaBlob.getContentType();
  Logger.log("Detected Media Type: " + mediaType);
  
  const initParams = {
    command: "INIT",
    total_bytes: totalBytes,
    media_type: mediaType,
    media_category: "tweet_video" 
  };
  
  oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "POST", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret, initParams);
  options = {
    method: "POST",
    // 【修正後】メディアアップロード専用の最小限ヘッダー
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Authorization": oauthHeader 
    },
    muteHttpExceptions: true
  };

  response = UrlFetchApp.fetch(UPLOAD_ENDPOINT + "?" + Object.keys(initParams).map(k => `${k}=${encodeURIComponent(initParams[k])}`).join('&'), options);
  responseCode = response.getResponseCode();
  responseText = response.getContentText();

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`X Video INIT Error (${responseCode}): ${responseText}`);
  }
  const mediaId = JSON.parse(responseText).media_id_string;
  Logger.log("X Video INIT successful. Media ID: " + mediaId);

  // 2. APPEND
  const mediaBytes = mediaBlob.getBytes();
  let segmentIndex = 0;
  for (let i = 0; i < totalBytes; i += CHUNK_SIZE) {
    const chunk = mediaBytes.slice(i, i + CHUNK_SIZE);
    Logger.log(`X Video Upload: APPEND segment ${segmentIndex}`);
    
    const appendParams = {
      command: "APPEND",
      media_id: mediaId,
      segment_index: segmentIndex
    };
    
    oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "POST", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret);
    
    const boundary = "----" + Utilities.getUuid();
    let data = "";
    for (const key in appendParams) {
        data += "--" + boundary + "\r\n";
        data += "Content-Disposition: form-data; name=\"" + key + "\"\r\n\r\n";
        data += appendParams[key] + "\r\n";
    }
    data += "--" + boundary + "\r\n";
    data += "Content-Disposition: form-data; name=\"media\"; filename=\"blob\"\r\n";
    data += "Content-Type: application/octet-stream\r\n\r\n"; // Use octet-stream for chunks

    const payloadBytes = Utilities.newBlob(data).getBytes()
        .concat(chunk)
        .concat(Utilities.newBlob("\r\n--" + boundary + "--\r\n").getBytes());

    options = {
        method: "POST",
        contentType: "multipart/form-data; boundary=" + boundary,
        payload: payloadBytes,
        // 【修正後】メディアアップロード専用の最小限ヘッダー
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Authorization": oauthHeader 
        },
        muteHttpExceptions: true
    };

    response = UrlFetchApp.fetch(UPLOAD_ENDPOINT, options);
    responseCode = response.getResponseCode();
    responseText = response.getContentText();

    if (responseCode < 200 || responseCode >= 300) {
      throw new Error(`X Video APPEND Error for segment ${segmentIndex} (${responseCode}): ${responseText}`);
    }
    Logger.log(`X Video APPEND successful for segment ${segmentIndex}`);
    segmentIndex++;
  }

  // 3. FINALIZE
  Logger.log("X Video Upload: FINALIZE");
  const finalizeParams = {
    command: "FINALIZE",
    media_id: mediaId
  };
  oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "POST", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret, finalizeParams);
  options = {
    method: "POST",
    // 【修正後】メディアアップロード専用の最小限ヘッダー
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Authorization": oauthHeader 
    },
    muteHttpExceptions: true
  };

  response = UrlFetchApp.fetch(UPLOAD_ENDPOINT + "?" + Object.keys(finalizeParams).map(k => `${k}=${encodeURIComponent(finalizeParams[k])}`).join('&'), options);
  responseCode = response.getResponseCode();
  responseText = response.getContentText();
  
  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`X Video FINALIZE Error (${responseCode}): ${responseText}`);
  }
  Logger.log("X Video FINALIZE response: " + responseText);
  const finalizeData = JSON.parse(responseText);

  // 4. STATUS (if needed)
  if (finalizeData.processing_info) {
    Logger.log("Video requires processing. Polling STATUS...");
    const statusParams = {
      command: "STATUS",
      media_id: mediaId
    };
    
    let processingState = finalizeData.processing_info.state;
    let processingData = finalizeData;

    // Set a timeout for polling
    const startTime = new Date().getTime();
    const timeout = 120 * 1000; // 120 seconds

    while (processingState === "pending" || processingState === "in_progress") {
      if (new Date().getTime() - startTime > timeout) {
        throw new Error("X Video processing timed out after 120 seconds.");
      }

      const checkAfterSecs = processingData.processing_info.check_after_secs || 5;
      Logger.log(`Waiting for ${checkAfterSecs} seconds...`);
      Utilities.sleep(checkAfterSecs * 1000);

      oauthHeader = generateOAuthHeader(UPLOAD_ENDPOINT, "GET", apiSettings.apiKey, apiSettings.apiSecret, apiSettings.accessToken, apiSettings.accessTokenSecret, statusParams);
      options = {
        method: "GET",
        // 【修正後】メディアアップロード専用の最小限ヘッダー
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Authorization": oauthHeader 
        },
        muteHttpExceptions: true
      };

      response = UrlFetchApp.fetch(UPLOAD_ENDPOINT + "?" + Object.keys(statusParams).map(k => `${k}=${encodeURIComponent(statusParams[k])}`).join('&'), options);
      responseText = response.getContentText();
      processingData = JSON.parse(responseText);
      
      if (processingData.processing_info) {
        processingState = processingData.processing_info.state;
        Logger.log("Current processing state: " + processingState);

        if (processingState === "failed") {
          const error = processingData.processing_info.error;
          throw new Error(`X Video processing failed: ${error.name} (Code: ${error.code}) - ${error.message}`);
        }
      } else {
        // If processing_info is suddenly gone, assume it's done.
        processingState = "succeeded";
        Logger.log("Processing info not found in STATUS response, assuming success.");
      }
    }
  }

  Logger.log("Video upload and processing finished for Media ID: " + mediaId);
  return mediaId;
}

/**
 * URL文字列を処理し、Google DriveのURLを変換する
 * @param {string} urlString - 改行区切りのURL文字列
 * @return {string[]} URLの配列
 */
function processImageUrls(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return [];
  }
  return urlString.split('\n')
    .map(url => url.trim())
    .filter(url => url) // 空の行を削除
    .map(url => {
      const driveRegex = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/.*/;
      const match = url.match(driveRegex);
      if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
      }
      return url;
    });
}

/**
 * 動画URL文字列を処理する
 * @param {string} urlString - 改行区切りのURL文字列
 * @return {string[]} URLの配列
 */
function processVideoUrls(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return [];
  }
  return urlString.split('\n')
    .map(url => url.trim())
    .filter(url => url) // 空の行を削除
}


/**
 * Threadsに投稿する（テキスト、画像、動画、カルーセル対応）
 * @param {string} text - 投稿テキスト
 * @param {string} imageUrlsN - N列の画像URL文字列
 * @param {string} imageUrlsP - P列の画像URL文字列
 * @param {string} videoUrlsM - M列の動画URL文字列
 * @param {string} videoUrlsO - O列の動画URL文字列
 */
function postToThreads(text, imageUrlsN, imageUrlsP, videoUrlsM, videoUrlsO, reply_to_id = null) {
  Logger.log(`postToThreads 関数実行: text=${text}, imagesN=${imageUrlsN}, imagesP=${imageUrlsP}, videosM=${videoUrlsM}, videosO=${videoUrlsO}, reply_to_id=${reply_to_id}`);

  let processedImageUrlsN = [];
  let processedVideoUrlsM = [];

  // M列(共通動画)が入力されていれば、そちらを優先する
  if (videoUrlsM && videoUrlsM.trim() !== '') {
    processedVideoUrlsM = processVideoUrls(videoUrlsM).slice(0, 1); // M列は1つだけ
    Logger.log("M列に動画URLが入力されているため、N列の共通画像URLは無視されます。");
  } else {
    // M列が空の場合、N列の画像を使用
    processedImageUrlsN = processImageUrls(imageUrlsN).slice(0, 4); // N列は4つまで
  }

  const allImageUrls = processedImageUrlsN.concat(processImageUrls(imageUrlsP));
  const allVideoUrls = processedVideoUrlsM.concat(processVideoUrls(videoUrlsO));

  let mediaItems = [];
  // 動画を先に格納する
  allVideoUrls.forEach(url => {
    if (url.includes("drive.google.com")) {
      Logger.log(`Google Drive URLをスキップします (Threads動画投稿): ${url}`);
      return; // スキップして次のURLへ
    }
    mediaItems.push({ type: 'VIDEO', url: url });
  });
  allImageUrls.forEach(url => mediaItems.push({ type: 'IMAGE', url: url }));

  // カルーセルの上限は20アイテム
  if (mediaItems.length > 20) {
    Logger.log(`メディアアイテムが20を超えたため、最初の20件に絞ります。 Total: ${mediaItems.length}`);
    mediaItems = mediaItems.slice(0, 20);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const threadsApiSettings = getThreadsApiSettings(settingsSheet);

  if (!threadsApiSettings.userId || !threadsApiSettings.accessToken) {
    throw new Error("Threads APIの設定が不完全です。設定シートでユーザーIDとアクセストークンを確認してください。");
  }

  if (mediaItems.length === 0) {
    Logger.log("メディアURLがないため、テキスト投稿を実行します。");
    return postThreadsText(text, threadsApiSettings, reply_to_id);
  } else if (mediaItems.length === 1) {
    Logger.log(`単一メディア投稿（${mediaItems[0].type}）を実行します。`);
    return postThreadsSingleMedia(text, mediaItems[0], threadsApiSettings, reply_to_id);
  } else {
    const hasVideo = mediaItems.some(item => item.type === 'VIDEO');
    Logger.log(`カルーセル投稿（${mediaItems.length}件, 動画含む: ${hasVideo}）を実行します。`);
    return postThreadsCarousel(text, mediaItems, threadsApiSettings, reply_to_id);
  }
}

/**
 * 指定されたメディアコンテナのステータスをポーリングする
 * @param {string} containerId - メディアコンテナID
 * @param {object} apiSettings - API設定
 * @returns {boolean} - 準備完了時にtrueを返す
 */
function pollContainerStatus(containerId, apiSettings) {
  const { accessToken } = apiSettings;
  // 修正: 正しいフィールド名 'status' をリクエストする
  const endpoint = `https://graph.threads.net/v1.0/${containerId}?fields=status&access_token=${accessToken}`;
  const options = {
    method: "GET",
    header: {  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    },
    muteHttpExceptions: true
  };
  
  const maxRetries = 24; // 24 retries * 5 seconds = 120 seconds timeout
  const retryInterval = 5000; // 5 seconds

  Logger.log(`Polling status for container ${containerId}...`);
  for (let i = 0; i < maxRetries; i++) {
    Utilities.sleep(retryInterval);
    Logger.log(`...polling attempt ${i + 1}/${maxRetries}`);
    
    const response = UrlFetchApp.fetch(endpoint, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode >= 200 && responseCode < 300) {
      const data = JSON.parse(responseText);
      // 修正: 正しいフィールド 'status' をチェックする
      Logger.log(`...status is: ${data.status}`);
      if (data.status === 'FINISHED') {
        Logger.log(`Container ${containerId} is FINISHED.`);
        return true;
      }
      if (data.status === 'ERROR' || data.status === 'EXPIRED') {
        throw new Error(`Container ${containerId} failed with status: ${data.status}. Full response: ${responseText}`);
      }
    } else {
      // 認証エラー等でGETリクエスト自体が失敗した場合
      throw new Error(`Polling failed for container ${containerId}. API responded with code ${responseCode}: ${responseText}`);
    }
  }
  throw new Error(`Container ${containerId} did not become ready in 120 seconds.`);
}


/**
 * Threadsにテキストを投稿する
 */
function postThreadsText(text, apiSettings, reply_to_id = null) {
  if (!text || text.trim() === "") {
    throw new Error("投稿のテキストが空または未定義です");
  }
  
  const createPayload = {
    "media_type": "TEXT",
    "text": text
  };

  const containerId = createThreadsContainer(createPayload, apiSettings, reply_to_id);
  pollContainerStatus(containerId, apiSettings);
  return publishThreadsContainer(containerId, apiSettings);
}

/**
 * Threadsに単一メディア（画像または動画）を投稿する
 */
function postThreadsSingleMedia(text, mediaItem, apiSettings, reply_to_id = null) {
  const payload = {
    "text": text,
    "media_type": mediaItem.type
  };
  if (mediaItem.type === 'IMAGE') {
    payload.image_url = mediaItem.url;
  } else { // VIDEO
    payload.video_url = mediaItem.url;
  }

  const containerId = createThreadsContainer(payload, apiSettings, reply_to_id);
  pollContainerStatus(containerId, apiSettings);
  return publishThreadsContainer(containerId, apiSettings);
}

/**
 * Threadsにカルーセル（画像、動画、または混合）を投稿する
 */
function postThreadsCarousel(text, mediaItems, apiSettings, reply_to_id = null) {
  const itemContainerIds = [];

  for (const item of mediaItems) {
    Logger.log(`Creating child container for ${item.type}...`);
    const createItemPayload = {
      "is_carousel_item": true,
      "media_type": item.type
    };
    if (item.type === 'IMAGE') {
      createItemPayload.image_url = item.url;
    } else { // VIDEO
      createItemPayload.video_url = item.url;
    }
    
    // 子コンテナはリプライIDを持たない
    const itemContainerId = createThreadsContainer(createItemPayload, apiSettings);
    pollContainerStatus(itemContainerId, apiSettings);
    itemContainerIds.push(itemContainerId);
  }

  Logger.log("All child containers are ready. Creating parent carousel container...");
  const createCarouselPayload = {
    "media_type": "CAROUSEL",
    "children": itemContainerIds,
    "text": text
  };

  const carouselContainerId = createThreadsContainer(createCarouselPayload, apiSettings, reply_to_id);
  pollContainerStatus(carouselContainerId, apiSettings);
  return publishThreadsContainer(carouselContainerId, apiSettings);
}


/**
 * Threadsのメディアコンテナを作成する
 */
function createThreadsContainer(payload, apiSettings, reply_to_id = null) {
  const { userId, accessToken } = apiSettings;
  const endpoint = `https://graph.threads.net/v1.0/${userId}/threads`;
  
  if (reply_to_id) {
    payload.reply_to_id = reply_to_id;
  }

  const options = {
    method: "POST",
    headers: {
      ...THREADS_FETCH_HEADERS,
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log("--- Threads API: Creating Container ---");
  Logger.log("Endpoint: " + endpoint);
  Logger.log("Options: " + JSON.stringify(options, null, 2));

  const response = UrlFetchApp.fetch(endpoint, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  Logger.log(`Container creation response (${responseCode}): ${responseText}`);

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`Threads API エラー (Container Creation): ${responseText}`);
  }
  const result = JSON.parse(responseText);
  const containerId = result.id;
  if (!containerId) {
    throw new Error("Threads API エラー: メディアコンテナIDの取得に失敗しました。");
  }
  Logger.log(`メディアコンテナIDを取得しました: ${containerId}`);
  return containerId;
}

/**
 * Threadsのメディアコンテナを公開する
 */
function publishThreadsContainer(containerId, apiSettings, reply_to_id = null) {
  const { userId, accessToken } = apiSettings;
  const endpoint = `https://graph.threads.net/v1.0/${userId}/threads_publish`;
  const payload = {
    "creation_id": containerId
  };
  const options = {
    method: "POST",
    headers: {
      ...THREADS_FETCH_HEADERS,
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log("--- Threads API: Publishing Container ---");
  Logger.log("Endpoint: " + endpoint);
  Logger.log("Options: " + JSON.stringify(options, null, 2));

  const response = UrlFetchApp.fetch(endpoint, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  Logger.log(`Publishing response (${responseCode}): ${responseText}`);

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`Threads API エラー (Publishing): ${responseText}`);
  }
  Logger.log("Threadsへの投稿が成功しました。");
  return JSON.parse(responseText);
}


/**
 * OAuth1.0aのヘッダーを生成する
 */
function generateOAuthHeader(url, method, consumerKey, consumerSecret, accessToken, accessTokenSecret, extraParams = {}) {
  if (!method) {
    method = "POST";
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Utilities.getUuid().replace(/-/g, '');
  const parameters = {
    ...extraParams,
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0'
  };
  const keys = Object.keys(parameters).sort();
  const parameterString = keys.map(key => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`).join('&');
  const signatureBaseString = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(parameterString)].join('&');
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;
  const signature = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, signatureBaseString, signingKey);
  const signatureBase64 = Utilities.base64Encode(signature);
  return 'OAuth ' + [
    `oauth_consumer_key="${encodeURIComponent(consumerKey)}"`, 
    `oauth_nonce="${encodeURIComponent(nonce)}"`, 
    `oauth_signature="${encodeURIComponent(signatureBase64)}"`, 
    `oauth_signature_method="HMAC-SHA1"`, 
    `oauth_timestamp="${timestamp}"`, 
    `oauth_token="${encodeURIComponent(accessToken)}"`, 
    `oauth_version="1.0"`
  ].join(', ');
}

/**
 * 設定シートからX API設定を取得
 */
function getXApiSettings(settingsSheet) {
  const apiSettingsData = settingsSheet.getRange("G4:G7").getValues();
  return {
    apiKey: apiSettingsData[0][0],
    apiSecret: apiSettingsData[1][0],
    accessToken: apiSettingsData[2][0],
    accessTokenSecret: apiSettingsData[3][0]
  };
}

/**
 * 設定シートからThreads API設定を取得
 */
function getThreadsApiSettings(settingsSheet) {
  const threadsSettingsData = settingsSheet.getRange("G10:G11").getValues();
  return {
    userId: threadsSettingsData[0][0],
    accessToken: threadsSettingsData[1][0]
  };
}

/**
 * CSVインポートダイアログを表示
 */
function showImportDialog() {
  const html = HtmlService.createHtmlOutput(`
    <h2>CSVファイルをインポート</h2>
    <p>CSVは以下の列順で作成してください(右側の列は省略できます):</p>
    <p>投稿日, 投稿時間枠, 投稿内容, 投稿先_ｘ(0 or 1), 投稿先_threads(0 or 1), 予定投稿時間(HH:mm), ツリー(0 or 1), サイトID</p>
    <p style="font-size:12px;color:#555;">予定投稿時間が入っている行は、ランダム設定をせずにその時刻で投稿します。ツリーが1の行は、直前のメイン投稿への返信として取り込み、メイン投稿の後に投稿します。サイトIDが登録済みの行は、二重登録を防ぐため取り込みません。</p>
    <form>
      <input type="file" id="csvFile" accept=".csv">
      <input type="button" value="インポート" onclick="importCSV()">
    </form>
    <script>
      function importCSV() {
        const file = document.getElementById('csvFile').files[0];
        if (!file) {
          alert('ファイルを選択してください');
          return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
          google.script.run
            .withSuccessHandler(function(result) {
              if (result) {
                alert(result.message);
                google.script.run.setScheduledTimes();
              } 
              // 失敗時のアラートはサーバー側で表示されるので、ここでは閉じるだけ
              google.script.host.close();
            })
            .withFailureHandler(function(error) {
              alert('エラーが発生しました: ' + error.message);
            })
            .importCSVData(e.target.result);
        };
        reader.readAsText(file, 'UTF-8');
      }
    </script>
  `)
    .setWidth(600)
    .setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'CSVインポート');
}

/**
 * CSVデータをインポート
 */
function importCSVData(csvData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
    const defaultPostToX = settingsSheet.getRange("B18").getValue();
    const defaultPostToThreads = settingsSheet.getRange("C18").getValue();

    const postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
    if (!postsSheet) {
      throw new Error("シート '" + SHEET_NAME_POSTS + "' が見つかりません。");
    }

    // サイトID列(T列)まで列が無いシートは、列を足す
    if (postsSheet.getMaxColumns() < SITE_ID_COLUMN) {
      postsSheet.insertColumnsAfter(postsSheet.getMaxColumns(), SITE_ID_COLUMN - postsSheet.getMaxColumns());
    }

    const lastRow = postsSheet.getLastRow();
    let nextId = 1;
    const knownSiteIds = new Set(); // すでにシートにあるサイトID(二重登録の判定用)
    if (lastRow > 1) {
      const ids = postsSheet.getRange(2, 1, lastRow - 1, 1).getValues()
        .flat()
        .filter(id => typeof id === 'number' && !isNaN(id));
      if (ids.length > 0) {
        nextId = Math.max(...ids) + 1;
      }
      postsSheet.getRange(2, SITE_ID_COLUMN, lastRow - 1, 1).getValues().flat().forEach(function (value) {
        const key = String(value || '').trim();
        if (key) knownSiteIds.add(key);
      });
    }

    if (!csvData || typeof csvData !== 'string' || !csvData.trim()) {
      throw new Error('CSVデータが空か、無効です。');
    }

    const parsedData = Utilities.parseCsv(csvData);
    const newData = [];

    // ツリー投稿(返信)用: 直前のメイン投稿の情報と、その投稿ごとの返信の数
    let lastParent = null; // { id, timeFrame, time }
    let parentIsDuplicate = false; // 直前のメイン投稿が、登録済みのため飛ばされたか
    const childCounts = {};

    // 取り込まなかった行の記録(結果の表示用。行番号はCSVの行で、見出し行を1行目と数える)
    let duplicateCount = 0;
    let orphanCount = 0;
    let treeCount = 0;
    const invalidLines = [];

    for (let index = 0; index < parsedData.length; index++) {
      const row = parsedData[index];
      const lineNo = index + 1;
      try {
        if (!Array.isArray(row)) continue;
        // 空行と、見出し行は、飛ばした行として数えない
        if (row.every(function (cell) { return String(cell || '').trim() === ''; })) continue;
        if (index === 0 && String(row[0] || '').trim() === '投稿日') continue;

        // 7列目: ツリー(1なら、直前のメイン投稿への返信)。メイン投稿の行なら、それ以前の親の情報は引き継がない
        const isTree = row.length > 6 && String(row[6] || '').trim() === '1';
        if (!isTree) {
          lastParent = null;
          parentIsDuplicate = false;
        }

        if (row.length < 3) {
          invalidLines.push(lineNo);
          continue;
        }

        const postDate = String(row[0] || '').trim();
        if (!postDate || isNaN(new Date(postDate).getTime())) {
          invalidLines.push(lineNo);
          continue;
        }

        // 8列目: サイトID。シートに登録済みなら取り込まない(同じCSVを2回読み込んでも二重にならない)
        const siteId = row.length > 7 ? String(row[7] || '').trim() : '';
        if (isTree && parentIsDuplicate) {
          // 親のメイン投稿が登録済みで飛ばされたので、その返信も飛ばす
          duplicateCount++;
          continue;
        }
        if (siteId && knownSiteIds.has(siteId)) {
          duplicateCount++;
          if (!isTree) parentIsDuplicate = true;
          continue;
        }
        if (isTree && !lastParent) {
          // 直前にメイン投稿が無い返信は、親が分からないため取り込まない
          orphanCount++;
          continue;
        }

        // 6列目: 予定投稿時間(HH:mm)。入っていれば、ランダム設定はせずにこの時刻で投稿する
        let time = normalizeCsvTime_(row.length > 5 ? row[5] : '');
        // 返信の時刻が空のときは、メイン投稿の数分後にする(メイン投稿に時刻がある場合)
        if (isTree && !time && lastParent && lastParent.time) {
          time = addMinutesToTime_(lastParent.time, DEFAULT_REPLY_DELAY_MINUTES);
        }

        let timeFrame = parseInt(String(row[1] || '').trim(), 10);
        if (time) {
          // 時刻が決まっている行は、時間枠が空・4以上でも受け付ける(サイト側の時間枠は5つまで設定できる)
          if (isNaN(timeFrame) && isTree && lastParent) timeFrame = lastParent.timeFrame;
          if (isNaN(timeFrame)) timeFrame = '';
        } else if (isNaN(timeFrame) || timeFrame < 1 || timeFrame > 3) {
          invalidLines.push(lineNo);
          continue;
        }

        let content = String(row[2] || '').replace(/\\n/g, '\n').trim();

        const postToX = (row.length > 3 && String(row[3] || '').trim() !== '') ? parseInt(String(row[3]).trim(), 10) : defaultPostToX;
        const postToThreads = (row.length > 4 && String(row[4] || '').trim() !== '') ? parseInt(String(row[4]).trim(), 10) : defaultPostToThreads;

        let postId;
        let treeId = '';
        if (isTree) {
          treeId = lastParent.id;
          childCounts[treeId] = (childCounts[treeId] || 0) + 1;
          postId = treeId + '_' + childCounts[treeId]; // onEditの採番と同じ「親ID_連番」
          treeCount++;
        } else {
          postId = nextId++;
          lastParent = { id: postId, timeFrame: timeFrame, time: time };
        }

        // 新しい列構造に合わせてデータを整形(T列まで。N〜S列は空欄)
        const record = [
          postId,     // A: 投稿ID(返信は「親ID_連番」)
          treeId,     // B: ツリーID(返信なら親の投稿ID)
          postDate,   // C: 投稿日
          timeFrame,  // D: 投稿時間枠
          time ? time + ':00' : '', // E: 予定投稿時間(空ならランダム設定の対象)
          content,    // F: 投稿内容
          STATUS_PENDING, // G: X_状態
          '',         // H: X_投稿時間
          STATUS_PENDING, // I: Thr_状態
          '',         // J: Thr_投稿時間
          '',         // K: 投稿タイプ
          postToX,    // L: to_X
          postToThreads // M: to_Thr
        ];
        while (record.length < SITE_ID_COLUMN - 1) record.push('');
        record.push(siteId); // T: サイトID
        newData.push(record);
        if (siteId) knownSiteIds.add(siteId);

      } catch (e) {
        invalidLines.push(lineNo);
        console.error("CSVインポート中にエラーが発生した行をスキップします。行データ: ", row.join(','), "エラー: ", e.message);
      }
    }

    if (newData.length === 0 && duplicateCount === 0) {
      throw new Error('有効なデータがCSVファイルに見つかりませんでした。ファイルの内容や形式を確認してください。');
    }

    if (newData.length > 0) {
      postsSheet.getRange(lastRow + 1, 1, newData.length, SITE_ID_COLUMN).setValues(newData);
    }

    // 結果の表示(取り込まなかった行があれば、理由と行数を伝える)
    const lines = [];
    lines.push(newData.length > 0
      ? 'CSVのインポートが完了しました。' + newData.length + '件を取り込みました' + (treeCount > 0 ? '(うちツリー投稿 ' + treeCount + '件)' : '') + '。'
      : '新しく取り込む投稿はありませんでした。');
    if (duplicateCount > 0) {
      lines.push('登録済みのため、' + duplicateCount + '件を飛ばしました。');
    }
    if (orphanCount > 0) {
      lines.push('親のメイン投稿が無いため、' + orphanCount + '件のツリー投稿を取り込めませんでした(メイン投稿と同じCSVの、直後の行に置いてください)。');
    }
    if (invalidLines.length > 0) {
      const shown = invalidLines.slice(0, 10).join(', ') + (invalidLines.length > 10 ? ' ほか' : '');
      lines.push('形式が正しくないため、' + invalidLines.length + '件を飛ばしました(CSVの行: ' + shown + ')。');
    }
    const message = lines.join('\n');
    logAction(message.replace(/\n/g, ' '));
    return { imported: newData.length, message: message };

  } catch (error) {
    console.error('CSVインポートエラー:', error.toString());
    SpreadsheetApp.getUi().alert('インポートできませんでした。エラー詳細: ' + error.message);
    return false;
  }
}


/**
 * ダイアログからの入力に基づいて投稿テンプレートを作成
 * @param {string} startDateStr - 開始日 (yyyy-MM-dd)
 * @param {string} endDateStr - 終了日 (yyyy-MM-dd)
 * @param {number[]} timeFrameCounts - 各時間枠の投稿数 [time1, time2, time3]
 */
function createCustomTemplate(startDateStr, endDateStr, timeFrameCounts) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
    const defaultPostToX = settingsSheet.getRange("B18").getValue();
    const defaultPostToThreads = settingsSheet.getRange("C18").getValue();

    const postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
    const lastRow = postsSheet.getLastRow();
    let nextId = 1;
    if (lastRow > 1) {
      const ids = postsSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      const maxId = Math.max(...ids.filter(id => typeof id === 'number' && !isNaN(id)));
      nextId = isFinite(maxId) ? maxId + 1 : 1;
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    // 終了日の23:59:59までを範囲に含める
    endDate.setHours(23, 59, 59, 999);

    if (startDate > endDate) {
      throw new Error("終了日は開始日より後の日付を選択してください。");
    }

    const newData = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      timeFrameCounts.forEach((count, index) => {
        const timeFrame = index + 1;
        for (let i = 0; i < count; i++) {
          // 新しい列構造に合わせてデータを整形
          newData.push([
            nextId++, // A: 投稿ID
            '', // B: ツリーID
            Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "yyyy-MM-dd"), // C: 投稿日
            timeFrame, // D: 投稿時間枠
            '', // E: 予定投稿時間
            `${Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "MM/dd")} の投稿 (時間枠${timeFrame})`, // F: 投稿内容
            STATUS_PENDING, // G: X_状態
            '', // H: X_投稿時間
            STATUS_PENDING, // I: Thr_状態
            '', // J: Thr_投稿時間
            '', // K: 投稿タイプ
            defaultPostToX, // L: to_X
            defaultPostToThreads  // M: to_Thr
          ]);
        }
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (newData.length > 0) {
      postsSheet.getRange(lastRow + 1, 1, newData.length, newData[0].length).setValues(newData);
      const message = `${newData.length}件の投稿テンプレートを作成しました。`;
      logAction(message);
      return message;
    } else {
      return "作成するテンプレートがありませんでした。";
    }
  } catch (e) {
    logAction(`テンプレート作成エラー: ${e.message}`);
    throw new Error(`作成に失敗しました: ${e.message}`);
  }
}



/**
 * ランダム投稿の設定ダイアログを表示
 */
function showRandomPostSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  let timeFrameCounts = [1, 1, 1];
  try {
    const currentSetting = settingsSheet.getRange("B11:D11").getValues()[0];
    if (currentSetting) {
      timeFrameCounts = currentSetting.map(num => (num && !isNaN(num)) ? parseInt(num) : 1);
    }
  } catch (e) {
    console.log("設定の取得に失敗しました: " + e);
  }
  const triggerTime = settingsSheet.getRange("B14").getDisplayValue();
  const html = HtmlService.createHtmlOutput(`
    <h2>ランダム投稿設定</h2>
    <p>各時間帯ごとの1日あたりの投稿数を設定してください</p>
    <form id="settingsForm">
      <div style="margin-bottom: 15px;"><label for="timeFrame1">時間帯1の投稿数: </label><input type="number" id="timeFrame1" value="${timeFrameCounts[0]}" min="0" max="20" style="width: 60px;"></div>
      <div style="margin-bottom: 15px;"><label for="timeFrame2">時間帯2の投稿数: </label><input type="number" id="timeFrame2" value="${timeFrameCounts[1]}" min="0" max="20" style="width: 60px;"></div>
      <div style="margin-bottom: 15px;"><label for="timeFrame3">時間帯3の投稿数: </label><input type="number" id="timeFrame3" value="${timeFrameCounts[2]}" min="0" max="20" style="width: 60px;"></div>
      <hr>
      <div style="margin-bottom: 15px;"><label for="triggerTime">ランダム投稿トリガー時刻: </label><input type="time" id="triggerTime" value="${triggerTime}"></div>
      <input type="button" value="保存" onclick="saveSettings()">
    </form>
    <script>
      function saveSettings() {
        const timeFrame1 = parseInt(document.getElementById('timeFrame1').value) || 0;
        const timeFrame2 = parseInt(document.getElementById('timeFrame2').value) || 0;
        const timeFrame3 = parseInt(document.getElementById('timeFrame3').value) || 0;
        const triggerTime = document.getElementById('triggerTime').value;
        google.script.run
          .withSuccessHandler(() => { alert('設定を保存しました'); google.script.host.close(); })
          .withFailureHandler((error) => alert('エラーが発生しました: ' + error))
          .saveRandomPostSettings(timeFrame1, timeFrame2, timeFrame3, triggerTime);
      }
    </script>
  `).setWidth(400).setHeight(350);
  SpreadsheetApp.getUi().showModalDialog(html, 'ランダム投稿設定');
}

/**
 * ランダム投稿の設定を保存
 */
function saveRandomPostSettings(timeFrame1, timeFrame2, timeFrame3, triggerTime) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  if (!settingsSheet.getRange("B10").getValue()) {
    settingsSheet.getRange("B10:D10").setValues([["時間帯1投稿数", "時間帯2投稿数", "時間帯3投稿数"]]).setFontWeight("bold");
  }
  settingsSheet.getRange("B11:D11").setValues([[timeFrame1, timeFrame2, timeFrame3]]);
  settingsSheet.getRange("B14").setValue(triggerTime);
  scheduleRandomPostsForToday();
  logAction(`ランダム投稿設定を更新しました [時間帯1: ${timeFrame1}, 時間帯2: ${timeFrame2}, 時間帯3: ${timeFrame3}, トリガー時刻: ${triggerTime}]`);
}

/**
 * ランダム投稿シートのセットアップ
 */
function setupRandomPostsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let randomPostsSheet = ss.getSheetByName(SHEET_NAME_RANDOM_POSTS);

  // ヘッダー情報を関数スコープの先頭で定義
  const expectedRandomHeaders = [["投稿ID", "投稿内容", "X(共通)動画", "X(共通)画像", "Threads(専用)動画", "Threads(専用)画像", "最終投稿日", "循環カウンター"]];

  if (!randomPostsSheet) {
    randomPostsSheet = ss.insertSheet(SHEET_NAME_RANDOM_POSTS);
    
    // Adjust the position of the usage instructions
    const usageColumn = "J";
    randomPostsSheet.getRange(`${usageColumn}2`).setValue("使い方").setFontWeight("bold");
    randomPostsSheet.getRange(`${usageColumn}3:${usageColumn}8`).setValues([
      ["1. 投稿したいコンテンツを「投稿内容」列に入力"],
      ["2. メディアを投稿する場合は、対応するURLを各列に入力"],
      ["3. 「設定」シートから、「1日あたりのランダム投稿数設定」を設定"],
      ["4. 「設定」シートから、「ランダム投稿トリガー時刻」を設定"],
      ["5. 毎日設定した時刻に投稿内容がランダムに選ばれ、「投稿管理」シートに反映されます"],
      ["6. 自動的に投稿内容がランダムな順序で毎日投稿されます"]
    ]);

    // Adjust column widths
    randomPostsSheet.setColumnWidth(1, 60);   // A: 投稿ID
    randomPostsSheet.setColumnWidth(2, 400);  // B: 投稿内容
    randomPostsSheet.setColumnWidth(3, 150);  // C: X(共通)動画
    randomPostsSheet.setColumnWidth(4, 150);  // D: X(共通)画像
    randomPostsSheet.setColumnWidth(5, 150);  // E: Threads(専用)動画
    randomPostsSheet.setColumnWidth(6, 150);  // F: Threads(専用)画像
    randomPostsSheet.setColumnWidth(7, 100);  // G: 最終投稿日
    randomPostsSheet.setColumnWidth(8, 100);  // H: 循環カウンター
    randomPostsSheet.setColumnWidth(9, 20);   // I: Spacer
    randomPostsSheet.setColumnWidth(10, 600); // J: 使い方
  }

  // --- デザイン設定 ---
  // setupSpreadsheet関数から配色定義をコピー
  const colors = {
    background: '#FAF8F1',
    headerBackground: '#E8E0D1',
    titleText: '#795548',
    bodyText: '#5D4037',
    accent: '#A1887F',
    statusPosted: '#D7E9B9',
    statusError: '#FFC4C4',
    border: '#D7CCC8',
    colorGroupGM: '#FFFAF0',
    colorGroupNQ: '#F5FFFA'
  };

  // シート全体に基本スタイルを適用
  randomPostsSheet.getRange(1, 1, randomPostsSheet.getMaxRows(), randomPostsSheet.getMaxColumns())
    .setBackground(colors.background)
    .setFontColor(colors.bodyText)
    .setVerticalAlignment('middle');

  // メディア関連の列(C-F)の背景色を投稿管理シートに合わせて設定
  randomPostsSheet.getRange(1, 3, randomPostsSheet.getMaxRows(), 4)
    .setBackground(colors.colorGroupNQ);
    
  // ヘッダーを更新してスタイルを適用
  randomPostsSheet.getRange(1, 1, 1, expectedRandomHeaders[0].length)
    .setValues(expectedRandomHeaders)
    .setFontWeight("bold")
    .setBackground(colors.headerBackground) // ヘッダー全体のデフォルト背景色
    .setFontColor(colors.titleText)
    .setFontSize(11)
    .setHorizontalAlignment('center');

  // 行の固定と列の固定
  randomPostsSheet.setFrozenRows(1);
  randomPostsSheet.setFrozenColumns(1);
  
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  if (settingsSheet && !settingsSheet.getRange("B10").getValue()) {
    settingsSheet.getRange("B10:D10").setValues([["時間帯1投稿数", "時間帯2投稿数", "時間帯3投稿数"]]).setFontWeight("bold");
    settingsSheet.getRange("B11:D11").setValues([[1, 1, 1]]);
  }
}

/**
 * 今日のランダム投稿スケジュールを作成
 */
function scheduleRandomPostsForToday() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const defaultPostToX = settingsSheet.getRange("B18").getValue();
  const defaultPostToThreads = settingsSheet.getRange("C18").getValue();

  // L2セルから設定時刻を取得し、現在の時刻と比較
  const now = new Date();
  const currentTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm");
  const targetTime = settingsSheet.getRange("B14").getDisplayValue();

  // 時刻が一致しない場合は処理を終了
  if (currentTime !== targetTime) {
    return;
  }
  
  // ログを追加して、実行されたことを確認
  logAction(`ランダム投稿のスケジュール作成を開始します (トリガー時刻: ${targetTime})`);

  const randomPostsSheet = ss.getSheetByName(SHEET_NAME_RANDOM_POSTS);
  const postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
  if (!randomPostsSheet) {
    setupRandomPostsSheet();
    return;
  }
  randomPostsSheet.getRange("C2:C").setNumberFormat("yyyy-MM-dd");
  randomPostsSheet.getRange("D2:D").setNumberFormat("0");
  const timeSlot1Posts = parseInt(settingsSheet.getRange("B11").getValue()) || 0;
  const timeSlot2Posts = parseInt(settingsSheet.getRange("C11").getValue()) || 0;
  const timeSlot3Posts = parseInt(settingsSheet.getRange("D11").getValue()) || 0;
  const totalDailyPosts = timeSlot1Posts + timeSlot2Posts + timeSlot3Posts;
  if (totalDailyPosts === 0) return;
  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const postsData = postsSheet.getDataRange().getValues();
  let existingRandomPosts = 0;
  for (let i = 1; i < postsData.length; i++) {
    const row = postsData[i];
    const postDate = row[2];
    const postType = row[9];
    let dateStr = "";
    if (postDate instanceof Date) {
      dateStr = Utilities.formatDate(postDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (typeof postDate === 'string') {
      dateStr = postDate;
    }
    if (dateStr === todayStr && postType === "ランダム") {
      existingRandomPosts++;
    }
  }
  if (existingRandomPosts > 0) {
    return;
  }
  const randomPostsData = randomPostsSheet.getDataRange().getValues();
  if (randomPostsData.length <= 1) return;
  const posts = [];
  // Read data from random posts sheet, including new media columns
  for (let i = 1; i < randomPostsData.length; i++) {
    const row = randomPostsData[i];
    // Check if Post ID (row[0]) and Content (row[1]) are present
    if (row[0] && row[1]) {
      posts.push({
        rowIndex: i,
        postId: row[0],
        content: row[1],
        xVideo: row[2] || '',      // C: X(共通)動画
        xImage: row[3] || '',      // D: X(共通)画像
        threadsVideo: row[4] || '', // E: Threads(専用)動画
        threadsImage: row[5] || '', // F: Threads(専用)画像
        lastPosted: row[6],        // G: 最終投稿日
        cycleCounter: parseInt(row[7]) || 0 // H: 循環カウンター
      });
    }
  }
  if (posts.length === 0) return;
  const totalNeeded = Math.min(totalDailyPosts, posts.length);
  const selectedPosts = selectPostsWithCycleCounter(posts, totalNeeded);
  shuffleArray(selectedPosts);
  const timeSlotPosts = {
    1: selectedPosts.slice(0, timeSlot1Posts),
    2: selectedPosts.slice(timeSlot1Posts, timeSlot1Posts + timeSlot2Posts),
    3: selectedPosts.slice(timeSlot1Posts + timeSlot2Posts, totalNeeded)
  };
  // Update the 'lastPosted' and 'cycleCounter' columns
  for (const post of selectedPosts) {
    randomPostsSheet.getRange(post.rowIndex + 1, 7).setValue(todayStr); // G: 最終投稿日
    randomPostsSheet.getRange(post.rowIndex + 1, 8).setValue(post.cycleCounter + 1); // H: 循環カウンター
  }
  if (selectedPosts.length > 0) {
    let maxExistingId = 0;
    for (let i = 1; i < postsData.length; i++) {
      const existingId = parseInt(postsData[i][0]) || 0;
      if (existingId > maxExistingId) maxExistingId = existingId;
    }
    const startRow = postsSheet.getLastRow() + 1;
    const timeRanges = getTimeRanges(settingsSheet);
    const newData = [];
    let nextId = maxExistingId + 1;
    for (let t = 1; t <= 3; t++) {
      const postsOfTimeSlot = timeSlotPosts[t] || [];
      if (postsOfTimeSlot.length === 0) continue;
      const timeRange = timeRanges[t - 1];
      if (!timeRange) continue;
      for (const p of postsOfTimeSlot) {
        const randTime = getRandomTime(timeRange.start, timeRange.end);
        // Add new row with all 17 columns (A to Q)
        newData.push([
          nextId++,           // A: 投稿ID
          '',                 // B: ツリーID
          todayStr,           // C: 投稿日
          t,                  // D: 投稿時間枠
          randTime,           // E: 予定投稿時間
          p.content,          // F: 投稿内容
          STATUS_PENDING,     // G: X_状態
          '',                 // H: X_投稿時間
          STATUS_PENDING,     // I: Thr_状態
          '',                 // J: Thr_投稿時間
          'ランダム',         // K: 投稿タイプ
          defaultPostToX,     // L: to_X
          defaultPostToThreads, // M: to_Thr
          p.xVideo,           // N: X(共通)動画
          p.xImage,           // O: X(共通)画像
          p.threadsVideo,     // P: Threads(専用)動画
          p.threadsImage      // Q: Threads(専用)画像
        ]);
      }
    }
    if (newData.length > 0) {
      // Set values for 17 columns
      postsSheet.getRange(startRow, 1, newData.length, 17).setValues(newData);
      logAction(`ランダム投稿を${newData.length}件スケジュールしました。`);
    }
  }
}

/**
 * 循環カウンターを考慮した投稿選択
 */
function selectPostsWithCycleCounter(posts, count) {
  if (posts.length === 0 || count === 0) return [];
  const counterGroups = {};
  posts.forEach(post => {
    const counter = post.cycleCounter;
    if (!counterGroups[counter]) counterGroups[counter] = [];
    counterGroups[counter].push(post);
  });
  const sortedCounters = Object.keys(counterGroups).map(Number).sort((a, b) => a - b);
  const selectedPosts = [];
  let remaining = count;
  for (const counter of sortedCounters) {
    if (remaining <= 0) break;
    const groupPosts = counterGroups[counter];
    const toSelect = Math.min(remaining, groupPosts.length);
    const randomSelected = getRandomSample(groupPosts, toSelect);
    selectedPosts.push(...randomSelected);
    remaining -= toSelect;
  }
  return selectedPosts;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getRandomSample(array, count) {
  if (array.length === 0 || count === 0) return [];
  const copy = [...array];
  const result = [];
  const actualCount = Math.min(count, copy.length);
  for (let i = 0; i < actualCount; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

/**
 * API設定ダイアログを表示
 */
function showApiSettingsDialog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const xApiSettings = getXApiSettings(settingsSheet);
  const threadsApiSettings = getThreadsApiSettings(settingsSheet);
  const html = HtmlService.createHtmlOutput(`
    <h2>API設定</h2>
    <hr>
    <h3>X API 設定</h3>
    <form>
      <div style="margin-bottom: 10px;"><label for="apiKey">API Key:</label><br><input type="text" id="apiKey" style="width: 100%;" value="${xApiSettings.apiKey || ''}"></div>
      <div style="margin-bottom: 10px;"><label for="apiSecret">API Secret:</label><br><input type="password" id="apiSecret" style="width: 100%;" value="${xApiSettings.apiSecret || ''}"></div>
      <div style="margin-bottom: 10px;"><label for="accessToken">Access Token:</label><br><input type="text" id="accessToken" style="width: 100%;" value="${xApiSettings.accessToken || ''}"></div>
      <div style="margin-bottom: 10px;"><label for="accessTokenSecret">Access Token Secret:</label><br><input type="password" id="accessTokenSecret" style="width: 100%;" value="${xApiSettings.accessTokenSecret || ''}"></div>
    </form>
    <hr>
    <h3>Threads API 設定</h3>
    <form>
        <div style="margin-bottom: 10px;"><label for="threadsUserId">Threads User ID:</label><br><input type="text" id="threadsUserId" style="width: 100%;" value="${threadsApiSettings.userId || ''}"></div>
        <div style="margin-bottom: 10px;"><label for="threadsAccessToken">Access Token:</label><br><input type="password" id="threadsAccessToken" style="width: 100%;" value="${threadsApiSettings.accessToken || ''}"></div>
    </form>
    <br>
    <input type="button" value="保存" onclick="saveApiSettings()">
    <script>
      function saveApiSettings() {
        const apiKey = document.getElementById('apiKey').value;
        const apiSecret = document.getElementById('apiSecret').value;
        const accessToken = document.getElementById('accessToken').value;
        const accessTokenSecret = document.getElementById('accessTokenSecret').value;
        const threadsUserId = document.getElementById('threadsUserId').value;
        const threadsAccessToken = document.getElementById('threadsAccessToken').value;
        google.script.run
          .withSuccessHandler(() => { alert('API設定を保存しました'); google.script.host.close(); })
          .withFailureHandler((error) => alert('エラーが発生しました: ' + error))
          .saveApiSettings(apiKey, apiSecret, accessToken, accessTokenSecret, threadsUserId, threadsAccessToken);
      }
    </script>
  `)
    .setWidth(400).setHeight(550);
  SpreadsheetApp.getUi().showModalDialog(html, 'API設定');
}

/**
 * API設定を保存
 */
function saveApiSettings(apiKey, apiSecret, accessToken, accessTokenSecret, threadsUserId, threadsAccessToken) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  settingsSheet.getRange("G4").setValue(apiKey);
  settingsSheet.getRange("G5").setValue(apiSecret);
  settingsSheet.getRange("G6").setValue(accessToken);
  settingsSheet.getRange("G7").setValue(accessTokenSecret);
  settingsSheet.getRange("G10").setValue(threadsUserId);
  settingsSheet.getRange("G11").setValue(threadsAccessToken);
  logAction("API設定が更新されました");
}

/**
 * システムの動作をログに記録
 */
function logAction(message) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(SHEET_NAME_LOG);
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  logSheet.appendRow([timestamp, message]);
}

/**
 * スプレッドシートの初期設定
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- デザイン設定 ---
  const colors = {
    background: '#FAF8F1', // ごく薄いベージュ
    headerBackground: '#E8E0D1', // やや濃いベージュ
    titleText: '#795548', // 焦茶色
    bodyText: '#5D4037', // やや薄い焦茶色
    accent: '#A1887F', // アクセントの茶色
    statusPosted: '#D7E9B9', // 投稿済み: 落ち着いた緑
    statusError: '#FFC4C4', // エラー: 落ち着いた赤
    border: '#D7CCC8', // 罫線の色
    colorGroupGM: '#FFFAF0', // G-M列の背景色
    colorGroupNQ: '#F5FFFA'  // N-Q列の背景色
  };

  // --- 投稿管理シート ---
  let postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
  const expectedHeaders = [["投稿ID", "ﾂﾘｰID", "投稿日", "投稿時間枠", "予定投稿時間", "投稿内容", "X_状態", "X_投稿時間", "Thr_状態", "Thr_投稿時間", "投稿タイプ", "to_X", "to_Thr", "X(共通)動画", "X(共通)画像", "Threads(専用)動画", "Threads(専用)画像", "X_Post_ID", "Threads_Post_ID", "サイトID"]];
  
  if (!postsSheet) {
    postsSheet = ss.insertSheet(SHEET_NAME_POSTS);
  }
  
  // シート全体に基本スタイルを適用
  postsSheet.getRange(1, 1, postsSheet.getMaxRows(), postsSheet.getMaxColumns())
    .setBackground(colors.background)
    .setFontColor(colors.bodyText)
    .setVerticalAlignment('middle');

  // G-M列 (7-13) の背景色を設定 (ヘッダー含む)
  postsSheet.getRange(1, 7, postsSheet.getMaxRows(), 7)
    .setBackground(colors.colorGroupGM);

  // N-Q列 (14-17) の背景色を設定 (ヘッダー含む)
  postsSheet.getRange(1, 14, postsSheet.getMaxRows(), 4)
    .setBackground(colors.colorGroupNQ);

  // ヘッダーを更新してスタイルを適用
  postsSheet.getRange(1, 1, 1, expectedHeaders[0].length)
    .setValues(expectedHeaders)
    .setFontWeight("bold")
    .setBackground(colors.headerBackground) // Default header background for all
    .setFontColor(colors.titleText)
    .setFontSize(11)
    .setHorizontalAlignment('center');

  
  // 行の固定と列の固定
  postsSheet.setFrozenRows(1);
  postsSheet.setFrozenColumns(1); // F列まで固定

  // 列幅を設定
  postsSheet.setColumnWidth(1, 60);  // A: 投稿ID
  postsSheet.setColumnWidth(2, 60);  // B: ツリーID
  postsSheet.setColumnWidth(3, 80); // C: 投稿日
  postsSheet.setColumnWidth(4, 90);  // D: 投稿時間枠
  postsSheet.setColumnWidth(5, 110); // E: 予定投稿時間
  postsSheet.setColumnWidth(6, 450); // F: 投稿内容
  postsSheet.setColumnWidth(7, 80);  // G: X_状態
  postsSheet.setColumnWidth(8, 100); // H: X_投稿時間
  postsSheet.setColumnWidth(9, 80);  // I: Thr_状態
  postsSheet.setColumnWidth(10, 100);// J: Thr_投稿時間
  postsSheet.setColumnWidth(11, 80); // K: 投稿タイプ
  postsSheet.setColumnWidth(12, 50); // L: to_X
  postsSheet.setColumnWidth(13, 50); // M: to_Thr
  postsSheet.setColumnWidth(14, 150); // N: X(共通)動画
  postsSheet.setColumnWidth(15, 150); // O: X(共通)画像
  postsSheet.setColumnWidth(16, 150); // P: Threads(専用)動画
  postsSheet.setColumnWidth(17, 150); // Q: Threads(専用)画像
  postsSheet.setColumnWidth(18, 180); // R: X_Post_ID
  postsSheet.setColumnWidth(19, 180); // S: Threads_Post_ID
  postsSheet.setColumnWidth(20, 180); // T: サイトID

  // 特定の列を中央揃えに
  postsSheet.getRange('A:E').setHorizontalAlignment('center');
  postsSheet.getRange('G:G').setHorizontalAlignment('center');
  postsSheet.getRange('I:I').setHorizontalAlignment('center');
  postsSheet.getRange('K:M').setHorizontalAlignment('center');

  // X_Post_ID (R列)、Threads_Post_ID (S列)、サイトID (T列) を非表示にする
  postsSheet.hideColumns(18, 3);

  // データ検証ルールを設定
  const timeFrameRule = SpreadsheetApp.newDataValidation().requireValueInList([1, 2, 3], true).build();
  postsSheet.getRange('D2:D').setDataValidation(timeFrameRule);
  
  postsSheet.getRange('C2:C').setNumberFormat("yyyy-MM-dd");
  postsSheet.getRange('E2:E').setNumberFormat("HH:mm:ss");
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList([STATUS_PENDING, STATUS_POSTED, STATUS_ERROR, "実行中"], true).build();
  postsSheet.getRange('G2:G').setDataValidation(statusRule); // X_状態
  postsSheet.getRange('I2:I').setDataValidation(statusRule); // Thr_状態

  const binaryRule = SpreadsheetApp.newDataValidation().requireValueInList([1, 0], true).build();
  postsSheet.getRange('L2:L').setDataValidation(binaryRule); // to_X
  postsSheet.getRange('M2:M').setDataValidation(binaryRule); // to_Thr
  
  // 条件付き書式でステータスに色を付ける
  postsSheet.clearConditionalFormatRules(); // 既存のルールをクリア
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_POSTED).setBackground(colors.statusPosted).setRanges([postsSheet.getRange('G2:G'), postsSheet.getRange('I2:I')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_ERROR).setBackground(colors.statusError).setRanges([postsSheet.getRange('G2:G'), postsSheet.getRange('I2:I')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("実行中").setBackground('#FFF9C4').setRanges([postsSheet.getRange('G2:G'), postsSheet.getRange('I2:I')]).build()
  ];
  postsSheet.setConditionalFormatRules(rules);

  // --- 設定シート ---
  let settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_NAME_SETTINGS);
  }

  // シート全体に基本スタイルを適用
  settingsSheet.getRange(1, 1, settingsSheet.getMaxRows(), settingsSheet.getMaxColumns())
    .setBackground(colors.background)
    .setFontColor(colors.bodyText);
  
  // 列幅を設定
  settingsSheet.setColumnWidth(1, 30);
  settingsSheet.setColumnWidth(2, 160);
  settingsSheet.setColumnWidth(3, 120);
  settingsSheet.setColumnWidth(4, 120);
  settingsSheet.setColumnWidth(5, 30);
  settingsSheet.setColumnWidth(6, 180);
  settingsSheet.setColumnWidth(7, 400);
  settingsSheet.setColumnWidth(8, 120); // H列: 最終更新日
  settingsSheet.setColumnWidth(9, 120); // I列: 残り日数

  // --- セクションごとの設定とスタイル適用 ---
  const mainTitleStyle = (range) => range.setFontWeight("bold").setFontColor(colors.titleText).setFontSize(12).setBackground(colors.headerBackground);
  const subTitleStyle = (range) => range.setFontWeight("bold").setFontColor(colors.titleText).setBackground(colors.headerBackground);

  // 時間枠設定
  mainTitleStyle(settingsSheet.getRange("B2").setValue("時間枠設定"));
  subTitleStyle(settingsSheet.getRange("B3:D3").setValues([["No.", "開始時間", "終了時間"]]));
  settingsSheet.getRange("B4:B6").setValues([["1"],["2"],["3"]]).setFontWeight("bold").setHorizontalAlignment('center');
  if (settingsSheet.getRange("C4").getValue() == "") {
    settingsSheet.getRange("C4:D6").setValues([["07:00", "10:00"],["12:00", "14:00"],["18:00", "21:00"]]).setHorizontalAlignment('center');
    settingsSheet.getRange("C4:D6").setNumberFormat("HH:mm");
  }

  // API設定
  mainTitleStyle(settingsSheet.getRange("F2").setValue("API設定"));
  subTitleStyle(settingsSheet.getRange("F3").setValue("X"));
  settingsSheet.getRange("F4:F7").setValues([["API Key"], ["API Secret"], ["Access Token"], ["Access Token Secret"]]);
  subTitleStyle(settingsSheet.getRange("F9").setValue("Threads"));
  settingsSheet.getRange("F10:G11").setValues([["Threads User ID", ""], ["Threads Access Token", ""]]);
  subTitleStyle(settingsSheet.getRange("H10:I10").setValues([["最終更新日", "残り日数"]]));
  settingsSheet.getRange("H11").setNumberFormat("yyyy/mm/dd");

  // 残り日数セルの条件付き書式
  const remainingDaysRange = settingsSheet.getRange("I11");
  const conditionalFormatRules = settingsSheet.getConditionalFormatRules();
  
  // 既存のルールをクリアしないように、新しいルールを追加する
  conditionalFormatRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(7)
      .setBackground("#f4cccc") // 赤
      .setRanges([remainingDaysRange])
      .build()
  );
  conditionalFormatRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(30)
      .setBackground("#fff2cc") // 黄
      .setRanges([remainingDaysRange])
      .build()
  );
  settingsSheet.setConditionalFormatRules(conditionalFormatRules);

  // ランダム投稿数設定
  mainTitleStyle(settingsSheet.getRange("B9").setValue("1日あたりのランダム投稿数設定"));
  subTitleStyle(settingsSheet.getRange("B10:D10").setValues([["時間枠No.1", "時間枠No.2", "時間枠No.3"]]));
  if (settingsSheet.getRange("B11").getValue() == "") {
    settingsSheet.getRange("B11:D11").setValues([[1, 1, 1]]).setHorizontalAlignment('center');
  }
  settingsSheet.getRange('B11:D11').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0, 20).build());
  
  // ランダム投稿トリガー時刻設定
  mainTitleStyle(settingsSheet.getRange("B13").setValue("ランダム投稿トリガー時刻"));
  if (settingsSheet.getRange("B14").getValue() == "") {
    settingsSheet.getRange("B14").setValue("00:05").setNumberFormat("HH:mm").setHorizontalAlignment('center');
  }

  // デフォルト投稿先設定
  mainTitleStyle(settingsSheet.getRange("B16").setValue("デフォルト投稿先設定"));
  subTitleStyle(settingsSheet.getRange("B17:C17").setValues([["X", "Threads"]]));
  if (settingsSheet.getRange("B18").getValue() == "") {
    settingsSheet.getRange("B18:C18").setValues([[1, 1]]).setHorizontalAlignment('center');
  }
  settingsSheet.getRange('B18:C18').setDataValidation(binaryRule);

  // --- ログシート ---
  let logSheet = ss.getSheetByName(SHEET_NAME_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_NAME_LOG);
  }
  logSheet.getRange(1, 1, logSheet.getMaxRows(), logSheet.getMaxColumns()).setBackground(colors.background).setFontColor(colors.bodyText);
  logSheet.getRange("A1:B1").setValues([["タイムスタンプ", "アクション"]])
    .setFontWeight("bold")
    .setBackground(colors.headerBackground)
    .setFontColor(colors.titleText)
    .setFontSize(11);
  logSheet.setFrozenRows(1);
  logSheet.setColumnWidth(1, 180); // A列
  logSheet.setColumnWidth(2, 600); // B列
  logSheet.getRange('A:A').setNumberFormat("yyyy-mm-dd HH:mm:ss");

  // --- ヘルプシート ---
  let helpSheet = ss.getSheetByName("ヘルプ");
  if (!helpSheet) {
    helpSheet = ss.insertSheet("ヘルプ");
    helpSheet.getRange(1, 1, helpSheet.getMaxRows(), helpSheet.getMaxColumns()).setBackground(colors.background).setFontColor(colors.bodyText);
    helpSheet.getRange("A1").setValue("X & Threads 自動投稿システム - 使い方ガイド").setFontSize(14).setFontWeight("bold").setFontColor(colors.titleText);
    const helpText = [
      ["基本的な使い方:"],
      ["1. 「設定」シートでAPI設定と投稿時間帯を設定します。"],
      ["2. 「投稿管理」シートに投稿内容を入力するか、CSVをインポートします。"],
      ["3. 「投稿先_ｘ」「投稿先_threads」列に 1(投稿する)か 0(投稿しない)を入力します。"],
      ["4. 「投稿システム」メニューから「予定投稿時間を設定する」を実行します。"],
      ["5. システムが自動的に投稿予定時間になった投稿を実行します。"],
      [""],
      ["CSVフォーマット:"],
      ["投稿日, 投稿時間枠, 投稿内容, 投稿先_ｘ, 投稿先_threads"],
      ["例: 2025-06-30, 1, おはようございます！#朝, 1, 1"],
      ["※投稿先指定( 0 or 1 )は入れなければ設定されたデフォルトで入ります。"],
      ["※日付は必ず「yyyy-MM-dd」の形で入れてください。"],
      [""],
      ["トラブルシューティング:"],
      ["- APIエラーが発生した場合は、「API設定」を確認してください。"],
      ["- 投稿が実行されない場合は、投稿日時やステータスを確認してください。"],
      ["- システムのログは「ログ」シートで確認できます。"]
    ];
    helpSheet.getRange(2, 1, helpText.length, 1).setValues(helpText).setWrap(true);
    helpSheet.getRange("A2,A8,A14").setFontWeight("bold").setFontColor(colors.titleText);
    helpSheet.setColumnWidth(1, 800); // A列
  }

  // --- ランダム投稿シート ---
  setupRandomPostsSheet(); 

  logAction("スプレッドシートの初期設定が完了しました");
  try {
    SpreadsheetApp.getUi().alert('自動投稿システムの初期設定が完了しました');
  } catch (e) {
    console.log('UIが利用できない環境で実行されました');
  }
}

/**
 * onOpenトリガー設定
 */
function onOpenTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let hasOpenTrigger = false;
  for (const trigger of triggers) {
    if (trigger.getEventType() === ScriptApp.EventType.ON_OPEN) {
      hasOpenTrigger = true;
      break;
    }
  }
  if (!hasOpenTrigger) {
    ScriptApp.newTrigger('onOpen')
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onOpen()
      .create();
  }
}

/**
 * 投稿状態を初期化
 */
function initializePostStatus() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '投稿状態の初期化',
    'すべての投稿（「投稿済み」「エラー」を含む）のXとThreadsの状態を「未投稿」にリセットします。よろしいですか？',
    ui.ButtonSet.YES_NO
  );

  if (response == ui.Button.YES) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const postsSheet = ss.getSheetByName(SHEET_NAME_POSTS);
    const dataRange = postsSheet.getDataRange();
    const values = dataRange.getValues();
    let updatedCount = 0;
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const postId = row[0];
      // 投稿IDがあれば、ステータスと投稿時間をリセット
      if (postId) {
        // G, H, I, J列を一度に更新
        postsSheet.getRange(i + 1, 7, 1, 4).setValues([[STATUS_PENDING, '', STATUS_PENDING, '']]);
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      SpreadsheetApp.getUi().alert(`${updatedCount}件の投稿状態を「未投稿」に初期化しました`);
      logAction(`${updatedCount}件の投稿状態を初期化しました`);
    } else {
      SpreadsheetApp.getUi().alert('初期化対象の投稿はありませんでした');
    }
  }
}

/**
 * テンプレート作成ダイアログを表示
 */
function showTemplateDialog() {
  const today = new Date();
  const startOfNextWeek = new Date(today);
  startOfNextWeek.setDate(today.getDate() + 1);
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

  const startDateStr = Utilities.formatDate(startOfNextWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const endDateStr = Utilities.formatDate(endOfNextWeek, Session.getScriptTimeZone(), "yyyy-MM-dd");

  const html = HtmlService.createHtmlOutput(`
    <h2>テンプレート作成</h2>
    <p>指定した期間と投稿数で投稿テンプレートを作成します。</p>
    <form id="templateForm">
      <div style="margin-bottom: 10px;">
        <label for="startDate">開始日:</label>
        <input type="date" id="startDate" value="${startDateStr}" style="width: 150px;">
      </div>
      <div style="margin-bottom: 15px;">
        <label for="endDate">終了日:</label>
        <input type="date" id="endDate" value="${endDateStr}" style="width: 150px;">
      </div>
      <hr>
      <p>1日あたりの各時間枠の投稿数を設定してください:</p>
      <div style="margin-bottom: 10px;"><label for="timeFrame1">時間帯1の投稿数: </label><input type="number" id="timeFrame1" value="1" min="0" max="20" style="width: 60px;"></div>
      <div style="margin-bottom: 10px;"><label for="timeFrame2">時間帯2の投稿数: </label><input type="number" id="timeFrame2" value="1" min="0" max="20" style="width: 60px;"></div>
      <div style="margin-bottom: 15px;"><label for="timeFrame3">時間帯3の投稿数: </label><input type="number" id="timeFrame3" value="1" min="0" max="20" style="width: 60px;"></div>
      <input type="button" value="作成" onclick="createTemplate()">
    </form>
    <script>
      function createTemplate() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const timeFrame1 = parseInt(document.getElementById('timeFrame1').value) || 0;
        const timeFrame2 = parseInt(document.getElementById('timeFrame2').value) || 0;
        const timeFrame3 = parseInt(document.getElementById('timeFrame3').value) || 0;

        if (!startDate || !endDate) {
          alert('開始日と終了日を両方入力してください。');
          return;
        }

        google.script.run
          .withSuccessHandler((message) => { 
            alert(message); 
            google.script.run.setScheduledTimes();
            google.script.host.close(); 
          })
          .withFailureHandler((error) => alert('エラーが発生しました: ' + error))
          .createCustomTemplate(startDate, endDate, [timeFrame1, timeFrame2, timeFrame3]);
      }
    </script>
  `).setWidth(400).setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, 'テンプレート作成');
}

/**
 * 時間枠設定ダイアログを表示
 */
function showTimeFrameSettingsDialog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const timeFrames = settingsSheet.getRange("C4:D6").getDisplayValues();

  const html = HtmlService.createHtmlOutput(`
    <h2>時間枠設定</h2>
    <form id="timeFrameForm">
      <table>
        <tr><th>No.</th><th>開始時間</th><th>終了時間</th></tr>
        <tr>
          <td>1</td>
          <td><input type="time" id="startTime1" value="${timeFrames[0][0]}"></td>
          <td><input type="time" id="endTime1" value="${timeFrames[0][1]}"></td>
        </tr>
        <tr>
          <td>2</td>
          <td><input type="time" id="startTime2" value="${timeFrames[1][0]}"></td>
          <td><input type="time" id="endTime2" value="${timeFrames[1][1]}"></td>
        </tr>
        <tr>
          <td>3</td>
          <td><input type="time" id="startTime3" value="${timeFrames[2][0]}"></td>
          <td><input type="time" id="endTime3" value="${timeFrames[2][1]}"></td>
        </tr>
      </table>
      <br>
      <input type="button" value="保存" onclick="saveTimeFrames()">
    </form>
    <script>
      function saveTimeFrames() {
        const timeFrames = [
          [document.getElementById('startTime1').value, document.getElementById('endTime1').value],
          [document.getElementById('startTime2').value, document.getElementById('endTime2').value],
          [document.getElementById('startTime3').value, document.getElementById('endTime3').value]
        ];
        google.script.run
          .withSuccessHandler(() => { alert('設定を保存しました'); google.script.host.close(); })
          .withFailureHandler((error) => alert('エラーが発生しました: ' + error))
          .saveTimeFrames(timeFrames);
      }
    </script>
  `).setWidth(400).setHeight(250);
  SpreadsheetApp.getUi().showModalDialog(html, '時間枠設定');
}

/**
 * 時間枠設定を保存
 */
function saveTimeFrames(timeFrames) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  settingsSheet.getRange("C4:D6").setValues(timeFrames);
  logAction("時間枠設定を更新しました");
}

/**
 * デフォルト投稿先設定ダイアログを表示
 */
function showDefaultPostDestinationDialog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  const defaultPostToX = settingsSheet.getRange("B18").getValue();
  const defaultPostToThreads = settingsSheet.getRange("C18").getValue();

  const html = HtmlService.createHtmlOutput(`
    <h2>デフォルト投稿先設定</h2>
    <form id="defaultPostDestinationForm">
      <p>CSVインポート時やテンプレート作成時のデフォルトの投稿先を選択してください。</p>
      <input type="checkbox" id="postToX" ${defaultPostToX == 1 ? 'checked' : ''}> Xに投稿する<br>
      <input type="checkbox" id="postToThreads" ${defaultPostToThreads == 1 ? 'checked' : ''}> Threadsに投稿する<br>
      <br>
      <input type="button" value="保存" onclick="saveDefaultPostDestination()">
    </form>
    <script>
      function saveDefaultPostDestination() {
        const postToX = document.getElementById('postToX').checked ? 1 : 0;
        const postToThreads = document.getElementById('postToThreads').checked ? 1 : 0;
        google.script.run
          .withSuccessHandler(() => { alert('設定を保存しました'); google.script.host.close(); })
          .withFailureHandler((error) => alert('エラーが発生しました: ' + error))
          .saveDefaultPostDestination(postToX, postToThreads);
      }
    </script>
  `).setWidth(400).setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'デフォルト投稿先設定');
}

/**
 * デフォルト投稿先設定を保存
 */
function saveDefaultPostDestination(postToX, postToThreads) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  settingsSheet.getRange("B18:C18").setValues([[postToX, postToThreads]]);
  logAction("デフォルト投稿先設定を更新しました");
}

/**
 * APIテストダイアログを表示
 */
function showApiTestDialog() {
  const html = HtmlService.createHtmlOutput(`
    <h2>APIテスト</h2>
    <p>投稿内容を入力し、投稿先のSNSを選択してテスト投稿を実行します。</p>
    <form>
      <div style="margin-bottom: 10px;">
        <label for="postText">投稿内容:</label><br>
        <textarea id="postText" rows="5" style="width: 95%;"></textarea>
      </div>
      <div style="margin-bottom: 15px;">
        <input type="checkbox" id="postToX" checked> Xに投稿する<br>
        <input type="checkbox" id="postToThreads" checked> Threadsに投稿する<br>
      </div>
      <input type="button" value="テスト投稿" onclick="executeTestPost()">
      <input type="button" value="閉じる" onclick="google.script.host.close()">
    </form>
    <script>
      function executeTestPost() {
        const postText = document.getElementById('postText').value;
        const postToX = document.getElementById('postToX').checked;
        const postToThreads = document.getElementById('postToThreads').checked;

        if (!postText.trim()) {
          alert('投稿内容を入力してください。');
          return;
        }
        if (!postToX && !postToThreads) {
          alert('投稿先を少なくとも1つ選択してください。');
          return;
        }

        // ボタンを無効化して二重投稿を防ぐ
        document.querySelector('input[value="テスト投稿"]').disabled = true;

        google.script.run
          .withSuccessHandler((result) => {
            alert(result);
            google.script.host.close();
          })
          .withFailureHandler((error) => {
            alert('エラーが発生しました: ' + error.message);
            // エラー後も再度試せるようにボタンを有効化
            document.querySelector('input[value="テスト投稿"]').disabled = false;
          })
          .executeApiTestPost(postText, postToX, postToThreads);
      }
    </script>
  `)
    .setWidth(400)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'APIテスト投稿');
}

/**
 * APIテスト投稿を実行
 */
function executeApiTestPost(postText, shouldPostToX, shouldPostToThreads) {
  let results = [];
  let errors = [];

  if (shouldPostToX) {
    try {
      Logger.log("XへのAPIテスト投稿を開始: " + postText);
      const result = postToX(postText, null, null);
      const message = 'Xへのテスト投稿に成功しました。';
      results.push(message);
      logAction(message + ` 内容: ${postText}`);
    } catch (e) {
      const errorMessage = 'Xへのテスト投稿でエラーが発生しました: ' + e.toString();
      errors.push(errorMessage);
      logAction(errorMessage);
      Logger.log(errorMessage);
    }
  }

  if (shouldPostToThreads) {
    try {
      Logger.log("ThreadsへのAPIテスト投稿を開始: " + postText);
      const result = postToThreads(postText, null, null, null, null);
      const message = 'Threadsへのテスト投稿に成功しました。';
      results.push(message);
      logAction(message + ` 内容: ${postText}`);
    } catch (e) {
      const errorMessage = 'Threadsへのテスト投稿でエラーが発生しました: ' + e.toString();
      errors.push(errorMessage);
      logAction(errorMessage);
      Logger.log(errorMessage);
    }
  }

  let finalMessage = "テスト投稿処理が完了しました。\n\n";
  if (results.length > 0) {
    finalMessage += "成功:\n" + results.join("\n") + "\n\n";
  }
  if (errors.length > 0) {
    finalMessage += "エラー:\n" + errors.join("\n");
  }

  return finalMessage;
}

/**
 * CSV変換ダイアログを表示
 */
function showCsvConversionDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { font-family: sans-serif; }
          textarea { width: 100%; box-sizing: border-box; }
          .container { display: flex; flex-direction: column; gap: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>テキストをCSVに変換</h2>
          <p>Googleドキュメントやテキストファイルの内容を下のテキストボックスに貼り付けるか、テキストファイルをアップロードしてください。</p>
          
          <div>
            <label for="fileInput">テキストファイルを選択 (.txt):</label>
            <input type="file" id="fileInput" accept=".txt">
          </div>

          <div>
            <label for="textBox">または、テキストを貼り付け:</label>
            <textarea id="textBox" rows="10"></textarea>
          </div>
          
          <button onclick="processConversion()">CSVに変換してダウンロード</button>
        </div>

        <script>
          document.getElementById('fileInput').addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) {
              return;
            }
            var reader = new FileReader();
            reader.onload = function(e) {
              document.getElementById('textBox').value = e.target.result;
            };
            reader.readAsText(file);
          });

          function processConversion() {
            var text = document.getElementById('textBox').value;
            if (!text.trim()) {
              alert('変換するテキストがありません。');
              return;
            }
            
            // サーバーサイドの関数を呼び出し
            google.script.run
              .withSuccessHandler(function(csvData) {
                if(csvData) {
                  downloadCsv(csvData);
                } else {
                  alert('CSVデータを作成できませんでした。');
                }
              })
              .withFailureHandler(function(error) {
                alert('エラーが発生しました: ' + error.message);
              })
              .convertTextToCsv(text);
          }

          function downloadCsv(csvContent) {
            var encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
            var link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "converted.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            google.script.host.close();
          }
        </script>
      </body>
    </html>
  `)
    .setWidth(500)
    .setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, 'CSV変換');
}

/**
 * テキストをCSV形式の文字列に変換する
 * @param {string} text 変換元のテキスト
 * @return {string} CSV形式の文字列
 */
function convertTextToCsv(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  // ユーザーの要望に基づき、引用符を一切追加せずにテキストをそのまま返す
  return text;
}

/**
 * M列とN列の排他制御とツリーIDの自動採番を行うためのonEditトリガー
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();
  const col = range.getColumn();
  const sheetName = sheet.getName();

  if (row === 1) return; // ヘッダー行は無視

  // --- 「投稿管理」シートの処理 ---
  if (sheetName === SHEET_NAME_POSTS) {
  // Part 1: N/O列の排他制御
    if (col === 14 || col === 15) {
      const videoCell = sheet.getRange(row, 14); // N列
      const imageCell = sheet.getRange(row, 15); // O列
      
      // セルの値を文字列として取得（null/undefined対策でString()を使用）
      const videoValue = String(videoCell.getValue()).trim();
      const imageValue = String(imageCell.getValue()).trim();
      
      const gray = "#cccccc";
      const white = "#F5FFFA"; // 指定の元の色

      if (videoValue !== "" && imageValue === "") {
        // N列(動画)のみ入力がある場合
        videoCell.setBackground(white);
        imageCell.setBackground(gray);
      } else if (imageValue !== "" && videoValue === "") {
        // O列(画像)のみ入力がある場合
        videoCell.setBackground(gray);
        imageCell.setBackground(white);
      } else if (videoValue !== "" && imageValue !== "") {
        // 万が一両方入力された場合（必要に応じてどちらかを優先、ここでは両方白）
        videoCell.setBackground(white);
        imageCell.setBackground(white);
      } else {
        // 両方が空、または消去された場合
        videoCell.setBackground(white);
        imageCell.setBackground(white);
      }
      return;
    }

    // Part 2: ツリーIDの自動採番
    const treeIdCol = 2; // B列
    if (col === treeIdCol) {
      const parentId = range.getValue();
      // 修正版ヘルパー関数を呼び出し（sheet, row, parentIdを渡す）
      updateChildIdsForParent(sheet, row, parentId);
    }
      
    // --- 「ランダム投稿」シートの処理 ---
    else if (sheetName === SHEET_NAME_RANDOM_POSTS) {
      // C/D列の排他制御
      if (col === 3 || col === 4) { // C列(X共通動画) または D列(X共通画像)
        const videoCell = sheet.getRange(row, 3);
        const imageCell = sheet.getRange(row, 4);
        const videoValue = videoCell.getValue().toString().trim();
        const imageValue = imageCell.getValue().toString().trim();
        const gray = "#cccccc";
        const white = "#F5FFFA"; // setupSpreadsheetのcolorGroupNQに合わせる

        if (videoValue !== "") {
          videoCell.setBackground(white);
          imageCell.setBackground(gray);
        } else if (imageValue !== "") {
          videoCell.setBackground(gray);
          imageCell.setBackground(white);
        } else {
          videoCell.setBackground(white);
          imageCell.setBackground(white);
        }
      }
    }
    // --- 「設定」シートの処理 ---
    else if (sheetName === SHEET_NAME_SETTINGS) {
      // G11セルが編集された場合にトークン更新処理を実行
      if (range.getA1Notation() === 'G11') {
        Logger.log("G11セル編集を検知しました。即時更新処理を開始します。");
        refreshAccessToken();
      }
    }
  }
}

/**
 * 編集された行に対して、その親ID（ツリーID）が何番目かを数えてA列にセットする
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 対象のシート
 * @param {number} row - 編集された行番号
 * @param {string} parentId - 入力された親のID（ツリーID）
 */
function updateChildIdsForParent(sheet, row, parentId) {
  if (!parentId) {
    sheet.getRange(row, 1).clearContent(); // 空になったらA列も消す
    return;
  }

  // B列（ツリーID）の全データを取得して、その行までの出現回数をカウント
  const lastRow = sheet.getLastRow();
  const bValues = sheet.getRange(1, 2, row, 1).getValues(); // 1行目から編集行までのB列を取得

  let count = 0;
  for (let i = 0; i < row; i++) {
    // 文字列として比較
    if (bValues[i][0].toString().trim() === parentId.toString().trim()) {
      count++;
    }
  }

  // A列（投稿ID）の対象セルに「parentId_連番」を書き込む
  const newId = `${parentId}_${count}`;
  sheet.getRange(row, 1).setValue(newId);
}

/**
 * Threads長期アクセストークンを更新するメイン処理
 */
function refreshAccessToken() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_SETTINGS);
  if (!sheet) {
    Logger.log("エラー: シートが見つかりません: " + SHEET_NAME_SETTINGS);
    return;
  }

  // ヘッダーが必ず表示されるように設定
  sheet.getRange("H10:I10").setValues([["最終更新日", "残り日数"]]).setFontWeight("bold");

  // G11から現在のトークンを取得
  const currentToken = sheet.getRange("G11").getValue();

  if (!currentToken || typeof currentToken !== 'string' || currentToken.length < 10) {
    Logger.log("長期アクセストークンがG11に設定されていません。処理をスキップします。");
    // トークンがない場合でも、表示をクリアする
    sheet.getRange("H11:I11").clearContent();
    return;
  }

  const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`;
  const options = {
    method: 'get',
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const json = JSON.parse(response.getContentText());

    if (responseCode === 200 && json.access_token) {
      // 1. 成功時: 新しいトークンと更新日をシートに書き込む
      sheet.getRange("G11").setValue(json.access_token); // G11を更新
      sheet.getRange("H11").setValue(new Date());         // H11を更新

      // 2. API応答のexpires_inから有効日数を計算し、I11に残り日数を表示する「計算式」を設定
      if (json.expires_in) {
        const validityInDays = Math.floor(json.expires_in / 86400); // 86400秒/日
        // H11(最終更新日)と有効期間(validityInDays)から有効期限を計算し、
        // そこから現在日付(TODAY)を引くことで、残り日数を動的に計算する計算式を設定する
        const formula = `=ROUNDDOWN((H11+${validityInDays})-TODAY(), 0)`;
        sheet.getRange("I11").setFormula(formula);
        Logger.log(`トークン更新成功。有効期間: 約${validityInDays}日。残り日数を計算する計算式をI11に設定しました。`);
      } else {
        sheet.getRange("I11").clearContent(); // expires_inがない場合はセルをクリア
        Logger.log("更新成功したが、expires_inが応答に含まれていませんでした。");
      }

    } else {
      // 失敗時: エラーをログに出力し、セルをクリアして古い情報が残らないようにする
      sheet.getRange("H11:I11").clearContent();
      Logger.log("トークン更新APIリクエスト失敗。ステータスコード: " + responseCode);
      Logger.log("レスポンス: " + JSON.stringify(json));
    }

  } catch (e) {
    sheet.getRange("H11:I11").clearContent();
    Logger.log("ネットワーク通信エラー: " + e.toString());
  }
}