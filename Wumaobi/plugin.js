import { http_get } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

const baseUrl = "https://wumaobi.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Popular", list: await getPage(baseUrl + "/recommend", "hits") },
        { title: "Latest", list: await getPage(baseUrl + "/recommend", "id") }
    ];
}

async function getPage(url, sort) {
    const res = await http_get(url, { ...getHeaders(), "Cookie": `sort=${sort}` });
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/search/${encodeURIComponent(query)}/`;
    const res = await http_get(url, { ...getHeaders(), "Cookie": "sort=id", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8", "Upgrade-Insecure-Requests": "1" });
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["'][^"']*card[^"']*["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        if(!item.includes("card-title")) continue;
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i) || item.match(/href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        // Match element with card-title
        let titleMatch = item.match(/class=["'][^"']*card-title[^"']*["'][^>]*>(.*?)<\//i) || item.match(/title=["']([^"']+)["']/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        let url = aTag[1];
        if(!url.startsWith("http")) url = baseUrl + url;

        results.push({
            url: url,
            title: title,
            poster: imgMatch ? imgMatch[1] : ''
        });
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/class=["']video-title["'][^>]*>\s*<a[^>]*>(.*?)<\/a>/i) || res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<video[^>]+poster=["']([^"']+)["']/i) || res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: [url],
        isMovie: true
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, { ...getHeaders() });
    
    const sourceMatch = res.match(/<video[^>]*playerCnt[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i) || res.match(/<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i);
    if(sourceMatch) {
         let videoSource = sourceMatch[1];
         if(videoSource.startsWith("//")) videoSource = "https:" + videoSource;
         
         return [{
             url: videoSource,
             quality: "Video",
             isM3U8: videoSource.includes(".m3u8")
         }];
    }
    return [];
}
