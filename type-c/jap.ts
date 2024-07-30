import { convertRelativePaths, eucKrToUtf8, fetchWithError } from "../utils.ts";

import type { NoCategoryNoticeInfo } from "../types.ts";

import iconv from "https://esm.sh/iconv-lite@0.6.3";

export enum JapCategory {
  Undergraduate = 1,
  Graduate = 2,
  Job = 3,
}

//메인 함수인 getJapUrlList, fetchJapNotices 함수들 구현

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
  const matchArray = html.match(/bbs_content\.html(.+?)type=B/g);
  if (!matchArray) throw Error("No match found");
  return matchArray.map((x) => "http://www.kujap.com/contents/bbs/" + x);
}

/**
 * @param url getJapUrlList 함수에서 반환된 url 하나
 * @returns 공지사항의 제목, 작성자, 게시일자, public URL, HTML table body, 카테고리 내용을 반환합니다.
 */
export async function fetchJapNotices(
  url: string,
  mainCategory: JapCategory,
): Promise<NoCategoryNoticeInfo> {
  const scrap = await fetchWithError(url);
  const html = await eucKrToUtf8(scrap);

  const noticeData = parseArticle(html);

  const subcategory = {
    1: "학부",
    2: "대학원",
    3: "취업정보",
  }[mainCategory];
  if (!subcategory) throw Error("Invalid category number");

  noticeData.url = url;
  noticeData.category = subcategory +
    (mainCategory == 3
      ? ""
      : noticeData.title.includes("장학")
      ? " 장학"
      : " 공지");

  return noticeData;
}

//위 함수들 구현을 위해 필요한 함수들

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
 * @param html fetch로 받아온 후 utf-8로 변환한 공지의 HTML string
 * @returns 공지의 title을 반환합니다.
 */
function getTitle(html: string): string {
  const regex = /<td class='pd5t b' id='head'>(.+?)<\/td>/;
  const rawTitle = html.match(regex);
  if (!rawTitle) throw Error("Failed to get title");
  const title = rawTitle[1].replace(/\s{2,}(&nbsp)?/, "").replace(";", "");
  return title;
}

/**
 * @param html fetch로 받아온 후 utf-8로 변환한 공지의 HTML string
 * @returns 공지의 date를 반환합니다.
 */
function getDate(html: string): string {
  const regex = /<td align='right' class='pd5'>(.+?)<\/td>/;
  const rawDate = html.match(regex);
  if (!rawDate) throw Error("Failed to get date");
  return rawDate[1].split(" ")[0];
}

/**
 * @param html fetch로 받아온 후 utf-8로 변환한 공지의 HTML string
 * @returns 공지의 writer를 반환합니다.
 */
function getWriter(html: string): string {
  const regex = /<td class='small pd5 b letter'>(.+?)<\/td>/;
  const rawWriter = html.match(regex);
  if (!rawWriter) throw Error("Failed to get writer");
  return rawWriter[1];
}

/**
 * @param html fetch로 받아온 후 utf-8로 변환한 공지의 HTML string
 * @returns 공지의 content를 반환합니다.
 */
function getContent(html: string): string {
  const regex = /<td class='pd10t'(.+?)<\/ul>/s;
  const rawMain = html.match(regex);
  if (!rawMain) throw Error("Failed to get main content");
  return convertRelativePaths(rawMain[0], "http://www.kujap.com").replace(
    /<ul id='file'>(.*?)<\/ul>/s,
    "",
  ) +
    getFile(rawMain[0]);
}

/**
 * @param html fetch로 받아온 후 utf-8로 변환한 공지의 HTML string
 * @returns 첨부파일 부분만 반환합니다. 첨부파일 부분은 다운로드 링크를 담고 있기에 추가 로직이 필요하여 분리하였습니다.
 */
function getFile(utf8Html: string): string {
  const fileSectionRegex = /<ul id='file'>(.*?)<\/ul>/s;
  const rawFileSectionUtf8 = utf8Html.match(fileSectionRegex);

  if (!rawFileSectionUtf8) {
    throw new Error("No file section found");
  }

  const fileSectionUtf8 = convertDownloadPath(rawFileSectionUtf8[0]);

  return fileSectionUtf8;
}

/**
 * @param html fetch로 받아온 후 utf-8로 변환한 공지의 HTML string
 * @returns 반환 형식인 NoCategoryNoticeInfo에 파싱된 정보들을 담아 반환합니다.
 */
function parseArticle(
  html: string,
): NoCategoryNoticeInfo {
  return {
    title: getTitle(html),
    date: getDate(html),
    writer: getWriter(html),
    content: getContent(html),
    url: "",
    category: "",
  };
}

/**
 * @param html utf-8로 변환된 HTML string
 * @returns javascript 다운로드 링크를 형식에 맞게 변환, euc-kr기준 url 인코딩시킵니다.
 */
function convertDownloadPath(html: string): string {
  return html.replace(
    /<a href="javascript:fnDownFile\('([^']+)','([^']+)','([^']+)'\);">/g,
    (_, bbs_cls_cd, cid, fileName) => {
      const encodedFileName = customURLEncode(fileName);
      const url =
        `http://www.kujap.com/contents/common/popup/download.html?bbs_cls_cd=${bbs_cls_cd}&cid=${cid}&file_nm=${encodedFileName}&con_flg=Y&home_id=`;
      return `<a href="${url}">`;
    },
  ).replace(/<img[^>]*>/g, ""); // 이미지 태그 제거
}

//URL 인코딩을 위한 함수들
function isNonASCII(char: string): boolean {
  return char.charCodeAt(0) > 127;
}

function encodeEUC_KR(char: string): string {
  const eucKrBuffer = iconv.encode(char, "euc-kr") as Uint8Array;
  return Array.from(eucKrBuffer)
    .map((byte: number) => "%" + byte.toString(16).toUpperCase())
    .join("");
}

function customURLEncode(url: string): string {
  let result = "";
  for (const char of url) {
    if (isNonASCII(char)) {
      result += encodeEUC_KR(char);
    } else {
      result += encodeURIComponent(char);
    }
  }
  return result;
}
