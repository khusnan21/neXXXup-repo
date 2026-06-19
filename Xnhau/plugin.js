import { http_get } from "../utils/network.js";

const baseUrl = "https://xnhau.im";
const storageUrl = "https://xnhaustorage.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Đang Xem", list: await getPage(baseUrl + "/") },
        { title: "Mới Nhất", list: await getPage(baseUrl + "/clip-sex-moi/") },
        { title: "Hay Nhất", list: await getPage(baseUrl + "/clip-sex-hay/") },
        { title: "Hot Nhất", list: await getPage(baseUrl + "/clip-sex-hot/") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res, url);
}

export async function search(query) {
    const url = `${baseUrl}/search/${encodeURIComponent(query)}/`;
    const res = await http_get(url, getHeaders());
    return parseList(res, url);
}

function parseList(html, url) {
    const results = [];
    let items = html.split(/class=["']item["']/i);
    
    // For parsing just a piece
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<strong class=["']title["'][^>]*>([\s\S]*?)<\/strong>/i) || item.match(/title=["']([^"']+)["']/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgContext = item.match(/class=["']img["'][^>]*>([\s\S]*?)<\//i) || [""];
        let imgMatch = imgContext[0].match(/data-original=["']([^"']+)["']/i) || imgContext[0].match(/data-webp=["']([^"']+)["']/i) || imgContext[0].match(/src=["']([^"']+)["']/i);
        if(!imgMatch) {
             imgMatch = item.match(/<img[^>]+data-original=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        }
        
        let link = aTag[1];
        if(!link.startsWith("http")) link = baseUrl + link;

        results.push({
            url: link,
            title: title,
            poster: imgMatch ? imgMatch[1] : ''
        });
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    let flashvarsMatch = res.match(/var flashvars = {([\s\S]*?)};/);
    if(flashvarsMatch) {
         let jsObj = flashvarsMatch[1];
         let videoTitleMatch = jsObj.match(/['"]?video_title['"]?\s*:\s*['"]?([^'",]+)['"]?,?/);
         if(videoTitleMatch) title = videoTitleMatch[1].trim();
    }
    if(title === url) {
         const titleMatch = res.match(/<title>([\s\S]*?)<\/title>/i);
         if(titleMatch) title = titleMatch[1].replace(" - xNhau", "").replace(/<[^>]+>/g, "").trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) {
        poster = posterMatch[1];
    } else if (flashvarsMatch) {
        let jsObj = flashvarsMatch[1];
        let prevUrlMatch = jsObj.match(/['"]?preview_url2['"]?\s*:\s*['"]?([^'",]+)['"]?,?/);
        if(prevUrlMatch) poster = prevUrlMatch[1];
    }
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: [url], // we will pass data=url
        isMovie: true
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const results = [];
    
    let pageContextMatch = res.match(/var pageContext = {([\s\S]*?)};/);
    let videoId = "";
    if(pageContextMatch) {
        let jsObj = pageContextMatch[1];
        let videoIdMatch = jsObj.match(/['"]?videoId['"]?\s*:\s*['"]?([^'",]+)['"]?,?/);
        if(videoIdMatch) videoId = videoIdMatch[1].trim();
    }
    if(!videoId) {
        const parts = url.split("video/");
        if(parts.length > 1) {
             videoId = parts[1].split("/")[0];
        }
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    let groupMatch = poster.match(/\/videos_screenshots\/(\d+)\//);
    let group = "";
    if(groupMatch) group = groupMatch[1];
    
    if(videoId && group) {
         // To avoid doing HEAD requests, just add them and let the player handle it
         results.push({
             url: `${storageUrl}/${group}/${videoId}/${videoId}_1080p.mp4`,
             quality: "1080p",
             isM3U8: false
         });
         results.push({
             url: `${storageUrl}/${group}/${videoId}/${videoId}_720p.mp4`,
             quality: "720p",
             isM3U8: false
         });
         results.push({
             url: `${storageUrl}/${group}/${videoId}/${videoId}.mp4`,
             quality: "480p",
             isM3U8: false
         });
    }
    
    return results;
}
