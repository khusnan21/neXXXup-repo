import { http_get, http_post } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

function getBaseUrl() {
    return "https://vlxx.moi";
}

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": getBaseUrl(),
    };
}

export async function getHome() {
    return [
        { title: "Homepage", list: await getPage(getBaseUrl()) }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${getBaseUrl()}/search/${encodeURIComponent(query)}/`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']video-item["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<div class=["']video-name["'][^>]*>(.*?)<\/div>/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]+data-original=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        let url = aTag[1];
        if(!url.startsWith("http")) url = getBaseUrl() + url;

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
    const titleMatch = res.match(/<div id=["']container["'][^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: [url],
        isMovie: true
    };
}

export async function loadLinks(url) {
    const results = [];
    const pathSplits = url.replace(/\/$/, '').split("/");
    const id = pathSplits[pathSplits.length - 1]; // Actually their code says size - 2 if not trimmed, but with trimming it's the last part. E.g /video-1234/
    
    let actualId = id;
    if(url.endsWith("/")) {
        const parts = url.split("/");
        actualId = parts[parts.length - 2];
    }
    
    const postData = `vlxx_server=1&id=${actualId}&server=1`;
    const res = await http_post(`${getBaseUrl()}/ajax.php`, {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": url,
        ...getHeaders()
    }, postData);
    
    const iframeMatch = res.match(/src=\\"(.*?)\\"/i) || res.match(/src=["']([^"']+)["']/i);
    if(iframeMatch) {
        let iframeUrl = iframeMatch[1].replace(/\\/g, "");
        if(iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl;
        else if (iframeUrl.startsWith("/")) iframeUrl = getBaseUrl() + iframeUrl;
        
        try {
             const playerConfig = await http_get(iframeUrl, { ...getHeaders(), "Referer": getBaseUrl() });
             const sourcesMatch = playerConfig.match(/sources:\s*(\[.*?\])/);
             if(sourcesMatch) {
                  const jsonStr = sourcesMatch[1].replace(/'/g, '"').replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":');
                  const sources = JSON.parse(jsonStr);
                  for(let s of sources) {
                       if(s.file) {
                            results.push({
                                url: s.file,
                                quality: s.label || "Video",
                                isM3U8: s.file.includes(".m3u8")
                            });
                       }
                  }
             }
        } catch(e) {}
    }
    
    return results;
}
