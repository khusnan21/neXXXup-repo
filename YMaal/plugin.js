import { http_get } from "../utils/network.js";

const baseUrl = "https://ymaal.co";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Latest", list: await getPage(baseUrl + "/") },
        { title: "Ullu", list: await getPage(baseUrl + "/channel/ullu/") },
        { title: "Altt", list: await getPage(baseUrl + "/channel/altt/") },
        { title: "Feel", list: await getPage(baseUrl + "/channel/feel/") },
        { title: "Kooku", list: await getPage(baseUrl + "/channel/kooku/") },
        { title: "PrimePlay", list: await getPage(baseUrl + "/channel/primeplay/") },
        { title: "HitPrime", list: await getPage(baseUrl + "/channel/hitprime/") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']video-card["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/class=["']title["'][^>]*>(.*?)<\/h2>/i);
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
    const titleMatch = res.match(/class=["']video-title["'][^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    let streamLink = "";
    const streamMatch = res.match(/<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i);
    if(streamMatch) streamLink = streamMatch[1];
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: streamLink ? [streamLink] : [],
        isMovie: true
    };
}

export async function loadLinks(url) {
    if(url.startsWith("http")) {
         return [{
             url: url,
             quality: "Video",
             isM3U8: url.includes(".m3u8")
         }];
    }
    return [];
}
