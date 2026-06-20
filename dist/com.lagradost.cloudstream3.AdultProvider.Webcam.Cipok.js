import { http_get } from "../utils/network.js";

const baseUrl = "https://cipok5.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Home", list: await getPage(baseUrl + "/home") },
        { title: "Live Center", list: await getPage(baseUrl + "/liveCenter") },
        { title: "Indonesia", list: await getPage(baseUrl + "/liveCountry?areaCode=ID&name=Indonesia") },
        { title: "Vietnam", list: await getPage(baseUrl + "/liveCountry?areaCode=VN&name=Vietnam") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/search?keyword=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["'](?:room-item|live-item|item)["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        // Find title
        let titleMatch = item.match(/class=["'][^"']*(?:title|name)[^"']*["'][^>]*>(.*?)<\//i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let aTag = item.match(/<a[^>]+href=["']([^"']+)["']/i);
        // Find url
        let url = "";
        if(aTag) url = aTag[1];
        else {
             // Maybe item itself has href
             let selfHref = item.match(/href=["']([^"']+)["']/i);
             if(selfHref) url = selfHref[1];
        }
        if(!url) continue;
        if(!url.startsWith("http")) url = baseUrl + url;

        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+data-src=["']([^"']+)["']/i);

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
    const titleMatch = res.match(/class=["'][^"']*(?:title|room-title)[^"']*["'][^>]*>([\s\S]*?)<\//i) || res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
         title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/class=["'][^"']*poster[^"']*["'][^>]*src=["']([^"']+)["']/i) || res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: [url],
        isMovie: true // Live stream wrapper treated as movie
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const m3u8Regex = /["'](http[^"']+\.m3u8[^"']*)["']/i;
    const match = res.match(m3u8Regex);
    
    if (match) {
        return [{
            url: match[1].replace(/\\\//g, '/'),
            quality: "Live",
            isM3U8: true
        }];
    }
    return [];
}
