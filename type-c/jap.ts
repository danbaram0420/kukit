import { eucKrToUtf8, fetchWithError } from "../utils.ts";

import type { NoCategoryNoticeInfo } from "../types.ts";

enum JapCategory {
  Undergraduate = 1,
  Graduate = 2,
  Job = 3,
}

/**
 * @param url 기본 페이지 url
 * @returns kujap 사이트는 탐색에 phpsessionId가 있어야 오류가 나지 않기에 해당 값을 반환합니다.
 */
async function getPHPSessionId(url: string) {
  //fetchWithError는 utils.ts에 있는 함수로, fetch를 이용해 url에 요청을 보내고, 에러가 발생하면 에러를 던집니다.
  const headers = new Headers({
    referer: "http://www.kujap.com",
  });
  const document = await fetch(url, {
    headers: headers,
    credentials: "include",
  });
  const cookie = document.headers.get("Set-Cookie");
  if (!cookie) throw Error("No cookie found");
  const matchArray = cookie.match(/PHPSESSID=(.+?);/);
  if (!matchArray) throw Error("No PHPSESSID found");
  const phpId = matchArray[1];
  return phpId;
}

/**
 * @param url 공지사항 기본 페이지 url
 * @param category 카테고리 번호, 1: 학부, 2: 대학원, 3: 취업정보
 * @returns 해당 페이지의 href 리스트를 반환합니다.
 */
export async function getJapUrlList(
  page: number,
  category: JapCategory,
): Promise<string[]> {
  const catenum = {
    1: "005003001",
    2: "005003002",
    3: "005008",
  }[category];
  const subUrl =
    `http://www.kujap.com/contents/bbs/bbs_list.html?bbs_cls_cd=${catenum}`;
  const phpId = await getPHPSessionId(subUrl);
  const mainUrl = subUrl + `&pagemove=GOTO&pageno=${page}`;
  const headers = new Headers({
    cookie: `PHPSESSID=${phpId}`,
    referer: "http://www.kujap.com",
  });

  const scrap = await fetch(mainUrl, {
    headers: headers,
    credentials: "include",
  });
  //eucKrToUtf8은 utils.ts에 있는 함수로, euc-kr로 인코딩된 문자열을 utf-8로 디코딩합니다.
  const html = await eucKrToUtf8(scrap);
  await Deno.writeTextFile("hello1.txt", html);
  const matchArray = html.match(/bbs_content\.html(.+?)type=B/g);
  if (!matchArray) throw Error("No match found");
  return matchArray.map((x) => "http://www.kujap.com/contents/bbs/" + x);
}

/**
 * @param url getJapUrlList 함수에서 반환된 url 하나
 * @returns 공지사항의 제목, 작성자, 게시일자, public URL, HTML table body, 카테고리 내용을 반환합니다.
 */
export async function getNoticeFromJap(
  url: string,
): Promise<NoCategoryNoticeInfo> {
}

console.log(await getJapUrlList(3, JapCategory.Undergraduate));
